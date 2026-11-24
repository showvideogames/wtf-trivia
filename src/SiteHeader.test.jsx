// @vitest-environment jsdom
import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import SiteHeader from "./SiteHeader.jsx";

let host, root;
const nav = [["play", "Play", "/"], ["archive", "Archive", "/archive"], ["stats", "Stats", "/stats"], ["help", "How To Play", "/how-to-play"]]
  .map(([id, label, href]) => ({ id, label, href, onClick: vi.fn() }));
const openAccount = vi.fn();
const openAdmin = vi.fn();
function Header({ signedIn = true, admin = true }) {
  const [muted, setMuted] = useState(false);
  return <SiteHeader nav={nav.map((item) => item.id === "help" ? {...item, label: "How to Play"} : item)} current="archive" sound={{ muted, setMuted }}
    account={{ signedIn, label: "person@example.com", title: "person@example.com", onClick: openAccount }}
    admin={admin ? { onClick: openAdmin } : null}/>;
}
const btn = (label) => host.querySelector(`button[aria-label="${label}"]`);
const click = async (node) => act(() => node.click());

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  vi.clearAllMocks();
});
afterEach(async () => {
  await act(() => root.unmount());
  host.remove();
});

describe("centered player header", () => {
  it("has one menu then the four genuine destination links, logo, and sound/settings/account in order", async () => {
    await act(() => root.render(<Header/>));
    expect([...host.querySelector(".sh-bar").children].map((node) => node.className)).toEqual(["sh-left","sh-logo","sh-tools"]);
    expect(host.querySelector(".sh-left").firstElementChild.contains(btn("Menu"))).toBe(true);
    expect([...host.querySelectorAll(".sh-nav a")].map((a) => [a.textContent, a.getAttribute("href")]))
      .toEqual(nav.map(({ label, href }) => [label, href]));
    expect(host.querySelector(".sh-nav [aria-current=page]").textContent).toBe("Archive");
    expect([...host.querySelectorAll(".sh-tools button")].map((node) => node.getAttribute("aria-label")))
      .toEqual(["Turn sound off", "Settings", "Account"]);
    expect(host.innerHTML).not.toContain("example.com");
    expect(btn("Account").classList.contains("is-signed-in")).toBe(true);
    await click(btn("Account"));
    expect(openAccount).toHaveBeenCalledOnce();
  });

  it("keeps guest sign-in, player Settings and the restricted Admin action distinct", async () => {
    await act(() => root.render(<Header signedIn={false} admin={false}/>));
    await click(btn("Sign in"));
    expect(openAccount).toHaveBeenCalledOnce();
    await click(btn("Menu"));
    const links = host.querySelectorAll(".sh-menu-panel .sh-menu-item");
    expect([...links].map((link) => link.textContent)).toEqual(nav.map(({ label }) => label));
    expect(document.activeElement).toBe(links[0]);
    await click(links[1]);
    expect(nav[1].onClick).toHaveBeenCalledOnce();
    expect(btn("Menu").getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(btn("Menu"));
    await act(() => root.render(<Header/>));
    await click(btn("Menu"));
    await click([...host.querySelectorAll(".sh-menu-item")].find((node) => node.textContent === "Admin"));
    expect(openAdmin).toHaveBeenCalledOnce();
  });

  it("shares the sound state between the quick button and Settings, with Escape returning focus", async () => {
    await act(() => root.render(<Header/>));
    await click(btn("Turn sound off"));
    await click(btn("Settings"));
    const control = host.querySelector('[role="switch"]');
    expect(document.activeElement).toBe(control);
    expect(control.getAttribute("aria-checked")).toBe("false");
    await click(control);
    expect(control.getAttribute("aria-checked")).toBe("true");
    expect(btn("Turn sound off").getAttribute("aria-pressed")).toBe("true");
    await act(() => control.dispatchEvent(new KeyboardEvent("keydown", { bubbles:true, key:"Escape" })));
    expect(host.querySelector('[role="switch"]')).toBeNull();
    expect(document.activeElement).toBe(btn("Settings"));
    expect(openAdmin).not.toHaveBeenCalled();
  });
});
