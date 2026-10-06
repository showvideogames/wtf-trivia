import { describe, expect, it } from "vitest";
import { buildPuzzleExport, exportFileName } from "./puzzleExport.js";

const PALETTE = [
  { id: "teal", name: "Spearmint", mid: "#2DD4BF" },
  { id: "pink", name: "Bubblegum", mid: "#FF5C8D" },
  { id: "deep-blue", name: "Deep Blue", mid: "#304D9B" },
];
const isYouTube = (url) => /youtu\.?be/.test(url);
const GAME = {
  id: "g-1700000000000",
  date: "2026-12-14",
  themeTitle: "Led Zeppelin OR My Little Pony Song?",
  status: "draft",
  tags: ["music", "toys"],
  headerImage: "https://example.com/poster.png",
  categoryA: "Led Zeppelin", categoryASubtitle: "Song", categoryAButtonName: "", categoryAShareName: "Led Zeppelin 🎸🤘", categoryAColor: "teal",
  categoryAImage: "https://example.com/a.png",
  categoryB: "My Little Pony", categoryBSubtitle: "", categoryBButtonName: "Pony", categoryBShareName: "", categoryBColor: "legacy-magenta",
  categoryBImage: "",
  questions: [
    { id: "q-1", itemText: "Kashmir", correctCategory: "A", flavorCopy: "Line one 🎸\nLine two, \"quoted\" — dash", explanationCopy: "A 1975 song.", imageUrl: "https://example.com/k.jpg", imageAlt: "Album cover", imageSource: "Via Wikimedia" },
    { id: "q-2", itemText: "", correctCategory: "B", flavorCopy: "", explanationCopy: "", imageUrl: "https://youtu.be/abc", imageAlt: "", imageSource: "", creditNote: "Old field" },
    { id: "q-3", itemText: "Smile", correctCategory: "B", imageUrl: "data:image/png;base64,AAAA" },
  ],
};
const now = new Date(2026, 9, 6, 9, 5);

describe("puzzle text export", () => {
  const out = buildPuzzleExport(GAME, { palette: PALETTE, isYouTube, unsaved: true, now });

  it("covers the puzzle, both categories and every question in order", () => {
    expect(out).toContain("Exported 2026-10-06 09:05");
    expect(out).toContain("including changes that are NOT saved yet");
    expect(out).toContain("  Puzzle ID: g-1700000000000");
    expect(out).toContain("  Title: Led Zeppelin OR My Little Pony Song?");
    expect(out).toContain("  Scheduled date: 2026-12-14");
    expect(out).toContain("  Status: Draft");
    expect(out).toContain("  Topics: Music 🎵, Toys 🧸");
    expect(out).toContain("  Home & Share artwork: https://example.com/poster.png");
    expect(out.indexOf("Question 1")).toBeLessThan(out.indexOf("Question 2"));
    expect(out.indexOf("Question 2")).toBeLessThan(out.indexOf("Question 3"));
  });

  it("shows stored names and the effective fallbacks players see", () => {
    expect(out).toContain("  Matchup subtitle (second banner line): Song");
    expect(out).toContain('  Answer button name: (blank), so the button shows "Led Zeppelin"');
    expect(out).toContain("  Answer button name: Pony");
    expect(out).toContain("  Share name: Led Zeppelin 🎸🤘");
    expect(out).toContain('  Share name: (blank), so the share text shows "My Little Pony"');
    expect(out).toContain("  Color: Spearmint (teal, #2DD4BF)");
    expect(out).toContain('"legacy-magenta" is stored but isn\'t in the palette; players see Bubblegum (pink, #FF5C8D)');
    expect(out).toContain("  Category image: (blank)");
  });

  it("keeps multiline text, punctuation and emoji, with commentary before info", () => {
    expect(out).toContain('  Needless Commentary:\n      Line one 🎸\n      Line two, "quoted" — dash\n  Actual Info: A 1975 song.');
    expect(out).toContain("  Correct category: A, Led Zeppelin");
    expect(out).toContain('  Correct category: B, My Little Pony (answer button: "Pony")');
  });

  it("describes media, labels blanks, and keeps unknown saved fields", () => {
    expect(out).toContain("  Reveal media: Image\n    Media URL: https://example.com/k.jpg\n    Alt text: Album cover\n    Media source: Via Wikimedia");
    expect(out).toContain("  Item text: (blank)");
    expect(out).toContain("  Reveal media: YouTube video\n    Media URL: https://youtu.be/abc\n    Media source: (blank)");
    expect(out).toContain("  Other fields:\n    creditNote: Old field");
    expect(out).toContain("not uploaded yet");
    expect(out).not.toContain("base64");
  });

  it("works for an empty new puzzle", () => {
    const blank = buildPuzzleExport({ id: "g-new", themeTitle: "", categoryA: "", categoryB: "", questions: [] }, { palette: PALETTE, now });
    expect(blank).toContain("  Title: (blank)");
    expect(blank).toContain("no questions yet");
    expect(blank).toContain("  Color: Spearmint (teal, #2DD4BF), the default (nothing stored)");
    expect(blank).toContain("which matches the last save");
  });

  it("names the file from the title and date, with a safe fallback", () => {
    expect(exportFileName(GAME)).toBe("led-zeppelin-or-my-little-pony-song-2026-12-14.txt");
    expect(exportFileName({ themeTitle: "Pokémon / Café 🎉" })).toBe("pokemon-cafe.txt");
    expect(exportFileName({ themeTitle: "🎉🎉", date: "" })).toBe("untitled-puzzle.txt");
  });
});
