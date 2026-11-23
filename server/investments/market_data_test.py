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
        self.assertEqual(before_close, {"asOf": "2026-11-20", "price": "11.00", "currency": "GBP"})
        self.assertEqual(after_close, {"asOf": "2026-11-23", "price": "12.50", "currency": "GBP"})

    def test_fx_excludes_the_current_daily_candle(self):
        frame = pd.DataFrame(
            {"Close": [0.91, 0.92, 0.93]},
            index=pd.to_datetime(["2026-11-20", "2026-11-23", "2026-11-24"]),
        )
        with patch.object(market_data, "history", return_value=(frame, {})) as history:
            rates = market_data.fx("USD", datetime(2026, 11, 23, 22, tzinfo=timezone.utc))
        history.assert_called_once_with("USDEUR=X", "1mo")
        self.assertEqual(rates, [["2026-11-20", "0.91"]])
