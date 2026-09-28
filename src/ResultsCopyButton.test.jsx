import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import ResultsCopyButton from "./ResultsCopyButton.jsx";
import { copyText } from "./homeShare.js";

// ScoreScreen stores copyText's outcome as the button's status, so these are
// the two paths a press can take.
const pressWith = async (writeText) => {
  const status = await copyText("share text", { clipboard: { writeText } });
  return { status, html: renderToStaticMarkup(<ResultsCopyButton status={status} onCopy={() => {}}/>) };
};

describe("Results copy feedback", () => {
  it("says Copied only after a successful clipboard write", async () => {
    const { status, html } = await pressWith(vi.fn().mockResolvedValue(undefined));
    expect(status).toBe("copied");
    expect(html).toContain("✓ Copied to clipboard!!");
    expect(html).toMatch(/role="status"[^>]*>Result copied to clipboard</);
    expect(html).not.toContain('role="alert"');
  });

  it("keeps the normal label and shows a persistent alert when copying fails", async () => {
    for (const writeText of [vi.fn().mockRejectedValue(new Error("NotAllowedError")), undefined]) {
      const { status, html } = await pressWith(writeText);
      expect(status).toBe("failed");
      expect(html).toContain("Copy &amp; Share 📋");
      expect(html).not.toContain("Copied");
      expect(html).toMatch(/<p class="rs-share-error" role="alert">Couldn’t copy your result\./);
    }
  });
});
