import { describe, it, expect, afterEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import GameProgress from "./GameProgress.jsx";
import PlayerHeader, { AdSlot } from "./PlayerHeader.jsx";
import { PlayerChromeContext } from "./playerChrome.js";
import { gameToRow, rowToGame } from "./gameRow.js";
import { restoreEditorDraft } from "./admin/editorDraft.js";

const count = (html, needle) => html.split(needle).length - 1;

describe("gameplay progress", () => {
  it("draws exactly one dot per question, for every supported puzzle length", () => {
    for (const total of [4, 8, 10, 12, 15]) {
      const html = renderToStaticMarkup(<GameProgress total={total} currentIndex={0}/>);
      expect(count(html, 'class="gp-dot"') + count(html, "gp-dot is-reached")).toBe(total);
    }
  });

  it("fills the answered and current dots, and only those", () => {
    const html = renderToStaticMarkup(<GameProgress total={10} currentIndex={2}/>);
    expect(count(html, "gp-dot is-reached")).toBe(3);
    expect(count(html, 'class="gp-dot"')).toBe(7);
    expect(html.replace(/<!-- -->/g, "")).toContain(">Question 3 of 10</span>");
  });

  it("is announced once, as a progress bar, not dot by dot or twice", () => {
    const html = renderToStaticMarkup(<GameProgress total={10} currentIndex={2}/>);
    expect(html).toMatch(/class="gp-qpill" aria-hidden="true"/);
    expect(html).toContain('role="progressbar"');
    expect(html).toContain('aria-valuenow="3"');
    expect(html).toContain('aria-valuemax="10"');
    expect(html).toContain('aria-valuetext="Question 3 of 10"');
    expect(count(html, "role=")).toBe(1);
  });

  it("never runs past the last question", () => {
    const html = renderToStaticMarkup(<GameProgress total={6} currentIndex={6}/>);
    expect(html).toContain('aria-valuetext="Question 6 of 6"');
    expect(count(html, "gp-dot is-reached")).toBe(6);
  });
});

describe("shared player header", () => {
  const chrome = {
    current: "play",
    nav: [{ id: "play", label: "Play", onClick() {} }, { id: "archive", label: "Archive", onClick() {} }, { id: "help", label: "How to Play", onClick() {} }],
    sound: { muted: false, setMuted() {} },
    account: { signedIn: false, label: "Sign in", title: "Sign in", onClick() {} },
    admin: null,
  };
  const render = (props) => renderToStaticMarkup(
    <PlayerChromeContext.Provider value={chrome}><PlayerHeader {...props}/></PlayerChromeContext.Provider>
  );

  it("is the one SiteHeader in the fixed frame, with the menu, centred logo, sound and account", () => {
    const html = render({});
    expect(html).toContain('<div class="ph-top"><header class="sh-bar">');
    expect(html).toContain('aria-label="Menu"');
    expect(html).toContain('class="sh-logo"');
    expect(html).toContain('aria-label="Turn sound off"');
    expect(html).toContain("sh-account");
    expect(count(html, "<header")).toBe(1);
  });

  it("is inert while loading, and compact in Admin Preview", () => {
    expect(render({ pending: true })).toContain('<div class="ph-pending" inert="">');
    expect(render({ compact: true })).toContain('<div class="ph-top ph-compact">');
  });
});

describe("advertisement slot", () => {
  afterEach(() => { try { globalThis.localStorage?.removeItem("wtf-dev-ad"); } catch { /* none */ } });

  it("takes no space at all when there is no ad", () => {
    expect(renderToStaticMarkup(<AdSlot/>)).toBe("");
  });

  it("holds an ad when one is supplied", () => {
    expect(renderToStaticMarkup(<AdSlot><span>ad</span></AdSlot>)).toBe('<aside class="ad-slot" aria-label="Advertisement"><span>ad</span></aside>');
  });
});

describe("category subtitles (supabase/category_subtitles.sql)", () => {
  const LEGACY_ROW = {
    id: "g-1", date: "2026-10-05", theme_title: "Led Zeppelin OR My Little Pony Song?",
    category_a: "Led Zeppelin", category_b: "My Little Pony", status: "published", questions: [],
  };

  it("loads existing puzzles with no subtitle, and saves them exactly as before", () => {
    const game = rowToGame(LEGACY_ROW);
    expect(game.categoryASubtitle).toBe("");
    expect(game.categoryBSubtitle).toBe("");
    expect(game.subtitleColumns).toBe(false);
    const row = gameToRow(game);
    expect("category_a_subtitle" in row).toBe(false);
    expect("category_b_subtitle" in row).toBe(false);
  });

  it("round-trips trimmed subtitles, and saves a cleared one as null once the columns exist", () => {
    const row = gameToRow({ ...rowToGame(LEGACY_ROW), categoryASubtitle: "  Song ", categoryBSubtitle: "Song" });
    expect(row.category_a_subtitle).toBe("Song");
    expect(row.category_b_subtitle).toBe("Song");
    const loaded = rowToGame({ ...LEGACY_ROW, category_a_subtitle: "Song", category_b_subtitle: null });
    expect(loaded.categoryASubtitle).toBe("Song");
    expect(loaded.subtitleColumns).toBe(true);
    const cleared = gameToRow({ ...loaded, categoryASubtitle: "" });
    expect(cleared.category_a_subtitle).toBeNull();
    expect(cleared.category_b_subtitle).toBeNull();
  });

  it("keeps the database's column flag when a stored draft is restored", () => {
    const loaded = rowToGame({ ...LEGACY_ROW, category_a_subtitle: null, category_b_subtitle: null });
    const reopened = restoreEditorDraft(loaded, { game: { ...loaded, categoryASubtitle: "Song", subtitleColumns: false } });
    expect(reopened.categoryASubtitle).toBe("Song");
    expect(reopened.subtitleColumns).toBe(true);
  });
});
