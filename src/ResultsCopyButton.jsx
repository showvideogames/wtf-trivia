// Results' copy button and its feedback, like Home's Share: status is what
// copyText (homeShare.js) resolved to. "copied" flips the label for a moment
// and is announced; "failed" keeps the normal label and shows an error that
// stays until the next press; null is the resting state.
export default function ResultsCopyButton({ status, onCopy }) {
  return (
    <>
      <button className="btn btn-pink rs-share-btn" onClick={onCopy}>
        {status === "copied" ? "✓ Copied to clipboard!!" : "Copy & Share 📋"}
      </button>
      <span className="hp-sr-only" role="status">{status === "copied" ? "Result copied to clipboard" : ""}</span>
      {status === "failed" && (
        <p className="rs-share-error" role="alert">
          Couldn&rsquo;t copy your result. Select the share text below and copy it yourself.
        </p>
      )}
    </>
  );
}
