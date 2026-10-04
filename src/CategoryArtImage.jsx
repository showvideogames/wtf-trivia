import { useState } from "react";
import { usableMediaUrl } from "./mediaPreloader.js";

// ---- CATEGORY ART IMAGE ----
// One category's saved image, shared by the Archive cards and the Home
// matchup so both treat the artwork the same way: only a usable URL is
// tried, and an image that fails to load gives way to `fallback` (the
// caller decides what stands in). Sizing and `contain` fitting are the
// caller's CSS.
export default function CategoryArtImage({ image, alt = "", loading, fallback = null }) {
  const src = usableMediaUrl(image);
  const [failedSrc, setFailedSrc] = useState(null);
  if (!src || failedSrc === src) return fallback;
  return <img src={src} alt={alt} loading={loading} decoding="async" onError={() => setFailedSrc(src)}/>;
}
