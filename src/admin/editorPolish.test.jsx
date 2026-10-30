// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import ConfirmDialog from "./ConfirmDialog.jsx";
import Dashboard from "./Dashboard.jsx";
import { PublishReadiness } from "./EditorChrome.jsx";
import QuestionEditor from "./QuestionEditor.jsx";
import SetupTab, { SetupNav } from "./SetupTab.jsx";
import { StudioContext } from "./StudioContext.js";
import { isBlankQuestion, missingSummary, publishReadiness, questionGaps } from "./questionStatus.js";

// The editor's guidance and its smaller pieces: the publish checklist, Add
// question's empty-question check, field order, the dialog's way out, the
// Setup jump bar and the dashboard's note.

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let root = null;
let host = null;
function clear() {
  act(() => root?.unmount());
  host?.remove();
  root = host = null;
}
afterEach(clear);
function mount(node) {
  clear();
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root.render(node));
  return host;
}

const PIC = "https://store.example.com/wtf-images/questions/1-abc.webp";
const isYouTube = (url) => url.includes("youtu");
const done = (n) => ({ id: `q${n}`, itemText: `Item ${n}`, correctCategory: "A", flavorCopy: "f", explanationCopy: "e" });
const four = [1, 2, 3, 4].map(done);
const many = (n) => Array.from({ length: n }, (_, i) => done(i + 1));
const check = (over) => publishReadiness({ hasDate: true, conflictTitle: null, questions: four, picture: false, isYouTube, ...over });
const keys = (r) => r.blocking.map((b) => b.key);

describe("publishReadiness", () => {
  it("has nothing to say about a ready puzzle", () => {
    expect(check()).toEqual({ blocking: [], unfinished: [] });
    expect(check({ questions: many(15) }).blocking).toEqual([]);
  });

  it("asks for a date, and names a date conflict", () => {
    expect(check({ hasDate: false }).blocking).toEqual([{ key: "date", text: "Pick a puzzle date", go: "date" }]);
    expect(check({ conflictTitle: "Cheese or Font" }).blocking).toEqual([{ key: "conflict", text: 'That day already has "Cheese or Font"', go: "date" }]);
  });

  it("counts what is short or over, within the 4–15 publishing needs", () => {
    const count = (n) => check({ questions: many(n) }).blocking[0];
    expect(count(3).text).toMatch(/^Add 1 more question \(publishing needs 4–15\)/);
    expect(count(0).text).toMatch(/^Add 4 more questions /);
    expect(count(16).text).toMatch(/^Remove 1 question \(publishing needs 4–15\)/);
    expect(count(17).text).toMatch(/^Remove 2 questions /);
    expect(count(3).go).toBe("questions");
    expect(count(16).go).toBe("questions");
  });

  it("points at the first blank item, in the puzzle's own word for it", () => {
    const questions = [done(1), { ...done(2), itemText: " " }, { ...done(3), itemText: "" }, done(4)];
    expect(check({ questions }).blocking).toEqual([{ key: "item", text: "Question 2 has no item text", go: 1 }]);
    const pictures = questions.map((q) => ({ ...q, questionImage: PIC }));
    expect(check({ questions: pictures, picture: true }).blocking).toEqual([{ key: "item", text: "Question 2 has no answer name", go: 1 }]);
  });

  it("needs a picture on every question of a picture quiz only", () => {
    const questions = [{ ...done(1), questionImage: PIC }, done(2), done(3), done(4)];
    expect(check({ questions, picture: true }).blocking).toEqual([{ key: "picture", text: "Question 2 needs a picture", go: 1 }]);
    expect(check({ questions, picture: false }).blocking).toEqual([]);
  });

  it("lists blocks in order", () => {
    const blank = { ...done(1), itemText: "" };
    expect(keys(check({ hasDate: false, questions: [blank], picture: true }))).toEqual(["date", "count", "item", "picture"]);
    expect(keys(check({ conflictTitle: "X", questions: [blank] }))).toEqual(["conflict", "count", "item"]);
  });

  it("lists unfinished questions, which never block", () => {
    const questions = [
      done(1),
      { ...done(2), flavorCopy: "" },
      { ...done(3), imageUrl: "https://x.example/a.webp" }, // no alt text
      { ...done(4), imageUrl: "https://youtu.be/abc" },     // video: needs none
      { itemText: "" },                                     // blank: a to-do, not unfinished
    ];
    const r = check({ questions });
    expect(r.unfinished).toEqual([1, 2]);
    expect(keys(r)).toEqual(["item"]);
    expect(check({ questions: questions.slice(0, 4) })).toEqual({ blocking: [], unfinished: [1, 2] });
  });

  it("counts a missing picture description as unfinished on a picture quiz", () => {
    const questions = four.map((q) => ({ ...q, questionImage: PIC, questionImageAlt: "d" }));
    questions[2] = { ...questions[2], questionImageAlt: "" };
    expect(check({ questions, picture: true })).toEqual({ blocking: [], unfinished: [2] });
  });
});

describe("isBlankQuestion", () => {
  const blank = { id: "q1", itemText: "", correctCategory: "B", flavorCopy: "  ", explanationCopy: "", imageUrl: "", imageAlt: "", imageSource: "", orderIndex: 5 };

  it("ignores the id, position and default answer", () => {
    expect(isBlankQuestion(blank)).toBe(true);
    expect(isBlankQuestion({})).toBe(true);
  });

  it("counts anything written or chosen", () => {
    for (const field of ["itemText", "flavorCopy", "explanationCopy", "imageUrl", "imageAlt", "imageSource", "questionImage", "questionImageAlt"])
      expect(isBlankQuestion({ ...blank, [field]: "x" })).toBe(false);
  });
});

describe("question gaps", () => {
  it("follow the editor's field order", () => {
    expect(questionGaps({ itemText: " ", imageUrl: "https://x.example/a.webp" }, isYouTube)).toEqual(["Item text", "Actual Info", "Needless Commentary", "Alt text"]);
    expect(questionGaps({}, isYouTube, { picture: true })).toEqual(["Picture", "Answer name", "Actual Info", "Needless Commentary"]);
    expect(missingSummary(questionGaps({ itemText: "A" }, isYouTube))).toBe("Missing explanation and commentary");
  });
});

describe("ConfirmDialog's way out", () => {
  const label = () => document.activeElement.textContent;

  it("says Cancel by default", () => {
    mount(<ConfirmDialog title="Sure?" confirmLabel="Yes" onConfirm={() => {}} onCancel={() => {}}><p>Gone.</p></ConfirmDialog>);
    expect(label()).toBe("Cancel");
  });

  it("uses cancelLabel, still starting there and still cancelling", () => {
    const onCancel = vi.fn();
    const onConfirm = vi.fn();
    mount(<ConfirmDialog title="Sure?" confirmLabel="Yes" cancelLabel="Keep editing" onConfirm={onConfirm} onCancel={onCancel}><p>Gone.</p></ConfirmDialog>);
    expect(label()).toBe("Keep editing");
    act(() => document.activeElement.click());
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });
});

describe("PublishReadiness", () => {
  const strip = (readiness, over) => {
    const onGo = vi.fn();
    const el = mount(<PublishReadiness readiness={readiness} published={false} retired={false} onGo={onGo} {...over}/>);
    return { el, onGo, links: [...el.querySelectorAll("button")] };
  };
  const blocked = { blocking: [
    { key: "date", text: "Pick a puzzle date", go: "date" },
    { key: "count", text: "Add 1 more question", go: "questions" },
    { key: "item", text: "Question 3 has no item text", go: 2 },
  ], unfinished: [] };

  it("lists each block as a link that jumps to it", () => {
    const { el, onGo, links } = strip(blocked);
    expect(el.querySelector("h2").textContent).toBe("Before you can publish");
    expect(links.map((b) => b.textContent)).toEqual(blocked.blocking.map((b) => b.text));
    links.forEach((b) => act(() => b.click()));
    expect(onGo.mock.calls.map(([go]) => go)).toEqual(["date", "questions", 2]);
  });

  it("says ready, with no link when nothing is unfinished", () => {
    const { el, links } = strip({ blocking: [], unfinished: [] });
    expect(el.textContent).toBe("Ready to publish");
    expect(links).toHaveLength(0);
  });

  it("offers the unfinished questions, noting they won't stop publishing", () => {
    const one = strip({ blocking: [], unfinished: [1] });
    expect(one.links[0].textContent).toBe("1 question still unfinished");
    act(() => one.links[0].click());
    expect(one.onGo).toHaveBeenCalledWith("questions");
    const two = strip({ blocking: [], unfinished: [0, 3] });
    expect(two.links[0].textContent).toBe("2 questions still unfinished");
    expect(two.el.textContent).toMatch(/won.t stop publishing/);
    expect(two.el.textContent).toContain("Ready to publish");
  });

  it("is hidden on a retired puzzle, blocked or not", () => {
    expect(strip(blocked, { retired: true }).el.textContent).toBe("");
    expect(strip({ blocking: [], unfinished: [1] }, { retired: true }).el.textContent).toBe("");
  });

  it("shows on a published puzzle only when something blocks", () => {
    expect(strip({ blocking: [], unfinished: [1] }, { published: true }).el.textContent).toBe("");
    expect(strip(blocked, { published: true }).el.textContent).toContain("Before you can publish");
  });
});

describe("Setup jump bar", () => {
  const SECTIONS = [["Basics", "ps-basics-title"], ["Quiz link", "ps-quizlink-title"], ["Names", "ps-names-title"], ["Topics", "ps-topics-title"],
    ["Appearance", "ps-appearance-title"], ["Poster", "ps-artwork-title"], ["Wide art", "ps-wide-title"], ["Teaser", "ps-silhouette-title"]];
  const realMatchMedia = window.matchMedia;
  const realScroll = HTMLElement.prototype.scrollIntoView;
  afterEach(() => {
    window.matchMedia = realMatchMedia;
    HTMLElement.prototype.scrollIntoView = realScroll;
  });

  // The real SetupTab, on the puzzle New Puzzle starts with, so every id the
  // bar names has to exist.
  const fresh = { id: "g-1", date: "", themeTitle: "", categoryA: "", categoryB: "", status: "draft", questions: [], tags: [] };
  const swatch = (id) => ({ id, name: id, mid: "#2DD4BF", dark: "#0F9488", light: "#E2F6F2", isDark: false });
  const studio = { palette: [swatch("teal"), swatch("pink")], paletteFamilies: [], HomeArt: () => null,
    youtubeEmbedUrl: () => null, isStoredImage: () => false, uploadBytes: vi.fn(), loadOptimizer: vi.fn() };
  function page(reduced = false) {
    window.matchMedia = vi.fn(() => ({ matches: reduced }));
    const jumps = [];
    HTMLElement.prototype.scrollIntoView = vi.fn(function scroll(options) { jumps.push({ el: this, options }); });
    const el = mount(
      <StudioContext.Provider value={studio}>
        <SetupTab game={fresh} set={() => {}} games={[]} trackImage={() => () => {}} onDelete={null} onRetire={null}/>
      </StudioContext.Provider>);
    return { el, jumps, buttons: [...el.querySelectorAll("nav.ps-setup-nav button")] };
  }

  it("is a labelled nav of the eight sections in page order, outside the grid so it can stick", () => {
    const { el, buttons } = page();
    expect(el.querySelector("nav.ps-setup-nav").getAttribute("aria-label")).toBe("Setup sections");
    expect(buttons.map((b) => b.textContent)).toEqual(SECTIONS.map(([label]) => label));
    expect(el.querySelector(".ps-setup nav")).toBeNull();
    const sections = [...el.querySelectorAll("section")];
    expect(SECTIONS.map(([, id]) => sections.indexOf(document.getElementById(id).closest("section")))).toEqual(SECTIONS.map((_, i) => i));
  });

  it("scrolls each button's whole section to the top and moves focus to its heading", () => {
    const { buttons, jumps } = page();
    const focus = vi.spyOn(HTMLElement.prototype, "focus");
    SECTIONS.forEach(([, id], i) => {
      act(() => buttons[i].click());
      const section = document.getElementById(id).closest("section");
      expect(jumps[i].el).toBe(section);
      expect(jumps[i].options).toEqual({ block: "start", behavior: "smooth" });
      expect(document.activeElement).toBe(section.querySelector("h2"));
      expect(document.activeElement.getAttribute("tabindex")).toBe("-1");
      expect(focus).toHaveBeenLastCalledWith({ preventScroll: true });
    });
    focus.mockRestore();
  });

  it("doesn't animate for reduced motion", () => {
    const { buttons, jumps } = page(true);
    act(() => buttons[0].click());
    expect(jumps[0].options.behavior).toBe("auto");
  });

  it("does nothing when a section isn't there", () => {
    window.matchMedia = vi.fn(() => ({ matches: false }));
    HTMLElement.prototype.scrollIntoView = vi.fn();
    const el = mount(<SetupNav/>);
    act(() => el.querySelector("nav button").click());
    expect(HTMLElement.prototype.scrollIntoView).not.toHaveBeenCalled();
  });
});

describe("Dashboard note", () => {
  const today = "2026-10-30";
  const games = [
    { id: "d1", status: "draft", themeTitle: "Draft one", date: "2026-11-05", questions: [] },
    { id: "d2", status: "draft", themeTitle: "Draft two", date: "2026-11-06", questions: [] },
    { id: "u1", status: "published", themeTitle: "Coming up", date: "2026-11-01", questions: [] },
    { id: "h1", status: "published", themeTitle: "Long gone", date: "2026-10-01", questions: [] },
    { id: "r1", status: "retired", themeTitle: "Put away", date: "2026-09-01", questions: [] },
  ];
  const dash = (extra) => mount(
    <StudioContext.Provider value={{ BrandIcon: () => null }}>
      <Dashboard games={games} today={today} onNew={() => {}} onEdit={() => {}} onLogout={() => {}} onExit={() => {}} {...extra}/>
    </StudioContext.Provider>);
  const notes = (el) => [...el.querySelectorAll(".ps-device-note")];

  it("shows nothing by default", () => {
    expect(notes(dash())).toHaveLength(0);
  });

  it("marks the draft rows and table rows that have device edits, with a dot", () => {
    const el = dash({ deviceEdits: (g) => g.id === "d1" || g.id === "u1" || g.id === "r1" });
    const found = notes(el);
    expect(found).toHaveLength(3);
    expect(found[0].textContent).toBe("Unsaved edits on this device");
    expect(found[0].querySelector(".ps-status-dot").getAttribute("aria-hidden")).toBe("true");
    expect(found[0].closest(".ps-draft").textContent).toContain("Draft one");
    expect(found[1].closest(".ps-tr").textContent).toContain("Coming up");
    expect(found[2].closest(".ps-tr").textContent).toContain("Put away");
  });
});

describe("question editor field order", () => {
  const color = { mid: "#2DD4BF", dark: "#0F9488", light: "#E2F6F2" };
  const question = { id: "q1", itemText: "Espresso", correctCategory: "A", flavorCopy: "Zip zip.", explanationCopy: "Coffee, pressed." };
  const studio = { youtubeEmbedUrl: () => null, isStoredImage: () => false, uploadBytes: vi.fn(), loadOptimizer: vi.fn() };
  const editor = (picture, onChange = () => {}) => mount(
    <StudioContext.Provider value={studio}>
      <QuestionEditor question={question} number={1} fresh={false} picture={picture} catA="Coffee" catB="Dinosaur" colorA={color} colorB={color}
                      onChange={onChange} onBusyChange={() => {}} onPictureBusyChange={() => {}} fieldId="f" pictureFieldId="p" onBackToList={() => {}}/>
    </StudioContext.Provider>);
  // Types into a controlled field: React only hears a value set past its own tracker.
  const type = (box, text) => act(() => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set.call(box, text);
    box.dispatchEvent(new Event("input", { bubbles: true }));
  });

  it.each([["ordinary", false], ["picture", true]])("each box on a %s question writes its own saved field", (_, picture) => {
    const onChange = vi.fn();
    const el = editor(picture, onChange);
    type(el.querySelector("#ps-q-info"), "typed info");
    expect(onChange).toHaveBeenLastCalledWith({ explanationCopy: "typed info" });
    type(el.querySelector("#ps-q-flavor"), "typed flavor");
    expect(onChange).toHaveBeenLastCalledWith({ flavorCopy: "typed flavor" });
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it.each([["ordinary", false], ["picture", true]])("puts Actual Info before Needless Commentary on a %s question", (_, picture) => {
    const el = editor(picture);
    const boxes = [...el.querySelectorAll("textarea")];
    expect(boxes.map((b) => b.id)).toEqual(["ps-q-info", "ps-q-flavor"]);
    const [info, flavor] = boxes;
    expect(info.compareDocumentPosition(flavor) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(info.value).toBe("Coffee, pressed.");
    expect(flavor.value).toBe("Zip zip.");
    expect(el.querySelector("label[for=ps-q-info]").textContent).toContain("Actual Info");
    expect(el.querySelector("label[for=ps-q-flavor]").textContent).toContain("Needless Commentary");
  });
});
