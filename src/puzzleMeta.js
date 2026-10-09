// Link previews for puzzle links (/puzzle/<id>): the title, description and
// picture a messaging app or social site shows when someone pastes the link.
// Crawlers read them from the first HTML response and don't run the app, so
// api/puzzle.js writes them into the page on the server. Pure functions, so
// every rule can be tested; the Studio's share preview uses them too.
//
// Only what a player sees before playing ever goes into a preview: the
// title, the two categories and the artwork. Never a question or an answer.

import { SITE_ORIGIN, puzzleUrl } from "./puzzleLink.js";
import { shareCategoryName } from "./share.js";

export const SITE_NAME = "What The Fudge Trivia";
// The site's own picture (index.html uses the same one).
export const BRAND_IMAGE = { url: `${SITE_ORIGIN}/icon-512.png`, width: 512, height: 512, alt: "What The Fudge Trivia: a pink candy letter F" };

const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;

// The newest calendar day anywhere on Earth (UTC+14) as YYYY-MM-DD. The app
// opens a puzzle at local midnight on its date, so once that date has begun
// here, someone somewhere may be playing and sharing it.
export function earliestOpenDay(now = new Date()) {
  return new Date(now.getTime() + 14 * 3600 * 1000).toISOString().slice(0, 10);
}

// Whether a puzzle's own preview may be shown: published and dated on or
// before earliestOpenDay. Drafts, retired puzzles and anything scheduled
// later get the site's ordinary preview, which names no puzzle. (Playing is
// still decided by the app, by the player's own day: schedule.js.)
export function previewReleased(game, now = new Date()) {
  return game?.status === "published"
    && typeof game.date === "string" && DAY_KEY.test(game.date)
    && game.date <= earliestOpenDay(now);
}

// An image address a crawler can fetch: absolute http(s), relative paths
// resolved against the site. Data and blob URLs, and anything malformed, are
// unusable (null).
export function absoluteImageUrl(value, origin = SITE_ORIGIN) {
  if (typeof value !== "string") return null;
  const raw = value.trim();
  if (!raw || /^(data|blob):/i.test(raw)) return null;
  try {
    const url = new URL(raw, `${origin}/`);
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : null;
  } catch {
    return null;
  }
}

// The preview picture: the wide artwork, else the square poster, else the
// site's own image. `wide` tells the page to ask for a large card.
export function previewImage(game, origin = SITE_ORIGIN) {
  const alt = game?.themeTitle?.trim() || SITE_NAME;
  const wide = absoluteImageUrl(game?.wideImage, origin);
  if (wide) return { url: wide, alt, wide: true };
  const square = absoluteImageUrl(game?.headerImage, origin);
  if (square) return { url: square, alt, wide: false };
  return { ...BRAND_IMAGE, wide: false };
}

// Everything a puzzle's preview says. The categories use their share names
// (emoji and all) when the puzzle has them.
export function puzzleMeta(game, origin = SITE_ORIGIN) {
  const a = shareCategoryName(game?.categoryAShareName, game?.categoryA, "");
  const b = shareCategoryName(game?.categoryBShareName, game?.categoryB, "");
  const title = game?.themeTitle?.trim() || (a && b ? `${a} or ${b}?` : SITE_NAME);
  const description = a && b
    ? `${a} or ${b}? Every clue belongs to one of them. Play the puzzle and compare scores.`
    : "Each clue belongs to one of two ridiculous categories. Play the puzzle and compare scores.";
  return {
    pageTitle: title === SITE_NAME ? SITE_NAME : `${title} · ${SITE_NAME}`,
    title,
    description,
    url: puzzleUrl(game.id, origin),
    image: previewImage(game, origin),
  };
}

const escapeHtml = (value) => String(value)
  .replace(/&/g, "&amp;")
  .replace(/</g, "&lt;")
  .replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;")
  .replace(/'/g, "&#39;");

// The <head> tags for a preview, one per line.
export function metaTags(meta) {
  const { image } = meta;
  // A preview with no description (a result link's) leaves all three out.
  const desc = meta.description ? escapeHtml(meta.description) : "";
  const tags = [
    `<title>${escapeHtml(meta.pageTitle)}</title>`,
    ...(desc ? [`<meta name="description" content="${desc}" />`] : []),
    `<link rel="canonical" href="${escapeHtml(meta.url)}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="${escapeHtml(SITE_NAME)}" />`,
    `<meta property="og:title" content="${escapeHtml(meta.title)}" />`,
    ...(desc ? [`<meta property="og:description" content="${desc}" />`] : []),
    `<meta property="og:url" content="${escapeHtml(meta.url)}" />`,
    `<meta property="og:image" content="${escapeHtml(image.url)}" />`,
  ];
  if (image.url.startsWith("https:")) tags.push(`<meta property="og:image:secure_url" content="${escapeHtml(image.url)}" />`);
  if (image.width && image.height) {
    tags.push(`<meta property="og:image:width" content="${image.width}" />`);
    tags.push(`<meta property="og:image:height" content="${image.height}" />`);
  }
  tags.push(
    `<meta property="og:image:alt" content="${escapeHtml(image.alt)}" />`,
    `<meta name="twitter:card" content="${image.wide ? "summary_large_image" : "summary"}" />`,
    `<meta name="twitter:title" content="${escapeHtml(meta.title)}" />`,
    ...(desc ? [`<meta name="twitter:description" content="${desc}" />`] : []),
    `<meta name="twitter:image" content="${escapeHtml(image.url)}" />`,
  );
  return tags.join("\n    ");
}

// The page's own preview tags, replaced: the title, description, canonical
// link and every og:/twitter: tag come out, and the puzzle's go in just
// before </head>. Everything else (scripts, styles, icons) is untouched.
const REPLACED = [
  /<title>[\s\S]*?<\/title>\s*/gi,
  /<meta\s+name="description"[^>]*>\s*/gi,
  /<link\s+rel="canonical"[^>]*>\s*/gi,
  /<meta\s+property="og:[^"]*"[^>]*>\s*/gi,
  /<meta\s+name="twitter:[^"]*"[^>]*>\s*/gi,
];
export function withPuzzleMeta(html, meta) {
  const stripped = REPLACED.reduce((out, pattern) => out.replace(pattern, ""), String(html));
  // A function, so a "$" in a title is never read as a replacement pattern.
  return stripped.replace(/<\/head>/i, () => `  ${metaTags(meta)}\n  </head>`);
}
