import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import handler, { clearShellCache, loadPreviewGame } from "../api/puzzle.js";

// api/puzzle.js, the server side of /puzzle/<id> (vercel.json rewrites the
// link to /api/puzzle?id=<id>), with the network faked: the deployment's own
// index.html and the Supabase REST read.

const SHELL = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const ENV = { VITE_SUPABASE_URL: "https://db.test", VITE_SUPABASE_ANON_KEY: "anon-key" };
const ROW = {
  id: "g-cage", date: "2020-01-01", status: "published", theme_title: "Board Game or Nicolas Cage Movie?",
  category_a: "Board Games", category_b: "Nicolas Cage Movies",
  category_a_share_name: "Board Game 🎲", category_b_share_name: "",
  header_image: "https://cdn.test/square.webp", wide_image: "https://cdn.test/wide.webp",
};

const response = (status, body, type = "application/json") => new Response(
  typeof body === "string" ? body : JSON.stringify(body), { status, headers: { "content-type": type } },
);

// rows: what the games read returns (an array, an Error to throw, or a
// status number); shell: the index.html response.
function fakeNetwork({ rows = [ROW], shell = response(200, SHELL, "text/html") } = {}) {
  return vi.fn(async (url) => {
    if (String(url).includes("/index.html")) {
      if (shell instanceof Error) throw shell;
      return shell.clone();
    }
    if (rows instanceof Error) throw rows;
    if (typeof rows === "number") return response(rows, { message: "nope" });
    return response(200, rows);
  });
}

function fakeRes() {
  return {
    statusCode: 0, headers: {}, body: null,
    setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
    end(body = "") { this.body = body; },
  };
}
const req = (id, headers = {}) => ({
  url: `/api/puzzle?id=${encodeURIComponent(id)}`,
  query: { id },
  headers: { host: "whatthefudge.gg", ...headers },
});

async function open(id, network = fakeNetwork(), headers) {
  const res = fakeRes();
  await handler(req(id, headers), res, { fetchImpl: network, env: ENV });
  return { res, network };
}

beforeEach(() => clearShellCache());

describe("a released puzzle's link", () => {
  it("serves the app's page with that puzzle's title, description and absolute image", async () => {
    const { res } = await open("g-cage");
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toBe("text/html; charset=utf-8");
    expect(res.headers["x-puzzle-preview"]).toBe("puzzle");
    expect(res.headers["cache-control"]).toContain("s-maxage=300");
    expect(res.body).toContain("<title>Board Game or Nicolas Cage Movie? · What The Fudge Trivia</title>");
    expect(res.body).toContain('<meta property="og:title" content="Board Game or Nicolas Cage Movie?" />');
    expect(res.body).toContain('<meta property="og:description" content="Board Game 🎲 or Nicolas Cage Movies? Every clue belongs to one of them. Play the puzzle and compare scores." />');
    expect(res.body).toContain('<meta property="og:image" content="https://cdn.test/wide.webp" />');
    // Its canonical address is the quiz's public link (quizSlug.js).
    expect(res.body).toContain('<meta property="og:url" content="https://whatthefudge.gg/quiz/board-game-or-nicolas-cage-movie" />');
    expect(res.body).toContain('<link rel="canonical" href="https://whatthefudge.gg/quiz/board-game-or-nicolas-cage-movie" />');
    // Still the app: the same root and script, so players get the game.
    expect(res.body).toContain('<div id="root"></div>');
    expect(res.body).toContain('src="/src/main.jsx"');
  });

  it("falls back to the square poster, then the site's image", async () => {
    let { res } = await open("g-cage", fakeNetwork({ rows: [{ ...ROW, wide_image: null }] }));
    expect(res.body).toContain('<meta property="og:image" content="https://cdn.test/square.webp" />');
    clearShellCache();
    ({ res } = await open("g-cage", fakeNetwork({ rows: [{ ...ROW, wide_image: null, header_image: "" }] })));
    expect(res.body).toContain('<meta property="og:image" content="https://whatthefudge.gg/icon-512.png" />');
  });

  it("reads only the preview columns with the public key, never the questions", async () => {
    const { network } = await open("g-cage");
    const [url, init] = network.mock.calls.find(([u]) => String(u).startsWith("https://db.test"));
    expect(url).toBe("https://db.test/rest/v1/games?id=eq.g-cage&select=id,date,status,theme_title,category_a,category_b,category_a_share_name,category_b_share_name,header_image,wide_image&limit=1");
    expect(url).not.toContain("questions");
    expect(init.headers.apikey).toBe("anon-key");
    expect(init.method ?? "GET").toBe("GET");
  });

  it("reads the basics again on a database without the later columns", async () => {
    let calls = 0;
    const network = vi.fn(async (url) => {
      if (String(url).includes("/index.html")) return response(200, SHELL, "text/html");
      calls += 1;
      return calls === 1 ? response(400, { message: "column games.wide_image does not exist" }) : response(200, [{ ...ROW, wide_image: undefined }]);
    });
    const { res } = await open("g-cage", network);
    expect(calls).toBe(3); // the preview, its basics, then the quiz slugs
    expect(network.mock.calls[2][0]).toContain("select=id,date,status,theme_title,category_a,category_b,header_image&");
    expect(res.headers["x-puzzle-preview"]).toBe("puzzle");
  });
});

describe("links that must not reveal a puzzle", () => {
  const cases = [
    ["a draft", [{ ...ROW, status: "draft", theme_title: "SECRET DRAFT" }]],
    ["a retired puzzle", [{ ...ROW, status: "retired", theme_title: "SECRET RETIRED" }]],
    ["a puzzle scheduled later", [{ ...ROW, date: "2999-01-01", theme_title: "SECRET FUTURE" }]],
    ["an unknown id", []],
    ["a failed read", 500],
    ["a network error", new Error("offline")],
  ];
  it.each(cases)("%s gets the site's own preview, unchanged", async (_, rows) => {
    const { res } = await open("g-secret", fakeNetwork({ rows }));
    expect(res.statusCode).toBe(200);
    expect(res.headers["x-puzzle-preview"]).toBe("site");
    expect(res.body).toBe(SHELL);
    expect(res.body).not.toContain("SECRET");
    expect(res.headers["cache-control"]).not.toContain("s-maxage=300");
  });

  it("never looks up an id that can't be used", async () => {
    const { res, network } = await open("a/b");
    expect(res.body).toBe(SHELL);
    expect(network.mock.calls.some(([u]) => String(u).startsWith("https://db.test"))).toBe(false);
  });
});

describe("the page itself", () => {
  it("is fetched from the same host once, passing the visitor's cookie for protected previews", async () => {
    const network = fakeNetwork();
    await open("g-cage", network, { host: "wtf-trivia-abc.vercel.app", cookie: "_vercel_jwt=abc" });
    const [url, init] = network.mock.calls[0];
    expect(url).toBe("https://wtf-trivia-abc.vercel.app/index.html");
    expect(init.headers.cookie).toBe("_vercel_jwt=abc");
    await open("g-cage", network);
    expect(network.mock.calls.filter(([u]) => String(u).includes("/index.html"))).toHaveLength(1);
  });

  it("hands over to the app at /?puzzle=<id> when the page can't be fetched", async () => {
    for (const shell of [new Error("offline"), response(401, "Authentication Required", "text/html"), response(200, "<html>not the app</html>", "text/html")]) {
      clearShellCache();
      const { res } = await open("g-cage", fakeNetwork({ shell }));
      expect(res.statusCode).toBe(302);
      expect(res.headers.location).toBe("/?puzzle=g-cage");
      expect(res.headers["cache-control"]).toBe("no-store");
    }
  });

  it("refuses an unexpected Host header rather than fetching it", async () => {
    const { res, network } = await open("g-cage", fakeNetwork(), { host: "evil.test/x?" });
    expect(res.statusCode).toBe(302);
    expect(network).not.toHaveBeenCalled();
  });
});

describe("loadPreviewGame", () => {
  it("needs the Supabase settings", async () => {
    await expect(loadPreviewGame("g-cage", { fetchImpl: fakeNetwork(), env: {} })).rejects.toThrow(/not configured/);
  });

  it("accepts the publishable key name too", async () => {
    const network = fakeNetwork();
    await loadPreviewGame("g-cage", { fetchImpl: network, env: { VITE_SUPABASE_URL: "https://db.test/", VITE_SUPABASE_PUBLISHABLE_KEY: "pk" } });
    expect(network.mock.calls[0][0]).toMatch(/^https:\/\/db\.test\/rest\/v1\/games\?/);
    expect(network.mock.calls[0][1].headers.apikey).toBe("pk");
  });
});

// /quiz/<slug>: vercel.json rewrites it to /api/puzzle?slug=<slug>.
describe("a public quiz link", () => {
  const OTHER = { ...ROW, id: "g-other", date: "2020-01-02", theme_title: "Muppet or Rapper?" };
  const DRAFT = { ...ROW, id: "g-draft", date: "", status: "draft", theme_title: "Secret Draft Title" };
  // Every games read answers from `rows`: the slug list (all of them) and
  // the preview (the one asked for by id=eq.<id>).
  function quizNetwork(rows, { slugColumn = true } = {}) {
    return vi.fn(async (url) => {
      const u = String(url);
      if (u.includes("/index.html")) return response(200, SHELL, "text/html");
      if (!slugColumn && u.includes("slug")) return response(400, { message: "column games.slug does not exist" });
      const id = /id=eq\.([^&]+)/.exec(u)?.[1];
      const found = id ? rows.filter((r) => r.id === decodeURIComponent(id)) : rows;
      return response(200, found.map(({ slug, ...r }) => (slugColumn ? { ...r, slug: slug ?? null } : r)));
    });
  }
  async function openQuiz(slug, network) {
    const res = fakeRes();
    await handler({ url: `/api/puzzle?slug=${slug}`, query: { slug }, headers: { host: "whatthefudge.gg" } }, res, { fetchImpl: network, env: ENV });
    return res;
  }

  it("serves that quiz's preview, with the quiz URL as its canonical address", async () => {
    const res = await openQuiz("muppet-or-rapper", quizNetwork([ROW, OTHER]));
    expect(res.headers["x-puzzle-preview"]).toBe("puzzle");
    expect(res.body).toContain("<title>Muppet or Rapper? · What The Fudge Trivia</title>");
    expect(res.body).toContain('<link rel="canonical" href="https://whatthefudge.gg/quiz/muppet-or-rapper" />');
    expect(res.body).toContain('<meta property="og:image" content="https://cdn.test/wide.webp" />');
  });

  it("finds a quiz by its stored slug, not by what its title says now", async () => {
    const network = quizNetwork([{ ...OTHER, slug: "the-original-name" }]);
    expect((await openQuiz("the-original-name", network)).body).toContain("Muppet or Rapper?");
    expect((await openQuiz("muppet-or-rapper", network)).headers["x-puzzle-preview"]).toBe("site");
  });

  it("works on a database without the slug column yet (slugs derived from titles)", async () => {
    const res = await openQuiz("board-game-or-nicolas-cage-movie", quizNetwork([ROW], { slugColumn: false }));
    expect(res.headers["x-puzzle-preview"]).toBe("puzzle");
    expect(res.body).toContain('<link rel="canonical" href="https://whatthefudge.gg/quiz/board-game-or-nicolas-cage-movie" />');
  });

  it("an unknown or unusable slug, or a draft's, gets the site's own preview", async () => {
    for (const slug of ["no-such-quiz", "Not_Valid!", "secret-draft-title"]) {
      const res = await openQuiz(slug, quizNetwork([ROW, DRAFT]));
      expect(res.statusCode).toBe(200);
      expect(res.headers["x-puzzle-preview"]).toBe("site");
      expect(res.body).toBe(SHELL);
      expect(res.body).not.toContain("Secret Draft");
    }
  });

  it("hands over to the app at /?quiz=<slug> when the page can't be fetched", async () => {
    clearShellCache();
    const res = fakeRes();
    await handler({ url: "/api/puzzle?slug=cats", query: { slug: "cats" }, headers: { host: "whatthefudge.gg" } }, res,
      { fetchImpl: fakeNetwork({ shell: new Error("offline") }), env: ENV });
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe("/?quiz=cats");
  });

  it("vercel.json sends /quiz/<slug> here", () => {
    const { rewrites } = JSON.parse(readFileSync(new URL("../vercel.json", import.meta.url), "utf8"));
    expect(rewrites).toContainEqual({ source: "/quiz/:slug", destination: "/api/puzzle?slug=:slug" });
    expect(rewrites).toContainEqual({ source: "/quiz/:slug/", destination: "/api/puzzle?slug=:slug" });
    expect(rewrites).toContainEqual({ source: "/puzzle/:id", destination: "/api/puzzle?id=:id" });
  });
});
