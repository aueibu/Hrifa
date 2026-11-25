# PDF Ingest

Local web applet that converts PDFs into LLM-readable Markdown using
[PyMuPDF](https://github.com/pymupdf/PyMuPDF) and
[pymupdf4llm](https://github.com/pymupdf/pymupdf4llm). Extracts text, tables,
and figures/diagrams so the output can be handed to an LLM for grepping/analysis.

## Setup

```bash
python -m venv .venv
.venv/Scripts/pip install -r requirements.txt
```

## Run

```bash
.venv/Scripts/python app.py
```

Then open http://localhost:5000

## Local environment

The `.venv/` directory is deliberately local and ignored by Git. Do not add it
to commits; install or recreate it with the setup commands above instead.

## Settings

- **Output layout** — one Markdown file per PDF, or one file per page.
- **Extract images** — saves embedded figures/diagrams to a `<pdfname>_images/`
  folder next to the output, referenced via relative links in the Markdown.
- **DPI** — resolution used for extracted/rasterized images and for OCR.
- **Table detection strategy** — passed through to pymupdf4llm
  (`lines_strict`, `lines`, `text`); try `lines` or `text` if tables in your
  source docs aren't being picked up.
- **Page range** — e.g. `1-12,15`; blank processes the whole document.
- **OCR fallback** — for pages with no extractable text layer (e.g. scanned
  sheet music or photographed pages), rasterizes the page and runs Tesseract
  OCR, inserting the result with an `<!-- OCR text, page N -->` marker.
  Requires [Tesseract OCR](https://github.com/tesseract-ocr/tesseract) to be
  installed separately and on your PATH — the option is disabled in the UI
  with a warning if it isn't found.

## Known limitations

- Equations and musical notation are extracted as raw visual/text content,
  not semantic LaTeX or MusicXML. For image-only equation/notation regions,
  enable image extraction so the LLM has the source figure for context.
- OCR text (when used) is unstructured plain text — good enough for an LLM
  to work from, but noisier than the native-text-layer path.
