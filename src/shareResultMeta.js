// What a result link's preview says (api/share.js): the picture is the
// puzzle's own matchup artwork and nothing else; the preview's only text is a
// plain tagline. The result (circles, score, dare) is the share's own text.
// page title and the picture's alt text.

import { SITE_NAME, previewImage } from "./puzzleMeta.js";
import { SITE_ORIGIN } from "./puzzleLink.js";
import { resultUrl } from "./shareLink.js";

// The preview's whole text. The answer circles and the score travel as the
// share's own text (shareLink.js resultShareFor), never in the metadata.
export const TAGLINE = "Daily trivia. Two choices.";

export function resultMeta(game, result, origin = SITE_ORIGIN) {
  const title = game?.themeTitle?.trim() || SITE_NAME;
  const image = previewImage(game, origin);
  return {
    pageTitle: `${title} · ${SITE_NAME}`,
    title: TAGLINE,
    description: "",
    url: resultUrl(result.code, origin),
    image: { ...image, alt: `${title}: ${result.score} of ${result.total} right` },
  };
}
