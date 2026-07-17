from __future__ import annotations

import json
from pathlib import Path

import pandas as pd


def export_all(output: Path, messages: pd.DataFrame, attachments: pd.DataFrame, tables: dict[str, pd.DataFrame], report_html: str, stats: dict) -> None:
    output.mkdir(parents=True, exist_ok=True)
    messages.drop(columns=["date_dt"], errors="ignore").to_csv(output / "messages.csv", index=False)
    try:
        messages.drop(columns=["date_dt"], errors="ignore").to_parquet(output / "messages.parquet", index=False)
    except (ImportError, ValueError) as exc:
        (output / "parquet-unavailable.txt").write_text(f"Parquet was not written: {exc}\nInstall pyarrow to enable it.\n", encoding="utf-8")
    attachments.to_csv(output / "attachments.csv", index=False)
    for name, frame in tables.items():
        frame.to_csv(output / f"{name}.csv", index=False)
    (output / "summary.json").write_text(json.dumps(stats, indent=2, default=str), encoding="utf-8")
    (output / "dashboard.html").write_text(report_html, encoding="utf-8")
