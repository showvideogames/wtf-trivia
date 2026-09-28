import { useEffect, useRef, useState } from "react";
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

export default function QuestionList({questions, catA, catB, colorA, colorB, selected, onSelect, onAdd, onMove, onDelete}){
  const {youtubeEmbedUrl} = useStudio();
  const isYouTube = url=>Boolean(youtubeEmbedUrl(url));
  const[dragFrom,setDragFrom]=useState(null);
  const[dragOver,setDragOver]=useState(null);
  const count = questions.length;
  const countOk = count>=MIN_QUESTIONS && count<=MAX_QUESTIONS;

  const startDrag=(e,i)=>{setDragFrom(i);setDragOver(null);e.dataTransfer.effectAllowed="move";e.dataTransfer.setData("text/plain",String(i));};
  const overDrag=(e,i)=>{e.preventDefault();if(i!==dragOver)setDragOver(i);};
  const dropDrag=(e,i)=>{
    e.preventDefault();
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
        <button type="button" className="ps-btn ps-btn-primary ps-qlist-add" onClick={onAdd}><Icon name="plus" size={18}/>Add question</button>
      </div>
      <div className={`ps-count-rule${countOk?"":" is-bad"}`}>
        {countOk
          ? `${count} questions · within the ${MIN_QUESTIONS}–${MAX_QUESTIONS} needed to publish`
          : `${count} question${count===1?"":"s"} · publishing needs ${MIN_QUESTIONS}–${MAX_QUESTIONS}`}
      </div>
      <ol className="ps-qrows">
        {questions.map((q,i)=>{
          const media = MEDIA[mediaKind(q.imageUrl, isYouTube)];
          const gaps = questionGaps(q, isYouTube);
          const isA = q.correctCategory!=="B";
          const on = selected===i;
          return(
            <li
              key={questionKey(q,i)}
              className={`ps-qrow${on?" is-selected":""}${dragFrom===i?" is-dragging":""}${dragOver===i&&dragFrom!==i?" is-over":""}`}
              draggable
              onDragStart={e=>startDrag(e,i)}
              onDragOver={e=>overDrag(e,i)}
              onDrop={e=>dropDrag(e,i)}
              onDragEnd={endDrag}
            >
              <span className="ps-grip" title="Drag to reorder" aria-hidden="true"><Icon name="grip" size={18}/></span>
              <button type="button" className="ps-qrow-main" aria-current={on?"true":undefined} onClick={()=>onSelect(i)}>
                <span className="ps-qnum" aria-hidden="true">{i+1}</span>
                <span className="ps-qrow-text">
                  <span className="ps-qrow-title"><span className="ps-sr">Question {i+1}: </span>{hasText(q.itemText)?q.itemText:<span className="ps-muted">No item text</span>}</span>
                  <span className="ps-qrow-meta">
                    <span className="ps-media-tag"><Icon name={media.icon} size={16}/>{media.label}</span>
                    <CategoryChip letter={isA?"A":"B"} name={isA?catA:catB} color={isA?colorA:colorB}/>
                  </span>
                  <span className={`ps-qrow-gaps${gaps.length?" is-missing":""}`}>
                    {gaps.length?missingSummary(gaps):"✓ Complete"}
                  </span>
                </span>
              </button>
              <RowMenu label={`More actions for question ${i+1}`} items={[
                {label:"Move up", icon:"up", disabled:i===0, onSelect:()=>onMove(i,i-1)},
                {label:"Move down", icon:"down", disabled:i===count-1, onSelect:()=>onMove(i,i+1)},
                {label:"Delete question", icon:"trash", danger:true, onSelect:()=>onDelete(i)},
              ]}/>
            </li>
          );
        })}
        {selected==="new"&&(
          <li className="ps-qrow is-selected is-new">
            <span className="ps-grip is-off" aria-hidden="true"><Icon name="grip" size={18}/></span>
            <span className="ps-qrow-main">
              <span className="ps-qnum" aria-hidden="true">{count+1}</span>
              <span className="ps-qrow-text">
                <span className="ps-qrow-title">New question</span>
                <span className="ps-qrow-gaps">Not added yet</span>
              </span>
            </span>
          </li>
        )}
      </ol>
      {count===0&&selected!=="new"&&(
        <div className="ps-empty">
          <span>No questions yet.</span>
          <button type="button" className="ps-link-btn" onClick={onAdd}>Add the first one</button>
        </div>
      )}
    </section>
  );
}
