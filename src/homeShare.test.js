import { describe, it, expect, vi } from "vitest";
import { isPhoneOrTablet, shareFeedback, shareResult } from "./homeShare.js";
import { buildResultsShareText } from "./share.js";

const shareOrCopy = (text, nav) => shareResult({ text }, nav);

const UA = {
  iPhone: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1",
  iPadOS: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15",
  oldIPad: "Mozilla/5.0 (iPad; CPU OS 12_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/12.1 Mobile/15E148 Safari/604.1",
  androidPhone: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36",
  androidTablet: "Mozilla/5.0 (Linux; Android 14; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36",
  windowsChrome: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36",
  windowsEdge: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36 Edg/129.0.0.0",
  macSafari: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15",
};

const fakeNav = ({ userAgent, maxTouchPoints = 0, mobile, share, writeText } = {}) => ({
  userAgent,
  maxTouchPoints,
  ...(mobile === undefined ? {} : { userAgentData: { mobile } }),
  ...(share ? { share } : {}),
  clipboard: { writeText: writeText || vi.fn().mockResolvedValue(undefined) },
});

const domError = (name) => Object.assign(new Error(name), { name });

describe("isPhoneOrTablet", () => {
  it("treats iPhones, iPads and Android phones and tablets as mobile", () => {
    expect(isPhoneOrTablet(fakeNav({ userAgent: UA.iPhone, maxTouchPoints: 5 }))).toBe(true);
    expect(isPhoneOrTablet(fakeNav({ userAgent: UA.iPadOS, maxTouchPoints: 5 }))).toBe(true);
    expect(isPhoneOrTablet(fakeNav({ userAgent: UA.oldIPad, maxTouchPoints: 5 }))).toBe(true);
    expect(isPhoneOrTablet(fakeNav({ userAgent: UA.androidPhone, maxTouchPoints: 5, mobile: true }))).toBe(true);
    expect(isPhoneOrTablet(fakeNav({ userAgent: UA.androidTablet, maxTouchPoints: 10, mobile: false }))).toBe(true);
  });

  it("treats Windows and Mac desktops, touchscreen laptops included, as desktop", () => {
    expect(isPhoneOrTablet(fakeNav({ userAgent: UA.windowsChrome, mobile: false }))).toBe(false);
    expect(isPhoneOrTablet(fakeNav({ userAgent: UA.windowsEdge, maxTouchPoints: 10, mobile: false }))).toBe(false);
    expect(isPhoneOrTablet(fakeNav({ userAgent: UA.macSafari, maxTouchPoints: 0 }))).toBe(false);
    expect(isPhoneOrTablet(undefined)).toBe(false);
  });
});

describe("shareResult", () => {
  const TEXT = "🔴🟢\n1/2 ➜ Can you beat my score?!\nhttps://whatthefudge.gg/puzzle/g-hp";

  it("copies on desktop without opening the share panel, even when one exists", async () => {
    const nav = fakeNav({ userAgent: UA.windowsChrome, mobile: false, share: vi.fn().mockResolvedValue(undefined) });
    expect(await shareOrCopy(TEXT, nav)).toBe("copied");
    expect(nav.share).not.toHaveBeenCalled();
    expect(nav.clipboard.writeText).toHaveBeenCalledWith(TEXT);
  });

  it("opens the native share sheet on phones with the exact text and copies nothing", async () => {
    const nav = fakeNav({ userAgent: UA.iPhone, maxTouchPoints: 5, share: vi.fn().mockResolvedValue(undefined) });
    expect(await shareOrCopy(TEXT, nav)).toBe("shared");
    expect(nav.share).toHaveBeenCalledWith({ text: TEXT });
    expect(nav.clipboard.writeText).not.toHaveBeenCalled();
  });

  it("treats closing the share sheet as a cancel: no copy, no error", async () => {
    const nav = fakeNav({ userAgent: UA.androidPhone, mobile: true, share: vi.fn().mockRejectedValue(domError("AbortError")) });
    expect(await shareOrCopy(TEXT, nav)).toBe("cancelled");
    expect(nav.clipboard.writeText).not.toHaveBeenCalled();
  });

  it("falls back to copying when the share sheet fails", async () => {
    const nav = fakeNav({ userAgent: UA.iPadOS, maxTouchPoints: 5, share: vi.fn().mockRejectedValue(domError("NotAllowedError")) });
    expect(await shareOrCopy(TEXT, nav)).toBe("copied");
    expect(nav.clipboard.writeText).toHaveBeenCalledWith(TEXT);
  });

  it("falls back to copying when a phone has no share sheet", async () => {
    const nav = fakeNav({ userAgent: UA.androidPhone, mobile: true });
    expect(await shareOrCopy(TEXT, nav)).toBe("copied");
    expect(nav.clipboard.writeText).toHaveBeenCalledWith(TEXT);
  });

  it("reports a failed copy, on desktop and after a failed share", async () => {
    const reject = () => vi.fn().mockRejectedValue(domError("NotAllowedError"));
    expect(await shareOrCopy(TEXT, fakeNav({ userAgent: UA.windowsChrome, writeText: reject() }))).toBe("failed");
    expect(await shareOrCopy(TEXT, fakeNav({ userAgent: UA.iPhone, maxTouchPoints: 5, share: vi.fn().mockRejectedValue(new TypeError("x")), writeText: reject() }))).toBe("failed");
    expect(await shareOrCopy(TEXT, { userAgent: UA.windowsChrome })).toBe("failed");
  });

  it("sends Results' own share text, link included, through unchanged", async () => {
    const game = { id: "g-hp", categoryA: "Harry Potter Characters", categoryB: "Professional Hockey Players" };
    const answers = [..."0001111100"].map((c, i) => ({ questionIndex: i, correct: c === "1" }));
    const record = { puzzleId: "g-hp", date: "2026-09-27", score: 5, totalQuestions: 10, answers, completed: true };
    const text = buildResultsShareText({ game, record });
    expect(text).toBe("🔴🔴🔴🟢🟢🟢🟢🟢🔴🔴\n5/10 ➜ Can you beat my score?!\nhttps://whatthefudge.gg/puzzle/g-hp");
    const phone = fakeNav({ userAgent: UA.iPhone, maxTouchPoints: 5, share: vi.fn().mockResolvedValue(undefined) });
    const desktop = fakeNav({ userAgent: UA.windowsChrome });
    await shareOrCopy(text, phone);
    await shareOrCopy(text, desktop);
    expect(phone.share.mock.calls[0][0].text).toBe(text);
    expect(desktop.clipboard.writeText.mock.calls[0][0]).toBe(text);
  });

  it("never attaches an image file: the link carries the preview", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    const nav = { ...fakeNav({ userAgent: UA.iPhone, maxTouchPoints: 5, share }), canShare: vi.fn(() => true) };
    expect(await shareResult({ text: TEXT, imageUrl: "https://x.test/poster.png" }, nav)).toBe("shared");
    expect(share).toHaveBeenCalledTimes(1);
    expect(share.mock.calls[0][0]).toEqual({ text: TEXT });
    expect(nav.canShare).not.toHaveBeenCalled();
  });
});

describe("shareFeedback", () => {
  it("shows feedback only for a real copy or a failed one", () => {
    expect(shareFeedback("copied")).toBe("copied");
    expect(shareFeedback("failed")).toBe("failed");
    expect(shareFeedback("shared")).toBeNull();
    expect(shareFeedback("cancelled")).toBeNull();
    expect(shareFeedback(null)).toBeNull();
  });
});
