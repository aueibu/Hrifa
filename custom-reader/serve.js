#!/usr/bin/env node
// index.html fetches feed-data.json, which browsers block over a bare file://
// URL (no CORS origin). This serves the folder over plain HTTP so that works.
//
// Root is the Hrifa project root (one level up), not this folder — index.html
// links to "../design-tokens/build/css/*.css" for shared theme variables, and
// serving only this folder made those 404 silently (so every var(--neutral-*)
// / var(--chrome-accent) resolved to nothing, no error, just invisible styling).

const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = process.env.PORT || 5391;
const ROOT = path.join(__dirname, "..");
const CONTENT_TYPES = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".json": "application/json" };

http
  .createServer((req, res) => {
    if (req.url === "/") {
      res.writeHead(302, { Location: "/custom-reader/" });
      res.end();
      return;
    }
    let filePath = path.join(ROOT, decodeURIComponent(req.url.split("?")[0]));
    if (filePath.endsWith(path.sep)) filePath = path.join(filePath, "index.html");
    fs.readFile(filePath, (err, data) => {
      if (err) {
        res.writeHead(404);
        res.end("Not found");
        return;
      }
      res.writeHead(200, { "Content-Type": CONTENT_TYPES[path.extname(filePath)] || "text/plain" });
      res.end(data);
    });
  })
  .listen(PORT, () => console.log(`Custom Reader running at http://localhost:${PORT}/custom-reader/`));
