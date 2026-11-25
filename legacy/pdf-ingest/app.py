import io
import os
import shutil
import threading
import time
import traceback
from concurrent.futures import ProcessPoolExecutor, as_completed
from pathlib import Path

import fitz  # PyMuPDF
import pymupdf4llm
from flask import Flask, jsonify, render_template, request

app = Flask(__name__)

# Single-job progress state. Processes a queue of PDFs one at a time (each
# still parallelized across all its own worker processes).
# - queue: [{path, filename, status: pending/running/done/error, written, error}]
# - queue_index: index of the file currently running (-1 before start / after finish)
# - meta/current/total/page_log/log/ok/written below describe the CURRENTLY
#   running (or just-finished) queue item specifically.
_job_lock = threading.Lock()
_job = {
    "running": False,
    "queue": [],
    "queue_index": -1,
    "current": 0,
    "total": 0,
    "meta": None,
    "started_at": None,
    "finished_at": None,
    "page_log": [],
    "log": [],
    "ok": None,
    "written": [],
}

TABLE_STRATEGIES = ["lines_strict", "lines", "text"]

_MD_UNSAFE_DASHES = "‐‑‒–—―−"


def sanitize_for_md_path(name):
    """Mirror pymupdf4llm's md_path() character substitutions (spaces/parens/
    unicode dashes), so a directory we create matches the path it actually
    writes extracted images to. See pymupdf4llm.helpers.utils.md_path -
    it sanitizes the save path itself, not just the markdown reference,
    so a pre-existing folder with those characters causes a FileNotFoundError."""
    for ch in "()[]":
        name = name.replace(ch, "-")
    name = name.replace(" ", "_")
    for ch in _MD_UNSAFE_DASHES:
        name = name.replace(ch, "-")
    return name


def tesseract_available():
    if shutil.which("tesseract"):
        return True
    try:
        import pytesseract

        pytesseract.get_tesseract_version()
        return True
    except Exception:
        return False


def parse_page_range(spec, page_count):
    """Parse '1-12,15' (1-based, inclusive) into a sorted list of 0-based indices."""
    if not spec or not spec.strip():
        return list(range(page_count))
    pages = set()
    for part in spec.split(","):
        part = part.strip()
        if not part:
            continue
        if "-" in part:
            start_s, end_s = part.split("-", 1)
            start, end = int(start_s), int(end_s)
            for p in range(start, end + 1):
                if 1 <= p <= page_count:
                    pages.add(p - 1)
        else:
            p = int(part)
            if 1 <= p <= page_count:
                pages.add(p - 1)
    return sorted(pages)


def ocr_page_text(page, dpi):
    from PIL import Image
    import pytesseract

    pix = page.get_pixmap(dpi=dpi)
    img = Image.open(io.BytesIO(pix.tobytes("png")))
    text = pytesseract.image_to_string(img)
    return text.strip()


def reencode_png_for_compat(path):
    """Re-save a PNG through Pillow's encoder with an explicit sRGB chunk.

    MuPDF's own PNG writer (used by pix.save()) only emits IHDR/pHYs/IDAT/IEND -
    a minimal but spec-valid PNG. Some strict/older decoders (observed: IrfanView)
    flag files missing optional colorimetry chunks as "possibly damaged" even
    though they open and decode fine elsewhere (e.g. Windows Photos). Re-encoding
    through Pillow with an sRGB chunk matches what mainstream image editors
    produce and resolves those false positives.
    """
    from PIL import Image
    from PIL.PngImagePlugin import PngInfo

    with Image.open(path) as im:
        im.load()
        pnginfo = PngInfo()
        pnginfo.add(b"sRGB", b"\x00")  # rendering intent: perceptual
        im.save(path, format="PNG", pnginfo=pnginfo)


# --- Worker-process globals & functions for parallel page conversion ---
# ProcessPoolExecutor on Windows uses spawn, so worker targets must be
# top-level (picklable) functions. Each worker opens its own fitz.Document
# once (via the pool initializer) and reuses it for every page it's handed,
# rather than reopening the PDF per task.
_worker_doc = None


def _pool_init(pdf_path, out_dir):
    global _worker_doc
    _worker_doc = fitz.open(pdf_path)
    # See the note in process_pdf about why this chdir is needed: pymupdf4llm
    # sanitizes its own save path and needs a cwd-relative image_path to stay
    # consistent. Each worker process has its own cwd, so this is safe.
    os.chdir(out_dir)


def _convert_one_page(idx, extract_images, image_dir_name, dpi, table_strategy, use_ocr):
    page = _worker_doc[idx]
    has_text = bool(page.get_text().strip())

    page_chunks = pymupdf4llm.to_markdown(
        _worker_doc,
        pages=[idx],
        page_chunks=True,
        write_images=extract_images,
        image_path=image_dir_name if extract_images else None,
        dpi=dpi,
        table_strategy=table_strategy,
    )
    # pymupdf4llm returns a defaultdict with a lambda default_factory, which
    # isn't picklable across process boundaries. Pull out only the plain
    # values we actually use.
    text = page_chunks[0]["text"]
    page_number = page_chunks[0]["metadata"]["page_number"]
    log_lines = []

    if extract_images:
        img_dir = Path(image_dir_name)
        if img_dir.exists():
            # Scope by this page's own filename pattern rather than diffing the
            # shared images directory - multiple worker processes write into the
            # same folder concurrently, so a before/after directory snapshot can
            # catch another worker's file mid-write (or attribute it to the
            # wrong page), causing "cannot identify image file" errors. Every
            # image pymupdf4llm writes for this page is named
            # "<doc>-{page:04d}-{n:02d}.<ext>", which is unique to this page
            # number, so glob-matching on it only ever touches files this same
            # to_markdown() call just finished writing synchronously.
            pattern = f"*-{idx + 1:04d}-*.*"
            for img_path in sorted(img_dir.glob(pattern)):
                try:
                    reencode_png_for_compat(img_path)
                except Exception as e:
                    log_lines.append(f"  Warning: could not re-encode {img_path.name}: {e}")

    if not has_text:
        log_lines.append(f"Page {idx + 1}: no extractable text layer.")
        if use_ocr:
            try:
                ocr_text = ocr_page_text(page, dpi)
            except Exception as e:
                ocr_text = ""
                log_lines.append(f"  OCR failed on page {idx + 1}: {e}")
            if ocr_text:
                text = (
                    text.strip()
                    + f"\n\n<!-- OCR text, page {idx + 1} (no native text layer) -->\n\n"
                    + ocr_text
                )
                log_lines.append(f"  OCR added text for page {idx + 1} ({len(ocr_text)} chars).")

    return idx, {"text": text, "page_number": page_number}, log_lines


def process_pdf(pdf_path, out_dir, layout, extract_images, dpi,
                 table_strategy, page_range_spec, use_ocr, log,
                 max_workers_cap=None, progress_cb=None, meta_cb=None, page_log_cb=None):
    pdf_path = Path(pdf_path).resolve()
    out_dir = Path(out_dir).resolve()
    out_dir.mkdir(parents=True, exist_ok=True)

    doc = fitz.open(pdf_path)
    pages = parse_page_range(page_range_spec, doc.page_count)
    doc_page_count = doc.page_count

    stem = pdf_path.stem
    safe_stem = sanitize_for_md_path(stem)
    image_dir_name = f"{safe_stem}_images"
    if extract_images:
        (out_dir / image_dir_name).mkdir(parents=True, exist_ok=True)

    total = len(pages)
    doc.close()

    # pymupdf4llm builds its saved image paths by sanitizing the full path string
    # (spaces/parens/dashes -> underscores/dashes) and using that same sanitized
    # string as the actual filesystem target. Each worker chdirs into out_dir
    # (see _pool_init) with an already-sanitized, cwd-relative image_path, so the
    # computed path stays consistent regardless of spaces elsewhere on disk
    # (e.g. "Program Files", user folder names).
    cpu_count = os.cpu_count() or 1
    cap = max_workers_cap if max_workers_cap else cpu_count
    max_workers = max(1, min(cap, cpu_count, total))

    if meta_cb:
        meta_cb({
            "filename": pdf_path.name,
            "page_count": doc_page_count,
            "processing_count": total,
            "workers": max_workers,
            "cpu_count": cpu_count,
        })
    if progress_cb:
        progress_cb(0, total)

    results = {}
    with ProcessPoolExecutor(
        max_workers=max_workers, initializer=_pool_init, initargs=(str(pdf_path), str(out_dir)),
    ) as executor:
        futures = {
            executor.submit(_convert_one_page, idx, extract_images, image_dir_name, dpi, table_strategy, use_ocr): idx
            for idx in pages
        }
        completed = 0
        for future in as_completed(futures):
            idx, chunk, page_notes = future.result()
            results[idx] = chunk
            completed += 1
            if page_log_cb:
                for note in page_notes:
                    page_log_cb(note)
                page_log_cb(f"Converted page {idx + 1} ({completed}/{total}).")
            if progress_cb:
                progress_cb(completed, total)

    chunks = [results[idx] for idx in pages]

    written = []
    if layout == "per_page":
        page_dir = out_dir / stem
        page_dir.mkdir(parents=True, exist_ok=True)
        for chunk in chunks:
            page_no = chunk["page_number"]
            out_file = page_dir / f"page_{page_no:04d}.md"
            out_file.write_text(chunk["text"], encoding="utf-8")
            written.append(str(out_file))
        log.append(f"Wrote {len(chunks)} page file(s) to {page_dir}")
    else:
        out_file = out_dir / f"{stem}.md"
        full_text = "\n\n".join(chunk["text"] for chunk in chunks)
        out_file.write_text(full_text, encoding="utf-8")
        written.append(str(out_file))
        log.append(f"Wrote {out_file}")

    return written


@app.route("/")
def index():
    return render_template(
        "index.html",
        table_strategies=TABLE_STRATEGIES,
        ocr_available=tesseract_available(),
        default_out=str(Path.cwd() / "output"),
        cpu_count=os.cpu_count() or 1,
    )


@app.route("/browse-file")
def browse_file():
    import tkinter as tk
    from tkinter import filedialog

    root = tk.Tk()
    root.withdraw()
    root.attributes("-topmost", True)
    path = filedialog.askopenfilename(
        title="Select a PDF", filetypes=[("PDF files", "*.pdf")]
    )
    root.destroy()
    return jsonify({"path": path})


@app.route("/browse-files")
def browse_files():
    import tkinter as tk
    from tkinter import filedialog

    root = tk.Tk()
    root.withdraw()
    root.attributes("-topmost", True)
    paths = filedialog.askopenfilenames(
        title="Select PDF(s)", filetypes=[("PDF files", "*.pdf")]
    )
    root.destroy()
    return jsonify({"paths": list(paths)})


@app.route("/browse-dir")
def browse_dir():
    import tkinter as tk
    from tkinter import filedialog

    root = tk.Tk()
    root.withdraw()
    root.attributes("-topmost", True)
    path = filedialog.askdirectory(title="Select output directory")
    root.destroy()
    return jsonify({"path": path})


def _run_queue_job(out_dir, layout, extract_images, dpi, table_strategy, page_range, use_ocr,
                    max_workers_cap):
    with _job_lock:
        queue_len = len(_job["queue"])

    for i in range(queue_len):
        with _job_lock:
            _job["queue"][i]["status"] = "running"
            _job["queue_index"] = i
            _job["current"] = 0
            _job["total"] = 0
            _job["meta"] = None
            _job["started_at"] = time.time()
            _job["finished_at"] = None
            _job["page_log"] = []
            _job["log"] = []
            _job["ok"] = None
            pdf_path = _job["queue"][i]["path"]
        # Re-fetch these each iteration: they were just replaced with new list
        # objects above, so a stale reference from a prior loop turn would
        # silently write into a list nobody polls anymore.
        log = _job["log"]
        page_log = _job["page_log"]

        def meta_cb(meta):
            with _job_lock:
                _job["meta"] = meta

        def progress_cb(current, total):
            with _job_lock:
                _job["current"] = current
                _job["total"] = total

        def page_log_cb(line):
            page_log.append(line)

        try:
            written = process_pdf(
                pdf_path, out_dir, layout, extract_images, dpi,
                table_strategy, page_range, use_ocr, log,
                max_workers_cap=max_workers_cap,
                progress_cb=progress_cb, meta_cb=meta_cb, page_log_cb=page_log_cb,
            )
            with _job_lock:
                _job["queue"][i]["status"] = "done"
                _job["queue"][i]["written"] = written
                _job["ok"] = True
                _job["written"] = written
        except Exception as e:
            log.append(f"ERROR: {e}")
            log.append(traceback.format_exc())
            with _job_lock:
                _job["queue"][i]["status"] = "error"
                _job["queue"][i]["error"] = str(e)
                _job["ok"] = False
        finally:
            with _job_lock:
                _job["finished_at"] = time.time()

    with _job_lock:
        _job["running"] = False


@app.route("/process", methods=["POST"])
def process():
    data = request.get_json(force=True)

    with _job_lock:
        if _job["running"]:
            return jsonify({"ok": False, "log": ["A job is already running."]})

    pdf_paths = data.get("pdf_paths")
    if not pdf_paths:
        # Back-compat with a single pdf_path.
        single = data.get("pdf_path", "").strip()
        pdf_paths = [single] if single else []
    pdf_paths = [p.strip() for p in pdf_paths if p and p.strip()]

    if not pdf_paths:
        return jsonify({"ok": False, "log": ["No PDF(s) selected."]})
    missing = [p for p in pdf_paths if not Path(p).is_file()]
    if missing:
        return jsonify({"ok": False, "log": [f"File not found: {p}" for p in missing]})

    out_dir = data.get("out_dir", "").strip()
    if not out_dir:
        out_dir = str(Path.cwd() / "output")

    layout = data.get("layout", "single")
    extract_images = bool(data.get("extract_images", False))
    dpi = int(data.get("dpi", 150))
    table_strategy = data.get("table_strategy", "lines_strict")
    page_range = data.get("page_range", "")
    use_ocr = bool(data.get("use_ocr", False)) and tesseract_available()

    cpu_count = os.cpu_count() or 1
    cpu_mode = data.get("cpu_mode", "multi")
    if cpu_mode == "single":
        max_workers_cap = 1
    else:
        try:
            max_workers_cap = int(data.get("max_cores", cpu_count))
        except (TypeError, ValueError):
            max_workers_cap = cpu_count
        max_workers_cap = max(1, min(max_workers_cap, cpu_count))

    queue = [
        {"path": p, "filename": Path(p).name, "status": "pending", "written": [], "error": None}
        for p in pdf_paths
    ]

    with _job_lock:
        _job.update(
            running=True, queue=queue, queue_index=-1,
            current=0, total=0, meta=None,
            started_at=None, finished_at=None,
            page_log=[], log=[], ok=None, written=[],
        )

    thread = threading.Thread(
        target=_run_queue_job,
        args=(out_dir, layout, extract_images, dpi, table_strategy, page_range, use_ocr,
              max_workers_cap),
        daemon=True,
    )
    thread.start()
    return jsonify({"ok": True, "started": True, "queue_length": len(queue)})


@app.route("/progress")
def progress():
    with _job_lock:
        data = dict(_job)
    started_at = data.pop("started_at", None)
    finished_at = data.pop("finished_at", None)
    if started_at:
        end = finished_at or time.time()
        elapsed = end - started_at
    else:
        elapsed = 0
    data["elapsed_seconds"] = elapsed
    data["avg_seconds_per_page"] = (elapsed / data["current"]) if data["current"] else 0
    return jsonify(data)


if __name__ == "__main__":
    app.run(debug=False, threaded=True, port=5000)
