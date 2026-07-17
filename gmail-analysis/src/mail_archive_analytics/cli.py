from __future__ import annotations

import argparse
import logging
from pathlib import Path

import pandas as pd

from .aggregation import aggregate, summary
from .classification import classify
from .config import load_settings
from .discovery import resolve_mbox_files
from .exports import export_all
from .parser import parse_mboxes
from .report import build_dashboard


def analyze(args) -> int:
    output = Path(args.output)
    output.mkdir(parents=True, exist_ok=True)
    log_dir = output / "logs"; log_dir.mkdir(exist_ok=True)
    logging.basicConfig(filename=log_dir / "ingestion.log", level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    settings = load_settings(args.config, args.user_address, include_spam=args.include_spam, include_trash=args.include_trash, store_subjects=args.store_subjects)
    files = resolve_mbox_files(args.inputs)
    print(f"Local-only analysis: parsing {len(files)} MBOX file(s). No data leaves this computer.")
    records: list[dict] = []; attachments: list[dict] = []
    def progress(count, bytes_read, total_bytes, path, file_offset, file_size):
        percent = (bytes_read / total_bytes * 100) if total_bytes else 100
        file_percent = (file_offset / file_size * 100) if file_size else 100
        print(f"Parsed messages: {count:,} | {percent:5.1f}% overall | {path.name}: {file_percent:5.1f}%")
    for record, items in parse_mboxes(files, settings, logging.getLogger(__name__), progress=progress):
        if (record["is_spam"] and not settings.include_spam) or (record["is_trash"] and not settings.include_trash): continue
        records.append(classify(record)); attachments.extend(items)
    messages = pd.DataFrame(records)
    if messages.empty:
        print("No messages were parsed. See logs/ingestion.log."); return 2
    attachment_frame = pd.DataFrame(attachments, columns=["message_id", "sender", "date", "filename", "extension", "mime_type", "size_bytes"])
    tables = aggregate(messages); stats = summary(messages, tables)
    export_all(output, messages, attachment_frame, tables, build_dashboard(stats, tables), stats)
    print(f"Parsed successfully: {len(messages):,}. Dashboard: {output / 'dashboard.html'}")
    return 0


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(prog="mail-analytics", description="Private offline Gmail Takeout MBOX analysis")
    sub = parser.add_subparsers(dest="command", required=True)
    p = sub.add_parser("analyze", help="Analyze one or more MBOX files or directories")
    p.add_argument("inputs", nargs="+"); p.add_argument("--output", default="gmail-analysis-output"); p.add_argument("--config"); p.add_argument("--user-address", action="append", default=[])
    p.add_argument("--include-spam", action=argparse.BooleanOptionalAction, default=None); p.add_argument("--include-trash", action=argparse.BooleanOptionalAction, default=None); p.add_argument("--store-subjects", action=argparse.BooleanOptionalAction, default=None)
    args = parser.parse_args(argv)
    return analyze(args)


if __name__ == "__main__": raise SystemExit(main())
