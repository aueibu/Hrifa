(() => {
  "use strict";

  const generatedAtEl = document.querySelector("#generatedAt");
  const errorBanner = document.querySelector("#errorBanner");
  const filtersEl = document.querySelector("#sourceFilters");
  const countEl = document.querySelector("#count");
  const listEl = document.querySelector("#itemList");
  const columnBoardEl = document.querySelector("#columnBoard");
  const viewToggleEl = document.querySelector("#viewToggle");
  const backToStartBtn = document.querySelector("#backToStartBtn");
  const shellEl = document.querySelector(".shell");
  const readingPaneEl = document.querySelector("#readingPane");
  const paneContentEl = document.querySelector("#paneContent");
  const paneResizeHandleEl = document.querySelector("#paneResizeHandle");
  const savedFilterBtn = document.querySelector("#savedFilterBtn");
  const savedCountEl = document.querySelector("#savedCount");
  const exportSavedBtn = document.querySelector("#exportSavedBtn");
  const importSavedInput = document.querySelector("#importSavedInput");
  const bookmarkStatusEl = document.querySelector("#bookmarkStatus");

  const VIEW_STORAGE_KEY = "customReader.view";
  const PANE_WIDTH_STORAGE_KEY = "customReader.paneWidth";
  const VISITED_STORAGE_KEY = "customReader.visited";
  const BOOKMARKS_STORAGE_KEY = "customReader.bookmarks";
  const BOOKMARK_EXPORT_VERSION = 1;
  const COLUMN_PAGE_SIZE = 5;
  let activeSource = "all";
  let view = "list";
  let selectedLink = null;
  const columnPages = new Map();
  const visitedLinks = new Set();
  const bookmarks = new Map();
  try {
    view = localStorage.getItem(VIEW_STORAGE_KEY) === "columns" ? "columns" : "list";
    JSON.parse(localStorage.getItem(VISITED_STORAGE_KEY) || "[]").forEach((link) => visitedLinks.add(link));
    const storedBookmarks = JSON.parse(localStorage.getItem(BOOKMARKS_STORAGE_KEY) || "[]");
    (Array.isArray(storedBookmarks) ? storedBookmarks : []).forEach((bookmark) => {
      const normalized = normalizeBookmark(bookmark);
      if (normalized) bookmarks.set(normalized.link, normalized);
    });
  } catch (e) {
    // storage unavailable — fall back to list view / no visited history
  }
  let data = { items: [], errors: [], generatedAt: null };

  function relativeTime(iso) {
    if (!iso) return "undated";
    const diffMs = Date.now() - new Date(iso).getTime();
    const hours = Math.round(diffMs / 3600000);
    if (hours < 1) return "just now";
    if (hours < 24) return `${hours}h ago`;
    const days = Math.round(hours / 24);
    if (days < 14) return `${days}d ago`;
    return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  }

  function normalizeBookmark(value) {
    if (!value || typeof value !== "object" || typeof value.link !== "string") return null;
    let url;
    try {
      url = new URL(value.link);
    } catch (e) {
      return null;
    }
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    const text = (field, limit) => (typeof value[field] === "string" ? value[field].slice(0, limit) : "");
    return {
      link: url.href,
      title: text("title", 500) || url.href,
      source: text("source", 160) || "Saved article",
      date: text("date", 80) || null,
      summary: text("summary", 2000),
      savedAt: text("savedAt", 80) || new Date().toISOString(),
    };
  }

  function bookmarkFromItem(item) {
    return normalizeBookmark({
      link: item.link,
      title: item.title,
      source: item.source,
      date: item.date,
      summary: item.summary,
      savedAt: new Date().toISOString(),
    });
  }

  function saveBookmarks() {
    try {
      localStorage.setItem(BOOKMARKS_STORAGE_KEY, JSON.stringify([...bookmarks.values()]));
      return true;
    } catch (e) {
      setBookmarkStatus("Could not save bookmarks in this browser.");
      return false;
    }
  }

  function setBookmarkStatus(message) {
    bookmarkStatusEl.textContent = message;
  }

  function itemForLink(link) {
    return data.items.find((item) => item.link === link) || bookmarks.get(link) || null;
  }

  function savedItems() {
    const currentItems = new Map(data.items.map((item) => [item.link, item]));
    return [...bookmarks.values()]
      .map((bookmark) => ({ ...bookmark, ...(currentItems.get(bookmark.link) || {}) }))
      .sort((a, b) => new Date(b.date || b.savedAt || 0) - new Date(a.date || a.savedAt || 0));
  }

  function renderSavedTools() {
    const count = bookmarks.size;
    savedCountEl.textContent = count;
    savedFilterBtn.classList.toggle("active", activeSource === "saved");
    exportSavedBtn.disabled = count === 0;
  }

  function renderFilters() {
    const sources = ["all", ...new Set(data.items.map((item) => item.source))];
    filtersEl.innerHTML = "";
    sources.forEach((source) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `filter${source === activeSource ? " active" : ""}`;
      button.textContent = source === "all" ? "All sources" : source;
      button.addEventListener("click", () => {
        activeSource = source;
        columnPages.clear();
        renderFilters();
        renderItems();
      });
      filtersEl.append(button);
    });
    renderSavedTools();
  }

  function itemHtml(item, { showSource } = { showSource: true }) {
    const active = item.link === selectedLink;
    const visited = visitedLinks.has(item.link);
    return `
      <li class="item${active ? " active" : ""}${visited ? " visited" : ""}">
        <div class="item-meta">${showSource ? `<span class="item-source">${escapeHtml(item.source)}</span>` : ""}<span>${relativeTime(item.date)}</span></div>
        <h2><button type="button" class="item-title-btn" data-link="${escapeAttr(item.link)}" aria-pressed="${active}">${escapeHtml(item.title)}</button></h2>
        ${item.summary ? `<p class="item-summary">${escapeHtml(item.summary)}</p>` : ""}
      </li>`;
  }

  function renderReadingPane() {
    const item = itemForLink(selectedLink);
    readingPaneEl.classList.toggle("open", !!item);
    readingPaneEl.setAttribute("aria-hidden", item ? "false" : "true");
    if (!item) {
      paneContentEl.innerHTML = "";
      return;
    }
    // item.content is sanitized HTML produced at build time (build.js runs it
    // through DOMPurify), so it's safe to inject directly here — the frontend
    // never touches untrusted markup itself.
    const body = item.content || `<p class="no-content">Full text isn't available inline for this source.</p>`;
    paneContentEl.innerHTML = `
      <div class="pane-inner">
        <div class="pane-header">
          <div>
            <div class="pane-meta"><span class="item-source">${escapeHtml(item.source)}</span><span>${relativeTime(item.date)}</span></div>
            <h2>${escapeHtml(item.title)}</h2>
          </div>
          <div class="pane-actions">
            <button type="button" class="bookmark-toggle${bookmarks.has(item.link) ? " saved" : ""}" aria-pressed="${bookmarks.has(item.link)}">${bookmarks.has(item.link) ? "Saved" : "Save"}</button>
            <button type="button" class="pane-close" aria-label="Close">&times;</button>
          </div>
        </div>
        <div class="pane-body">
          ${body}
          <a class="read-original" href="${escapeAttr(item.link)}" target="_blank" rel="noopener">Read on ${escapeHtml(item.source)} &rarr;</a>
        </div>
      </div>`;
    paneContentEl.querySelector(".pane-body").scrollTop = 0;
  }

  // Drag-to-resize: the handle sits on the pane's left edge; dragging it sets
  // --pane-width directly (skipping the CSS transition for a 1:1 feel) and
  // the width is remembered across reloads.
  try {
    const stored = parseInt(localStorage.getItem(PANE_WIDTH_STORAGE_KEY), 10);
    if (!isNaN(stored)) readingPaneEl.style.setProperty("--pane-width", `${stored}px`);
  } catch (e) {
    // storage unavailable — falls back to the CSS default
  }

  function clampPaneWidth(px) {
    const maxWidth = Math.min(900, window.innerWidth - 280);
    return Math.max(320, Math.min(px, maxWidth));
  }

  paneResizeHandleEl.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    paneResizeHandleEl.setPointerCapture(e.pointerId);
    readingPaneEl.classList.add("resizing");

    function onMove(moveEvent) {
      const width = clampPaneWidth(window.innerWidth - moveEvent.clientX);
      readingPaneEl.style.setProperty("--pane-width", `${width}px`);
    }
    function onUp() {
      readingPaneEl.classList.remove("resizing");
      paneResizeHandleEl.releasePointerCapture(e.pointerId);
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
      try {
        const width = parseInt(getComputedStyle(readingPaneEl).getPropertyValue("--pane-width"), 10);
        if (!isNaN(width)) localStorage.setItem(PANE_WIDTH_STORAGE_KEY, String(width));
      } catch (err) {
        // storage unavailable — width just won't persist
      }
    }
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
  });

  function visibleItems() {
    if (activeSource === "all") return data.items;
    if (activeSource === "saved") return savedItems();
    return data.items.filter((item) => item.source === activeSource);
  }

  function renderList(visible) {
    listEl.hidden = false;
    columnBoardEl.hidden = true;
    listEl.innerHTML = visible.length ? visible.map((item) => itemHtml(item)).join("") : '<li class="empty">No items match that filter.</li>';
  }

  function renderColumns(visible) {
    listEl.hidden = true;
    columnBoardEl.hidden = false;
    const sources = [...new Set(visible.map((item) => item.source))];
    columnBoardEl.innerHTML = sources.length
      ? sources
          .map((source) => {
            const sourceItems = visible.filter((item) => item.source === source);
            const totalPages = Math.max(1, Math.ceil(sourceItems.length / COLUMN_PAGE_SIZE));
            const page = Math.min(columnPages.get(source) || 0, totalPages - 1);
            const pageItems = sourceItems.slice(page * COLUMN_PAGE_SIZE, page * COLUMN_PAGE_SIZE + COLUMN_PAGE_SIZE);
            return `
        <div class="column">
          <div class="column-head"><h2>${escapeHtml(source)}</h2><span>${sourceItems.length}</span></div>
          <ul class="item-list">${pageItems.map((item) => itemHtml(item, { showSource: false })).join("")}</ul>
          <div class="column-pager">
            <button type="button" class="pager-btn" data-source="${escapeAttr(source)}" data-dir="-1" ${page === 0 ? "disabled" : ""}>&larr; Prev</button>
            <span class="pager-status">Page ${page + 1} of ${totalPages}</span>
            <button type="button" class="pager-btn" data-source="${escapeAttr(source)}" data-dir="1" ${page >= totalPages - 1 ? "disabled" : ""}>Next &rarr;</button>
          </div>
        </div>`;
          })
          .join("")
      : '<p class="empty">No items match that filter.</p>';
  }

  function renderItems() {
    const visible = visibleItems();
    countEl.textContent = `${visible.length} ${visible.length === 1 ? "item" : "items"}`;
    if (view === "columns") renderColumns(visible);
    else renderList(visible);
  }

  function renderViewToggle() {
    shellEl.classList.toggle("is-columns", view === "columns");
    backToStartBtn.hidden = view !== "columns";
    viewToggleEl.querySelectorAll(".view-btn").forEach((button) => {
      button.classList.toggle("active", button.dataset.view === view);
    });
  }

  function markVisited(link) {
    if (visitedLinks.has(link)) return;
    visitedLinks.add(link);
    try {
      localStorage.setItem(VISITED_STORAGE_KEY, JSON.stringify([...visitedLinks]));
    } catch (e) {
      // storage unavailable — visited state just won't persist
    }
  }

  function selectItem(link) {
    selectedLink = selectedLink === link ? null : link;
    if (selectedLink === link) markVisited(link);
    renderItems();
    renderReadingPane();
  }

  function toggleBookmark(link) {
    const item = itemForLink(link);
    if (!item) return;
    if (bookmarks.has(link)) {
      bookmarks.delete(link);
      setBookmarkStatus("Removed from saved articles.");
    } else {
      const bookmark = bookmarkFromItem(item);
      if (!bookmark) return;
      bookmarks.set(bookmark.link, bookmark);
      setBookmarkStatus("Saved on this browser.");
    }
    saveBookmarks();
    if (activeSource === "saved" && !bookmarks.has(link)) selectedLink = null;
    renderSavedTools();
    renderItems();
    renderReadingPane();
  }

  function handleItemClick(e) {
    const button = e.target.closest(".item-title-btn");
    if (!button) return;
    selectItem(button.dataset.link);
  }
  listEl.addEventListener("click", handleItemClick);

  columnBoardEl.addEventListener("click", (e) => {
    const pagerBtn = e.target.closest(".pager-btn");
    if (pagerBtn) {
      const source = pagerBtn.dataset.source;
      const dir = Number(pagerBtn.dataset.dir);
      columnPages.set(source, Math.max(0, (columnPages.get(source) || 0) + dir));
      renderItems();
      return;
    }
    handleItemClick(e);
  });

  backToStartBtn.addEventListener("click", () => {
    columnPages.clear();
    renderItems();
  });

  readingPaneEl.addEventListener("click", (e) => {
    if (e.target.closest(".pane-close")) selectItem(selectedLink);
    if (e.target.closest(".bookmark-toggle")) toggleBookmark(selectedLink);
  });

  savedFilterBtn.addEventListener("click", () => {
    activeSource = activeSource === "saved" ? "all" : "saved";
    columnPages.clear();
    renderFilters();
    renderItems();
  });

  exportSavedBtn.addEventListener("click", () => {
    const payload = JSON.stringify({ version: BOOKMARK_EXPORT_VERSION, exportedAt: new Date().toISOString(), bookmarks: [...bookmarks.values()] }, null, 2);
    const url = URL.createObjectURL(new Blob([payload], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `custom-reader-saved-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
    setBookmarkStatus("Saved articles exported.");
  });

  importSavedInput.addEventListener("change", async () => {
    const file = importSavedInput.files && importSavedInput.files[0];
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      const candidates = Array.isArray(parsed) ? parsed : parsed.bookmarks;
      if (!Array.isArray(candidates)) throw new Error("No bookmark list found");
      let imported = 0;
      candidates.forEach((candidate) => {
        const bookmark = normalizeBookmark(candidate);
        if (bookmark) {
          bookmarks.set(bookmark.link, bookmark);
          imported++;
        }
      });
      if (!imported) throw new Error("No valid bookmarks found");
      saveBookmarks();
      renderSavedTools();
      if (activeSource === "saved") renderItems();
      setBookmarkStatus(`${imported} saved ${imported === 1 ? "article" : "articles"} imported.`);
    } catch (e) {
      setBookmarkStatus("Could not import that bookmark file.");
    } finally {
      importSavedInput.value = "";
    }
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && selectedLink) selectItem(selectedLink);
  });

  viewToggleEl.querySelectorAll(".view-btn").forEach((button) => {
    button.addEventListener("click", () => {
      view = button.dataset.view;
      columnPages.clear();
      try {
        localStorage.setItem(VIEW_STORAGE_KEY, view);
      } catch (e) {
        // storage unavailable — view choice just won't persist
      }
      renderViewToggle();
      renderItems();
    });
  });

  function escapeHtml(text) {
    return String(text).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
  function escapeAttr(text) {
    return escapeHtml(text);
  }

  fetch("feed-data.json")
    .then((res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    })
    .then((json) => {
      data = json;
      generatedAtEl.textContent = data.generatedAt
        ? `Generated ${new Date(data.generatedAt).toLocaleString()}`
        : "";
      if (data.errors && data.errors.length) {
        errorBanner.hidden = false;
        errorBanner.textContent = `Skipped ${data.errors.length} source(s): ${data.errors
          .map((e) => `${e.name} (${e.error})`)
          .join(", ")}`;
      }
      renderFilters();
      renderViewToggle();
      renderItems();
    })
    .catch((err) => {
      errorBanner.hidden = false;
      errorBanner.textContent = `Couldn't load feed-data.json: ${err.message}. Run "node build.js" first.`;
    });
})();
