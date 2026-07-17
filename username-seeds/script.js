"use strict";

// Edit these defaults to change the built-in username components.
const defaultWordsA = ["wind", "dusk", "moss", "root", "ash", "glow", "tide", "fog", "stone", "thorn", "gloam", "fern", "reed", "slate", "dust", "rill"];
const defaultWordsB = ["ward", "seal", "mark", "plot", "well", "pool", "wake", "march", "croft", "holt", "span", "fold", "gap", "form"];
const wordsA = [...defaultWordsA];
const wordsB = [...defaultWordsB];
const cycleDurationMilliseconds = 3 * 60 * 60 * 1000;
const savedListsKey = "time-derived-username-lists";

const elements = {
  username: document.querySelector("#username"), mode: document.querySelector("#mode-label"), time: document.querySelector("#time-display"),
  minutes: document.querySelector("#minutes-value"), flatIndex: document.querySelector("#flat-index-value"), aIndex: document.querySelector("#a-index-value"),
  bIndex: document.querySelector("#b-index-value"), words: document.querySelector("#words-value"), error: document.querySelector("#configuration-error"),
  copy: document.querySelector("#copy-button"), freeze: document.querySelector("#freeze-button"), manualTime: document.querySelector("#manual-time"),
  testTime: document.querySelector("#test-time-button"), returnLive: document.querySelector("#return-live-button"), copyStatus: document.querySelector("#copy-status"),
  wordsAInput: document.querySelector("#words-a-input"), wordsBInput: document.querySelector("#words-b-input"), applyLists: document.querySelector("#apply-lists-button"),
  resetLists: document.querySelector("#reset-lists-button"), editorStatus: document.querySelector("#editor-status")
};

let isFrozen = false;
let isManual = false;
let currentResult = null;

function validateWordLists() {
  const errors = [];
  if (wordsA.length === 0) errors.push("A list must contain at least one word.");
  if (wordsB.length === 0) errors.push("B list must contain at least one word.");
  if (errors.length) {
    elements.error.textContent = `Configuration error: ${errors.join(" ")}`;
    elements.error.hidden = false;
    return false;
  }
  return true;
}

function replaceWords(nextWordsA, nextWordsB) {
  wordsA.splice(0, wordsA.length, ...nextWordsA);
  wordsB.splice(0, wordsB.length, ...nextWordsB);
}

function updateListEditor() {
  elements.wordsAInput.value = wordsA.join("\n");
  elements.wordsBInput.value = wordsB.join("\n");
}

function parseWordList(value) {
  return value.split(/[\n,]/).map(word => word.trim()).filter(Boolean);
}

function showConfigurationError(message) {
  elements.error.textContent = `Configuration error: ${message}`;
  elements.error.hidden = false;
}

function loadSavedLists() {
  try {
    const savedLists = JSON.parse(localStorage.getItem(savedListsKey));
    if (Array.isArray(savedLists?.wordsA) && savedLists.wordsA.length && Array.isArray(savedLists?.wordsB) && savedLists.wordsB.length) {
      replaceWords(savedLists.wordsA, savedLists.wordsB);
    }
  } catch (error) {
    // Invalid or unavailable local storage simply leaves the built-in lists active.
  }
}

function applySavedLists() {
  const nextWordsA = parseWordList(elements.wordsAInput.value);
  const nextWordsB = parseWordList(elements.wordsBInput.value);
  if (nextWordsA.length === 0 || nextWordsB.length === 0) {
    showConfigurationError("Both A and B lists must contain at least one word.");
    return;
  }
  replaceWords(nextWordsA, nextWordsB);
  try {
    localStorage.setItem(savedListsKey, JSON.stringify({ wordsA, wordsB }));
    elements.editorStatus.textContent = `Saved ${wordsA.length} A words and ${wordsB.length} B words in this browser.`;
  } catch (error) {
    elements.editorStatus.textContent = "Applied the lists, but this browser could not save them.";
  }
  elements.error.hidden = true;
  resumeLiveMode();
}

function restoreDefaultLists() {
  replaceWords(defaultWordsA, defaultWordsB);
  try { localStorage.removeItem(savedListsKey); } catch (error) { /* Defaults still apply for this page. */ }
  updateListEditor();
  elements.error.hidden = true;
  elements.editorStatus.textContent = "Built-in word lists restored and local saved lists removed.";
  resumeLiveMode();
}

function getMillisecondsSinceMidnight(date) {
  return (((date.getHours() * 60 + date.getMinutes()) * 60 + date.getSeconds()) * 1000) + date.getMilliseconds();
}

function greatestCommonDivisor(first, second) {
  while (second !== 0) [first, second] = [second, first % second];
  return first;
}

function getInterleaveStride(listLength) {
  for (let stride = Math.floor(listLength / 2); stride > 0; stride -= 1) {
    if (greatestCommonDivisor(stride, listLength) === 1) return stride;
  }
  return 1;
}

function deriveUsernameFromMilliseconds(millisecondsSinceMidnight) {
  const totalCombinations = wordsA.length * wordsB.length;
  const millisecondsInCycle = millisecondsSinceMidnight % cycleDurationMilliseconds;
  const flatIndex = Math.floor((millisecondsInCycle / cycleDurationMilliseconds) * totalCombinations);
  const aIndex = flatIndex % wordsA.length;
  const bCycle = Math.floor(flatIndex / wordsA.length);
  const bIndex = (bCycle + aIndex * getInterleaveStride(wordsB.length)) % wordsB.length;
  return { username: `${wordsA[aIndex]}${wordsB[bIndex]}`, minutesSinceMidnight: Math.floor(millisecondsSinceMidnight / 60000), flatIndex, aIndex, bIndex, wordA: wordsA[aIndex], wordB: wordsB[bIndex] };
}

function deriveUsernameFromDate(date) { return deriveUsernameFromMilliseconds(getMillisecondsSinceMidnight(date)); }
function formatTime(date) { return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }); }
function formatTimestamp(date) { return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }); }

function renderResult(result, date, mode) {
  currentResult = result;
  elements.username.textContent = result.username;
  elements.mode.textContent = mode;
  elements.time.textContent = mode === "Frozen result" ? `Frozen at: ${formatTimestamp(date)}` : `Local time: ${formatTime(date)}`;
  elements.minutes.textContent = result.minutesSinceMidnight;
  elements.flatIndex.textContent = result.flatIndex;
  elements.aIndex.textContent = result.aIndex;
  elements.bIndex.textContent = result.bIndex;
  elements.words.textContent = `${result.wordA} + ${result.wordB}`;
}

async function copyUsername() {
  if (!currentResult) return;
  const value = currentResult.username;
  try {
    if (navigator.clipboard && window.isSecureContext) await navigator.clipboard.writeText(value);
    else {
      const area = document.createElement("textarea"); area.value = value; area.setAttribute("readonly", ""); area.style.position = "fixed"; area.style.opacity = "0";
      document.body.append(area); area.select();
      if (!document.execCommand("copy")) throw new Error("Copy command failed");
      area.remove();
    }
    elements.copy.textContent = "Copied"; elements.copyStatus.textContent = "Username copied.";
    window.setTimeout(() => { elements.copy.textContent = "Copy username"; }, 1400);
  } catch (error) { elements.copyStatus.textContent = "Unable to copy the username. Select it and copy manually."; }
}

function freezeResult() {
  isFrozen = true; isManual = false;
  const frozenDate = new Date();
  renderResult(currentResult || deriveUsernameFromDate(frozenDate), frozenDate, "Frozen result");
  elements.freeze.textContent = "Resume";
}
function resumeLiveMode() {
  isFrozen = false; isManual = false; elements.freeze.textContent = "Freeze";
  const now = new Date(); renderResult(deriveUsernameFromDate(now), now, "Live local time");
}
function testManualTime() {
  const [hours, minutes] = elements.manualTime.value.split(":").map(Number);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) { elements.manualTime.focus(); return; }
  isManual = true; isFrozen = false; elements.freeze.textContent = "Freeze";
  const date = new Date(); date.setHours(hours, minutes, 0, 0);
  renderResult(deriveUsernameFromDate(date), date, "Manual test time");
}
function startClock() {
  const updateIfMinuteChanged = () => {
    if (isFrozen || isManual) return;
    const now = new Date();
    renderResult(deriveUsernameFromDate(now), now, "Live local time");
  };
  updateIfMinuteChanged();
  window.setInterval(updateIfMinuteChanged, 1000);
}

if (validateWordLists()) {
  loadSavedLists();
  updateListEditor();
  elements.copy.addEventListener("click", copyUsername);
  elements.freeze.addEventListener("click", () => isFrozen ? resumeLiveMode() : freezeResult());
  elements.testTime.addEventListener("click", testManualTime);
  elements.manualTime.addEventListener("change", testManualTime);
  elements.returnLive.addEventListener("click", resumeLiveMode);
  elements.applyLists.addEventListener("click", applySavedLists);
  elements.resetLists.addEventListener("click", restoreDefaultLists);
  startClock();
}
