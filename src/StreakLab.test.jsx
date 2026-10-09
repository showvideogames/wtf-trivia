// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, useContext } from "react";
import { createRoot } from "react-dom/client";
import { StreakOverrideContext, LAB_QUICK_VALUES, LAB_MAX_STREAK, parseLabStreak } from "./streakOverride.js";

// The app is replaced by a probe that shows the streak the lab hands it, so
// these cases are about the lab itself: its controls, its address, what it
// leaves alone and that it keeps itself out of search.
vi.mock("./App.jsx", () => ({
  default: function Probe() {
    const n = useContext(StreakOverrideContext);
    return <p id="probe">{String(n)}</p>;
  },
}));
const { default: StreakLab } = await import("./StreakLab.jsx");

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe("parseLabStreak", () => {
  it("takes whole numbers from 0 and nothing else", () => {
    expect(parseLabStreak("0")).toBe(0);
    expect(parseLabStreak(" 237 ")).toBe(237);
    expect(parseLabStreak("1000")).toBe(1000);
    for (const bad of ["", "-1", "1.5", "abc", "1e3", null, undefined]) expect(parseLabStreak(bad)).toBeNull();
  });
  it("holds huge values at the maximum", () => {
    expect(parseLabStreak("99999999999")).toBe(LAB_MAX_STREAK);
  });
});

describe("StreakLab", () => {
  let host, root;
  const mount = async () => { await act(async () => { root.render(<StreakLab/>); }); };
  const probe = () => host.querySelector("#probe").textContent;
  const setInput = async (value) => {
    const input = host.querySelector("input");
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
    await act(async () => { setter.call(input, value); input.dispatchEvent(new Event("input", { bubbles: true })); });
  };
  const quick = (n) => [...host.querySelectorAll(".sl-quick button")].find((b) => b.textContent === String(n));

  beforeEach(() => {
    localStorage.clear();
    window.history.replaceState(null, "", "/streak-lab");
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });
  afterEach(() => { act(() => root.unmount()); host.remove(); });

  it("is labeled QA only, and opens at 100 without a parameter", async () => {
    await mount();
    expect(host.textContent).toContain("STREAK LAB — QA ONLY");
    expect(probe()).toBe("100");
  });

  it("opens at the streak in the address", async () => {
    window.history.replaceState(null, "", "/streak-lab?streak=237");
    await mount();
    expect(probe()).toBe("237");
    expect(host.querySelector("input").value).toBe("237");
  });

  it("offers every quick value, and each one updates the preview and the address", async () => {
    await mount();
    expect(host.querySelectorAll(".sl-quick button")).toHaveLength(LAB_QUICK_VALUES.length);
    for (const n of LAB_QUICK_VALUES) {
      await act(async () => { quick(n).click(); });
      expect(probe()).toBe(String(n));
      expect(host.querySelector("input").value).toBe(String(n));
      expect(window.location.search).toBe(`?streak=${n}`);
    }
  });

  it("typing updates the preview and the address, ignoring text that isn't a number", async () => {
    await mount();
    await setInput("301");
    expect(probe()).toBe("301");
    expect(window.location.search).toBe("?streak=301");
    await setInput("");
    expect(probe()).toBe("301");
    expect(window.location.pathname).toBe("/streak-lab");
  });

  it("changes nothing in the browser's storage", async () => {
    const set = vi.spyOn(Storage.prototype, "setItem");
    await mount();
    await act(async () => { quick(101).click(); });
    await setInput("1000");
    expect(set).not.toHaveBeenCalled();
    expect(localStorage.length).toBe(0);
    set.mockRestore();
  });

  it("locks the app below it so it can't be played", async () => {
    await mount();
    expect(host.querySelector("#probe").closest("[inert]")).not.toBeNull();
  });

  it("keeps itself out of search engines while mounted", async () => {
    await mount();
    expect(document.head.querySelector('meta[name="robots"]').content).toContain("noindex");
    act(() => root.unmount());
    expect(document.head.querySelector('meta[name="robots"]')).toBeNull();
    root = createRoot(host);
  });
});
