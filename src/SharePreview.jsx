import { Fragment } from "react";

// Results' on-screen share preview: the share text itself, exactly as it is
// copied and shared (see share.js), never a separately assembled copy. Each
// line is a span joined by the text's own newlines inside a pre-wrap box,
// so it shows as it will be sent, and the preview's text content is the
// share string character for character.
// Only the look is added: the link may wrap, and the circle row shrinks to
// fit the box instead of wrapping.
const LINE_CLASS = [
  "rs-share-pips",
  "rs-share-score",
  "rs-share-url",
];

// Width per circle, in ems, generous enough for the widest common emoji
// font: ~1.42em covers Segoe UI Emoji (~1.37em).
const FIT_EMS = { "rs-share-pips": 1.42 };

export default function SharePreview({ text }) {
  return (
    <div className="share-box rs-share-preview" aria-label="Share preview">
      {text.split("\n").map((line, i) => {
        const className = LINE_CLASS[i] || "rs-share-line";
        const perChar = FIT_EMS[className];
        const style = perChar ? { "--fit-ems": [...line].length * perChar + 0.2 } : undefined;
        return (
          <Fragment key={i}>
            {i > 0 && "\n"}
            <span className={className} style={style}>{line}</span>
          </Fragment>
        );
      })}
    </div>
  );
}
