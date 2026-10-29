// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it } from "vitest";
import MoreGames from "./MoreGames.jsx";
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let root;
afterEach(async () => { if (root) await act(async () => root.unmount()); document.body.innerHTML = ""; });
it("offers six other games with local artwork and private, plain outbound links", async () => {
  const host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  await act(async () => root.render(React.createElement(MoreGames)));
  const links = [...host.querySelectorAll("a")];
  expect(links).toHaveLength(6);
  expect(links.map(a => a.querySelector("strong").textContent)).not.toContain('What The Fudge Trivia');
  for (const link of links) {
    const url = new URL(link.href);
    expect(url.protocol).toBe("https:"); expect(url.search).toBe(""); expect(url.hash).toBe("");
    expect(link.rel).toBe("noopener noreferrer"); expect(link.target).toBe("_blank");
    expect(link.querySelector("img").getAttribute("src")).toMatch(/^\/game-icons\/.*\.png$/);
    expect(link.textContent).toContain("opens in a new tab");
  }
});

it("keeps existing navigation and returns focus after Escape", async () => {
  const { default: SiteHeader } = await import("./SiteHeader.jsx");
  const host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  let visits = 0;
  await act(async () => root.render(React.createElement(SiteHeader, {
    nav: [{id:"archive",label:"Archive",href:"/archive",onClick:()=>{visits++;}}],
    account:{label:"Sign in",onClick(){}},
  })));
  const button = host.querySelector('button[aria-label="Menu"]');
  await act(async () => button.click());
  expect(button.getAttribute("aria-expanded")).toBe("true");
  expect(host.querySelectorAll(".sh-left .more-games a")).toHaveLength(6);
  expect(document.activeElement.textContent).toBe("Archive");
  await act(async () => document.dispatchEvent(new KeyboardEvent("keydown",{key:"Escape",bubbles:true})));
  expect(button.getAttribute("aria-expanded")).toBe("false");
  expect(document.activeElement).toBe(button);
  await act(async () => button.click());
  await act(async () => host.querySelector('.sh-left a[href="/archive"]').click());
  expect(visits).toBe(1);
  expect(button.getAttribute("aria-expanded")).toBe("false");
});

it("keeps the real PlayerHeader's four-link desktop track separate from More Games", async () => {
  const { default: PlayerHeader } = await import("./PlayerHeader.jsx");
  const { PlayerChromeContext } = await import("./playerChrome.js");
  const host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  const chrome = {
    nav: ["Play", "Archive", "Stats", "How to Play"].map(label => ({id:label,label,href:"/"+label,onClick(){}})),
    sound:{muted:false,setMuted(){}},account:{label:"Sign in",onClick(){}},
  };
  await act(async () => root.render(React.createElement(PlayerChromeContext.Provider, {value:chrome}, React.createElement(PlayerHeader))));
  expect(host.querySelectorAll(".sh-nav > a")).toHaveLength(4);
  expect(host.querySelector(".sh-nav button")).toBeNull();
  const desktop = host.querySelector('.sh-tools button[aria-label="More Games"]');
  expect(desktop).not.toBeNull();
  await act(async () => desktop.click());
  expect(host.querySelectorAll(".sh-tools .more-games a")).toHaveLength(6);
});
