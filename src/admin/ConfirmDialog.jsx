import { useEffect, useId, useRef } from "react";

// A modal "are you sure?" for actions that can't be taken back (Delete and
// Retire puzzle, correcting a played answer). Opening it does nothing by itself: only the confirm button
// acts. Focus starts on Cancel, so an Enter still held or repeating from the
// button that opened it can only cancel; and the confirm button ignores a
// keyboard press that didn't start on it (a keyboard click has detail 0).
// Escape, the backdrop and Cancel all close it without acting, and focus goes
// back to where it was. tone "primary" is for a confirm that isn't
// destructive (correcting an answer); the default is the red danger button.
export default function ConfirmDialog({title, children, confirmLabel, onConfirm, onCancel, tone="danger"}){
  const titleId = useId();
  const bodyId = useId();
  const boxRef = useRef(null);
  const cancelRef = useRef(null);
  const armedRef = useRef(false);
  useEffect(()=>{
    const back = document.activeElement;
    cancelRef.current?.focus();
    return ()=>{ if(back?.isConnected) back.focus?.(); };
  },[]);
  const onKeyDown = e=>{
    if(e.key==="Escape"){ e.preventDefault(); onCancel(); return; }
    if(e.key!=="Tab") return;
    // Keep Tab inside the dialog.
    const items = [...boxRef.current.querySelectorAll("button:not([disabled])")];
    const at = items.indexOf(document.activeElement);
    const next = e.shiftKey ? (at<=0 ? items.length-1 : at-1) : (at===items.length-1 ? 0 : at+1);
    e.preventDefault();
    items[next]?.focus();
  };
  const confirm = e=>{
    if(e.detail===0 && !armedRef.current) return;
    armedRef.current = false;
    onConfirm();
  };
  return(
    <div className="ps-dialog-backdrop" onPointerDown={e=>{ if(e.target===e.currentTarget) onCancel(); }}>
      <div className="ps-dialog" ref={boxRef} role="alertdialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={bodyId} onKeyDown={onKeyDown}>
        <h2 id={titleId} className="ps-dialog-title">{title}</h2>
        <div id={bodyId} className="ps-dialog-body">{children}</div>
        <div className="ps-dialog-actions">
          <button type="button" ref={cancelRef} className="ps-btn" onClick={onCancel}>Cancel</button>
          <button type="button" className={`ps-btn ${tone==="primary"?"ps-btn-primary":"ps-btn-danger-solid"}`} data-confirm
                  onKeyDown={e=>{ if((e.key==="Enter"||e.key===" ")&&!e.repeat) armedRef.current = true; }}
                  onBlur={()=>{ armedRef.current = false; }}
                  onClick={confirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
