import { describe, expect, it } from "vitest";
import { SITE_ORIGIN, isPuzzleId, puzzleIdFromPath, puzzlePath, puzzleUrl } from "./puzzleLink.js";

describe("puzzle links", () => {
  it("are permanent addresses built from the puzzle's id", () => {
    expect(SITE_ORIGIN).toBe("https://whatthefudge.gg");
    expect(puzzlePath("g-1759600000000")).toBe("/puzzle/g-1759600000000");
    expect(puzzleUrl("g-1759600000000")).toBe("https://whatthefudge.gg/puzzle/g-1759600000000");
    expect(puzzleUrl("demo-today", "http://localhost:5173")).toBe("http://localhost:5173/puzzle/demo-today");
  });

  it("round-trip any usable id through the path", () => {
    for (const id of ["g-1759600000000", "demo-yesterday", "2026-10-07", "g-1&2=ü", "a.b~c_d"]) {
      expect(isPuzzleId(id)).toBe(true);
      expect(puzzleIdFromPath(puzzlePath(id))).toBe(id);
    }
  });

  it("read the id from /puzzle/<id>, one trailing slash allowed", () => {
    expect(puzzleIdFromPath("/puzzle/g-1")).toBe("g-1");
    expect(puzzleIdFromPath("/puzzle/g-1/")).toBe("g-1");
  });

  it("are null for every other page", () => {
    for (const path of ["/", "", "/admin", "/auth/callback", "/puzzle", "/puzzles/g-1", "/puzzle/g-1/extra", "/x/puzzle/g-1", undefined]) {
      expect(puzzleIdFromPath(path)).toBeNull();
    }
  });

  it("give \"\" for a puzzle link whose id can't be used", () => {
    expect(puzzleIdFromPath("/puzzle/")).toBe("");
    expect(puzzleIdFromPath("/puzzle/%E0%A4%A")).toBe(""); // malformed escape
    expect(puzzleIdFromPath("/puzzle/a%20b")).toBe(""); // whitespace
    expect(puzzleIdFromPath("/puzzle/a%2Fb")).toBe(""); // a slash
    expect(puzzleIdFromPath(`/puzzle/${"x".repeat(201)}`)).toBe("");
    for (const id of ["", " ", "a b", "a/b", "a?b", "a#b", null, 42]) expect(isPuzzleId(id)).toBe(false);
  });
});
