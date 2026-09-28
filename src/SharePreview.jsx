import { Fragment } from "react";

// Results' on-screen share preview: the share text itself, exactly as it is
// copied and shared (see share.js), never a separately assembled copy. Each
// line is a span joined by the text's own newlines inside a pre-wrap box,
// so spacing such as the indented OR shows as it will be sent, and the
// preview's text content is the share string character for character.
// Only the look is added: long labels may wrap, and the dividers and the
// circle row shrink to fit the box instead of wrapping.
const LINE_CLASS = [
  "rs-share-header",
  "rs-share-divider",
  "rs-share-name",
  "rs-share-or",
  "rs-share-name",
  "rs-share-divider",
  "rs-share-pips",
  "rs-share-score",
  "rs-share-url",
];

// Widths per character, in ems, generous enough for the widest common font:
// ~1.42em per circle covers Segoe UI Emoji (~1.37em), and 1.05em per heavy
// line covers fonts that draw it full-width.
const FIT_EMS = { "rs-share-divider": 1.05, "rs-share-pips": 1.42 };

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
