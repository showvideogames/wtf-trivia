// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";

// The Puzzle Studio through the whole app, offline (the dev backend, never a
// database), on jsdom's real history and localStorage, as siteRoutes.test.jsx
// runs the player's side. Each test starts on the dashboard at /admin with "/"
// on the stack below it, and two puzzles: one live today, one future draft
// (nobody has played it, so its questions aren't locked).

vi.stubEnv("VITE_SUPABASE_URL", "");
vi.stubEnv("VITE_SUPABASE_ANON_KEY", "");
vi.stubEnv("VITE_PLATFORM_DISCOVERY_URL", "");
vi.mock("../dev/offlineBackend.js", async (importOriginal) => {
  const real = await importOriginal();
  const questions = ["Alpha", "Beta", "Gamma", "Delta", "Epsilon"].map((itemText, i) => (
    { id: `q${i + 1}`, itemText, correctCategory: "A", flavorCopy: "f", explanationCopy: "e", imageUrl: "", orderIndex: i + 1 }));
  const base = { ...real.demoGame(), questions };
  return {
    ...real,
    demoGames: () => [
      { ...base, id: "t-live", date: "2026-10-08", themeTitle: "Live Puzzle" },
      { ...base, id: "t-draft", date: "2026-10-20", themeTitle: "Draft Puzzle", status: "draft" },
    ],
  };
});
// An upload that never finishes: the real ImageField stays busy.
vi.mock("./imageOptimizer.js", async (importOriginal) => ({ ...await importOriginal(), optimizeImage: () => new Promise(() => {}) }));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const LIVE = "Edit Live Puzzle";
const DRAFT = "Continue editing Draft Puzzle";
const DRAFT_KEY = "wtf-editor-draft:t-draft";

let root = null;
let host = null;

async function flush(ms = 0) {
  await act(async () => { await vi.advanceTimersByTimeAsync(ms); });
}
const path = () => window.location.pathname;
const editor = () => host.querySelector(".ps-editor");
const dashboard = () => host.querySelector(".ps-dash");
const dialog = () => host.querySelector("[role=alertdialog]");
const title = () => host.querySelector("#ps-theme");
const rows = () => [...host.querySelectorAll(".ps-qrow")];
const names = () => rows().map((r) => r.querySelector(".ps-qrow-title").textContent.replace(/^Question \d+: /, ""));
const draftCopy = () => JSON.parse(localStorage.getItem(DRAFT_KEY))?.game;
const button = (label, scope = host) => [...scope.querySelectorAll("button")].find((b) => b.textContent === label);
// A real pointer click: ConfirmDialog ignores one with detail 0.
const click = (el) => act(() => { el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, detail: 1 })); });
const confirm = () => click(dialog().querySelector("[data-confirm]"));
// Types into a controlled field: React only hears a value set past its own tracker.
const type = (el, text) => act(() => {
  Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), "value").set.call(el, text);
  el.dispatchEvent(new Event("input", { bubbles: true }));
});
const go = async (delta) => { act(() => window.history.go(delta)); await flush(300); };
const openEditor = async (label) => { click(host.querySelector(`[aria-label="${label}"]`)); await flush(50); };
const openQuestions = async () => { await openEditor(DRAFT); click(host.querySelector("#ps-tab-questions")); };
const askToDelete = (i) => { click(rows()[i].querySelector(".ps-menu-btn")); click(button("Delete question", rows()[i])); };
const unloadBlocked = () => {
  const event = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(event);
  return event.defaultPrevented;
};
// A full device: the draft copy can't be written, everything else can.
function refuseDraftCopies() {
  const setItem = Storage.prototype.setItem;
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(function set(key, value) {
    if (key.startsWith("wtf-editor-draft:")) throw new Error("Storage full");
    return setItem.call(this, key, value);
  });
}
const pagehide = () => act(() => { window.dispatchEvent(new Event("pagehide")); });
// What another tab leaves behind: the one device copy, holding its edits.
function copyFromAnotherTab() {
  const copy = JSON.stringify({ savedAt: 1, game: { id: "t-draft", themeTitle: "From another tab", status: "draft", questions: [], tags: [] } });
  localStorage.setItem(DRAFT_KEY, copy);
  return copy;
}
async function startUpload() {
  const input = host.querySelector('#img-field-headerImage input[type="file"]');
  Object.defineProperty(input, "files", { value: [new File(["png"], "cat.png", { type: "image/png" })], configurable: true });
  await act(async () => { input.dispatchEvent(new Event("change", { bubbles: true })); });
}

beforeEach(async () => {
  vi.useFakeTimers({ now: new Date(2026, 9, 8, 12, 0, 0), toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date"] });
  localStorage.clear();
  sessionStorage.clear();
  sessionStorage.setItem("wtf-admin-in", "1");
  window.matchMedia = (q) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
  globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  globalThis.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };
  globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(0), 16);
  globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
  window.scrollTo = () => {};
  Element.prototype.scrollTo = () => {};
  Element.prototype.scrollIntoView = () => {};
  window.AudioContext = class {
    constructor() { this.currentTime = 0; this.destination = {}; this.state = "running"; }
    resume() { return Promise.resolve(); }
    createOscillator() { const p = { setValueAtTime() {}, exponentialRampToValueAtTime() {}, linearRampToValueAtTime() {} }; return { type: "", frequency: p, connect() {}, start() {}, stop() {} }; }
    createGain() { const p = { value: 1, setValueAtTime() {}, exponentialRampToValueAtTime() {}, linearRampToValueAtTime() {} }; return { gain: p, connect() {} }; }
  };
  window.history.replaceState(null, "", "/");
  window.history.pushState(null, "", "/admin");
  const { default: App } = await import("../App.jsx");
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root.render(<App/>));
  await flush(50);
  await flush(500);
}, 30_000);
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = host = null;
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("leaving the editor", { timeout: 30_000 }, () => {
  it("a jump past the guard with a live edit stays on /admin, asks, and keeps the edit", async () => {
    await openEditor(LIVE);
    type(title(), "Live Puzzle edited");
    await go(-2);
    expect(path()).toBe("/admin");
    expect(editor()).not.toBeNull();
    expect(dialog().textContent).toContain("Leave without publishing?");
    expect(title().value).toBe("Live Puzzle edited");
  });

  it("a clean editor follows the same jump", async () => {
    await openEditor(LIVE);
    await go(-2);
    expect(path()).toBe("/");
    expect(editor()).toBeNull();
    expect(dialog()).toBeNull();
  });

  it("All puzzles with a live edit asks; Keep editing keeps it, Leave reaches the dashboard", async () => {
    await openEditor(LIVE);
    type(title(), "Live Puzzle edited");
    click(button("All puzzles"));
    expect(dialog().textContent).toContain("Your changes to this live puzzle will be lost.");
    click(button("Keep editing", dialog()));
    expect(dialog()).toBeNull();
    expect(dashboard()).toBeNull();
    expect(title().value).toBe("Live Puzzle edited");

    click(button("All puzzles"));
    confirm();
    await flush(300);
    expect(dashboard()).not.toBeNull();
    expect(editor()).toBeNull();
    expect(path()).toBe("/admin");
    expect(window.history.state?.wtfEditor).toBeUndefined();
  });

  it("browser Back from Preview returns to the editor, not the dashboard", async () => {
    await openEditor(LIVE);
    click(button("Preview"));
    await flush(50);
    expect(host.querySelector(".adm-preview")).not.toBeNull();
    await go(-1);
    expect(host.querySelector(".adm-preview")).toBeNull();
    expect(editor()).not.toBeNull();
    expect(dashboard()).toBeNull();
    expect(path()).toBe("/admin");
  });

  it("closing the tab is held back by a live edit, not by a clean editor", async () => {
    await openEditor(LIVE);
    expect(unloadBlocked()).toBe(false);
    type(title(), "Live Puzzle edited");
    expect(unloadBlocked()).toBe(true);
    type(title(), "Live Puzzle");
    expect(unloadBlocked()).toBe(false);
  });
});

describe("the device copy", { timeout: 30_000 }, () => {
  it("leaving inside the 700 ms wait still keeps the latest edit, and the dashboard says so", async () => {
    await openEditor(DRAFT);
    type(title(), "Draft edited");
    click(button("All puzzles"));
    await flush(300);
    expect(dashboard()).not.toBeNull();
    expect(draftCopy().themeTitle).toBe("Draft edited");
    expect(host.querySelector(".ps-device-note")).not.toBeNull();
  });

  it("undoing inside the 700 ms wait replaces the old copy, so no note is left", async () => {
    await openEditor(DRAFT);
    type(title(), "Draft edited");
    await flush(800);
    expect(draftCopy().themeTitle).toBe("Draft edited");
    type(title(), "Draft Puzzle");
    click(button("All puzzles"));
    await flush(300);
    expect(dashboard()).not.toBeNull();
    expect(draftCopy().themeTitle).toBe("Draft Puzzle");
    expect(host.querySelector(".ps-device-note")).toBeNull();
  });

  it("undoing then hiding the page replaces this tab's copy, and after that it writes nothing", async () => {
    await openEditor(DRAFT);
    type(title(), "Draft edited");
    await flush(800);
    type(title(), "Draft Puzzle");
    pagehide();
    expect(draftCopy().themeTitle).toBe("Draft Puzzle");
    const other = copyFromAnotherTab();
    click(button("All puzzles"));
    await flush(300);
    expect(localStorage.getItem(DRAFT_KEY)).toBe(other);
  });

  it("a clean tab that wrote no edits writes nothing on hide or exit", async () => {
    await openEditor(DRAFT);
    pagehide();
    click(button("All puzzles"));
    await flush(300);
    expect(dashboard()).not.toBeNull();
    expect(localStorage.getItem(DRAFT_KEY)).toBeNull();
  });

  it("a clean tab leaves another tab's copy alone on hide and on All puzzles", async () => {
    await openEditor(DRAFT);
    const other = copyFromAnotherTab();
    pagehide();
    expect(localStorage.getItem(DRAFT_KEY)).toBe(other);
    click(button("All puzzles"));
    await flush(300);
    expect(dashboard()).not.toBeNull();
    expect(localStorage.getItem(DRAFT_KEY)).toBe(other);
    expect(host.querySelector(".ps-device-note")).not.toBeNull();
  });

  it("a copy the device refuses stops All puzzles at the dialog, and its confirm really leaves", async () => {
    await openEditor(DRAFT);
    refuseDraftCopies();
    type(title(), "Draft edited");
    click(button("All puzzles"));
    expect(dashboard()).toBeNull();
    expect(dialog().textContent).toContain("couldn't be kept on this device");
    confirm();
    await flush(300);
    expect(dashboard()).not.toBeNull();
  });

  it("a copy the device refuses stops a jump too", async () => {
    await openEditor(DRAFT);
    refuseDraftCopies();
    type(title(), "Draft edited");
    await go(-2);
    expect(path()).toBe("/admin");
    expect(dialog().textContent).toContain("couldn't be kept on this device");
    expect(title().value).toBe("Draft edited");
    confirm();
    await flush(300);
    expect(dashboard()).not.toBeNull();
    expect(path()).toBe("/admin");
  });

  it("an upload's dialog stays once if the edits can't be kept either, then really leaves", async () => {
    await openEditor(DRAFT);
    type(title(), "Draft edited");
    await flush(800); // the copy is safe, so only the upload is at risk
    await startUpload();
    refuseDraftCopies();
    click(button("All puzzles"));
    expect(dialog().textContent).toContain("An image is still uploading.");
    confirm();
    expect(dashboard()).toBeNull();
    expect(dialog().textContent).toContain("couldn't be kept on this device");
    expect(dialog().textContent).toContain("also still uploading");
    confirm();
    await flush(300);
    expect(dashboard()).not.toBeNull();
  });

  it("a refused copy with nothing unsaved doesn't hold anyone up", async () => {
    await openEditor(DRAFT);
    refuseDraftCopies();
    click(button("All puzzles"));
    await flush(300);
    expect(dialog()).toBeNull();
    expect(dashboard()).not.toBeNull();
  });

  it("Discard clears the device copy and the edit", async () => {
    await openEditor(DRAFT);
    type(title(), "Draft edited");
    await flush(800);
    expect(draftCopy().themeTitle).toBe("Draft edited");
    click(button("Discard changes"));
    expect(localStorage.getItem(DRAFT_KEY)).not.toBeNull(); // only the dialog's confirm acts
    confirm();
    expect(localStorage.getItem(DRAFT_KEY)).toBeNull();
    expect(title().value).toBe("Draft Puzzle");
    expect(button("Discard changes")).toBeUndefined();
    await flush(800);
    expect(draftCopy().themeTitle).toBe("Draft Puzzle");
  });
});

describe("questions and publishing", { timeout: 30_000 }, () => {
  it("Add question clicked twice leaves one blank, and a reused blank is a to-do, not an error", async () => {
    await openQuestions();
    const add = host.querySelector(".ps-qlist-add");
    click(add);
    click(add);
    expect(rows()).toHaveLength(6);
    expect(host.querySelector(".ps-notice").textContent).toContain("Question 6 is still empty");
    click(rows()[0].querySelector(".ps-qrow-main")); // opening another drops the to-do
    expect(host.querySelector("#ps-q-item-note")).toBeNull();
    click(add);
    expect(rows()).toHaveLength(6);
    expect(host.querySelector("#ps-q-item").value).toBe("");
    expect(host.querySelector("#ps-q-item-note").className).toBe("ps-hint");
  });

  it("Publish stays pressable while the checklist blocks, and says why itself: guidance only", async () => {
    click(button("New Puzzle"));
    await flush(50);
    expect(host.querySelector(".ps-ready h2").textContent).toBe("Before you can publish");
    const publish = [...host.querySelectorAll(".ps-btn-publish")];
    expect(publish.length).toBeGreaterThan(0);
    for (const b of publish) {
      expect(b.disabled).toBe(false);
      expect(b.classList.contains("is-unready")).toBe(true);
    }
    click(publish[0]);
    await flush(50);
    expect(host.querySelector(".ps-notice.is-error").textContent).toContain("Pick a puzzle date first.");
    expect(editor()).not.toBeNull();
  });

  it("Delete question: Keep question keeps it and returns focus, confirm removes the right one", async () => {
    await openQuestions();
    askToDelete(1);
    expect(dialog().textContent).toContain("Delete question 2?");
    expect(dialog().textContent).toContain("Beta");
    click(button("Keep question", dialog()));
    await flush(50);
    expect(dialog()).toBeNull();
    expect(names()).toEqual(["Alpha", "Beta", "Gamma", "Delta", "Epsilon"]);
    expect(document.activeElement).toBe(rows()[1].querySelector(".ps-menu-btn"));

    askToDelete(1);
    confirm();
    await flush(50);
    expect(dialog()).toBeNull();
    expect(names()).toEqual(["Alpha", "Gamma", "Delta", "Epsilon"]);
    expect(document.activeElement).toBe(host.querySelector(".ps-qrow.is-selected .ps-qrow-main"));
  });
});
