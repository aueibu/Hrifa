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
  const savedActionsEl = document.querySelector("#savedActions");
  const exportSavedBtn = document.querySelector("#exportSavedBtn");
  const importSavedInput = document.querySelector("#importSavedInput");
  const bookmarkStatusEl = document.querySelector("#bookmarkStatus");
  const sourceGroupSelect = document.querySelector("#sourceGroupSelect");
  const newSourceGroupBtn = document.querySelector("#newSourceGroupBtn");
  const editSourceGroupBtn = document.querySelector("#editSourceGroupBtn");
  const setDefaultViewBtn = document.querySelector("#setDefaultViewBtn");
  const clearDefaultViewBtn = document.querySelector("#clearDefaultViewBtn");
  const sourceGroupDialog = document.querySelector("#sourceGroupDialog");
  const sourceGroupForm = document.querySelector("#sourceGroupForm");
  const sourceGroupDialogTitle = document.querySelector("#sourceGroupDialogTitle");
  const sourceGroupNameInput = document.querySelector("#sourceGroupNameInput");
  const sourceGroupChoices = document.querySelector("#sourceGroupChoices");
  const sourceGroupError = document.querySelector("#sourceGroupError");
  const closeSourceGroupDialogBtn = document.querySelector("#closeSourceGroupDialogBtn");
  const cancelSourceGroupBtn = document.querySelector("#cancelSourceGroupBtn");
  const deleteSourceGroupBtn = document.querySelector("#deleteSourceGroupBtn");

  const VIEW_STORAGE_KEY = "customReader.view";
  const PANE_WIDTH_STORAGE_KEY = "customReader.paneWidth";
  const VISITED_STORAGE_KEY = "customReader.visited";
  const BOOKMARKS_STORAGE_KEY = "customReader.bookmarks";
  const SOURCE_GROUPS_STORAGE_KEY = "customReader.sourceGroups";
  const DEFAULT_STATE_STORAGE_KEY = "customReader.defaultState";
  const BOOKMARK_EXPORT_VERSION = 1;
  const COLUMN_PAGE_SIZE = 5;
  const GROUP_FILTER_PREFIX = "group:";
  let activeSource = "all";
  let view = "list";
  let sourceGroups = [];
  let defaultState = null;
  let editingGroupId = null;
  let selectedLink = null;
  let readingMode = "reader";
  const columnPages = new Map();
  const visitedLinks = new Set();
  const bookmarks = new Map();
  try {
    const storedDefault = JSON.parse(localStorage.getItem(DEFAULT_STATE_STORAGE_KEY) || "null");
    defaultState = normalizeDefaultState(storedDefault);
    if (defaultState) {
      activeSource = defaultState.activeSource;
      view = defaultState.view;
    } else {
      view = localStorage.getItem(VIEW_STORAGE_KEY) === "columns" ? "columns" : "list";
    }
    sourceGroups = normalizeSourceGroups(JSON.parse(localStorage.getItem(SOURCE_GROUPS_STORAGE_KEY) || "[]"));
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

  function normalizeSourceGroups(value) {
    if (!Array.isArray(value)) return [];
    const seenIds = new Set();
    return value.flatMap((group) => {
      if (!group || typeof group !== "object" || typeof group.id !== "string" || seenIds.has(group.id)) return [];
      const name = typeof group.name === "string" ? group.name.trim().slice(0, 80) : "";
      const sources = Array.isArray(group.sources)
        ? [...new Set(group.sources.filter((source) => typeof source === "string" && source.trim()).map((source) => source.trim().slice(0, 160)))].slice(0, 100)
        : [];
      if (!name || !sources.length) return [];
      seenIds.add(group.id);
      return [{ id: group.id, name, sources }];
    });
  }

  function normalizeDefaultState(value) {
    if (!value || typeof value !== "object") return null;
    const active = typeof value.activeSource === "string" ? value.activeSource : "all";
    return { activeSource: active, view: value.view === "columns" ? "columns" : "list" };
  }

  function sourceNames() {
    return [...new Set(data.items.map((item) => item.source))].sort((a, b) => a.localeCompare(b));
  }

  function activeGroupId() {
    return activeSource.startsWith(GROUP_FILTER_PREFIX) ? activeSource.slice(GROUP_FILTER_PREFIX.length) : null;
  }

  function activeGroup() {
    const id = activeGroupId();
    return id ? sourceGroups.find((group) => group.id === id) || null : null;
  }

  function saveSourceGroups() {
    try {
      localStorage.setItem(SOURCE_GROUPS_STORAGE_KEY, JSON.stringify(sourceGroups));
      return true;
    } catch (e) {
      setBookmarkStatus("Could not save source groups in this browser.");
      return false;
    }
  }

  function saveDefaultState() {
    try {
      defaultState = { activeSource, view };
      localStorage.setItem(DEFAULT_STATE_STORAGE_KEY, JSON.stringify(defaultState));
      setBookmarkStatus("This source selection and layout will open by default.");
      renderGroupTools();
    } catch (e) {
      setBookmarkStatus("Could not save a default view in this browser.");
    }
  }

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
    savedActionsEl.hidden = activeSource !== "saved";
    exportSavedBtn.disabled = count === 0;
  }

  function renderFilters() {
    const sources = sourceNames();
    filtersEl.innerHTML = "";
    ["all"].forEach((source) => {
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
    if (sources.length) {
      const overflow = document.createElement("details");
      overflow.className = "source-overflow";
      const summary = document.createElement("summary");
      summary.className = "filter source-overflow-trigger";
      summary.textContent = "Sources";
      overflow.append(summary);
      const menu = document.createElement("div");
      menu.className = "source-overflow-menu";
      sources.forEach((source) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "source-overflow-item";
        button.textContent = source;
        button.addEventListener("click", () => {
          activeSource = source;
          columnPages.clear();
          renderFilters();
          renderItems();
        });
        menu.append(button);
      });
      overflow.append(menu);
      filtersEl.append(overflow);
    }
    renderSavedTools();
    renderGroupTools();
  }

  function renderGroupTools() {
    const selectedGroup = activeGroup();
    if (activeGroupId() && !selectedGroup) activeSource = "all";
    sourceGroupSelect.innerHTML = '<option value="all">All sources</option>'
      + sourceGroups.map((group) => `<option value="${escapeAttr(group.id)}">${escapeHtml(group.name)}</option>`).join("");
    sourceGroupSelect.value = selectedGroup ? selectedGroup.id : "all";
    editSourceGroupBtn.disabled = !selectedGroup;
    const isDefault = defaultState && defaultState.activeSource === activeSource && defaultState.view === view;
    setDefaultViewBtn.textContent = isDefault ? "Current default" : "Set current as default";
    clearDefaultViewBtn.hidden = !defaultState;
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
    const readerBody = item.content || `<p class="no-content">Full text isn't available from this feed. Try Original page to see whether this publisher allows in-reader viewing.</p>`;
    const body = readingMode === "original"
      ? `
          <div class="original-page">
            <p class="original-page-note">This is the publisher's page, shown only if the publisher permits embedding. If it does not appear, use Open original.</p>
            <section class="frame-diagnostics" aria-label="Original page diagnostics">
              <div class="frame-diagnostics-head"><span>Frame diagnostics</span><button type="button" class="copy-frame-diagnostics">Copy</button></div>
              <p class="frame-diagnostics-note">The browser cannot expose errors or page text from a publisher's cross-origin frame. This records only events the reader itself can observe.</p>
              <ol class="frame-diagnostics-log"></ol>
            </section>
            <iframe class="original-page-frame" src="${escapeAttr(item.link)}" title="Original article: ${escapeAttr(item.title)}" sandbox="allow-forms allow-popups allow-scripts allow-same-origin" referrerpolicy="strict-origin-when-cross-origin"></iframe>
          </div>`
      : readerBody;
    paneContentEl.innerHTML = `
      <div class="pane-inner">
        <div class="pane-header">
          <div>
            <div class="pane-meta"><span class="item-source">${escapeHtml(item.source)}</span><span>${relativeTime(item.date)}</span></div>
            <h2>${escapeHtml(item.title)}</h2>
            <a class="pane-open-original" href="${escapeAttr(item.link)}" target="_blank" rel="noopener">Open original on ${escapeHtml(item.source)} &rarr;</a>
          </div>
          <div class="pane-actions">
            <div class="reading-mode-toggle" role="group" aria-label="Reading mode">
              <button type="button" class="reading-mode-btn${readingMode === "reader" ? " active" : ""}" data-reading-mode="reader">Reader</button>
              <button type="button" class="reading-mode-btn${readingMode === "original" ? " active" : ""}" data-reading-mode="original">Original</button>
            </div>
            <button type="button" class="bookmark-toggle${bookmarks.has(item.link) ? " saved" : ""}" aria-pressed="${bookmarks.has(item.link)}">${bookmarks.has(item.link) ? "Saved" : "Save"}</button>
            <button type="button" class="pane-close" aria-label="Close">&times;</button>
          </div>
        </div>
        <div class="pane-body">
          ${body}
          <a class="read-original" href="${escapeAttr(item.link)}" target="_blank" rel="noopener">Open original on ${escapeHtml(item.source)} &rarr;</a>
        </div>
      </div>`;
    paneContentEl.querySelector(".pane-body").scrollTop = 0;
    if (readingMode === "original") bindFrameDiagnostics(item);
  }

  function addFrameDiagnostic(message) {
    const log = paneContentEl.querySelector(".frame-diagnostics-log");
    if (!log) return;
    const line = document.createElement("li");
    line.textContent = `${new Date().toLocaleTimeString()} — ${message}`;
    log.append(line);
  }

  function bindFrameDiagnostics(item) {
    const frame = paneContentEl.querySelector(".original-page-frame");
    if (!frame) return;
    addFrameDiagnostic(`Requested ${new URL(item.link).origin}.`);
    frame.addEventListener("load", () => {
      addFrameDiagnostic("Browser reported that the frame loaded. This can also happen when a publisher renders its own error page.");
    });
    frame.addEventListener("error", () => {
      addFrameDiagnostic("Browser reported a frame loading error.");
    });
  }

  async function copyFrameDiagnostics(button) {
    const item = itemForLink(selectedLink);
    const entries = [...paneContentEl.querySelectorAll(".frame-diagnostics-log li")].map((line) => line.textContent);
    const report = [
      "Custom Reader original-page diagnostics",
      `Source: ${item ? item.source : "unknown"}`,
      `Article: ${item ? item.title : "unknown"}`,
      `URL: ${item ? item.link : "unknown"}`,
      "Note: publisher-frame errors are not readable by this app.",
      ...entries,
    ].join("\n");
    try {
      await navigator.clipboard.writeText(report);
      button.textContent = "Copied";
      setTimeout(() => { button.textContent = "Copy"; }, 1500);
    } catch (e) {
      button.textContent = "Copy failed";
    }
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
    const group = activeGroup();
    if (group) return data.items.filter((item) => group.sources.includes(item.source));
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
    const nextLink = selectedLink === link ? null : link;
    if (nextLink !== selectedLink) readingMode = "reader";
    selectedLink = nextLink;
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
    const modeButton = e.target.closest(".reading-mode-btn");
    if (modeButton && modeButton.dataset.readingMode !== readingMode) {
      readingMode = modeButton.dataset.readingMode;
      renderReadingPane();
    }
    const copyButton = e.target.closest(".copy-frame-diagnostics");
    if (copyButton) copyFrameDiagnostics(copyButton);
  });

  savedFilterBtn.addEventListener("click", () => {
    activeSource = activeSource === "saved" ? "all" : "saved";
    columnPages.clear();
    renderFilters();
    renderItems();
  });

  sourceGroupSelect.addEventListener("change", () => {
    activeSource = sourceGroupSelect.value === "all" ? "all" : `${GROUP_FILTER_PREFIX}${sourceGroupSelect.value}`;
    columnPages.clear();
    renderFilters();
    renderItems();
  });

  function openSourceGroupDialog(group = null) {
    editingGroupId = group ? group.id : null;
    sourceGroupDialogTitle.textContent = group ? "Edit source group" : "New source group";
    sourceGroupNameInput.value = group ? group.name : "";
    sourceGroupChoices.innerHTML = sourceNames().map((source) => {
      const checked = group && group.sources.includes(source) ? " checked" : "";
      return `<label class="source-choice"><input type="checkbox" name="group-source" value="${escapeAttr(source)}"${checked} />${escapeHtml(source)}</label>`;
    }).join("");
    sourceGroupError.hidden = true;
    sourceGroupError.textContent = "";
    deleteSourceGroupBtn.hidden = !group;
    sourceGroupDialog.showModal();
    sourceGroupNameInput.focus();
  }

  function closeSourceGroupDialog() {
    if (sourceGroupDialog.open) sourceGroupDialog.close();
    editingGroupId = null;
  }

  newSourceGroupBtn.addEventListener("click", () => openSourceGroupDialog());
  editSourceGroupBtn.addEventListener("click", () => {
    const group = activeGroup();
    if (group) openSourceGroupDialog(group);
  });
  closeSourceGroupDialogBtn.addEventListener("click", closeSourceGroupDialog);
  cancelSourceGroupBtn.addEventListener("click", closeSourceGroupDialog);

  sourceGroupForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const name = sourceGroupNameInput.value.trim().slice(0, 80);
    const sources = [...sourceGroupChoices.querySelectorAll('input[name="group-source"]:checked')].map((input) => input.value);
    if (!name) {
      sourceGroupError.textContent = "Give this group a name.";
      sourceGroupError.hidden = false;
      return;
    }
    if (!sources.length) {
      sourceGroupError.textContent = "Choose at least one source.";
      sourceGroupError.hidden = false;
      return;
    }
    const duplicate = sourceGroups.find((group) => group.name.localeCompare(name, undefined, { sensitivity: "accent" }) === 0 && group.id !== editingGroupId);
    if (duplicate) {
      sourceGroupError.textContent = "A group already has that name.";
      sourceGroupError.hidden = false;
      return;
    }
    const id = editingGroupId || (window.crypto && crypto.randomUUID ? crypto.randomUUID() : `group-${Date.now()}-${Math.random().toString(16).slice(2)}`);
    const nextGroup = { id, name, sources };
    sourceGroups = editingGroupId
      ? sourceGroups.map((group) => group.id === editingGroupId ? nextGroup : group)
      : [...sourceGroups, nextGroup];
    activeSource = `${GROUP_FILTER_PREFIX}${id}`;
    columnPages.clear();
    saveSourceGroups();
    closeSourceGroupDialog();
    renderFilters();
    renderItems();
    setBookmarkStatus(`Source group “${name}” saved.`);
  });

  deleteSourceGroupBtn.addEventListener("click", () => {
    const group = sourceGroups.find((candidate) => candidate.id === editingGroupId);
    if (!group) return;
    sourceGroups = sourceGroups.filter((candidate) => candidate.id !== group.id);
    if (activeSource === `${GROUP_FILTER_PREFIX}${group.id}`) activeSource = "all";
    if (defaultState && defaultState.activeSource === `${GROUP_FILTER_PREFIX}${group.id}`) {
      defaultState = null;
      try { localStorage.removeItem(DEFAULT_STATE_STORAGE_KEY); } catch (e) { /* storage unavailable */ }
    }
    columnPages.clear();
    saveSourceGroups();
    closeSourceGroupDialog();
    renderFilters();
    renderItems();
    setBookmarkStatus(`Source group “${group.name}” deleted.`);
  });

  setDefaultViewBtn.addEventListener("click", saveDefaultState);
  clearDefaultViewBtn.addEventListener("click", () => {
    defaultState = null;
    try { localStorage.removeItem(DEFAULT_STATE_STORAGE_KEY); } catch (e) { /* storage unavailable */ }
    renderGroupTools();
    setBookmarkStatus("Default view cleared.");
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
      renderGroupTools();
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
