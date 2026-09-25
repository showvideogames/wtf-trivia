import { describe, it, expect, beforeEach, vi } from "vitest";

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
