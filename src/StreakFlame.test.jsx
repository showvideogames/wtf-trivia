// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { readFileSync } from "node:fs";
import { Buffer } from "node:buffer";
import { join } from "node:path";
import process from "node:process";
import { StreakFlame, STREAK_FLAME_GIF, STREAK_FLAME_STILL } from "./Home.jsx";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const pub = (name) => readFileSync(join(process.cwd(), "public", name));

describe("StreakFlame", () => {
  let host, root;
  beforeEach(() => { host = document.createElement("div"); document.body.appendChild(host); root = createRoot(host); });
  afterEach(() => { act(() => root.unmount()); host.remove(); });
  const mount = async () => { await act(async () => { root.render(<StreakFlame fallbackSrc="data:image/png;base64,FALLBACK"/>); }); };

  it("shows the animated GIF, with the still chosen for reduced motion", async () => {
    await mount();
    const img = host.querySelector("picture > img");
    expect(img.getAttribute("src")).toBe(STREAK_FLAME_GIF);
    expect(img.getAttribute("alt")).toBe("");
    const source = host.querySelector("picture > source");
    expect(source.getAttribute("media")).toBe("(prefers-reduced-motion: reduce)");
    expect(source.getAttribute("srcset")).toBe(STREAK_FLAME_STILL);
  });

  it("falls back to the built-in static flame when the image fails to load", async () => {
    await mount();
    await act(async () => { host.querySelector("img").dispatchEvent(new Event("error")); });
    expect(host.querySelector("picture")).toBeNull();
    expect(host.querySelector("img").getAttribute("src")).toBe("data:image/png;base64,FALLBACK");
  });
});

describe("flame assets", () => {
  it("the GIF is animated (several frames, looping)", () => {
    const gif = pub("streak-flame.gif");
    expect(gif.subarray(0, 6).toString()).toBe("GIF89a");
    let frames = 0;
    for (let i = 0; i < gif.length - 3; i++) if (gif[i] === 0x21 && gif[i + 1] === 0xF9 && gif[i + 2] === 4) frames++;
    expect(frames).toBeGreaterThan(1);
    expect(gif.includes(Buffer.from("NETSCAPE2.0"))).toBe(true);
  });

  it("the reduced-motion still is a real PNG the same size as the GIF", () => {
    const png = pub("streak-flame-still.png");
    expect([...png.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    const gif = pub("streak-flame.gif");
    expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([gif.readUInt16LE(6), gif.readUInt16LE(8)]);
  });
});
