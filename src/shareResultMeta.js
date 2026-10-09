// What a result link's preview says (api/share.js): the picture carries the
// result and the matchup art; the text is only the score and the dare. The
// puzzle's title stays out of the visible text (the art already shows it)
// and lives in the page title and the picture's alt text.

import { SHARE_DARE } from "./share.js";
import { SITE_NAME, previewImage } from "./puzzleMeta.js";
import { SITE_ORIGIN } from "./puzzleLink.js";
import { resultCircles, resultImageUrl, resultUrl } from "./shareLink.js";

export const IMAGE_SIZE = { width: 1200, height: 630 };

export function resultMeta(game, result, origin = SITE_ORIGIN) {
  const title = game?.themeTitle?.trim() || SITE_NAME;
  const circles = resultCircles(result.answers);
  const score = `${result.score}/${result.total} ${SHARE_DARE}`;
  return {
    pageTitle: `${title} · ${SITE_NAME}`,
    title: score,
    description: circles,
    url: resultUrl(result.code, origin),
    image: {
      url: resultImageUrl(result.code, origin), ...IMAGE_SIZE, wide: true,
      alt: `${title}: ${result.score} of ${result.total} right`,
    },
  };
}

// The artwork the picture is built on: the same choice a puzzle preview makes.
export const resultArtUrl = (game, origin = SITE_ORIGIN) => {
  const img = previewImage(game, origin);
  return img.url === `${origin}/icon-512.png` ? null : img.url;
};
