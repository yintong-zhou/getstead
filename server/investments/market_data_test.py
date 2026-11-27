from datetime import datetime, timezone
from unittest import TestCase
from unittest.mock import patch

import pandas as pd

from api import market_data


class MarketDataTest(TestCase):
    def test_excludes_an_open_session_then_uses_its_close(self):
        frame = pd.DataFrame(
            {"Close": [1100, 1250]},
            index=pd.to_datetime(["2026-11-20", "2026-11-23"]),
        )
        metadata = {
            "currency": "GBp",
            "instrumentType": "EQUITY",
            "exchangeTimezoneName": "Europe/London",
            "currentTradingPeriod": {
                "regular": {"end": pd.Timestamp("2026-11-23 16:30", tz="Europe/London")},
            },
        }
        with patch.object(market_data, "history", return_value=(frame, metadata)):
            before_close = market_data.quote("TEST.L", datetime(2026, 11, 23, 15, tzinfo=timezone.utc))
            after_close = market_data.quote("TEST.L", datetime(2026, 11, 23, 17, tzinfo=timezone.utc))
        self.assertEqual(before_close, {"asOf": "2026-11-20", "price": "11.00", "currency": "GBP", "history": [["2026-11-20", "11.00"]]})
        self.assertEqual(after_close, {
            "asOf": "2026-11-23", "price": "12.50", "currency": "GBP", "previousAsOf": "2026-11-20", "previousPrice": "11.00",
            "history": [["2026-11-20", "11.00"], ["2026-11-23", "12.50"]],
        })

    def test_benchmarks_report_latest_previous_and_year_end_closes(self):
        frame = pd.DataFrame(
            {"Close": [4700.5, 4800, 5000, 5100]},
            index=pd.to_datetime(["2025-12-30", "2025-12-31", "2026-11-20", "2026-11-23"]),
        )
        metadata = {"exchangeTimezoneName": "America/New_York", "currentTradingPeriod": {}}
        with patch.object(market_data, "history", return_value=(frame, metadata)) as history:
            result = market_data.benchmarks(datetime(2026, 11, 24, 12, tzinfo=timezone.utc))
        history.assert_any_call("^GSPC", start="2025-12-15")
        self.assertEqual(result["sp500"], {"asOf": "2026-11-23", "close": "5100.0", "previousClose": "5000.0", "yearStartClose": "4800.0"})
        self.assertEqual(set(result), {"sp500", "vix"})

    def test_benchmarks_accept_no_symbol(self):
        with self.assertRaises(ValueError):
            market_data.run({"operation": "benchmarks", "value": "AAPL"})

    def test_fx_excludes_the_current_daily_candle(self):
        frame = pd.DataFrame(
            {"Close": [0.91, 0.92, 0.93]},
            index=pd.to_datetime(["2026-11-20", "2026-11-23", "2026-11-24"]),
        )
        with patch.object(market_data, "history", return_value=(frame, {})) as history:
            rates = market_data.fx("USD", datetime(2026, 11, 23, 22, tzinfo=timezone.utc))
        history.assert_called_once_with("USDEUR=X", "max")
        self.assertEqual(rates, [["2026-11-20", "0.91"]])
    def test_quote_contains_historical_closes_for_period_returns(self):
        frame = pd.DataFrame({"Close": [10, 12, 15]}, index=pd.to_datetime(["2025-12-31", "2026-10-23", "2026-11-20"]))
        metadata = {"currency": "EUR", "instrumentType": "ETF", "exchangeTimezoneName": "Europe/Paris", "currentTradingPeriod": {}}
        with patch.object(market_data, "history", return_value=(frame, metadata)) as fetch:
            result = market_data.quote("TEST.PA", datetime(2026, 11, 23, tzinfo=timezone.utc))
        fetch.assert_called_once_with("TEST.PA", "max")
        self.assertEqual(result["history"], [["2025-12-31", "10"], ["2026-10-23", "12"], ["2026-11-20", "15"]])
