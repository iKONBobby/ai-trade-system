#!/usr/bin/env python3
"""Small JSON bridge used by the Node server for BaoStock fallback data."""

import datetime as dt
import json
import sys

import baostock as bs


def fail(message: str) -> None:
    print(json.dumps({"ok": False, "error": message}, ensure_ascii=False))
    raise SystemExit(1)


def main() -> None:
    if len(sys.argv) != 3 or not sys.argv[1].isdigit():
        fail("usage: baostock-kline.py STOCK_CODE DAYS")

    code = sys.argv[1]
    days = max(1, min(1000, int(sys.argv[2])))
    if code.startswith("6"):
        symbol = f"sh.{code}"
    elif code.startswith(("0", "3")):
        symbol = f"sz.{code}"
    else:
        fail("unsupported stock board")

    end = dt.date.today()
    start = end - dt.timedelta(days=int(days * 1.8) + 45)
    login = bs.login()
    if login.error_code != "0":
        fail(login.error_msg or "BaoStock login failed")

    try:
        fields = "date,open,high,low,close,volume"
        result = bs.query_history_k_data_plus(
            symbol,
            fields,
            start_date=start.isoformat(),
            end_date=end.isoformat(),
            frequency="d",
            adjustflag="2",
        )
        if result.error_code != "0":
            fail(result.error_msg or "BaoStock query failed")

        rows = []
        while result.next():
            values = result.get_row_data()
            try:
                rows.append({
                    "date": values[0],
                    "open": float(values[1]),
                    "high": float(values[2]),
                    "low": float(values[3]),
                    "close": float(values[4]),
                    "volume": float(values[5]),
                })
            except (ValueError, IndexError):
                continue
        print(json.dumps({"ok": True, "klines": rows[-days:]}, ensure_ascii=False))
    finally:
        bs.logout()


if __name__ == "__main__":
    main()
