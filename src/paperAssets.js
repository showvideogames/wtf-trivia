// ---- PAPER ASSETS ----
// The real crumpled-paper sheets PaperPrompt sets the question on, trimmed to
// the paper itself (transparent around it) in public/paper:
//   aspect      the sheet's width / height
//   tornTop/Bottom  how much of its height the torn top and bottom edges
//               take across the text area (the middle 86% of the width),
//               measured from the image: the text stays inside them
//
// The approved family is the parchment, in three depths: `short` (about
// 3.9:1) for one line, `medium` (3:1) for two, and `parchment` (about
// 2.3:1) for three or more, so the paper deepens gradually with the title.

export const PAPERS = {
  short: { src: "/paper/torn-cream-parchment-banner.webp", aspect: 1200 / 309, tornTop: 0.117, tornBottom: 0.1 },
  medium: { src: "/paper/torn-cream-parchment-medium.webp", aspect: 1200 / 400, tornTop: 0.113, tornBottom: 0.125 },
  parchment: { src: "/paper/torn-crumpled-parchment-paper.webp", aspect: 1200 / 529, tornTop: 0.07, tornBottom: 0.089 },
};

// Which sheet a prompt uses and how tall the prompt is, for a prompt `width`
// wide whose text is `textHeight` tall over `lines` lines:
//   - one line: the short parchment; two: the medium; three or more: the
//     standard parchment (or `force`, any sheet, for review in development);
//   - the prompt takes the sheet's own proportions (height = width / aspect),
//     so the paper is shown whole and undistorted;
//   - only if the text would not fit inside the torn edges at that height
//     (with `air` above and below, on top of the line box's own leading)
//     does the prompt grow taller; the sheet then scales up proportionally
//     and its sides are cropped (`cropped`).
export function paperLayout({ width, textHeight, lines, force = null, air = 3 }) {
  const id = PAPERS[force] ? force : lines <= 1 ? "short" : lines === 2 ? "medium" : "parchment";
  const paper = PAPERS[id];
  const natural = width / paper.aspect;
  const torn = Math.max(paper.tornTop, paper.tornBottom);
  const needed = (textHeight + 2 * air) / (1 - 2 * torn);
  const height = Math.ceil(Math.max(natural, needed));
  return { id, src: paper.src, height, cropped: needed > natural + 0.5 };
}
