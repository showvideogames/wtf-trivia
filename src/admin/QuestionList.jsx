import { useEffect, useLayoutEffect, useRef, useState } from "react";
import Icon from "./Icon.jsx";
import { useStudio } from "./StudioContext.js";
import { MAX_QUESTIONS, MIN_QUESTIONS, hasText, mediaKind, missingSummary, questionGaps, questionKey } from "./questionStatus.js";

const MEDIA = {
  image: {icon:"image", label:"Image"},
  video: {icon:"video", label:"Video"},
  none: {icon:"noMedia", label:"No media"},
};

// A quiet "…" menu for the less common row actions. Delete keeps its
// confirmation (in AdminEditor); Move up/down reorder without dragging.
function RowMenu({label, items}){
  const[open,setOpen]=useState(false);
  const wrapRef=useRef(null);
  const btnRef=useRef(null);
  // Inside the scrolling list, a menu near its bottom opens upward instead of
  // being cut off.
  useLayoutEffect(()=>{
    if(!open) return;
    const wrap=wrapRef.current;
    const menu=wrap?.querySelector(".ps-menu");
    const box=wrap?.closest(".ps-qrows");
    if(!menu||!box) return;
    const below=box.getBoundingClientRect().bottom-wrap.getBoundingClientRect().bottom;
    const above=wrap.getBoundingClientRect().top-box.getBoundingClientRect().top;
    menu.classList.toggle("is-up", menu.offsetHeight+8>below && above>below);
  },[open]);
  useEffect(()=>{
    if(!open) return;
    const onDown=e=>{ if(!wrapRef.current?.contains(e.target)) setOpen(false); };
    const onKey=e=>{ if(e.key==="Escape"){ setOpen(false); btnRef.current?.focus(); } };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    wrapRef.current?.querySelector("[role=menuitem]:not([disabled])")?.focus();
    return ()=>{ document.removeEventListener("pointerdown", onDown); document.removeEventListener("keydown", onKey); };
  },[open]);
  const onMenuKey=e=>{
    if(e.key!=="ArrowDown"&&e.key!=="ArrowUp") return;
    e.preventDefault();
    const list=[...wrapRef.current.querySelectorAll("[role=menuitem]:not([disabled])")];
    const at=list.indexOf(document.activeElement);
    list[(at+(e.key==="ArrowDown"?1:-1)+list.length)%list.length]?.focus();
  };
  return(
    <div className="ps-menu-wrap" ref={wrapRef}>
      <button ref={btnRef} type="button" className="ps-icon-btn ps-menu-btn" aria-label={label} aria-haspopup="menu" aria-expanded={open} onClick={()=>setOpen(v=>!v)}>
        <Icon name="dots" size={20}/>
      </button>
      {open&&(
        <div className="ps-menu" role="menu" onKeyDown={onMenuKey}>
          {items.map(it=>(
            <button key={it.label} type="button" role="menuitem" className={`ps-menu-item${it.danger?" is-danger":""}`} disabled={it.disabled}
                    onClick={()=>{ setOpen(false); it.onSelect(); }}>
              <Icon name={it.icon} size={16}/>{it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function CategoryChip({letter, name, color}){
  return(
    <span className="ps-cat-chip" style={{"--cat":color.mid,"--cat-dark":color.dark}}>
      <Icon name="check" size={13}/>{name||`Category ${letter}`}
    </span>
  );
}

// How many rows sit wholly or partly below the list's visible part.
function rowsBelow(list){
  if(!list) return 0;
  const bottom=list.scrollTop+list.clientHeight;
  return [...list.children].filter(li=>li.offsetTop-list.offsetTop+li.offsetHeight>bottom+2).length;
}

export default function QuestionList({questions, catA, catB, colorA, colorB, selected, onSelect, onAdd, onMove, onDelete, onShuffle, onUndoShuffle, lock, onRestore}){
  const {youtubeEmbedUrl} = useStudio();
  const isYouTube = url=>Boolean(youtubeEmbedUrl(url));
  const[dragFrom,setDragFrom]=useState(null);
  const[dragOver,setDragOver]=useState(null);
  const count = questions.length;
  // lock: why questions can't be added, deleted or reordered (AdminEditor's
  // questionLock), or null. Every structural control here follows it: no
  // Add, Delete, drag, Move up/down or Shuffle. Opening a question to edit
  // its wording stays available.
  const locked = Boolean(lock);
  const countOk = count>=MIN_QUESTIONS && count<=MAX_QUESTIONS;

  // The list scrolls inside a viewport-sized box (studio.css), so "N more
  // below" says when questions are out of sight, and the selected row is
  // kept in view (Prev/Next, a shuffle) without moving the page.
  const listRef=useRef(null);
  const[below,setBelow]=useState(0);
  useEffect(()=>{
    const list=listRef.current;
    if(!list) return;
    const update=()=>setBelow(rowsBelow(list));
    update();
    list.addEventListener("scroll", update, {passive:true});
    const ro=typeof ResizeObserver==="undefined"?null:new ResizeObserver(update);
    ro?.observe(list);
    return ()=>{ list.removeEventListener("scroll", update); ro?.disconnect(); };
  },[questions]);
  useEffect(()=>{
    const list=listRef.current;
    const row=typeof selected==="number"?list?.children[selected]:null;
    if(!row||list.scrollHeight<=list.clientHeight) return;
    const top=row.offsetTop-list.offsetTop, end=top+row.offsetHeight;
    if(top<list.scrollTop) list.scrollTop=top-4;
    else if(end>list.scrollTop+list.clientHeight) list.scrollTop=end-list.clientHeight+4;
  },[selected, questions]);
  const showMore=()=>{
    const list=listRef.current;
    list?.scrollBy({top:list.clientHeight*0.8, behavior:window.matchMedia?.("(prefers-reduced-motion: reduce)").matches?"auto":"smooth"});
  };

  const startDrag=(e,i)=>{if(locked){e.preventDefault();return;}setDragFrom(i);setDragOver(null);e.dataTransfer.effectAllowed="move";e.dataTransfer.setData("text/plain",String(i));};
  const overDrag=(e,i)=>{e.preventDefault();if(i!==dragOver)setDragOver(i);};
  const dropDrag=(e,i)=>{
    e.preventDefault();
    if(locked){setDragFrom(null);setDragOver(null);return;}
    const raw=e.dataTransfer.getData("text/plain");
    const from=raw!==""&&!Number.isNaN(Number(raw))?Number(raw):dragFrom;
    if(from!=null) onMove(from,i);
    setDragFrom(null);setDragOver(null);
  };
  const endDrag=()=>{setDragFrom(null);setDragOver(null);};

  return(
    <section className="ps-panel ps-qlist" aria-labelledby="ps-qlist-title">
      <div className="ps-qlist-head">
        <h2 id="ps-qlist-title">Questions</h2>
        <div className="ps-qlist-actions">
          <button type="button" className="ps-btn ps-btn-sm ps-qlist-shuffle" onClick={onShuffle} disabled={count<2||locked}
                  title="Put every question in a new random order. Each question moves whole, with its answer, commentary and media.">
            <span aria-hidden="true">🎲</span>Shuffle Order
          </button>
          <button type="button" className="ps-btn ps-btn-primary ps-qlist-add" onClick={onAdd} disabled={locked}><Icon name="plus" size={18}/>Add question</button>
        </div>
      </div>
      <div className={`ps-count-rule${countOk?"":" is-bad"}`}>
        {countOk
          ? `${count} questions · within the ${MIN_QUESTIONS}–${MAX_QUESTIONS} needed to publish`
          : `${count} question${count===1?"":"s"} · publishing needs ${MIN_QUESTIONS}–${MAX_QUESTIONS}`}
      </div>
      {locked&&(
        <div className="ps-order-lock" role="status">
          <Icon name="warn" size={15}/>
          <span>{lock}</span>
          {onRestore&&<button type="button" className="ps-link-btn" onClick={onRestore}>Restore saved questions</button>}
        </div>
      )}
      {onUndoShuffle&&(
        <div className="ps-shuffle-bar">
          <span>New order shown, not saved yet.</span>
          <button type="button" className="ps-link-btn" onClick={onUndoShuffle}>Undo shuffle</button>
        </div>
      )}
      <ol className={`ps-qrows${below>0?" has-more":""}`} ref={listRef}>
        {questions.map((q,i)=>{
          const media = MEDIA[mediaKind(q.imageUrl, isYouTube)];
          const gaps = questionGaps(q, isYouTube);
          const isA = q.correctCategory!=="B";
          const on = selected===i;
          // Unfinished rows get a coloured edge: amber while anything is
          // missing, red when the item text is (saving refuses that).
          const blank = !hasText(q.itemText);
          const state = blank ? " is-blocking" : gaps.length ? " is-unfinished" : "";
          return(
            <li
              key={questionKey(q,i)}
              className={`ps-qrow${state}${on?" is-selected":""}${dragFrom===i?" is-dragging":""}${dragOver===i&&dragFrom!==i?" is-over":""}`}
              draggable={!locked}
              onDragStart={e=>startDrag(e,i)}
              onDragOver={e=>overDrag(e,i)}
              onDrop={e=>dropDrag(e,i)}
              onDragEnd={endDrag}
            >
              <span className={`ps-grip${locked?" is-off":""}`} title={locked?"Question order is locked":"Drag to reorder"} aria-hidden="true"><Icon name="grip" size={18}/></span>
              <button type="button" className="ps-qrow-main" aria-current={on?"true":undefined} onClick={()=>onSelect(i)}>
                <span className="ps-qnum" aria-hidden="true">{i+1}</span>
                <span className="ps-qrow-text">
                  <span className="ps-qrow-title"><span className="ps-sr">Question {i+1}: </span>{hasText(q.itemText)?q.itemText:<span className="ps-muted">No item text</span>}</span>
                  <span className="ps-qrow-meta">
                    <span className="ps-media-tag"><Icon name={media.icon} size={16}/>{media.label}</span>
                    <CategoryChip letter={isA?"A":"B"} name={isA?catA:catB} color={isA?colorA:colorB}/>
                    <span className={`ps-qrow-gaps${blank?" is-blocking":gaps.length?" is-missing":""}`}>
                      {gaps.length?<><Icon name="warn" size={14}/>{missingSummary(gaps)}{blank&&" · needed to save"}</>:"✓ Complete"}
                    </span>
                  </span>
                </span>
              </button>
              <RowMenu label={`More actions for question ${i+1}`} items={[
                {label:"Move up", icon:"up", disabled:locked||i===0, onSelect:()=>onMove(i,i-1)},
                {label:"Move down", icon:"down", disabled:locked||i===count-1, onSelect:()=>onMove(i,i+1)},
                {label:"Delete question", icon:"trash", danger:true, disabled:locked, onSelect:()=>onDelete(i)},
              ]}/>
            </li>
          );
        })}
      </ol>
      {below>0&&(
        <button type="button" className="ps-qmore" onClick={showMore}>
          <Icon name="down" size={16}/>{below} more question{below===1?"":"s"} below
        </button>
      )}
      {count===0&&(
        <div className="ps-empty">
          <span>No questions yet.</span>
          <button type="button" className="ps-link-btn" onClick={onAdd} disabled={locked}>Add the first one</button>
        </div>
      )}
    </section>
  );
}
