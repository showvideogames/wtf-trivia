import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import ResultsScore from "./ResultsScore.jsx";

describe("ResultsScore", () => {
  it.each([[4, 8], [0, 8], [10, 13], [11, 15]])("shows %i/%i once to readers, with a hidden decorative copy", (score, total) => {
    const html = renderToStaticMarkup(<ResultsScore score={score} total={total}/>);
    const face = html.match(/<span class="rs-score-face">(.*?)<\/span><\/div>/)[1].replace(/<[^>]+>/g, "");
    expect(face).toBe(`${score}/${total}`);
    expect(html).toMatch(/<span class="rs-score-ext" aria-hidden="true">/);
    expect(html.match(/aria-hidden="true"/g)).toHaveLength(1);
    // Hard-edged layers only: every shadow has a zero blur radius.
    expect(html).not.toMatch(/em [0-9.-]+em [1-9]/);
  });
});
