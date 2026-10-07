import { useLayoutEffect, useRef, useState } from "react";
import { paperLayout } from "./paperAssets.js";
import { PAPER_ASSET } from "./gameplayLook.js";

// ---- PAPER PROMPT ----
// The question, set on a real scrap of crumpled paper. The words are live
// text (the heading itself); the paper is only a transparent image behind
// them (paperAssets.js), never carrying any text.
//
// One-line questions sit on the short parchment, two-line ones on the
// medium, longer ones on the standard parchment: one paper family in three
// depths. The prompt takes the sheet's own proportions at its width, so the
// paper shows whole -- torn edges included -- and is never stretched; the
// text is centred on it. Only text too tall for that sheet makes the prompt
// taller, and then the sheet is scaled up and its sides cropped rather than
// distorted. The soft shadow is CSS (paperLook.css).

function usePaperLayout(boxRef, textRef, force) {
  const [layout, setLayout] = useState(null);
  useLayoutEffect(() => {
    const box = boxRef.current, text = textRef.current;
    if (!box || !text) return;
    const measure = () => {
      const width = box.offsetWidth;
      const textHeight = text.offsetHeight;
      const lineHeight = parseFloat(getComputedStyle(text).lineHeight) || textHeight;
      if (!width || !textHeight) return;
      const next = paperLayout({ width, textHeight, lines: Math.round(textHeight / lineHeight), force });
      setLayout((l) => (l && l.id === next.id && l.height === next.height ? l : next));
    };
    measure();
    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", measure);
      return () => window.removeEventListener("resize", measure);
    }
    // The text's own size changes when the web font arrives or the title
    // changes; the box's width when the window does.
    const ro = new ResizeObserver(measure);
    ro.observe(box);
    ro.observe(text);
    return () => ro.disconnect();
  }, [boxRef, textRef, force]);
  return layout;
}

export default function PaperPrompt({ children, as = "h1", className = "", paper = PAPER_ASSET }) {
  const Tag = as;
  const boxRef = useRef(null);
  const textRef = useRef(null);
  const layout = usePaperLayout(boxRef, textRef, paper);
  return (
    <div ref={boxRef} className={`pp ${className}`.trim()}
         data-paper={layout?.id} style={layout ? { minHeight: layout.height } : undefined}>
      {layout && <img className="pp-sheet" src={layout.src} alt="" aria-hidden="true" draggable="false"/>}
      <Tag ref={textRef} className="pp-text">{children}</Tag>
    </div>
  );
}
