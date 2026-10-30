// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StrictMode, act, useImperativeHandle } from "react";
import { createRoot } from "react-dom/client";
import { browserBackAction, leaveCopy, leaveRisk, useBrowserBackGuard } from "./editorHistory.js";

// Browser Back in the editor: one history entry of its own, under StrictMode
// as main.jsx renders it, and what leaving would lose.

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let root = null;
let host = null;
beforeEach(() => window.history.replaceState(null, "", "/admin"));
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = host = null;
  vi.restoreAllMocks();
});

function Harness({onBack, ref}) {
  const guard = useBrowserBackGuard(onBack);
  useImperativeHandle(ref, () => guard);
  return null;
}
function render(onBack, api) {
  act(() => root.render(<StrictMode><Harness onBack={onBack} ref={api}/></StrictMode>));
}
function open(onBack = vi.fn()) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  const api = { current: null };
  render(onBack, api);
  return { onBack, api, own: window.history.state };
}
// What the browser does on Back or Forward: the entry changes, then popstate.
function arriveAt(state) {
  act(() => {
    window.history.replaceState(state, "");
    window.dispatchEvent(new PopStateEvent("popstate"));
  });
}
// The real thing, for the tests below that need the stack itself: jsdom
// traverses in a later task, so this waits for its popstate.
async function traverse(move) {
  const landed = new Promise((resolve) => window.addEventListener("popstate", resolve, { once: true }));
  await act(async () => { move(); await landed; });
}

describe("useBrowserBackGuard", () => {
  it("pushes exactly one entry under StrictMode, keeping the entry's state", () => {
    window.history.replaceState({ wtfView: "home" }, "");
    const push = vi.spyOn(window.history, "pushState");
    const { api, own } = open();
    expect(push).toHaveBeenCalledTimes(1);
    expect(own.wtfEditor).toBeTruthy();
    expect(own.wtfView).toBe("home");
    act(() => api.current.hold());
    expect(push).toHaveBeenCalledTimes(1);
  });

  it("calls the latest callback on arriving at another entry, and hold puts its own entry back", () => {
    window.history.replaceState({ wtfView: "admin" }, "");
    const { onBack, api, own } = open();
    arriveAt({ wtfView: "home", wtfHelp: true }); // none of this may follow it back
    expect(onBack).toHaveBeenCalledTimes(1);
    const hold = onBack.mock.calls[0][0];
    const push = vi.spyOn(window.history, "pushState");
    act(() => hold());
    expect(push).toHaveBeenCalledTimes(1);
    expect(window.history.state).toEqual(own);
    expect(own).toEqual({ wtfView: "admin", wtfEditor: own.wtfEditor });

    const later = vi.fn();
    render(later, api);
    arriveAt(null);
    expect(later).toHaveBeenCalledTimes(1);
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it("ignores arriving back on its own entry", () => {
    const { onBack, own } = open();
    arriveAt(own);
    expect(onBack).not.toHaveBeenCalled();
  });

  it("release steps back over its entry without calling the callback", () => {
    const back = vi.spyOn(window.history, "back").mockImplementation(() => {});
    const { onBack, api } = open();
    act(() => api.current.release());
    expect(back).toHaveBeenCalledTimes(1);
    arriveAt({ wtfView: "home" });
    expect(onBack).not.toHaveBeenCalled();
  });

  it("release does nothing once its entry has already gone", () => {
    const back = vi.spyOn(window.history, "back").mockImplementation(() => {});
    const { onBack, api } = open();
    arriveAt(null);
    expect(onBack).toHaveBeenCalledTimes(1);
    act(() => api.current.release());
    expect(back).not.toHaveBeenCalled();
  });

  it("stops listening once the editor is gone", () => {
    const { onBack } = open();
    act(() => root.unmount());
    root = null;
    arriveAt(null);
    expect(onBack).not.toHaveBeenCalled();
  });

  it("turns the browser's scroll restoring off only while open", () => {
    window.history.scrollRestoration = "auto"; // jsdom has none of its own
    open();
    expect(window.history.scrollRestoration).toBe("manual");
    act(() => root.unmount());
    root = null;
    expect(window.history.scrollRestoration).toBe("auto");
    delete window.history.scrollRestoration;
  });

  // The setting is per entry in a browser, and the entry that matters is the
  // one below the push. jsdom has no such thing, so this only pins the order;
  // Back from Preview keeping its scroll position is a browser check.
  it("sets scroll restoring before every push, including a re-push on a held Back", () => {
    const push = window.history.pushState;
    const modes = [];
    vi.spyOn(window.history, "pushState").mockImplementation(function spy(...args) {
      modes.push(window.history.scrollRestoration);
      return push.apply(window.history, args);
    });
    window.history.scrollRestoration = "auto";
    open(vi.fn((hold) => hold()));
    expect(modes).toEqual(["manual"]);
    window.history.scrollRestoration = "auto"; // the entry Back lands on
    arriveAt(null);
    expect(modes).toEqual(["manual", "manual"]);
    act(() => root.unmount());
    root = null;
    expect(window.history.scrollRestoration).toBe("auto"); // what it was before the first hold
    delete window.history.scrollRestoration;
  });
});

describe("useBrowserBackGuard on real history", () => {
  const stay = () => vi.fn((hold) => hold());
  const onItsOwnEntry = (own) => {
    expect(window.location.pathname).toBe("/admin");
    expect(window.history.state).toEqual(own);
  };
  beforeEach(() => {
    window.history.pushState(null, "", "/start");
    window.history.pushState(null, "", "/admin");
  });

  it("restores its own address after a jump lands on another path", async () => {
    window.history.replaceState({ wtfView: "admin" }, "", "/admin?tab=1");
    const seen = [];
    const { onBack, own } = open(vi.fn((hold) => { seen.push(window.location.pathname); hold(); }));
    await traverse(() => window.history.go(-2));
    expect(seen).toEqual(["/start"]);
    expect(onBack).toHaveBeenCalledTimes(1);
    expect(window.location.pathname + window.location.search).toBe("/admin?tab=1");
    expect(window.history.state).toEqual(own);
  });

  it("doesn't grow the stack however often Back is held", async () => {
    const { onBack, own, api } = open(stay());
    const depth = window.history.length;
    for (let i = 0; i < 3; i++) await traverse(() => window.history.back());
    expect(onBack).toHaveBeenCalledTimes(3);
    act(() => { api.current.hold(); api.current.hold(); });
    expect(window.history.length).toBe(depth);
    onItsOwnEntry(own);
  });

  it("holds again after a new mount on a dead entry", async () => {
    const first = open();
    act(() => root.unmount());
    root = null;
    host.remove();
    const depth = window.history.length;
    const second = open(stay());
    expect(second.own.wtfEditor).not.toBe(first.own.wtfEditor);
    expect(window.history.length).toBe(depth + 1);
    await traverse(() => window.history.back()); // onto the dead token's entry
    expect(first.onBack).not.toHaveBeenCalled();
    expect(second.onBack).toHaveBeenCalledTimes(1);
    onItsOwnEntry(second.own);
  });

  it("release steps back onto the admin's entry", async () => {
    const { onBack, api } = open();
    await traverse(() => api.current.release());
    expect(onBack).not.toHaveBeenCalled();
    expect(window.location.pathname).toBe("/admin");
    expect(window.history.state?.wtfEditor).toBeUndefined();
  });

  it("release doesn't step back onto another page after a jump was held", async () => {
    const { api } = open(stay());
    await traverse(() => window.history.go(-2));
    const depth = window.history.length;
    const back = vi.spyOn(window.history, "back");
    act(() => api.current.release());
    expect(back).not.toHaveBeenCalled();
    expect(window.location.pathname).toBe("/admin");
    expect(window.history.state?.wtfEditor).toBeUndefined();
    expect(window.history.length).toBe(depth);
  });
});

describe("browserBackAction", () => {
  it("closes the nearest thing first, and only leaves with nothing left", () => {
    let state = { preview: true, dialogOpen: true, phoneQuestion: true, saving: "save", risk: "published" };
    for (const [flag, action] of [["preview", "preview"], ["dialogOpen", "dialog"], ["phoneQuestion", "list"], ["saving", "saving"], ["risk", "ask"]]) {
      expect(browserBackAction(state)).toBe(action);
      state = { ...state, [flag]: false };
    }
    expect(browserBackAction({ ...state, risk: null })).toBe("exit");
  });

  it("gets a phone question back to the list before asking about a save or a risk", () => {
    expect(browserBackAction({ phoneQuestion: true, saving: "publish" })).toBe("list");
    expect(browserBackAction({ phoneQuestion: true, risk: "new" })).toBe("list");
    expect(browserBackAction({ preview: true, phoneQuestion: true })).toBe("preview");
  });
});

describe("leaveRisk", () => {
  const base = { dirty: true, published: false, inDb: true, autoSaveState: "saved", imagesBusy: false };
  const risk = (over) => leaveRisk({ ...base, ...over });

  it("names what would be lost", () => {
    expect(risk({ published: true })).toBe("published");
    expect(risk({ inDb: false })).toBe("new");
    expect(risk({ autoSaveState: "failed" })).toBe("device");
    expect(risk({})).toBeNull(); // a draft whose copy is safe on this device
    expect(risk({ dirty: false, published: true, inDb: false, autoSaveState: "failed" })).toBeNull();
  });

  it("names an upload only when no edits are at risk", () => {
    expect(risk({ imagesBusy: true })).toBe("upload"); // the edits are safe on this device
    expect(risk({ imagesBusy: true, dirty: false })).toBe("upload");
    expect(risk({ imagesBusy: true, dirty: false, published: true })).toBe("upload");
    expect(risk({ imagesBusy: true, published: true })).toBe("published");
    expect(risk({ imagesBusy: true, inDb: false })).toBe("new");
    expect(risk({ imagesBusy: true, autoSaveState: "failed" })).toBe("device");
  });

  it("prefers published, then new, as the old confirm's wording did", () => {
    expect(risk({ published: true, inDb: false, autoSaveState: "failed" })).toBe("published");
    expect(risk({ inDb: false, autoSaveState: "failed" })).toBe("new");
  });

  it("matches the old leave check for every case without an upload", () => {
    for (const dirty of [true, false]) for (const published of [true, false]) for (const inDb of [true, false])
      for (const autoSaveState of ["idle", "saved", "failed"]) {
        const losing = dirty && (published || !inDb || autoSaveState === "failed");
        expect(Boolean(leaveRisk({ dirty, published, inDb, autoSaveState, imagesBusy: false }))).toBe(losing);
      }
  });
});

describe("leaveCopy", () => {
  const edits = ["published", "new", "device"];

  it("adds the upload to what edits would lose, without changing the rest", () => {
    for (const risk of edits) {
      const alone = leaveCopy(risk);
      const both = leaveCopy(risk, true);
      expect(alone.lines).toHaveLength(1);
      expect(both.lines).toEqual([...alone.lines, expect.stringMatching(/image.*still uploading.*won't be kept/)]);
      expect({ ...both, lines: alone.lines }).toEqual(alone);
    }
  });

  it("doesn't say the upload twice when it's the only risk", () => {
    expect(leaveCopy("upload", true)).toEqual(leaveCopy("upload"));
    expect(leaveCopy("upload", true).lines).toHaveLength(1);
  });

  it("offers a way to go for everything leaveRisk can return", () => {
    const risks = [true, false].flatMap((dirty) => [true, false].flatMap((published) => [true, false].flatMap((inDb) => ["idle", "failed"].map((autoSaveState) =>
      leaveRisk({ dirty, published, inDb, autoSaveState, imagesBusy: true })))));
    expect(new Set(risks)).toEqual(new Set(["upload", ...edits]));
    for (const risk of risks) expect(leaveCopy(risk).confirmLabel).toMatch(/^Leave and lose /);
  });
});
