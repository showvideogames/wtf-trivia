import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

/* A minimal, controllable stand-in for the DOM Image constructor. Each
   instance is recorded so a test can find it and manually fire onload /
   onerror -- this lets the tests assert exactly how many real "requests"
   (Image constructions) happened, without needing a real browser or a real
   network. */
class FakeImage {
  constructor() {
    this.decoding = null;
    this._src = null;
    FakeImage.instances.push(this);
  }
  set src(value) {
    this._src = value;
  }
  get src() {
    return this._src;
  }
}
FakeImage.instances = [];

function resolveLoaded(url) {
  const img = FakeImage.instances.find((i) => i.src === url);
  img.onload();
}
function resolveError(url) {
  const img = FakeImage.instances.find((i) => i.src === url);
  img.onerror();
}
function requestCountFor(url) {
  return FakeImage.instances.filter((i) => i.src === url).length;
}

beforeEach(async () => {
  vi.stubGlobal("Image", FakeImage);
  FakeImage.instances = [];
  vi.resetModules(); // fresh module-level cache/queue for every test
});

describe("mediaPreloader: deduplication", () => {
  it("only ever constructs one Image for the same URL, even with concurrent callers", async () => {
    const { preloadImage } = await import("./mediaPreloader.js");
    const url = "https://example.com/a.jpg";
    const p1 = preloadImage(url);
    const p2 = preloadImage(url);
    expect(requestCountFor(url)).toBe(1);
    resolveLoaded(url);
    expect(await p1).toBe("loaded");
    expect(await p2).toBe("loaded");
    // A third, later call must also reuse the cache, not fetch again.
    expect(requestCountFor(url)).toBe(1);
    expect(await preloadImage(url)).toBe("loaded");
    expect(requestCountFor(url)).toBe(1);
  });

  it("does not re-request a URL that appears more than once in the same puzzle", async () => {
    const { primeActiveWindow } = await import("./mediaPreloader.js");
    const shared = "https://example.com/shared.jpg";
    const urls = [shared, null, shared]; // e.g. question 1 and question 3 reuse the same art
    const windowUrls = primeActiveWindow(urls, 0, "puzzle-dedup");
    expect(windowUrls).toEqual([shared]); // deduplicated within the window itself
    expect(requestCountFor(shared)).toBe(1);
  });
});

describe("mediaPreloader: failure resolution", () => {
  it("resolves a failed image to 'error' and never retries it in the same session", async () => {
    const { preloadImage, getImageStatus } = await import("./mediaPreloader.js");
    const url = "https://example.com/broken.jpg";
    const p = preloadImage(url);
    resolveError(url);
    expect(await p).toBe("error");
    expect(getImageStatus(url)).toBe("error");
    // Calling again must reuse the failed result, not issue a second request.
    expect(await preloadImage(url)).toBe("error");
    expect(requestCountFor(url)).toBe(1);
  });

  it("treats a decode() rejection as loaded, since the image itself already loaded", async () => {
    class DecodingImage extends FakeImage {
      decode() {
        return Promise.reject(new Error("decode not supported here"));
      }
    }
    vi.stubGlobal("Image", DecodingImage);
    const { preloadImage } = await import("./mediaPreloader.js");
    const url = "https://example.com/decode-fails.jpg";
    const p = preloadImage(url);
    const img = DecodingImage.instances.at(-1);
    img.onload();
    expect(await p).toBe("loaded");
  });
});

describe("mediaPreloader: active-window selection", () => {
  it("primes exactly the current question plus the next two, nothing further", async () => {
    const { primeActiveWindow } = await import("./mediaPreloader.js");
    const urls = ["q0", "q1", "q2", "q3", "q4", "q5"];
    const windowUrls = primeActiveWindow(urls, 2, "puzzle-window");
    expect(windowUrls).toEqual(["q2", "q3", "q4"]);
    expect(requestCountFor("q0")).toBe(0);
    expect(requestCountFor("q1")).toBe(0);
    expect(requestCountFor("q2")).toBe(1);
    expect(requestCountFor("q3")).toBe(1);
    expect(requestCountFor("q4")).toBe(1);
    expect(requestCountFor("q5")).toBe(0);
  });

  it("skips null slots (no-media or video questions) without gaps in the window", async () => {
    const { primeActiveWindow } = await import("./mediaPreloader.js");
    const urls = ["q0", null, "q2", null, "q4"];
    const windowUrls = primeActiveWindow(urls, 0, "puzzle-nulls");
    expect(windowUrls).toEqual(["q0", "q2"]); // the null at index 1 is simply absent, not a gap
  });

  it("does not request beyond the end of the puzzle", async () => {
    const { primeActiveWindow } = await import("./mediaPreloader.js");
    const urls = ["q0", "q1", "q2"];
    const windowUrls = primeActiveWindow(urls, 2, "puzzle-end"); // last question
    expect(windowUrls).toEqual(["q2"]);
  });

  it("sliding forward only requests the newly-eligible image, leaving the rest cached", async () => {
    const { primeActiveWindow } = await import("./mediaPreloader.js");
    const urls = ["q0", "q1", "q2", "q3", "q4"];
    primeActiveWindow(urls, 0, "puzzle-slide"); // window: q0, q1, q2
    expect(requestCountFor("q0")).toBe(1);
    expect(requestCountFor("q1")).toBe(1);
    expect(requestCountFor("q2")).toBe(1);
    expect(requestCountFor("q3")).toBe(0);

    primeActiveWindow(urls, 1, "puzzle-slide"); // window slides to: q1, q2, q3
    expect(requestCountFor("q3")).toBe(1); // newly eligible
    expect(requestCountFor("q0")).toBe(1); // still cached, not re-requested
    expect(requestCountFor("q1")).toBe(1); // still cached, not re-requested
    expect(requestCountFor("q4")).toBe(0); // not yet eligible

    primeActiveWindow(urls, 2, "puzzle-slide"); // window slides to: q2, q3, q4
    expect(requestCountFor("q4")).toBe(1); // newly eligible
    expect(requestCountFor("q0")).toBe(1);
    expect(requestCountFor("q1")).toBe(1);
    expect(requestCountFor("q2")).toBe(1);
    expect(requestCountFor("q3")).toBe(1);
  });

  it("an abandoned early game never requests images outside the window it ever reached", async () => {
    const { primeActiveWindow } = await import("./mediaPreloader.js");
    const urls = Array.from({ length: 13 }, (_, i) => `q${i}`);
    primeActiveWindow(urls, 0, "puzzle-abandon"); // player quits after seeing only question 1
    for (let i = 3; i < 13; i++) {
      expect(requestCountFor(`q${i}`)).toBe(0);
    }
    expect(requestCountFor("q0")).toBe(1);
    expect(requestCountFor("q1")).toBe(1);
    expect(requestCountFor("q2")).toBe(1);
  });
});

describe("mediaPreloader: missing and invalid URLs", () => {
  it("treats missing, null, blank and malformed values as no usable image", async () => {
    const { usableMediaUrl } = await import("./mediaPreloader.js");
    for (const bad of [undefined, null, "", "   ", "null", "undefined", 42, {}, [], "javascript:alert(1)", "data:text/html,hi", String.raw`C:\art\cat.png`, "mailto:a@b.c"]) {
      expect(usableMediaUrl(bad)).toBe(null);
    }
    expect(usableMediaUrl(" https://example.com/a.webp ")).toBe("https://example.com/a.webp");
    expect(usableMediaUrl("/mystery-question.webp")).toBe("/mystery-question.webp");
    expect(usableMediaUrl("//cdn.example.com/a.png")).toBe("//cdn.example.com/a.png");
    expect(usableMediaUrl("blob:http://localhost:5173/abc")).toBe("blob:http://localhost:5173/abc");
    expect(usableMediaUrl("data:image/png;base64,iVBOR")).toBe("data:image/png;base64,iVBOR");
    expect(usableMediaUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
    // Legacy formats already referenced by existing puzzles keep rendering.
    expect(usableMediaUrl("https://x.supabase.co/storage/v1/object/public/wtf-images/questions/1.gif")).toBe("https://x.supabase.co/storage/v1/object/public/wtf-images/questions/1.gif");
    expect(usableMediaUrl("https://example.com/art.svg")).toBe("https://example.com/art.svg");
    expect(usableMediaUrl("data:image/svg+xml;charset=utf-8,%3Csvg%3E")).toBe("data:image/svg+xml;charset=utf-8,%3Csvg%3E");
    expect(usableMediaUrl("data:image/gif;base64,R0lGOD")).toBe("data:image/gif;base64,R0lGOD");
  });

  it("never requests anything for missing or invalid values", async () => {
    const { preloadImage, getImageStatus } = await import("./mediaPreloader.js");
    for (const bad of [undefined, null, "", "  ", "javascript:void(0)", 7]) {
      expect(await preloadImage(bad)).toBe("none");
      expect(getImageStatus(bad)).toBe("none");
    }
    expect(FakeImage.instances.length).toBe(0);
  });

  it("skips missing and invalid entries in the active window and survives a non-array", async () => {
    const { primeActiveWindow } = await import("./mediaPreloader.js");
    const urls = [undefined, "", "https://example.com/c.jpg", null];
    expect(primeActiveWindow(urls, 0, "puzzle-missing")).toEqual(["https://example.com/c.jpg"]);
    expect(FakeImage.instances.length).toBe(1);
    expect(primeActiveWindow(undefined, 0, "puzzle-none")).toEqual([]);
  });
});

describe("mediaPreloader: bounded decode wait", () => {
  // An Image whose decode() the test controls: "resolve", "reject" or "hang".
  function imageWithDecode(mode) {
    return class extends FakeImage {
      decode() {
        this.decodeCalls = (this.decodeCalls || 0) + 1;
        if (mode === "resolve") return Promise.resolve();
        if (mode === "reject") return Promise.reject(new Error("EncodingError"));
        return new Promise(() => {}); // never settles
      }
    };
  }
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("1. decode resolves normally: loaded, and the timeout is cleared", async () => {
    vi.stubGlobal("Image", imageWithDecode("resolve"));
    const { preloadImage, getImageStatus } = await import("./mediaPreloader.js");
    const url = "https://example.com/ok.webp";
    const p = preloadImage(url);
    FakeImage.instances.at(-1).onload();
    expect(await p).toBe("loaded");
    expect(getImageStatus(url)).toBe("loaded");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("2. decode rejects: still loaded, and the timeout is cleared", async () => {
    vi.stubGlobal("Image", imageWithDecode("reject"));
    const { preloadImage } = await import("./mediaPreloader.js");
    const p = preloadImage("https://example.com/decode-rejects.webp");
    FakeImage.instances.at(-1).onload();
    expect(await p).toBe("loaded");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("3. decode never settles after a successful load: loaded after ~3 s, never 'error'", async () => {
    vi.stubGlobal("Image", imageWithDecode("hang"));
    const { preloadImage, getImageStatus, DECODE_TIMEOUT_MS } = await import("./mediaPreloader.js");
    expect(DECODE_TIMEOUT_MS).toBe(3000);
    const url = "https://example.com/big-animated.gif";
    const p = preloadImage(url);
    const img = FakeImage.instances.at(-1);
    img.onload();
    expect(img.decodeCalls).toBe(1);
    await vi.advanceTimersByTimeAsync(DECODE_TIMEOUT_MS - 1);
    expect(getImageStatus(url)).toBe("pending");
    // A second caller while decode is still hanging reuses the same request.
    const again = preloadImage(url);
    expect(requestCountFor(url)).toBe(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(await p).toBe("loaded");
    expect(await again).toBe("loaded");
    expect(getImageStatus(url)).toBe("loaded");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("4. a genuine load failure is 'error' at once and starts no decode timer", async () => {
    vi.stubGlobal("Image", imageWithDecode("hang"));
    const { preloadImage, getImageStatus } = await import("./mediaPreloader.js");
    const url = "https://example.com/404.webp";
    const p = preloadImage(url);
    const img = FakeImage.instances.at(-1);
    img.onerror();
    expect(await p).toBe("error");
    expect(getImageStatus(url)).toBe("error");
    expect(img.decodeCalls).toBeUndefined();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("5. a missing or blank URL makes no request and starts no timer", async () => {
    vi.stubGlobal("Image", imageWithDecode("hang"));
    const { preloadImage, getImageStatus } = await import("./mediaPreloader.js");
    for (const url of [undefined, null, "", "   "]) {
      expect(await preloadImage(url)).toBe("none");
      expect(getImageStatus(url)).toBe("none");
    }
    expect(FakeImage.instances.length).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("keeps the active window at current + next two while decodes hang", async () => {
    vi.stubGlobal("Image", imageWithDecode("hang"));
    const { primeActiveWindow } = await import("./mediaPreloader.js");
    const urls = ["h0", "h1", "h2", "h3", "h4"];
    expect(primeActiveWindow(urls, 0, "puzzle-hang")).toEqual(["h0", "h1", "h2"]);
    FakeImage.instances.forEach((img) => img.onload());
    await vi.advanceTimersByTimeAsync(3000);
    expect(primeActiveWindow(urls, 1, "puzzle-hang")).toEqual(["h1", "h2", "h3"]);
    for (const u of ["h0", "h1", "h2", "h3"]) expect(requestCountFor(u)).toBe(1);
    expect(requestCountFor("h4")).toBe(0);
  });
});
