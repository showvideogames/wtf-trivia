// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";

// The shared preloader, faked: each test says how the picture's load ends.
const loads = new Map(); // url -> {status, resolve}
vi.mock("./mediaPreloader.js", async (orig) => {
  const real = await orig();
  return {
    ...real,
    preloadImage: (url) => {
      if (!loads.has(url)) { let resolve; const p = new Promise((r) => { resolve = r; }); loads.set(url, { status: "pending", resolve, p }); }
      return loads.get(url).p;
    },
    getImageStatus: (url) => loads.get(url)?.status ?? "unknown",
  };
});
const { default: PictureClue, PICTURE_SLOW_MS } = await import("./PictureClue.jsx");

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const PIC = "https://store.example.com/wtf-images/questions/1-abc.webp";
const question = { itemText: "Mr. Met", questionImage: PIC, questionImageAlt: "Cartoon mascot with a baseball for a head" };

// A stand-in for the browser's Image, for Retry's fresh load.
let nextLoad = "loaded";
class FakeImage {
  set src(_) { setTimeout(() => (nextLoad === "loaded" ? this.onload?.() : this.onerror?.()), 0); }
}

let root = null, host = null, ready = [];
beforeEach(() => { loads.clear(); ready = []; nextLoad = "loaded"; vi.stubGlobal("Image", FakeImage); });
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = host = null;
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
function mount(q = question) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root.render(<PictureClue question={q} onReady={(up) => ready.push(up)}/>));
}
const settle = async (status) => {
  await act(async () => { const l = loads.get(PIC); l.status = status; l.resolve(status); await l.p; });
};
const retryButton = () => [...host.querySelectorAll("button")].find((b) => b.textContent === "Retry");
const noName = () => expect(host.innerHTML).not.toMatch(/Mr. Met/);

describe("PictureClue", () => {
  it("holds the frame while loading, then shows the whole picture with a neutral description and no name", async () => {
    mount();
    const frame = host.querySelector("figure.gp-pic");
    expect(frame.className).toContain("is-pending");
    expect(host.querySelector(".gp-pic-loading")).not.toBeNull();
    expect(ready.at(-1)).toBe(false);
    noName();
    await settle("loaded");
    expect(host.querySelector("figure.gp-pic")).toBe(frame); // same frame, nothing replaced around it
    const img = host.querySelector("img.gp-pic-img");
    expect(img.getAttribute("alt")).toBe(question.questionImageAlt);
    expect(img.hasAttribute("title")).toBe(false);
    expect(host.querySelector("figcaption")).toBeNull();
    expect(ready.at(-1)).toBe(true);
    noName();
  });

  it("uses a neutral description when the question has none", async () => {
    mount({ ...question, questionImageAlt: "" });
    await settle("loaded");
    expect(host.querySelector("img").getAttribute("alt")).toBe("Picture clue");
  });

  it("a failed picture says so with Retry, never the name, and keeps answering off", async () => {
    mount();
    await settle("error");
    const frame = host.querySelector("figure.gp-pic");
    expect(frame.className).toContain("is-error");
    expect(host.querySelector(".gp-pic-note").textContent).toBe("The picture didn’t load.");
    expect(retryButton()).toBeTruthy();
    expect(ready.at(-1)).toBe(false);
    noName();
  });

  it("Retry loads the picture afresh and only then opens answering", async () => {
    mount();
    await settle("error");
    nextLoad = "error";
    await act(async () => { retryButton().click(); });
    expect(host.querySelector("figure.gp-pic").className).toContain("is-pending");
    expect(ready.at(-1)).toBe(false);
    await act(async () => { await new Promise((r) => setTimeout(r, 5)); });
    expect(host.querySelector("figure.gp-pic").className).toContain("is-error"); // failed again: still waiting
    expect(ready.at(-1)).toBe(false);
    nextLoad = "loaded";
    await act(async () => { retryButton().click(); });
    await act(async () => { await new Promise((r) => setTimeout(r, 5)); });
    expect(host.querySelector("img.gp-pic-img")).not.toBeNull();
    expect(retryButton()).toBeUndefined();
    expect(ready.at(-1)).toBe(true);
    noName();
  });

  it("a picture that fails while showing goes back to waiting, with Retry", async () => {
    mount();
    await settle("loaded");
    await act(async () => { host.querySelector("img.gp-pic-img").dispatchEvent(new Event("error")); });
    expect(host.querySelector("figure.gp-pic").className).toContain("is-error");
    expect(ready.at(-1)).toBe(false);
  });

  it("says when a picture is taking long, offers Retry, and still never shows the name", async () => {
    vi.useFakeTimers();
    mount();
    expect(retryButton()).toBeUndefined();
    await act(async () => { vi.advanceTimersByTime(PICTURE_SLOW_MS + 10); });
    expect(host.querySelector("figure.gp-pic").className).toContain("is-slow");
    expect(host.querySelector(".gp-pic-note").textContent).toBe("The picture is still loading.");
    expect(retryButton()).toBeTruthy();
    expect(ready.at(-1)).toBe(false);
    noName();
  });

  it("a question with no picture never opens answering and never shows the name", () => {
    mount({ ...question, questionImage: "" });
    expect(host.querySelector(".gp-pic-note").textContent).toBe("This question has no picture yet.");
    expect(retryButton()).toBeUndefined();
    expect(ready.at(-1)).toBe(false);
    noName();
  });
});
