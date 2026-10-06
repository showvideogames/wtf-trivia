// ---- CANDY PAGE SHELL ----
// The warm custard page from the Archive design: a pale yellow canvas, a soft
// cream spotlight behind the top of the content, and candy pieces scattered
// around the outside edges. Built to spread to other pages later; for now
// only Archive uses it.
//
// Sprinkles reuse the existing artwork in /public. The gumballs and stars
// are small CSS/SVG shapes. Every piece sits on fixed, inert layers behind
// the page (aria-hidden, pointer-events: none) and is clipped to the
// viewport, so it can never cover a control or widen the page. One set is
// shown per breakpoint (see site.css); none of it animates.

const SPRINKLE = {
  pink: "/sprinkle-pink.png",
  teal: "/sprinkle-turquoise.png",
  yellow: "/sprinkle-yellow.png",
};

// kind, colour, then position: [top %, side, offset, size px, rotation deg].
// Sprinkle sizes are the element width; the PNG is ~37% artwork, so the
// visible dash is roughly a third of it.
const s = (color, top, side, offset, size, rot) => ({ kind: "sprinkle", color, top, side, offset, size, rot });
const dot = (color, top, side, offset, size) => ({ kind: "dot", color, top, side, offset, size, rot: 0 });
const star = (top, side, offset, size, rot) => ({ kind: "star", top, side, offset, size, rot });

// DESKTOP, 1100px and up: kept to the outer margins beside the content.
const DECOR_DT = [
  s("yellow", 3, "left", "0.5%", 86, 32),
  dot("pink", 6, "left", "3.6%", 24),
  s("teal", 13, "left", "1.6%", 104, 24),
  star(12, "left", "5.2%", 46, -12),
  dot("pink", 22, "left", "2.4%", 20),
  s("pink", 30, "left", "0.4%", 92, 38),
  star(42, "left", "-0.6%", 48, 8),
  dot("pink", 47, "left", "4.6%", 18),
  s("teal", 55, "left", "1.6%", 98, -28),
  s("pink", 64, "left", "3.4%", 82, 46),
  dot("teal", 75, "left", "1.4%", 18),
  s("pink", 84, "left", "1.6%", 92, 30),
  star(87, "left", "4.6%", 50, 14),

  s("yellow", 2, "right", "1.2%", 84, -42),
  s("pink", 7, "right", "3.6%", 96, 58),
  s("teal", 14, "right", "0.8%", 100, -34),
  star(20, "right", "2.6%", 54, 10),
  dot("pink", 26, "right", "5.8%", 14),
  s("yellow", 33, "right", "0.6%", 88, -62),
  dot("pink", 39, "right", "3.4%", 22),
  s("pink", 47, "right", "1.2%", 94, 32),
  star(61, "right", "3.8%", 50, -8),
  s("teal", 70, "right", "1.4%", 102, -40),
  s("yellow", 79, "right", "4.4%", 80, 52),
  dot("pink", 88, "right", "1.6%", 22),
];

// TABLET, 600-1099px: fewer, smaller, pushed right to the edges.
const DECOR_TB = [
  s("teal", 6, "left", "-14px", 76, 24),
  dot("pink", 18, "left", "4px", 16),
  star(36, "left", "-12px", 36, -10),
  s("pink", 62, "left", "-18px", 72, 40),
  dot("teal", 86, "left", "6px", 14),
  s("yellow", 4, "right", "-16px", 74, -38),
  star(24, "right", "-10px", 38, 12),
  dot("pink", 48, "right", "6px", 16),
  s("teal", 74, "right", "-18px", 76, -30),
];

// PHONE, under 600px: a handful of small pieces peeking in from the edges.
const DECOR_PH = [
  star(9, "left", "-14px", 30, -10),
  s("pink", 34, "right", "-26px", 60, 36),
  dot("pink", 58, "left", "-5px", 14),
  s("teal", 84, "right", "-22px", 58, -32),
  s("yellow", 96, "left", "-20px", 56, 28),
];

function StarShape() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <path d="M24 3.5l6.2 12.7 14 2-10.1 9.9 2.4 13.9L24 35.4l-12.5 6.6 2.4-13.9L3.8 18.2l14-2z"
            fill="#FFD43B" stroke="#E8B10C" strokeWidth="2.4" strokeLinejoin="round"/>
      <path d="M17.5 17.8l4.3-.6M24 9.4l2.4 4.9" stroke="#FFF3B0" strokeWidth="2.6" strokeLinecap="round"/>
    </svg>
  );
}

function Piece({ d, set }) {
  const style = {
    top: `${d.top}%`,
    [d.side]: d.offset,
    width: `${d.size}px`,
    transform: `rotate(${d.rot}deg)`,
  };
  if (d.kind === "sprinkle") {
    return <img src={SPRINKLE[d.color]} alt="" className={`cps-piece cps-sprinkle ${set}`} style={style}/>;
  }
  if (d.kind === "dot") {
    return <span className={`cps-piece cps-dot cps-dot-${d.color} ${set}`} style={{ ...style, height: `${d.size}px` }}/>;
  }
  return <span className={`cps-piece cps-star ${set}`} style={style}><StarShape/></span>;
}

const SETS = [[DECOR_DT, "cps-dt"], [DECOR_TB, "cps-tb"], [DECOR_PH, "cps-ph"]];

// The canvas and the candy pieces on their own: the page draws them behind
// itself, and the sticky header draws a copy behind its bar (PlayerHeader).
export function CandyCanvas() {
  return (
    <>
      <div className="cps-glow" aria-hidden="true"/>
      <div className="cps-decor" aria-hidden="true">
        {SETS.flatMap(([list, set]) => list.map((d, i) => <Piece key={set + i} d={d} set={set}/>))}
      </div>
    </>
  );
}

export default function CandyPageShell({ className = "", children }) {
  return (
    <div className={`cps-page ${className}`.trim()}>
      <CandyCanvas/>
      {children}
    </div>
  );
}
