// What a result link's preview says (api/share.js): the picture is the
// puzzle's own matchup artwork and nothing else; the result sits in the text
// under it (the score and the dare, then the answer circles). The puzzle's
// title stays out of that text (the art already shows it) and lives in the
// page title and the picture's alt text.

import { SITE_NAME, previewImage } from "./puzzleMeta.js";
import { SITE_ORIGIN } from "./puzzleLink.js";
import { resultCircles, resultUrl } from "./shareLink.js";

export function resultMeta(game, result, origin = SITE_ORIGIN) {
  const title = game?.themeTitle?.trim() || SITE_NAME;
  const image = previewImage(game, origin);
  return {
    pageTitle: `${title} · ${SITE_NAME}`,
    title: `${result.score}/${result.total} → Can you beat my score?!`,
    description: resultCircles(result.answers),
    url: resultUrl(result.code, origin),
    image: { ...image, alt: `${title}: ${result.score} of ${result.total} right` },
  };
}
