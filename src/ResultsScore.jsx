// The big "4/8" on Results: live text drawn like a sticker. The front copy is
// candy pink with a thick black outline; an aria-hidden copy behind it is the
// darker pink extrusion, dropped down and slightly right, with a thin black
// edge around its bottom. Every layer is a ring of hard-edged (zero-blur)
// offset copies rather than a text stroke, so corners come out rounded like
// the mock-up instead of mitred, and the layers stay crisp at any size (all
// in em). Only the front copy is read or selected.

const em = (n) => `${+n.toFixed(4)}em`;
const ring = (radius, color, dx = 0, dy = 0, steps = 36) =>
  Array.from({ length: steps }, (_, i) => {
    const a = (i / steps) * 2 * Math.PI;
    return `${em(dx + radius * Math.cos(a))} ${em(dy + radius * Math.sin(a))} 0 ${color}`;
  });

const OUTLINE = 0.06;                    // black outline around the face
const DROP = { x: 0.022, y: 0.065 };     // how far the extrusion reaches
const DROP_STEPS = 4;                    // copies along it, so its sides are solid
const EDGE = 0.03;                       // black rim around the extrusion

const FACE_SHADOW = ring(OUTLINE, "var(--black)").join(",");
const EXTRUSION_SHADOW = (() => {
  const fill = [];
  const rim = [];
  for (let k = 1; k <= DROP_STEPS; k++) {
    const dx = (DROP.x * k) / DROP_STEPS;
    const dy = (DROP.y * k) / DROP_STEPS;
    fill.push(...ring(OUTLINE, "var(--pink-dark)", dx, dy, 28));
    rim.push(...ring(OUTLINE + EDGE, "var(--black)", dx, dy, 28));
  }
  // Earlier shadows paint on top: the pink fill sits inside the black rim.
  return [...fill, ...rim].join(",");
})();

const LAYERS = { "--rs-face-shadow": FACE_SHADOW, "--rs-extrusion-shadow": EXTRUSION_SHADOW };

export default function ResultsScore({ score, total }) {
  const text = <>{score}<span className="score-denom">/{total}</span></>;
  return (
    <div className="score-big rs-score" style={LAYERS}>
      <span className="rs-score-ext" aria-hidden="true">{text}</span>
      <span className="rs-score-face">{text}</span>
    </div>
  );
}
