# Gmail Archive Analytics

An offline-only command-line tool for understanding a Gmail archive exported from Google Takeout. It parses extracted `.mbox` files locally and produces CSV datasets, a Parquet dataset when `pyarrow` is installed, JSON summary metrics, and a standalone dashboard. It never uses Gmail credentials, remote APIs, analytics, CDNs, or message-body previews.

## Install

```powershell
cd "Gmail Analysis"
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -e .
```

## Analyze a Takeout archive

Extract the Takeout archive first, then point the tool at an `.mbox` file or a directory containing them:

```powershell
mail-analytics analyze "C:\Takeout\Mail\All mail Including Spam and Trash.mbox" --output .\output --user-address "me@example.com"
```

Open `output/dashboard.html` directly in a browser. The output includes sender, domain, Gmail-label, timeline, subscription, possible-service, duplicate, attachment, and message CSV datasets; `summary.json`; `messages.parquet` when supported; and `logs/ingestion.log`.

## Browser interface

For the browser-first workflow, start the local server:

```powershell
mail-analytics-web
```

Then open `http://127.0.0.1:8765`. Select one or more extracted `.mbox` files, optionally enter your own addresses, and choose **Analyze locally**. The server binds only to your computer (`127.0.0.1`); uploaded files are held in a temporary local folder while parsing and removed afterwards. The latest dashboard and datasets are kept in `web-output/latest/`.

## Privacy and interpretation

Everything runs locally. By default, full message body text is not exported. Classification is a transparent heuristic based on headers, sender patterns, subjects, and thread metadata; it is an estimate, not a decision. The tool only suggests Gmail search queries through its sender data—it cannot connect to Gmail, delete mail, or unsubscribe on your behalf.

Use `--no-include-spam`, `--no-include-trash`, `--no-store-subjects`, or a YAML configuration file to narrow the analysis.
