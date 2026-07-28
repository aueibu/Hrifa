#!/usr/bin/env node
// Fetches every feed in sources.json, sorts all items by publish date (most
// recent first), and writes the result to feed-data.json for index.html to
// render. Each source is fetched and parsed independently, so one broken or
// blocked feed doesn't take the rest of the digest down with it.
//
// For sources marked "fullContent": true, also fetches each article's page
// and runs it through Readability (the same extraction Chromium's reading
// mode uses) so the full piece can be read inline instead of only a teaser.
// Sources left at "fullContent": false either already publish full text in
// the feed itself (Poetry Foundation's content:encoded) or sit behind a bot
// checkpoint that a plain fetch can't and shouldn't try to get through
// (Aeon/Psyche return a Vercel/Cloudflare challenge page, not the article) —
// those fall back to whatever the feed itself provides.
//
// `item.content` is sanitized HTML (via DOMPurify + jsdom), not plain text —
// this keeps images, links, and formatting so the reading pane can render the
// real article rather than a flattened wall of text. It's sanitized here at
// build time so the static frontend never has to trust or clean raw
// third-party markup itself.

const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");
const createDOMPurify = require("dompurify");
const { Readability } = require("@mozilla/readability");
const { GoogleDecoder } = require("google-news-url-decoder");

const SOURCES_PATH = path.join(__dirname, "sources.json");
const OUTPUT_PATH = process.env.READER_OUTPUT_PATH || path.join(__dirname, "feed-data.json");
const FETCH_TIMEOUT_MS = 15000;
const FULL_CONTENT_CONCURRENCY = 3;
// Google News keeps RSS article URLs behind an opaque redirect. Resolve only
// the newest entries from each opted-in source, in batches against Google, so
// a daily build does not turn into a broad publisher-page crawl.
const GOOGLE_NEWS_RESOLVE_MAX_PER_SOURCE = 12;
const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

const ALLOWED_TAGS = ["p", "br", "strong", "b", "em", "i", "a", "img", "figure", "figcaption", "blockquote", "ul", "ol", "li", "h2", "h3", "h4", "code", "pre"];
const ALLOWED_ATTR = ["href", "src", "alt", "title", "data-reader-font-kind", "data-reader-italic"];

function unwrapCdata(text) {
  return text.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").trim();
}

function decodeEntities(text) {
  return unwrapCdata(text)
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, " ")
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)));
}

// Turns feed-supplied HTML into plain text while keeping paragraph/line
// breaks — used only for the short list-preview teaser and the title, where
// we deliberately want plain text, not markup.
function htmlToText(html) {
  const decoded = decodeEntities(html).replace(/\r\n?/g, "\n");
  const withBreaks = decoded.replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|div|li)>/gi, "\n\n");
  return withBreaks
    .replace(/<[^>]*>/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/ *\n */g, "\n")
    .trim();
}

// Preserve typography as a small semantic hint rather than carrying publisher
// CSS into the reader. This keeps reader text locally styled and predictable
// while honouring an explicit inline source declaration when one is available.
function readerFontKind(fontFamily) {
  const family = String(fontFamily || "").toLowerCase();
  if (!family) return null;
  if (/monospace|courier|consolas|menlo|monaco|code/.test(family)) return "mono";
  if (/sans-serif|sans serif|arial|helvetica|verdana|tahoma|figtree|inter|ui-sans/.test(family)) return "sans";
  if (/serif|georgia|times|garamond|baskerville|crimson|palatino/.test(family)) return "serif";
  return null;
}

function annotateReaderTypography(document) {
  document.body.querySelectorAll("[style]").forEach((element) => {
    const kind = readerFontKind(element.style.fontFamily);
    if (kind) element.setAttribute("data-reader-font-kind", kind);
    if (/italic|oblique/i.test(element.style.fontStyle) || /(?:^|[;\s])(?:italic|oblique)(?:[;\s]|$)/i.test(element.getAttribute("style") || "")) {
      element.setAttribute("data-reader-italic", "true");
    }
  });
}

// Sanitizes a raw HTML fragment down to a small allowlist of tags/attributes
// via DOMPurify (using jsdom as the DOM backend — jsdom is DOMPurify's
// officially supported Node target; a lighter DOM shim was tried first and
// silently let scripts/event-handlers straight through, which is worse than
// no sanitization since it looks safe but isn't).
function sanitizeHtml(rawHtmlFragment, baseUrl) {
  if (!rawHtmlFragment) return "";
  const dom = new JSDOM(`<!doctype html><body>${rawHtmlFragment}</body>`, { url: baseUrl });
  const { document } = dom.window;
  annotateReaderTypography(document);
  // DOMPurify sanitizes the raw attribute string, not a resolved URL, so
  // relative src/href need resolving to absolute first — reading the `.src`/
  // `.href` IDL property (rather than getAttribute) gives jsdom's already-
  // resolved absolute URL, using the document's own baseURI.
  document.querySelectorAll("img[src]").forEach((img) => img.setAttribute("src", img.src));
  document.querySelectorAll("a[href]").forEach((a) => a.setAttribute("href", a.href));
  const DOMPurify = createDOMPurify(dom.window);
  return DOMPurify.sanitize(document.body.innerHTML, { ALLOWED_TAGS, ALLOWED_ATTR }).trim();
}

function extractTag(block, tag) {
  const match = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, "i").exec(block);
  return match ? match[1].trim() : "";
}

function extractLink(block) {
  // RSS: <link>https://example.com</link>
  const rssLink = decodeEntities(extractTag(block, "link")).trim();
  if (rssLink && !rssLink.includes("<")) return rssLink;
  // Atom: <link rel="alternate" href="https://example.com" />
  const atomLinks = [...block.matchAll(/<link\b([^>]*)\/?>/gi)];
  for (const [, attrs] of atomLinks) {
    const relMatch = /rel="([^"]*)"/.exec(attrs);
    const hrefMatch = /href="([^"]*)"/.exec(attrs);
    if (hrefMatch && (!relMatch || relMatch[1] === "alternate")) return decodeEntities(hrefMatch[1]);
  }
  return "";
}

function parseFeed(xml) {
  const items = [];
  const blocks = [
    ...xml.matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/gi),
    ...xml.matchAll(/<entry(?:\s[^>]*)?>([\s\S]*?)<\/entry>/gi),
  ];
  for (const [, block] of blocks) {
    const title = htmlToText(extractTag(block, "title"));
    const link = extractLink(block);
    const dateText =
      extractTag(block, "pubDate") ||
      extractTag(block, "published") ||
      extractTag(block, "updated") ||
      extractTag(block, "dc:date");
    const date = dateText ? new Date(dateText) : null;
    const descriptionRaw = extractTag(block, "description") || extractTag(block, "summary");
    const encodedRaw = extractTag(block, "content:encoded") || extractTag(block, "content");
    const summary = htmlToText(descriptionRaw || encodedRaw).slice(0, 240);
    // The feed's own full markup, when it has one (e.g. Poetry Foundation's
    // poems, or Aeon/Psyche's teaser with its lead image) — some feeds wrap
    // this in CDATA (Aeon/Psyche), others XML-entity-escape it instead
    // (Google News: "&lt;a href=...&gt;"), so it needs a full entity decode,
    // not just a CDATA unwrap, to recover real markup for sanitizeHtml().
    const feedContentRaw = decodeEntities(encodedRaw.length > descriptionRaw.length ? encodedRaw : descriptionRaw || encodedRaw);
    if (title && link) {
      items.push({ title, link, date: date && !isNaN(date) ? date.toISOString() : null, summary, feedContentRaw });
    }
  }
  return items;
}

async function fetchResponse(url, { timeoutMs = FETCH_TIMEOUT_MS, headers = {} } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      signal: controller.signal,
      headers: { "user-agent": USER_AGENT, ...headers },
    });
  } finally {
    clearTimeout(timer);
  }
}

async function fetchText(url, options = {}) {
  const res = await fetchResponse(url, options);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.text();
}

function conditionalHeaders(cache) {
  const headers = {};
  if (cache?.etag) headers["if-none-match"] = cache.etag;
  if (cache?.lastModified) headers["if-modified-since"] = cache.lastModified;
  return headers;
}

function responseCache(res) {
  const etag = res.headers.get("etag");
  const lastModified = res.headers.get("last-modified");
  return {
    ...(etag ? { etag } : {}),
    ...(lastModified ? { lastModified } : {}),
  };
}

function isGoogleNewsUrl(value) {
  try {
    return new URL(value).hostname === "news.google.com";
  } catch (e) {
    return false;
  }
}

async function fetchFeed({ name, url, fullContent, resolveGoogleNews }, cache, previousItems) {
  try {
    const res = await fetchResponse(url, { headers: conditionalHeaders(cache) });
    if (res.status === 304) {
      if (!cache) throw new Error("HTTP 304 without a cached feed");
      return {
        name,
        ok: true,
        notModified: true,
        cache,
        items: previousItems.map((item) => ({
          ...item,
          fullContent: false,
          resolveGoogleNews: !!resolveGoogleNews && isGoogleNewsUrl(item.link),
        })),
      };
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const xml = await res.text();
    const items = parseFeed(xml).map((item) => ({ ...item, source: name, fullContent: !!fullContent, resolveGoogleNews: !!resolveGoogleNews }));
    return { name, ok: true, notModified: false, cache: responseCache(res), items };
  } catch (err) {
    return { name, ok: false, error: err.message, cache, items: [] };
  }
}

function isHttpUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch (e) {
    return false;
  }
}

async function resolveGoogleNewsUrls(items) {
  const decoder = new GoogleDecoder();
  const bySource = new Map();
  items.filter((item) => item.resolveGoogleNews && isGoogleNewsUrl(item.link)).forEach((item) => {
    if (!bySource.has(item.source)) bySource.set(item.source, []);
    bySource.get(item.source).push(item);
  });

  let resolved = 0;
  let failed = 0;
  for (const [source, sourceItems] of bySource) {
    const candidates = sourceItems.slice(0, GOOGLE_NEWS_RESOLVE_MAX_PER_SOURCE);
    try {
      const results = await decoder.decodeBatch(candidates.map((item) => item.link));
      results.forEach((result, index) => {
        if (result && result.status && isHttpUrl(result.decoded_url)) {
          candidates[index].link = result.decoded_url;
          resolved++;
        } else {
          failed++;
        }
      });
    } catch (err) {
      failed += candidates.length;
      console.warn(`  could not resolve ${source} Google News URLs: ${err.message}`);
    }
  }
  return { resolved, failed };
}

// Fetches an article's own page and runs Readability on it — the same
// extraction algorithm behind Chromium's reading mode — to pull out just the
// article body (as HTML, with images/links intact), stripped of nav/ads/chrome.
async function scrapeArticleHtml(url) {
  const html = await fetchText(url, { timeoutMs: 20000 });
  const dom = new JSDOM(html, { url });
  const article = new Readability(dom.window.document).parse();
  if (!article || !article.textContent || article.textContent.trim().length < 200) {
    throw new Error("Readability found no usable article content");
  }
  return article.content;
}

async function mapWithConcurrency(items, limit, worker) {
  const results = new Array(items.length);
  let next = 0;
  async function run() {
    while (next < items.length) {
      const i = next++;
      results[i] = await worker(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
  return results;
}

async function main() {
  const sources = JSON.parse(fs.readFileSync(SOURCES_PATH, "utf8"));

  let previousContent = new Map();
  let previousItemsBySource = new Map();
  let previousSourceCache = {};
  try {
    const previous = JSON.parse(fs.readFileSync(OUTPUT_PATH, "utf8"));
    const previousItems = Array.isArray(previous.items) ? previous.items : [];
    previousContent = new Map(previousItems.filter((i) => i.content).map((i) => [i.link, i.content]));
    previousItems.forEach((item) => {
      if (!previousItemsBySource.has(item.source)) previousItemsBySource.set(item.source, []);
      previousItemsBySource.get(item.source).push(item);
    });
    previousSourceCache = previous.sourceCache && typeof previous.sourceCache === "object" ? previous.sourceCache : {};
  } catch (e) {
    // no previous run to reuse — fine, everything gets fetched fresh
  }

  const results = await Promise.all(sources.map((source) => fetchFeed(
    source,
    previousSourceCache[source.name],
    previousItemsBySource.get(source.name) || []
  )));

  const seen = new Set();
  let items = results
    .flatMap((r) => r.items)
    .filter((item) => {
      if (seen.has(item.link)) return false;
      seen.add(item.link);
      return true;
    })
    .sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));

  const googleResolved = await resolveGoogleNewsUrls(items);
  const canonicalSeen = new Set();
  items = items.filter((item) => {
    if (canonicalSeen.has(item.link)) return false;
    canonicalSeen.add(item.link);
    return true;
  });

  let scraped = 0;
  let scrapeFailed = 0;
  await mapWithConcurrency(items, FULL_CONTENT_CONCURRENCY, async (item) => {
    if (previousContent.has(item.link)) {
      item.content = previousContent.get(item.link);
      return;
    }
    if (item.fullContent) {
      try {
        item.content = sanitizeHtml(await scrapeArticleHtml(item.link), item.link);
        scraped++;
      } catch (err) {
        item.content = sanitizeHtml(item.feedContentRaw, item.link);
        scrapeFailed++;
      }
    } else {
      item.content = sanitizeHtml(item.feedContentRaw, item.link);
    }
  });
  items.forEach((item) => {
    delete item.fullContent;
    delete item.feedContentRaw;
    delete item.resolveGoogleNews;
  });

  const errors = results.filter((r) => !r.ok).map(({ name, error }) => ({ name, error }));
  const sourceCache = Object.fromEntries(results
    .filter((result) => result.cache)
    .map((result) => [result.name, result.cache]));
  const notModified = results.filter((result) => result.ok && result.notModified).length;

  fs.writeFileSync(
    OUTPUT_PATH,
    JSON.stringify({ generatedAt: new Date().toISOString(), items, errors, sourceCache }, null, 2)
  );

  console.log(`Wrote ${items.length} items from ${results.length - errors.length}/${results.length} sources to feed-data.json`);
  console.log(`  ${notModified} source(s) returned 304 Not Modified and reused their cached items`);
  console.log(`  fetched full article HTML for ${scraped} item(s); ${scrapeFailed} fell back to the feed's own markup`);
  console.log(`  resolved ${googleResolved.resolved} Google News URL(s); ${googleResolved.failed} retained their Google News link`);
  errors.forEach((e) => console.warn(`  skipped ${e.name}: ${e.error}`));
}

main();
