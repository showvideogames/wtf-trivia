import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { emptyFavorites, toggleFavorite } from "./archiveFavorites.js";
import ArchiveFavoriteButton from "./ArchiveFavoriteButton.jsx";

// A tiny store like the Archive's: setState applies updates synchronously.
function store(initial) {
  let state = { ...emptyFavorites(), ...initial };
  return {
    get: () => state,
    set: (update) => { state = typeof update === "function" ? update(state) : update; },
  };
}
function deferred() {
  let resolve, reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}
const run = (s, save, puzzleId = "p1") =>
  toggleFavorite({ puzzleId, title: "Puppet or Singer?", getState: s.get, setState: s.set, save });

describe("toggleFavorite", () => {
  it("adds a favorite at once, then takes the database's total", async () => {
    const s = store({ mine: new Set(), counts: { p1: 4 } });
    const d = deferred();
    const done = run(s, () => d.promise);
    expect(s.get().mine.has("p1")).toBe(true);
    expect(s.get().counts.p1).toBe(5);
    expect(s.get().pending.has("p1")).toBe(true);
    d.resolve(7); // someone else favorited meanwhile
    expect(await done).toBe("saved");
    expect(s.get().counts.p1).toBe(7);
    expect(s.get().pending.has("p1")).toBe(false);
  });

  it("removes a favorite at once, never below zero", async () => {
    const s = store({ mine: new Set(["p1"]), counts: {} });
    const save = vi.fn(async () => 0);
    const done = run(s, save);
    expect(s.get().mine.has("p1")).toBe(false);
    expect(s.get().counts.p1).toBe(0);
    await done;
    expect(save).toHaveBeenCalledWith("p1", false);
  });

  it("ignores repeat presses while a save is in progress", async () => {
    const s = store({ mine: new Set(), counts: { p1: 0 } });
    const d = deferred();
    const save = vi.fn(() => d.promise);
    const first = run(s, save);
    expect(await run(s, save)).toBe("ignored");
    expect(await run(s, save)).toBe("ignored");
    expect(save).toHaveBeenCalledTimes(1);
    expect(s.get().counts.p1).toBe(1); // counted once, not three times
    d.resolve(1);
    await first;
    expect(s.get().counts.p1).toBe(1);
  });

  it("restores exactly the previous heart and count when saving fails, and keeps an error up", async () => {
    const s = store({ mine: new Set(["other"]), counts: { p1: 4, other: 2 } });
    const d = deferred();
    const done = run(s, () => d.promise);
    expect(s.get().counts.p1).toBe(5);
    d.reject(new Error("offline"));
    expect(await done).toBe("failed");
    expect(s.get().mine.has("p1")).toBe(false);
    expect(s.get().counts).toEqual({ p1: 4, other: 2 });
    expect(s.get().pending.size).toBe(0);
    expect(s.get().error).toEqual({
      puzzleId: "p1",
      message: "Couldn't add “Puppet or Singer?” to your favorites. Check your connection and try again.",
    });
  });

  it("rolls back a removal too, and a puzzle that had no count goes back to none", async () => {
    const s = store({ mine: new Set(["p1"]), counts: {} });
    await run(s, async () => { throw new Error("nope"); });
    expect(s.get().mine.has("p1")).toBe(true);
    expect(s.get().counts).toEqual({});
    expect(s.get().error.message).toMatch(/^Couldn't remove/);
  });

  it("only rolls back its own puzzle", async () => {
    const s = store({ mine: new Set(), counts: { p1: 1, p2: 1 } });
    const failing = deferred();
    const a = run(s, () => failing.promise, "p1");
    await run(s, async () => 2, "p2");
    failing.reject(new Error("x"));
    await a;
    expect([...s.get().mine]).toEqual(["p2"]);
    expect(s.get().counts).toEqual({ p1: 1, p2: 2 });
  });

  it("a later successful save of that puzzle clears its error", async () => {
    const s = store({ mine: new Set(), counts: { p1: 0 } });
    await run(s, async () => { throw new Error("x"); });
    expect(s.get().error).not.toBeNull();
    await run(s, async () => 1);
    expect(s.get().error).toBeNull();
    expect(s.get().counts.p1).toBe(1);
  });

  it("does nothing while this player's favorites are unknown", async () => {
    const s = store({ mine: null, counts: { p1: 3 } });
    const save = vi.fn();
    expect(await run(s, save)).toBe("ignored");
    expect(save).not.toHaveBeenCalled();
  });

  it("works without counts (they failed to load): no false number appears", async () => {
    const s = store({ mine: new Set(), counts: null });
    await run(s, async () => 3);
    expect(s.get().mine.has("p1")).toBe(true);
    expect(s.get().counts).toBeNull();
  });
});

describe("ArchiveFavoriteButton", () => {
  const html = (props) => renderToStaticMarkup(<ArchiveFavoriteButton title="Cheese OR Font?" onToggle={() => {}} {...props}/>);

  it("names the action and uses aria-pressed", () => {
    expect(html({ selected: false, count: 0 })).toContain('aria-pressed="false" aria-label="Add Cheese OR Font? to favorites"');
    expect(html({ selected: true, count: 3 })).toContain('aria-pressed="true" aria-label="Remove Cheese OR Font? from favorites"');
  });

  it("shows the total, including 0, and no number when it's unknown", () => {
    expect(html({ selected: false, count: 0 })).toContain('<span class="arc-fav-count" aria-hidden="true">0</span>');
    expect(html({ selected: false, count: 0 })).toContain("0 favorites");
    expect(html({ selected: true, count: 1 })).toContain("1 favorite<");
    expect(html({ selected: false, count: null })).not.toContain("arc-fav-count");
  });

  it("marks busy and unavailable states without the disabled attribute", () => {
    expect(html({ selected: true, count: 1, busy: true })).toMatch(/aria-disabled="true" aria-busy="true"/);
    expect(html({ selected: false, count: 1, disabled: true })).toMatch(/aria-disabled="true"/);
    expect(html({ selected: false, count: 1, disabled: true })).not.toMatch(/ disabled=""/);
  });

  // The press never reaches the card (which would open the puzzle), and is
  // ignored while busy or unavailable.
  const press = (props) => {
    const onToggle = vi.fn();
    const button = ArchiveFavoriteButton({ title: "T", selected: false, count: 0, onToggle, ...props }).props.children[0];
    const event = { stopPropagation: vi.fn() };
    button.props.onClick(event);
    return { onToggle, event };
  };
  it("a press toggles and stops at the heart", () => {
    const { onToggle, event } = press({});
    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(event.stopPropagation).toHaveBeenCalled();
  });
  it("a press while busy or unavailable does nothing, and still stops at the heart", () => {
    for (const state of [{ busy: true }, { disabled: true }]) {
      const { onToggle, event } = press(state);
      expect(onToggle).not.toHaveBeenCalled();
      expect(event.stopPropagation).toHaveBeenCalled();
    }
  });
});
