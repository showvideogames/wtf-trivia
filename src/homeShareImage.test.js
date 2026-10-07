import { describe, it, expect, vi, beforeEach } from "vitest";
import { clearShareImages, prepareShareImage, prepareShareImages, shareArtworkUrls, shareFeedback, shareImageType, shareResult } from "./homeShare.js";

// The one share operation behind Home's Share button, with the puzzle's
// Home & Share poster: the poster plus the short image text on phones that
// can share the file, the full text alone otherwise, the clipboard last.

const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1";
const WINDOWS = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36";
const POSTER = "https://example.supabase.co/storage/v1/object/public/wtf-images/headers/poster.webp";
const TEXT = "What The Fudge Trivia 🍬\n━━━━━━━━━━━━━━━━━━━━━━━━━━\nLed Zeppelin 🎸\n     OR\nMy Little Pony 🦄\n" +
  "━━━━━━━━━━━━━━━━━━━━━━━━━━\n🟢🟢🔴🟢🔴🟢🟢🔴\n5/8 • Beat 67% of players\nwhatthefudge.gg";
const IMAGE_TEXT = "🟢🟢🔴🟢🔴🟢🟢🔴\n5/8 ➜ Can you beat my score?!\nwhatthefudge.gg";

const domError = (name) => Object.assign(new Error(name), { name });
const phone = ({ share = vi.fn().mockResolvedValue(undefined), canShare = vi.fn(() => true), writeText } = {}) => ({
  userAgent: IPHONE, maxTouchPoints: 5, share, ...(canShare ? { canShare } : {}),
  clipboard: { writeText: writeText || vi.fn().mockResolvedValue(undefined) },
});
const okFetch = (type = "image/webp") =>
  vi.fn().mockResolvedValue({ ok: true, blob: async () => new Blob([new Uint8Array([1, 2, 3, 4])], { type }) });
const share = (nav, fetchImpl, imageUrl = POSTER) => shareResult({ text: TEXT, imageText: IMAGE_TEXT, imageUrl }, nav, { fetchImpl });

beforeEach(() => clearShareImages());

describe("shareResult with a Home & Share poster", () => {
  it("sends one image file plus the exact short text, and copies nothing", async () => {
    const nav = phone();
    expect(await share(nav, okFetch())).toBe("shared");
    expect(nav.share).toHaveBeenCalledTimes(1);
    const payload = nav.share.mock.calls[0][0];
    expect(Object.keys(payload).sort()).toEqual(["files", "text"]);
    expect(payload.text).toBe(IMAGE_TEXT);
    expect(payload.files).toHaveLength(1);
    expect(payload.files[0]).toBeInstanceOf(File);
    expect(payload.files[0].type).toBe("image/webp");
    expect(payload.files[0].name).toBe("what-the-fudge-trivia.webp");
    expect(nav.canShare).toHaveBeenCalledWith({ files: [payload.files[0]] });
    expect(nav.clipboard.writeText).not.toHaveBeenCalled();
  });

  it("accepts PNG and JPEG, and types an untyped download from its URL", async () => {
    const cases = [
      ["image/png", POSTER, "what-the-fudge-trivia.png"],
      ["image/jpeg", POSTER, "what-the-fudge-trivia.jpg"],
      ["", "https://x.test/a/poster.JPG?v=2", "what-the-fudge-trivia.jpg"],
    ];
    for (const [type, url, name] of cases) {
      clearShareImages();
      const nav = phone();
      await share(nav, okFetch(type), url);
      expect(nav.share.mock.calls[0][0].files[0].name).toBe(name);
    }
    expect(shareImageType("application/octet-stream", "https://x.test/poster")).toBeNull();
    expect(shareImageType("application/octet-stream", "https://x.test/poster.png")).toBe("image/png");
  });

  it("never shares a page served in the image's place, whatever its URL says", async () => {
    expect(shareImageType("text/html", "https://x.test/missing.png")).toBeNull();
    expect(shareImageType("application/json; charset=utf-8", "https://x.test/missing.webp")).toBeNull();
    const nav = phone();
    expect(await share(nav, okFetch("text/html"), "https://x.test/missing.png")).toBe("shared");
    expect(nav.share).toHaveBeenCalledWith({ text: TEXT });
  });

  it("shares the full text alone when the puzzle has no poster", async () => {
    const nav = phone();
    const fetchImpl = okFetch();
    expect(await share(nav, fetchImpl, null)).toBe("shared");
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(nav.share).toHaveBeenCalledTimes(1);
    expect(nav.share).toHaveBeenCalledWith({ text: TEXT });
  });

  it("shares the full text alone when the poster can't be downloaded", async () => {
    for (const fetchImpl of [vi.fn().mockRejectedValue(new TypeError("Failed to fetch")), vi.fn().mockResolvedValue({ ok: false, status: 404 })]) {
      clearShareImages();
      const nav = phone();
      expect(await share(nav, fetchImpl)).toBe("shared");
      expect(nav.share).toHaveBeenCalledTimes(1);
      expect(nav.share).toHaveBeenCalledWith({ text: TEXT });
      expect(nav.clipboard.writeText).not.toHaveBeenCalled();
    }
  });

  it("shares the full text alone when canShare refuses the file, throws, or is missing", async () => {
    for (const canShare of [vi.fn(() => false), vi.fn(() => { throw new TypeError("x"); }), null]) {
      clearShareImages();
      const nav = phone({ canShare });
      expect(await share(nav, okFetch())).toBe("shared");
      expect(nav.share).toHaveBeenCalledTimes(1);
      expect(nav.share).toHaveBeenCalledWith({ text: TEXT });
    }
  });

  it("tries the text-only share sheet when the file share fails, then the clipboard", async () => {
    const nav = phone({ share: vi.fn().mockRejectedValueOnce(domError("NotAllowedError")).mockResolvedValueOnce(undefined) });
    expect(await share(nav, okFetch())).toBe("shared");
    expect(nav.share).toHaveBeenCalledTimes(2);
    expect(nav.share.mock.calls[1][0]).toEqual({ text: TEXT });
    expect(nav.clipboard.writeText).not.toHaveBeenCalled();

    clearShareImages();
    const both = phone({ share: vi.fn().mockRejectedValue(domError("DataError")) });
    expect(await share(both, okFetch())).toBe("copied");
    expect(both.share).toHaveBeenCalledTimes(2);
    expect(both.clipboard.writeText).toHaveBeenCalledWith(TEXT);
  });

  it("does nothing more when the player cancels the share sheet", async () => {
    const nav = phone({ share: vi.fn().mockRejectedValue(domError("AbortError")) });
    const outcome = await share(nav, okFetch());
    expect(outcome).toBe("cancelled");
    expect(nav.share).toHaveBeenCalledTimes(1);
    expect(nav.clipboard.writeText).not.toHaveBeenCalled();
    expect(shareFeedback(outcome)).toBeNull(); // no "Copied!", no error
  });

  it("copies the full text on desktop without downloading the poster or opening a share panel", async () => {
    const fetchImpl = okFetch();
    const nav = { userAgent: WINDOWS, maxTouchPoints: 0, share: vi.fn(), canShare: vi.fn(() => true), clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } };
    expect(await share(nav, fetchImpl)).toBe("copied");
    expect(nav.clipboard.writeText).toHaveBeenCalledWith(TEXT);
    expect(nav.share).not.toHaveBeenCalled();
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(prepareShareImage(POSTER, nav, fetchImpl)).toBeNull();
    expect(shareFeedback("copied")).toBe("copied");
  });

  it("reports a failed clipboard write honestly", async () => {
    const nav = { userAgent: WINDOWS, clipboard: { writeText: vi.fn().mockRejectedValue(domError("NotAllowedError")) } };
    const outcome = await share(nav, okFetch());
    expect(outcome).toBe("failed");
    expect(shareFeedback(outcome)).toBe("failed");
  });

  it("downloads the poster once, ahead of the tap, and retries after a failed download", async () => {
    const fetchImpl = okFetch();
    const nav = phone();
    await prepareShareImage(POSTER, nav, fetchImpl);
    await share(nav, fetchImpl);
    await share(nav, fetchImpl);
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    clearShareImages();
    const flaky = vi.fn().mockRejectedValueOnce(new TypeError("offline")).mockImplementation(okFetch());
    expect(await prepareShareImage(POSTER, nav, flaky)).toBeNull();
    expect(await prepareShareImage(POSTER, nav, flaky)).toBeInstanceOf(File);
  });
});

describe("wide artwork first, then the square poster", () => {
  const WIDE = "https://example.supabase.co/storage/v1/object/public/wtf-images/wide/wide.webp";
  const SQUARE = POSTER;
  // Serves each URL as its own image type, or fails the ones listed.
  const byUrl = (failing = []) => vi.fn(async (url) => failing.includes(url)
    ? { ok: false, status: 404 }
    : { ok: true, blob: async () => new Blob([new Uint8Array(url === WIDE ? 8 : 4)], { type: url === WIDE ? "image/webp" : "image/png" }) });
  const shareBoth = (nav, fetchImpl) => shareResult({ text: TEXT, imageText: IMAGE_TEXT, imageUrls: shareArtworkUrls({ wideImage: WIDE, headerImage: SQUARE }) }, nav, { fetchImpl });

  it("lists the wide artwork, then the square poster, skipping what's missing or unusable", () => {
    expect(shareArtworkUrls({ wideImage: WIDE, headerImage: SQUARE })).toEqual([WIDE, SQUARE]);
    expect(shareArtworkUrls({ wideImage: "", headerImage: SQUARE })).toEqual([SQUARE]);
    expect(shareArtworkUrls({ wideImage: WIDE, headerImage: null })).toEqual([WIDE]);
    expect(shareArtworkUrls({ wideImage: "javascript:alert(1)", headerImage: "  " })).toEqual([]);
  });

  it("attaches the wide artwork when it downloads, without fetching the square", async () => {
    const nav = phone();
    const fetchImpl = byUrl();
    expect(await shareBoth(nav, fetchImpl)).toBe("shared");
    expect(nav.share.mock.calls[0][0].files[0].type).toBe("image/webp");
    expect(nav.share.mock.calls[0][0].text).toBe(IMAGE_TEXT);
    expect(fetchImpl.mock.calls.map((c) => c[0])).toEqual([WIDE]);
  });

  it("falls back to the square poster when the wide artwork fails or isn't shareable", async () => {
    let nav = phone();
    expect(await shareBoth(nav, byUrl([WIDE]))).toBe("shared");
    expect(nav.share.mock.calls[0][0].files[0].type).toBe("image/png");

    clearShareImages();
    nav = phone({ canShare: vi.fn(({ files }) => files[0].type !== "image/webp") });
    expect(await shareBoth(nav, byUrl())).toBe("shared");
    expect(nav.share.mock.calls[0][0].files[0].type).toBe("image/png");
  });

  it("falls back to the full text when neither image can go", async () => {
    const nav = phone();
    expect(await shareBoth(nav, byUrl([WIDE, SQUARE]))).toBe("shared");
    expect(nav.share).toHaveBeenCalledTimes(1);
    expect(nav.share).toHaveBeenCalledWith({ text: TEXT });
  });

  it("prepares the chain ahead of the tap, and a failed wide download goes straight to the square next time", async () => {
    const nav = phone();
    const fetchImpl = byUrl([WIDE]);
    const file = await prepareShareImages([WIDE, SQUARE], nav, fetchImpl);
    expect(file.type).toBe("image/png");
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(await shareBoth(nav, fetchImpl)).toBe("shared");
    expect(fetchImpl).toHaveBeenCalledTimes(2); // nothing fetched at tap time
    expect(prepareShareImages([WIDE, SQUARE], { userAgent: WINDOWS, share: vi.fn(), canShare: vi.fn() }, fetchImpl)).toBeNull();
  });
});
