import { useLayoutEffect, useRef } from "react";
import Icon from "./Icon.jsx";

// The save status beside the puzzle title. `tone` is one of
// saving | saved | dirty | error | idle, and the text always describes what
// the database actually has (see saveStatus in App.jsx).
function SaveStatus({status}){
  return(
    <div className={`ps-status is-${status.tone}`} role="status" aria-live="polite">
      {status.tone==="saving"?<span className="ps-spinner" aria-hidden="true"/>
        :status.tone==="saved"?<Icon name="check" size={16}/>
        :status.tone==="error"?<Icon name="warn" size={16}/>
        :<span className="ps-status-dot" aria-hidden="true"/>}
      <span className="ps-status-text">{status.text}</span>
      {status.detail&&<span className="ps-status-detail">· {status.detail}</span>}
    </div>
  );
}

// Save draft (drafts; "Save" for a retired puzzle, which stays retired),
// Publish / Publish changes. Both run the editor's existing save path;
// Publish stays pressable when the puzzle isn't ready so it can say why.
// writable false (no admin account): both are off until access is back.
export function EditorActions({published, retired=false, saving, imagesBusy, canPublish, writable=true, onSaveDraft, onPublish, onPreview}){
  const held = saving||imagesBusy||!writable;
  const locked = writable ? undefined : "Needs a signed-in admin account";
  return(
    <div className="ps-actions">
      <button type="button" className="ps-btn" onClick={onPreview}><Icon name="eye" size={18}/>Preview</button>
      {!published&&(
        <button type="button" className="ps-btn" onClick={onSaveDraft} disabled={held} aria-busy={(saving||imagesBusy)||undefined} title={locked}>
          {imagesBusy?"Uploading image…":retired?"Save":"Save draft"}
        </button>
      )}
      <button type="button" className={`ps-btn ps-btn-publish${canPublish?"":" is-unready"}`} onClick={onPublish} disabled={held} aria-busy={(saving||imagesBusy)||undefined} title={locked}>
        {saving?"Saving…":published?"Publish changes":"Publish"}
      </button>
    </div>
  );
}

// Progress, success, info and errors from Save/Publish/Delete. Success and
// info clear themselves (see AdminEditor); errors stay until dismissed.
export function NoticeBar({notice, onDismiss}){
  if(!notice) return null;
  return(
    <div className={`ps-notice is-${notice.kind}`} role={notice.kind==="error"?"alert":"status"}>
      {notice.kind==="progress"&&<span className="ps-spinner" aria-hidden="true"/>}
      <span className="ps-notice-text">{notice.text}</span>
      {notice.kind!=="progress"&&(
        <button type="button" className="ps-icon-btn" aria-label="Dismiss message" onClick={onDismiss}><Icon name="x" size={16}/></button>
      )}
    </div>
  );
}

export function EditorHeader({heading, title, headerImage, status, onBack, actions, notice}){
  // Publishes the header's height as --ps-head-h, so the sticky question list
  // always starts just below it, message bar or not.
  const ref=useRef(null);
  useLayoutEffect(()=>{
    const el=ref.current;
    const shell=el?.parentElement;
    if(!el||!shell||typeof ResizeObserver==="undefined") return;
    const ro=new ResizeObserver(()=>shell.style.setProperty("--ps-head-h", `${el.offsetHeight}px`));
    ro.observe(el);
    return ()=>ro.disconnect();
  },[]);
  return(
    <header className="ps-editor-head" ref={ref}>
      <div className="ps-editor-head-row">
        <button type="button" className="ps-btn ps-back" onClick={onBack}><Icon name="back" size={18}/>Back</button>
        <span className="ps-head-divider" aria-hidden="true"/>
        <h1 className="ps-head-heading">{heading}</h1>
        <div className="ps-head-puzzle">
          {headerImage&&<img className="ps-head-thumb" src={headerImage} alt="" onError={e=>{e.currentTarget.style.display="none";}}/>}
          <div className="ps-head-puzzle-text">
            <div className="ps-head-title">{title}</div>
            <SaveStatus status={status}/>
          </div>
        </div>
        <div className="ps-head-actions">{actions}</div>
      </div>
      {notice&&<div className="ps-head-notice">{notice}</div>}
    </header>
  );
}

// Phones: the same actions and messages, pinned to the bottom of the screen.
export function MobileActionBar({actions, notice}){
  // Publishes the bar's full height (safe-area padding included) as
  // --ps-bar-h, so the page always scrolls clear of it, message or not.
  const ref=useRef(null);
  useLayoutEffect(()=>{
    const el=ref.current;
    const shell=el?.parentElement;
    if(!el||!shell||typeof ResizeObserver==="undefined") return;
    const ro=new ResizeObserver(()=>{
      if(el.offsetHeight) shell.style.setProperty("--ps-bar-h", `${el.offsetHeight}px`);
      else shell.style.removeProperty("--ps-bar-h");
    });
    ro.observe(el);
    return ()=>ro.disconnect();
  },[]);
  return(
    <div className="ps-mobile-bar" ref={ref}>
      {notice}
      {actions}
    </div>
  );
}

export function EditorTabs({tab, onTab, questionsLabel}){
  const tabs = [
    {id:"setup", label:"Setup", icon:"pencil"},
    {id:"questions", label:questionsLabel, icon:"list"},
  ];
  const onKey=e=>{
    if(e.key!=="ArrowRight"&&e.key!=="ArrowLeft") return;
    e.preventDefault();
    const next = tab==="setup"?"questions":"setup";
    onTab(next);
    document.getElementById(`ps-tab-${next}`)?.focus();
  };
  return(
    <div className="ps-tabs" role="tablist" aria-label="Editor sections" onKeyDown={onKey}>
      {tabs.map(t=>(
        <button
          key={t.id}
          id={`ps-tab-${t.id}`}
          type="button"
          role="tab"
          aria-selected={tab===t.id}
          aria-controls={`ps-panel-${t.id}`}
          tabIndex={tab===t.id?0:-1}
          className={`ps-tab${tab===t.id?" on":""}`}
          onClick={()=>onTab(t.id)}
        >
          <Icon name={t.icon} size={18}/>{t.label}
        </button>
      ))}
    </div>
  );
}
