// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import ConfirmDialog from "./ConfirmDialog.jsx";
import DatePicker from "./DatePicker.jsx";
import { answerCorrectionCopy, answerCorrectionNeedsConfirm, puzzleActionCopy } from "./puzzleActions.js";
import QuestionList from "./QuestionList.jsx";
import { StudioContext } from "./StudioContext.js";
import { QUESTION_LOCK_TEXT, applyOrder, questionLock, questionStructureChanged, restoreSavedQuestions, secureRandomInt, shuffleOrder, undoOrder } from "./questionStatus.js";
import { answersFit, parseResultCode } from "../shareLink.js";

// The admin cleanup: Delete/Retire confirmation, the compact calendar and
// Shuffle Order (a whole-question, unbiased, undoable reorder that is
// refused once a puzzle may have been played).

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let root = null;
let host = null;
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = host = null;
});
function mount(node) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root.render(node));
  return host;
}

describe("Delete / Retire confirmation", () => {
  function open() {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    const opener = document.createElement("button");
    document.body.appendChild(opener);
    opener.focus();
    mount(<ConfirmDialog title="Delete “Coffee or Dinosaur”?" confirmLabel="Delete puzzle" onConfirm={onConfirm} onCancel={onCancel}><p>Gone.</p></ConfirmDialog>);
    const dialog = document.querySelector("[role=alertdialog]");
    const confirm = dialog.querySelector("[data-confirm]");
    return { onConfirm, onCancel, opener, dialog, confirm };
  }

  it("does nothing on opening, and starts on Cancel", () => {
    const { onConfirm, onCancel, dialog } = open();
    expect(onConfirm).not.toHaveBeenCalled();
    expect(onCancel).not.toHaveBeenCalled();
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(document.activeElement.textContent).toBe("Cancel");
    expect(dialog.textContent).toContain("Coffee or Dinosaur");
  });

  it("ignores a keyboard press that didn't start on the confirm button", () => {
    const { onConfirm, confirm } = open();
    // An Enter carried over from the control that opened it: the browser's
    // synthetic click (detail 0) with no keydown on this button.
    act(() => confirm.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 0 })));
    // A held, repeating Enter doesn't arm it either.
    act(() => confirm.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", repeat: true, bubbles: true })));
    act(() => confirm.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 0 })));
    expect(onConfirm).not.toHaveBeenCalled();
    // A fresh Enter pressed on the button itself confirms.
    act(() => confirm.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })));
    act(() => confirm.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 0 })));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("confirms on a pointer click, and Escape or Cancel close without acting", () => {
    const { onConfirm, onCancel, dialog, confirm } = open();
    act(() => dialog.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    expect(onCancel).toHaveBeenCalledTimes(1);
    act(() => dialog.querySelector("button").click());
    expect(onCancel).toHaveBeenCalledTimes(2);
    expect(onConfirm).not.toHaveBeenCalled();
    act(() => confirm.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 1 })));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("names the puzzle and says what each action really does", () => {
    const live = { themeTitle: "Coffee ☕ or Dinosaur 🦕🦖", status: "published", date: "2026-10-11", questions: [{}, {}, {}, {}, {}] };
    const del = puzzleActionCopy("delete", live);
    expect(del.title).toBe("Delete “Coffee ☕ or Dinosaur 🦕🦖”?");
    expect(del.confirmLabel).toBe("Delete puzzle");
    expect(del.lines.join(" ")).toMatch(/5 questions.*nobody has played it.*can't be undone/);
    const retire = puzzleActionCopy("retire", live);
    expect(retire.confirmLabel).toBe("Retire puzzle");
    expect(retire.lines.join(" ")).toMatch(/October 11, 2026 becomes free/);
    expect(retire.lines.join(" ")).toMatch(/Nothing is deleted/);
    const draft = puzzleActionCopy("delete", { themeTitle: "", status: "draft", questions: [{}] });
    expect(draft.title).toBe("Delete draft “Untitled puzzle”?");
    expect(draft.lines[0]).toContain("1 question.");
  });
});

describe("correcting an answer on a played puzzle", () => {
  it("asks first, only when the puzzle may have plays and the answer moves away from the saved one", () => {
    const saved = { id: "q1", itemText: "Espresso", correctCategory: "A" };
    const ask = (lock, question, next) => answerCorrectionNeedsConfirm({ lock, question, saved, next });
    expect(ask("played", saved, "B")).toBe(true);
    expect(ask("live", saved, "B")).toBe(true);
    expect(ask("unknown", saved, "B")).toBe(true);
    expect(ask(null, saved, "B")).toBe(false); // confirmed unplayed (or never saved)
    expect(ask("played", saved, "A")).toBe(false); // no change
    expect(ask("played", { ...saved, correctCategory: "B" }, "A")).toBe(false); // back to the saved answer
    expect(answerCorrectionNeedsConfirm({ lock: "played", question: { id: "q9" }, saved: undefined, next: "B" })).toBe(false); // a new question
  });

  it("says plainly that saved results and stats are not recalculated", () => {
    const copy = answerCorrectionCopy({ itemText: "Espresso", number: 1, name: "Dinosaur 🦕" });
    expect(copy.title).toBe("Change the correct answer for “Espresso”?");
    expect(copy.confirmLabel).toBe("Change answer");
    expect(copy.lines.join(" ")).toMatch(/becomes Dinosaur 🦕..*won't be recalculated: past scores, right and wrong marks, shared result links and this puzzle's stats keep the old answer/);
    expect(answerCorrectionCopy({ itemText: " ", number: 3, name: "A" }).title).toBe("Change the correct answer for question 3?");
  });
});

describe("calendar", () => {
  it("marks taken days with a dot and an accessible label instead of a status word", () => {
    const games = [
      { id: "g-this", date: "2026-10-11", status: "published", themeTitle: "Coffee or Dinosaur" },
      { id: "g-pub", date: "2026-10-04", status: "published", themeTitle: "Opera or Pasta?" },
      { id: "g-draft", date: "2026-10-13", status: "draft", themeTitle: "Cheese or Font" },
    ];
    const el = mount(<DatePicker value="2026-10-11" onChange={() => {}} games={games} currentGameId="g-this"/>);
    act(() => el.querySelector("[aria-controls=ps-calendar]").click());
    const days = [...el.querySelectorAll(".ps-cal-day:not(.is-empty)")];
    expect(days).toHaveLength(31);
    expect(el.querySelectorAll(".ps-cal-dow")).toHaveLength(7);
    expect(el.querySelector(".ps-cal-grid").textContent).toBe("SunMonTueWedThuFriSat" + Array.from({ length: 31 }, (_, i) => i + 1).join(""));
    const label = (d) => days[d - 1].getAttribute("aria-label");
    expect(label(4)).toBe("October 4, 2026, published: Opera or Pasta?");
    expect(label(13)).toBe("October 13, 2026, draft: Cheese or Font");
    expect(label(11)).toBe("October 11, 2026, this puzzle's day");
    expect(label(14)).toBe("October 14, 2026");
    expect(days[3].querySelector(".ps-cal-dot.is-used")).not.toBeNull();
    expect(days[12].querySelector(".ps-cal-dot.is-draft")).not.toBeNull();
    expect(days[10].querySelector(".ps-cal-dot.is-own")).not.toBeNull();
    expect(days[3].getAttribute("aria-disabled")).toBe("true");
  });
});

describe("Shuffle Order", () => {
  const Q = [
    { id: "q1", itemText: "Espresso", correctCategory: "A", flavorCopy: "zip", explanationCopy: "a", imageUrl: "https://x/1.webp", orderIndex: 1 },
    { id: "q2", itemText: "T. rex", correctCategory: "B", flavorCopy: "rawr", explanationCopy: "b", imageUrl: "https://youtu.be/abc", orderIndex: 2 },
    { id: "q3", itemText: "Latte", correctCategory: "A", flavorCopy: "", explanationCopy: "c", imageUrl: "", orderIndex: 3 },
    { id: "q4", itemText: "Stegosaurus", correctCategory: "B", flavorCopy: "", explanationCopy: "d", imageUrl: "", orderIndex: 4 },
  ];

  it("moves every question whole and renumbers, and Undo restores the order keeping later edits", () => {
    const order = [2, 0, 3, 1];
    const shuffled = applyOrder(Q, order);
    expect(shuffled.map((q) => q.id)).toEqual(["q3", "q1", "q4", "q2"]);
    shuffled.forEach((q, i) => expect(q).toEqual({ ...Q[order[i]], orderIndex: i + 1 }));
    const edited = shuffled.map((q) => (q.id === "q4" ? { ...q, itemText: "Ankylosaurus" } : q));
    const back = undoOrder(edited, order);
    expect(back.map((q) => q.id)).toEqual(["q1", "q2", "q3", "q4"]);
    expect(back.map((q) => q.orderIndex)).toEqual([1, 2, 3, 4]);
    expect(back[3].itemText).toBe("Ankylosaurus");
    // With the list as it was, each question gets its own orderIndex back.
    const odd = Q.map((q, i) => ({ ...q, orderIndex: [7, undefined, 2, 9][i] }));
    expect(undoOrder(applyOrder(odd, order), order, odd)).toEqual(odd);
  });

  it("is a uniform shuffle: every order of 4 equally likely, for any count", () => {
    const counts = new Map();
    const runs = 24000;
    for (let r = 0; r < runs; r++) {
      const key = shuffleOrder(4).join("");
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    expect(counts.size).toBe(24);
    // Chi-square with 23 degrees of freedom; 60 is far beyond p = 0.0001.
    const expected = runs / 24;
    const chi = [...counts.values()].reduce((sum, c) => sum + (c - expected) ** 2 / expected, 0);
    expect(chi).toBeLessThan(60);
    for (const n of [0, 1, 2, 7, 15, 40]) expect(shuffleOrder(n).slice().sort((a, b) => a - b)).toEqual([...Array(n).keys()]);
  });

  it("draws from crypto without modulo bias", () => {
    // max 3: 2^32 isn't a multiple of 3, so the top values are redrawn.
    const draws = [0xFFFFFFFF, 7];
    const fake = (a) => { a[0] = draws.shift(); return a; };
    expect(secureRandomInt(3, fake)).toBe(1);
    expect(draws).toHaveLength(0);
    const spy = vi.spyOn(globalThis.crypto, "getRandomValues");
    shuffleOrder(5);
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it("follows the shared played-question lock", () => {
    const now = new Date("2026-10-12T12:00:00Z");
    const lock = (stored, history, saved = true) => questionLock({ saved, stored, history }, now);
    // Never saved: nothing can have been played.
    expect(lock({ status: "draft" }, "checking", false)).toBeNull();
    // Saved: only the server's "no plays" unlocks it, never the date alone.
    expect(lock({ status: "draft", date: "2026-10-20" }, "unplayed")).toBeNull();
    expect(lock({ status: "published", date: "2026-10-20" }, "unplayed")).toBeNull();
    expect(lock({ status: "draft", date: "2026-10-20" }, "checking")).toBe("checking");
    expect(lock({ status: "draft", date: "2026-10-20" }, "unknown")).toBe("unknown");
    expect(lock({ status: "draft", date: "2026-10-20" }, undefined)).toBe("unknown");
    // A played puzzle moved to a future date stays locked.
    expect(lock({ status: "published", date: "2027-01-01" }, "played")).toBe("played");
    expect(lock({ status: "draft", date: "2027-01-01" }, "played")).toBe("played");
    // Live or retired: locked whatever the server says.
    expect(lock({ status: "published", date: "2026-10-12" }, "unplayed")).toBe("live");
    expect(lock({ status: "published", date: "2026-10-13" }, "unplayed")).toBe("live"); // already the 13th in UTC+14
    expect(lock({ status: "retired", date: "2026-11-01" }, "unplayed")).toBe("retired");
    for (const why of ["played", "live", "retired", "checking", "unknown"]) expect(QUESTION_LOCK_TEXT[why]).toBeTruthy();
  });

  it("adding or deleting a question breaks a played puzzle's shared results, so both count as structural", () => {
    // Why: a shared result link carries one digit per question, and its
    // result is only shown while the puzzle has exactly that many questions.
    const link = parseResultCode("g-1759600000000.1011");
    expect(answersFit({ questionCount: 4 }, link)).toBe(true);
    expect(answersFit({ questionCount: 5 }, link)).toBe(false); // a question added
    expect(answersFit({ questionCount: 3 }, link)).toBe(false); // a question deleted
    // And positions: deleting Q2 moves Q3 and Q4 up, under the answers saved for Q2 and Q3.
    const moved = [Q[1], Q[0], Q[2], Q[3]];
    expect(questionStructureChanged(Q, moved)).toBe(true); // reordered
    expect(questionStructureChanged(Q, [...Q, { id: "q5", itemText: "Mocha" }])).toBe(true); // added at the end
    expect(questionStructureChanged(Q, [Q[0], Q[2], Q[3]])).toBe(true); // deleted
    expect(questionStructureChanged(Q, [Q[0], Q[2], Q[3], { id: "q5" }])).toBe(true); // deleted + added, same count
    const noIds = Q.map(({ id, ...q }) => q);
    expect(questionStructureChanged(noIds, [noIds[1], noIds[0], noIds[2], noIds[3]])).toBe(true);
    // Wording, commentary and media edits keep every position: not structural.
    expect(questionStructureChanged(Q, Q.map((q) => ({ ...q, itemText: q.itemText + "!", flavorCopy: "new", explanationCopy: "new", imageUrl: "" })))).toBe(false);
    expect(questionStructureChanged(noIds, noIds.map((q, i) => (i === 1 ? { ...q, itemText: "Rex", flavorCopy: "new" } : q)))).toBe(false);
  });

  it("restores the saved questions, keeping wording edits", () => {
    const edited = [{ ...Q[1], itemText: "Rex" }, Q[0], Q[3], { id: "q5", itemText: "Mocha" }]; // reordered, q3 deleted, q5 added
    const back = restoreSavedQuestions(edited, Q);
    expect(back.map((q) => q.id)).toEqual(["q1", "q2", "q3", "q4"]);
    expect(back[1].itemText).toBe("Rex");
    expect(back[2]).toEqual(Q[2]);
    expect(questionStructureChanged(Q, back)).toBe(false);
  });

  it("locks every structural control in the list, and keeps editing a question", () => {
    const color = { mid: "#2DD4BF", dark: "#0F9488" };
    const props = { questions: Q, catA: "Coffee", catB: "Dinosaur", colorA: color, colorB: color, selected: 0,
      onSelect: vi.fn(), onAdd: vi.fn(), onMove: vi.fn(), onDelete: vi.fn(), onShuffle: vi.fn(), onUndoShuffle: null };
    const render = (extra) => mount(
      <StudioContext.Provider value={{ youtubeEmbedUrl: () => null }}><QuestionList {...props} {...extra}/></StudioContext.Provider>);
    const menuItems = (el) => {
      act(() => el.querySelectorAll(".ps-menu-btn")[1].click());
      const items = [...el.querySelectorAll("[role=menuitem]")].map((b) => [b.textContent, b.disabled]);
      act(() => el.querySelectorAll(".ps-menu-btn")[1].click());
      return Object.fromEntries(items);
    };

    let el = render({ lock: null });
    expect([...el.querySelectorAll(".ps-qrow")].every((li) => li.draggable)).toBe(true);
    expect(el.querySelector(".ps-qlist-shuffle").disabled).toBe(false);
    expect(el.querySelector(".ps-qlist-add").disabled).toBe(false);
    expect(menuItems(el)).toEqual({ "Move up": false, "Move down": false, "Delete question": false });
    act(() => root.unmount()); host.remove();

    el = render({ lock: QUESTION_LOCK_TEXT.played, onRestore: vi.fn() });
    expect(el.querySelector(".ps-order-lock").textContent).toContain(QUESTION_LOCK_TEXT.played);
    expect([...el.querySelectorAll(".ps-qrow")].some((li) => li.draggable)).toBe(false);
    expect(el.querySelector(".ps-qlist-shuffle").disabled).toBe(true);
    expect(el.querySelector(".ps-qlist-add").disabled).toBe(true);
    expect(menuItems(el)).toEqual({ "Move up": true, "Move down": true, "Delete question": true });
    // A drop still arriving (e.g. from another window) moves nothing.
    const drop = new Event("drop", { bubbles: true, cancelable: true });
    drop.dataTransfer = { getData: () => "0" };
    act(() => el.querySelectorAll(".ps-qrow")[2].dispatchEvent(drop));
    expect(props.onMove).not.toHaveBeenCalled();
    // Opening a question to edit its wording stays available; Add does nothing.
    act(() => el.querySelector(".ps-qrow-main").click());
    act(() => el.querySelector(".ps-qlist-add").click());
    expect(props.onSelect).toHaveBeenCalled();
    expect(props.onAdd).not.toHaveBeenCalled();
    expect(el.querySelector(".ps-order-lock button").textContent).toBe("Restore saved questions");
  });
});
