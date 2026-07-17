"""Browser UI served only on the local machine."""
from __future__ import annotations

import argparse
import shutil
import tempfile
from pathlib import Path
from types import SimpleNamespace

from flask import Flask, Response, abort, redirect, request, send_from_directory, url_for
from werkzeug.utils import secure_filename

from .cli import analyze

HOME = """<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Gmail Archive Analytics</title><style>
body{margin:0;min-height:100vh;background:#f3f6f8;color:#182535;font:16px system-ui,-apple-system,Segoe UI,sans-serif;display:grid;place-items:center}.shell{width:min(720px,calc(100% - 40px));background:white;border:1px solid #d9e2e9;border-radius:18px;padding:38px;box-shadow:0 18px 60px #29465a18}h1{font-size:30px;margin:0 0 10px}.sub{color:#526879;line-height:1.55}.privacy{background:#edf7f1;color:#1e6440;padding:12px 14px;border-radius:8px;margin:24px 0}label.drop{display:block;border:2px dashed #9bb8ca;border-radius:12px;padding:28px;text-align:center;background:#f8fbfd;cursor:pointer}input[type=file]{display:none}.picked{margin:14px 0;color:#455c70}.row{display:flex;gap:18px;flex-wrap:wrap;margin:18px 0}.row label{font-size:14px}button{border:0;border-radius:8px;background:#116b9d;color:white;font:inherit;font-weight:650;padding:12px 18px;cursor:pointer}button:disabled{opacity:.5;cursor:wait}.hint{font-size:13px;color:#607587;margin-top:24px}</style></head><body><main class="shell"><h1>Gmail Archive Analytics</h1><p class="sub">Select one or more extracted Google Takeout <code>.mbox</code> files. The browser sends them only to the local analysis server running on this computer.</p><p class="privacy"><strong>Local only.</strong> No Gmail sign-in, cloud service, telemetry, or external upload is used.</p><form method="post" action="/analyze" enctype="multipart/form-data" id="form"><label class="drop"><strong>Choose MBOX files</strong><br><span>Multiple files are supported</span><input id="files" name="archives" type="file" accept=".mbox" multiple required></label><p class="picked" id="picked">No files selected</p><div class="row"><label>Your email addresses (optional)<br><input name="user_addresses" placeholder="me@example.com, old@example.com" size="42"></label></div><div class="row"><label><input type="checkbox" name="include_spam" checked> Include spam</label><label><input type="checkbox" name="include_trash" checked> Include trash</label><label><input type="checkbox" name="store_subjects" checked> Store subjects in exports</label></div><button id="run" type="submit">Analyze locally</button></form><p class="hint">Larger archives can take a few minutes. The analysis output stays in the app's <code>web-output</code> folder so you can reopen the dashboard later.</p></main><script>const f=document.querySelector('#files'),p=document.querySelector('#picked'),form=document.querySelector('#form'),b=document.querySelector('#run');f.onchange=()=>p.textContent=[...f.files].map(x=>x.name+' ('+(x.size/1048576).toFixed(1)+' MB)').join(', ')||'No files selected';form.onsubmit=()=>{b.disabled=true;b.textContent='Analyzing locally...'};</script></body></html>"""


def create_app(output_root: str = "web-output") -> Flask:
    app = Flask(__name__)
    root = Path(output_root).resolve()
    root.mkdir(parents=True, exist_ok=True)
    app.config["MAX_CONTENT_LENGTH"] = 20 * 1024 * 1024 * 1024

    @app.get("/")
    def home():
        return Response(HOME, mimetype="text/html")

    @app.post("/analyze")
    def analyze_upload():
        files = [f for f in request.files.getlist("archives") if f and f.filename]
        if not files:
            abort(400, "Choose at least one .mbox file.")
        session = root / "latest"
        shutil.rmtree(session, ignore_errors=True)
        session.mkdir(parents=True)
        with tempfile.TemporaryDirectory(prefix="mail-analytics-") as temp:
            saved = []
            for upload in files:
                name = secure_filename(upload.filename)
                if not name.lower().endswith(".mbox"):
                    abort(400, "Only .mbox files are accepted.")
                target = Path(temp) / name
                upload.save(target)
                saved.append(str(target))
            addresses = [a.strip() for a in request.form.get("user_addresses", "").split(",") if a.strip()]
            args = SimpleNamespace(inputs=saved, output=str(session), config=None, user_address=addresses, include_spam="include_spam" in request.form, include_trash="include_trash" in request.form, store_subjects="store_subjects" in request.form)
            status = analyze(args)
            if status:
                abort(500, "No messages could be parsed. Check that this is an extracted Gmail MBOX file.")
        return redirect(url_for("dashboard"))

    @app.get("/dashboard")
    def dashboard():
        file = root / "latest" / "dashboard.html"
        if not file.exists():
            return redirect(url_for("home"))
        return send_from_directory(file.parent, file.name)

    @app.get("/downloads/<path:name>")
    def download(name: str):
        directory = root / "latest"
        if not (directory / name).is_file():
            abort(404)
        return send_from_directory(directory, name, as_attachment=True)
    return app


def main(argv=None) -> None:
    parser = argparse.ArgumentParser(description="Run the local Gmail Archive Analytics web interface")
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument("--output", default="web-output")
    args = parser.parse_args(argv)
    print(f"Open http://127.0.0.1:{args.port} in your browser. This server accepts local connections only.")
    create_app(args.output).run(host="127.0.0.1", port=args.port, debug=False)


if __name__ == "__main__":
    main()
