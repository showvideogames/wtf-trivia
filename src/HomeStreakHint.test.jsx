// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { HomeStreak } from "./Home.jsx";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let host, root;
beforeEach(() => { host = document.createElement("div"); document.body.appendChild(host); root = createRoot(host); });
afterEach(() => { act(() => root.unmount()); host.remove(); });

it("pressing the guest nudge opens the existing sign-in flow, and nothing else", async () => {
  const onSignIn = vi.fn();
  const set = vi.spyOn(Storage.prototype, "setItem");
  await act(async () => { root.render(<HomeStreak streak={50} flame={<i/>} onSignIn={onSignIn}/>); });
  await act(async () => { host.querySelector(".hm-sk-hint").click(); });
  expect(onSignIn).toHaveBeenCalledTimes(1);
  expect(set).not.toHaveBeenCalled();
  set.mockRestore();
});
