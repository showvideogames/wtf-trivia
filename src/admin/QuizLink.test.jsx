// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import QuizLink from "./QuizLink.jsx";

// Puzzle Studio's Quiz link card: the permanent /quiz/<slug> address with
// Copy Quiz Link; a draft's slug can be chosen, a published one's can't.

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let root = null;
let host = null;
function render(props) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root.render(<QuizLink set={() => {}} games={[]} {...props}/>));
}
afterEach(() => { act(() => root?.unmount()); host?.remove(); root = host = null; });
const url = () => host.querySelector('[data-testid="quiz-url"]').textContent;
const slugInput = () => host.querySelector("#ps-quizlink-slug");

const PUBLISHED = { id: "g-1", date: "2026-10-01", status: "published", themeTitle: "Taylor Swift Song OR Skyrim City?", slug: "taylor-swift-song-or-skyrim-city", slugColumn: true };

describe("QuizLink", () => {
  it("shows a published quiz's permanent URL, read-only, and copies it", async () => {
    const nav = { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } };
    render({ game: { ...PUBLISHED, themeTitle: "A New Title" }, games: [PUBLISHED], nav });
    expect(url()).toBe("https://whatthefudge.gg/quiz/taylor-swift-song-or-skyrim-city");
    expect(slugInput()).toBeNull();
    expect(host.textContent).toContain("Permanent");
    const copy = [...host.querySelectorAll("button")].find((b) => b.textContent.includes("Copy Quiz Link"));
    await act(async () => { copy.click(); });
    expect(nav.clipboard.writeText).toHaveBeenCalledWith("https://whatthefudge.gg/quiz/taylor-swift-song-or-skyrim-city");
    expect(host.textContent).toContain("Copied!");
  });

  it("lets a draft choose its slug, previewing the one its title would get", () => {
    const set = vi.fn();
    render({ game: { id: "g-2", status: "draft", themeTitle: "Taylor Swift Song OR Skyrim City?", slug: "", slugColumn: true }, games: [PUBLISHED], set });
    expect(url()).toBe("https://whatthefudge.gg/quiz/taylor-swift-song-or-skyrim-city-2");
    expect(slugInput().placeholder).toBe("taylor-swift-song-or-skyrim-city-2");
    act(() => { slugInput().dispatchEvent(new FocusEvent("focusout", { bubbles: true })); });
    expect(set).toHaveBeenCalledWith("slug", "");
  });

  it("shows a draft's typed name as the slug it will be", () => {
    render({ game: { id: "g-2", status: "draft", themeTitle: "Anything", slug: "My Custom Name!", slugColumn: true } });
    expect(url()).toBe("https://whatthefudge.gg/quiz/my-custom-name");
  });

  it("before the database has slugs, shows the one derived from the title and says so", () => {
    const legacy = { id: "g-1", date: "2026-10-01", status: "published", themeTitle: "Cats or Dogs?" };
    render({ game: legacy, games: [legacy] });
    expect(url()).toBe("https://whatthefudge.gg/quiz/cats-or-dogs");
    expect(slugInput()).toBeNull();
    expect(host.textContent).toContain("0004_quiz_slugs.sql");
  });
});
