// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { demoGame } from "../dev/offlineBackend.js";

const fake = vi.hoisted(() => ({ getSession: vi.fn(), game: null, fetch: vi.fn() }));
vi.mock("../game/config.js", () => ({
  SUPABASE_URL: "http://127.0.0.1:1", SUPABASE_KEY: "test-key", SUPABASE_CONFIGURED: true,
  ACCOUNTS_ENABLED: true, PLATFORM_DISCOVERY_URL: "http://127.0.0.1:1", announceConfiguration() {},
}));
vi.mock("./supabaseClient.js", () => ({
  AUTH_STORAGE_KEY: "test-auth", authedFetch: (...args) => fake.fetch(...args),
  supabase: { auth: { getSession: (...args) => fake.getSession(...args),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
  } },
}));
vi.mock("./accountData.js", () => ({ createAccountDataLoader: () => ({
  invalidate() {},
  async load(_session, options, publish) {
    publish({ player: { id: "alice", isGuest: false, email: "alice@test.invalid" },
      adminStatus: "not_admin", handoff: null, games: [fake.game], record: null,
      stats: { currentStreak:0,longestStreak:0,totalPlayed:0,totalCorrect:0,totalQuestions:0,bestCombo:0 },
      today: options.today,
    });
  },
}) }));
let root, host;
const session = { data: { session: { user: { id: "alice" }, access_token: "alice-token" } } };
const flush = async ms => { await act(async () => { await vi.advanceTimersByTimeAsync(ms); }); };
beforeEach(() => {
  vi.useFakeTimers({ now: new Date(2026,9,29,12), toFake: ["setTimeout","clearTimeout","setInterval","clearInterval","Date"] });
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.clear(); sessionStorage.clear();
  window.history.replaceState(null,"","/");
  window.matchMedia = q => ({ matches:false, media:q, addEventListener(){},removeEventListener(){},addListener(){},removeListener(){} });
  globalThis.ResizeObserver = class { observe(){} unobserve(){} disconnect(){} };
  globalThis.IntersectionObserver = class { observe(){} unobserve(){} disconnect(){} };
  window.scrollTo=()=>{}; Element.prototype.scrollTo=()=>{}; Element.prototype.scrollIntoView=()=>{};
  window.AudioContext = class {
    constructor(){ this.currentTime=0; this.destination={}; this.state="running"; }
    resume(){ return Promise.resolve(); }
    createOscillator(){ const p={setValueAtTime(){},exponentialRampToValueAtTime(){},linearRampToValueAtTime(){}}; return {frequency:p,connect(){},start(){},stop(){}}; }
    createGain(){ const p={value:1,setValueAtTime(){},exponentialRampToValueAtTime(){},linearRampToValueAtTime(){}}; return {gain:p,connect(){}}; }
  };
  const base=demoGame();
  fake.game={...base,id:"completion-fixture",date:"2026-10-29",questions:[{...base.questions[0],imageUrl:null,correctCategory:"B"}],status:"published"};
  fake.getSession.mockReset().mockResolvedValue(session);
  fake.fetch.mockReset().mockImplementation(async (_url, init) => {
    const body=init?.body ? JSON.parse(init.body) : null;
    return new Response(JSON.stringify(body?.completed ? [{...body,puzzle_id:fake.game.id}] : []),{status:200});
  });
  vi.stubGlobal("fetch",vi.fn(() => { throw new Error("Unexpected real network"); }));
  host=document.createElement("div"); document.body.append(host); root=createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); host.remove(); vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
it.each(["resolve", "reject"])("keeps Results visible while final-answer session lookup waits then %s", async mode => {
  const { default: App } = await import("../App.jsx");
  await act(async () => root.render(<App/>));
  await flush(50);
  const play=host.querySelector(".hm-play");
  expect(play).not.toBeNull();
  await act(async () => play.click());
  await flush(50);
  expect(host.querySelector(".ans-box")).not.toBeNull();
  await act(async () => host.querySelector(".ans-box").click());
  await flush(400);
  let release, reject;
  const pending=new Promise((resolve, fail) => { release=resolve; reject=fail; });
  fake.getSession.mockReturnValue(pending);
  await act(async () => host.querySelector(".gp-next").click());
  expect(host.querySelector(".rs-score-face")).not.toBeNull();
  expect(host.querySelector(".gp-prompt, .gp-clue-text")).toBeNull();
  const errors=vi.spyOn(console,"error").mockImplementation(()=>{});
  await act(async () => mode==="resolve" ? release(session) : reject(new Error("session lookup unavailable")));
  await flush(1600);
  expect(host.querySelector(".rs-score-face")).not.toBeNull();
  const statsWrites=fake.fetch.mock.calls.filter(([url, init]) => url.endsWith("/rest/v1/player_stats") && init?.method==="POST");
  expect(statsWrites).toHaveLength(mode==="resolve" ? 1 : 0);
  if(mode==="resolve") {
    expect(statsWrites[0][1].headers.Authorization).toBe("Bearer alice-token");
    expect(JSON.parse(statsWrites[0][1].body).player_id).toBe("alice");
    expect(errors).not.toHaveBeenCalled();
  }
});
