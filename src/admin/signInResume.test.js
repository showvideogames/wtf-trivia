// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ADMIN_RESUME_KEY,
  EDITS_NOT_STORED,
  RESUME_NOT_STORED,
  clearAdminResume,
  prepareSignInFromEditor,
  takeAdminResume,
  writeAdminResume,
} from "./signInResume.js";

// Signing in from the editor leaves the page. It may only start once the
// unsaved edits and the puzzle to reopen are both really stored; when
// browser storage fails, the admin stays in the editor with nothing lost.

const PUZZLE = { id: "g-1", themeTitle: "Farm or Not", status: "published", questions: [] };
const quotaError = () => Object.assign(new Error("The quota has been exceeded."), { name: "QuotaExceededError" });

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
});
afterEach(() => vi.restoreAllMocks());

describe("writeAdminResume / takeAdminResume", () => {
  it("stores the puzzle, reads it back, and hands it over once", () => {
    expect(writeAdminResume(PUZZLE)).toBe(true);
    expect(takeAdminResume()).toEqual(PUZZLE);
    expect(takeAdminResume()).toBe(null);
  });
  it("is false when the browser refuses the write (full or blocked storage)", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw quotaError(); });
    expect(writeAdminResume(PUZZLE)).toBe(false);
    expect(sessionStorage.getItem(ADMIN_RESUME_KEY)).toBe(null);
  });
  it("is false when a write silently doesn't stick", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {});
    expect(writeAdminResume(PUZZLE)).toBe(false);
  });
  it("is false with no storage at all, and never stores a puzzle without an id", () => {
    expect(writeAdminResume(PUZZLE, null)).toBe(false);
    expect(writeAdminResume({ themeTitle: "no id" })).toBe(false);
  });
  it("clearing and reading never throw when storage is blocked", () => {
    const blocked = { getItem: () => { throw new Error("SecurityError"); }, removeItem: () => { throw new Error("SecurityError"); } };
    expect(() => clearAdminResume(blocked)).not.toThrow();
    expect(takeAdminResume(blocked)).toBe(null);
  });
});

describe("prepareSignInFromEditor", () => {
  it("starts sign-in only once the edits and the puzzle to reopen are both stored", () => {
    const saveDraft = vi.fn(() => true);
    const saveResume = vi.fn(() => true);
    expect(prepareSignInFromEditor({ hasEdits: true, saveDraft, saveResume })).toEqual({ ok: true });
    expect(saveDraft).toHaveBeenCalledTimes(1);
    expect(saveResume).toHaveBeenCalledTimes(1);
  });

  it("with nothing unsaved it doesn't need a draft copy", () => {
    const saveDraft = vi.fn(() => false);
    expect(prepareSignInFromEditor({ hasEdits: false, saveDraft, saveResume: () => true }).ok).toBe(true);
    expect(saveDraft).not.toHaveBeenCalled();
  });

  it("REGRESSION: a failed draft save stops the sign-in before anything else is stored", () => {
    const saveResume = vi.fn(() => true);
    for (const saveDraft of [() => false, () => { throw quotaError(); }]) {
      const r = prepareSignInFromEditor({ hasEdits: true, saveDraft, saveResume });
      expect(r).toEqual({ ok: false, message: EDITS_NOT_STORED });
    }
    expect(saveResume).not.toHaveBeenCalled();
    expect(sessionStorage.getItem(ADMIN_RESUME_KEY)).toBe(null);
  });

  it("REGRESSION: with browser storage full, sign-in doesn't start and no half-stored puzzle is left", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw quotaError(); });
    // The same shape as the editor: the draft goes to localStorage, the resume to sessionStorage.
    const saveDraft = () => {
      try { localStorage.setItem("wtf-editor-draft:g-1", JSON.stringify({ game: PUZZLE })); } catch { return false; }
      return localStorage.getItem("wtf-editor-draft:g-1") !== null;
    };
    const r = prepareSignInFromEditor({ hasEdits: true, saveDraft, saveResume: () => writeAdminResume(PUZZLE) });
    expect(r.ok).toBe(false);
    expect(r.message).toBe(EDITS_NOT_STORED);
    expect(r.message).toMatch(/Your edits are still here/);
    expect(sessionStorage.getItem(ADMIN_RESUME_KEY)).toBe(null);
  });

  it("REGRESSION: a resume that didn't stick stops the sign-in and clears what was written", () => {
    const clearResume = vi.fn();
    const r = prepareSignInFromEditor({ hasEdits: true, saveDraft: () => true, saveResume: () => false, clearResume });
    expect(r).toEqual({ ok: false, message: RESUME_NOT_STORED });
    expect(clearResume).toHaveBeenCalledTimes(1);

    // Session storage full while the draft copy succeeded.
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw quotaError(); });
    expect(prepareSignInFromEditor({ hasEdits: true, saveDraft: () => true, saveResume: () => writeAdminResume(PUZZLE) }).message).toBe(RESUME_NOT_STORED);
    expect(sessionStorage.getItem(ADMIN_RESUME_KEY)).toBe(null);
  });
});
