"""Transport adapter for public Yahoo listings and raw daily prices."""

import hmac
import json
import logging
import os
import re
import sys
import tempfile
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
from http.server import BaseHTTPRequestHandler
from zoneinfo import ZoneInfo

import yfinance as yf
from yfinance.exceptions import YFRateLimitError

yf.set_tz_cache_location(os.path.join(tempfile.gettempdir(), "getstead-yfinance"))
logging.getLogger("yfinance").disabled = True

SYMBOL = re.compile(r"[A-Z0-9][A-Z0-9.-]{0,23}")
TYPES = {"EQUITY", "ETF", "MUTUALFUND"}
TIMEOUT = 4


def positive(value):
    try:
        price = Decimal(str(value))
    except InvalidOperation:
        return None
    return price if price.is_finite() and price > 0 else None


def currency_and_multiplier(metadata):
    currency = metadata.get("currency")
    if currency in ("GBp", "GBX"):
        return "GBP", Decimal("0.01")
    if isinstance(currency, str) and re.fullmatch(r"[A-Z]{3}", currency):
        return currency, Decimal(1)
    return None, Decimal(1)


def history(symbol, period=None, start=None):
    ticker = yf.Ticker(symbol)
    frame = ticker.history(
        period=period, start=start, interval="1d", auto_adjust=False, actions=False,
        timeout=TIMEOUT, raise_errors=True,
    )
    return frame, ticker.get_history_metadata()


def closes(frame, metadata, now):
    """Finished daily closes, latest first; a session still open today is left out."""
    venue_name = metadata.get("exchangeTimezoneName")
    if not isinstance(venue_name, str):
        return []
    venue = ZoneInfo(venue_name)
    today = now.astimezone(venue).date()
    end = (metadata.get("currentTradingPeriod") or {}).get("regular", {}).get("end")
    if isinstance(end, (int, float)):
        end = datetime.fromtimestamp(end, venue)
    session_ended = (
        isinstance(end, datetime) and end.tzinfo is not None and
        end.astimezone(venue).date() == today and end <= now
    )
    rows = []
    for timestamp, value in reversed(list(frame["Close"].items())):
        date = timestamp.date()
        price = positive(value)
        if price is not None and (date < today or (date == today and session_ended)):
            rows.append((date, price))
    return rows


def search(query):
    rows = yf.Search(
        query, max_results=8, news_count=0, lists_count=0, include_cb=False,
        recommended=0, timeout=TIMEOUT,
    ).quotes
    by_symbol = {}
    for row in rows:
        symbol = row.get("symbol", "")
        if row.get("quoteType") in TYPES and isinstance(symbol, str) and SYMBOL.fullmatch(symbol):
            by_symbol.setdefault(symbol, row)

    def listing(item):
        symbol, row = item
        try:
            currency, _ = currency_and_multiplier(yf.Ticker(symbol).get_history_metadata())
        except YFRateLimitError:
            raise
        except Exception:
            return None
        market = row.get("exchDisp") or row.get("exchange")
        name = row.get("longname") or row.get("shortname")
        return dict(symbol=symbol, name=name, market=market, currency=currency) if currency and market and name else None

    with ThreadPoolExecutor(max_workers=3) as pool:
        return [match for match in pool.map(listing, list(by_symbol.items())[:6]) if match]


def quote(symbol, now):
    frame, metadata = history(symbol, "5d")
    currency, multiplier = currency_and_multiplier(metadata)
    if not currency or metadata.get("instrumentType") not in TYPES:
        return None
    rows = closes(frame, metadata, now)
    if not rows:
        return None
    result = dict(asOf=rows[0][0].isoformat(), price=format(rows[0][1] * multiplier, "f"), currency=currency)
    if len(rows) > 1:
        result.update(previousAsOf=rows[1][0].isoformat(), previousPrice=format(rows[1][1] * multiplier, "f"))
    return result


# Fixed market context for the dashboard; never a user-supplied symbol.
BENCHMARKS = {"sp500": "^GSPC", "vix": "^VIX"}


def benchmarks(now):
    """Latest, previous and previous-year-end close of each benchmark, in index points."""
    result = {}
    for key, symbol in BENCHMARKS.items():
        frame, metadata = history(symbol, start=f"{now.year - 1}-12-15")
        rows = closes(frame, metadata, now)
        if len(rows) < 2:
            continue
        year_end = next((price for date, price in rows if date.year < rows[0][0].year), None)
        result[key] = dict(
            asOf=rows[0][0].isoformat(), close=format(rows[0][1], "f"), previousClose=format(rows[1][1], "f"),
            yearStartClose=format(year_end, "f") if year_end is not None else None,
        )
    return result


def fx(currency, now):
    frame, _ = history(f"{currency}EUR=X", "1mo")
    today = now.date()
    result = []
    for timestamp, value in frame["Close"].items():
        day = timestamp.date()
        price = positive(value)
        if day < today and price is not None:
            result.append([day.isoformat(), format(price, "f")])
    return result


def run(request):
    if not isinstance(request, dict):
        raise ValueError("Invalid request")
    operation = request.get("operation")
    value = request.get("value")
    if not isinstance(value, str):
        raise ValueError("Invalid request")
    now = datetime.now(timezone.utc)
    if operation == "search" and 1 <= len(value) <= 64 and all(char.isalnum() or char in " .,&'+-" for char in value):
        return search(value)
    if operation == "quote" and SYMBOL.fullmatch(value):
        return quote(value, now)
    if operation == "fx" and re.fullmatch(r"[A-Z]{3}", value) and value != "EUR":
        return fx(value, now)
    if operation == "benchmarks" and value == "":
        return benchmarks(now)
    raise ValueError("Invalid request")


class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        secret = os.environ.get("MARKET_DATA_BRIDGE_SECRET", "")
        auth = self.headers.get("Authorization", "").encode()
        if not secret or not hmac.compare_digest(auth, f"Bearer {secret}".encode()):
            self.reply(401, None)
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if not 1 <= length <= 1024:
                self.reply(400, None)
                return
            request = json.loads(self.rfile.read(length))
            self.reply(200, run(request))
        except YFRateLimitError:
            self.reply(429, None)
        except (ValueError, TypeError):
            self.reply(400, None)
        except Exception:
            self.reply(502, None)

    def reply(self, status, value):
        body = json.dumps(value).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *_args):
        pass


if __name__ == "__main__":
    try:
        print(json.dumps(run(json.loads(sys.argv[1]))))
    except YFRateLimitError:
        sys.exit(75)
    except Exception:
        sys.exit(1)
