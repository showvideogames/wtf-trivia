// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import ImageField from "./ImageField.jsx";
import { StudioContext } from "./StudioContext.js";
import { StorageUploadError } from "./adminAccess.js";

// The image field with the Studio's services faked: an upload refused for
// the account must say so (and ask the Studio to re-check), and with no
// admin access nothing can start an upload. The current image never changes.

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const CURRENT = "https://store.example.com/wtf-images/categories/current.webp";
const optimized = { blob: new Blob(["x"], { type: "image/webp" }), mime: "image/webp", size: 2048, summary: "2 KB WebP" };

let root = null;
let host = null;
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = host = null;
});

function mount(services, props = {}) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  const studio = {
    uploadBytes: vi.fn(),
    isStoredImage: (v) => String(v).startsWith("https://store.example.com/"),
    youtubeEmbedUrl: () => null,
    loadOptimizer: async () => ({ optimizeImage: async () => optimized }),
    ...services,
  };
  const onChange = vi.fn();
  act(() => root.render(
    <StudioContext.Provider value={studio}>
      <ImageField value={CURRENT} onChange={onChange} label="Category A image" preset="category" {...props}/>
    </StudioContext.Provider>
  ));
  return { studio, onChange };
}

async function chooseFile() {
  const input = host.querySelector('input[type="file"]');
  const file = new File(["png"], "cat.png", { type: "image/png" });
  Object.defineProperty(input, "files", { value: [file], configurable: true });
  await act(async () => { input.dispatchEvent(new Event("change", { bubbles: true })); });
  await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
}

const button = (text) => [...host.querySelectorAll("button")].find((b) => b.textContent.includes(text));

describe("ImageField upload failures", () => {
  it("a refused upload names the sign-in problem, keeps the image and asks the Studio to re-check", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const onAccessProblem = vi.fn();
    const { studio, onChange } = mount({ canWrite: true, onAccessProblem, uploadBytes: vi.fn(async () => { throw new StorageUploadError("permission", { status: 403 }); }) });
    act(() => button("Replace").click());
    await chooseFile();
    expect(studio.uploadBytes).toHaveBeenCalledTimes(1);
    const alert = host.querySelector('[role="alert"]').textContent;
    expect(alert).toMatch(/isn't allowed to upload images/);
    expect(alert).toMatch(/current image is unchanged/);
    expect(alert).not.toMatch(/connection/i);
    expect(onAccessProblem).toHaveBeenCalledTimes(1);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("a request that never got an answer still says to check the connection", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const onAccessProblem = vi.fn();
    mount({ canWrite: true, onAccessProblem, uploadBytes: vi.fn(async () => { throw new StorageUploadError("network"); }) });
    act(() => button("Replace").click());
    await chooseFile();
    expect(host.querySelector('[role="alert"]').textContent).toMatch(/Check your connection/);
    expect(onAccessProblem).not.toHaveBeenCalled();
  });

  it("without admin access no upload can start", async () => {
    const { studio, onChange } = mount({ canWrite: false });
    act(() => button("Replace").click());
    expect(button("Choose image").disabled).toBe(true);
    expect(host.querySelector('input[type="file"]').disabled).toBe(true);
    expect(host.textContent).toMatch(/Uploads need a signed-in admin account/);
    await chooseFile();
    expect(studio.uploadBytes).not.toHaveBeenCalled();
    expect(onChange).not.toHaveBeenCalled();
  });
});
