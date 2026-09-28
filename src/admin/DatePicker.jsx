import { useEffect, useRef, useState } from "react";
import Icon from "./Icon.jsx";
import { formatAdminDate, formatLongDate, isoFromLocalDate, localDateFromISO, parseAdminDate } from "./adminDates.js";

// The puzzle's day as one compact row. "Change date" opens the calendar
// below it (occupied days, this puzzle's day, Today, typed MM/DD/YYYY); it
// closes again once a day is picked. A puzzle with no date starts open.
export default function DatePicker({value,onChange,games,currentGameId}){
  const selectedDate = localDateFromISO(value) || new Date();
  const[month,setMonth]=useState(()=>new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1));
  const[draft,setDraft]=useState(()=>formatAdminDate(value));
  const[open,setOpen]=useState(()=>!value);
  const occupied = new Map();
  (games||[]).forEach(g=>{
    if(g?.date) occupied.set(g.date,g);
  });
  const conflict = value ? occupied.get(value) : null;
  const hasConflict = Boolean(conflict && conflict.id!==currentGameId);
  const ownDate = Boolean(conflict && conflict.id===currentGameId);
  const monthTitle = month.toLocaleDateString("en-US",{month:"long",year:"numeric"});
  const firstDay = new Date(month.getFullYear(), month.getMonth(), 1);
  const daysInMonth = new Date(month.getFullYear(), month.getMonth()+1, 0).getDate();
  const blanks = Array.from({length:firstDay.getDay()},(_,i)=>({empty:true,key:`b-${i}`}));
  const days = Array.from({length:daysInMonth},(_,idx)=>{
    const day = idx+1;
    const date = new Date(month.getFullYear(), month.getMonth(), day);
    const iso = isoFromLocalDate(date);
    const game = occupied.get(iso);
    return {day,iso,game};
  });
  const cells = [...blanks,...days];
  const shiftMonth = delta => setMonth(m=>new Date(m.getFullYear(), m.getMonth()+delta, 1));
  const chooseDate = iso => {
    const game = occupied.get(iso);
    if(game && game.id!==currentGameId) return;
    onChange(iso);
    setDraft(formatAdminDate(iso));
    setOpen(false);
  };
  const applyDraft = () => {
    const parsed = parseAdminDate(draft);
    if(parsed){
      onChange(parsed);
      setDraft(formatAdminDate(parsed));
      const parsedDate = localDateFromISO(parsed);
      if(parsedDate) setMonth(new Date(parsedDate.getFullYear(), parsedDate.getMonth(), 1));
    }else if(!draft.trim()){
      onChange("");
    }else{
      setDraft(formatAdminDate(value));
    }
  };
  // Keeps the typed field and the shown month in step with the value.
  const[seenValue,setSeenValue]=useState(value);
  if(seenValue!==value){
    setSeenValue(value);
    setDraft(formatAdminDate(value));
    const date = localDateFromISO(value);
    if(date) setMonth(new Date(date.getFullYear(), date.getMonth(), 1));
  }

  // Escape or a click outside closes the calendar (it floats over the page
  // on wide screens).
  const wrapRef=useRef(null);
  useEffect(()=>{
    if(!open) return;
    const onDown=e=>{ if(!wrapRef.current?.contains(e.target)) setOpen(false); };
    const onKey=e=>{ if(e.key==="Escape") setOpen(false); };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return ()=>{ document.removeEventListener("pointerdown", onDown); document.removeEventListener("keydown", onKey); };
  },[open]);

  return(
    <div className="ps-date" ref={wrapRef}>
      <div className="ps-label" id="ps-date-label">Puzzle date</div>
      <div className="ps-date-row">
        <div className={`ps-date-value${value?"":" is-empty"}`} aria-labelledby="ps-date-label">
          <Icon name="calendar" size={20}/>
          <span>{value?formatLongDate(value):"No date picked yet"}</span>
        </div>
        <button type="button" className="ps-btn" aria-expanded={open} aria-controls="ps-calendar" onClick={()=>setOpen(v=>!v)}>
          {open?"Close calendar":value?"Change date":"Pick date"}
        </button>
      </div>
      {hasConflict&&(
        <div className="ps-date-note is-bad" role="alert">
          {formatAdminDate(value)} already has "{conflict.themeTitle||"another puzzle"}". Pick a different day.
        </div>
      )}
      {!hasConflict&&value&&(
        <div className={`ps-date-note${ownDate?" is-good":""}`}>
          {ownDate?"This is this puzzle's current day.":"This day is available."}
        </div>
      )}
      {open&&(
        <div className="ps-calendar" id="ps-calendar">
          <div className="ps-cal-type">
            <label htmlFor="ps-date-typed">Type a date</label>
            <input
              id="ps-date-typed"
              className="ps-input"
              value={draft}
              placeholder="MM/DD/YYYY"
              onChange={e=>setDraft(e.target.value)}
              onBlur={applyDraft}
              onKeyDown={e=>e.key==="Enter"&&applyDraft()}
            />
          </div>
          <div className="ps-cal-head">
            <div className="ps-cal-title">{monthTitle}</div>
            <div className="ps-cal-nav">
              <button type="button" aria-label="Previous month" onClick={()=>shiftMonth(-1)}><Icon name="prev" size={16}/></button>
              <button type="button" onClick={()=>setMonth(new Date())}>Today</button>
              <button type="button" aria-label="Next month" onClick={()=>shiftMonth(1)}><Icon name="next" size={16}/></button>
            </div>
          </div>
          <div className="ps-cal-grid">
            {["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map(d=><div key={d} className="ps-cal-dow">{d}</div>)}
            {cells.map(cell=>{
              if(cell.empty) return <div key={cell.key} className="ps-cal-day is-empty"/>;
              const cellGame = cell.game;
              const isOwn = cellGame?.id===currentGameId;
              const isUsed = Boolean(cellGame && !isOwn);
              const selected = cell.iso===value;
              const cls = `ps-cal-day${selected?" is-selected":""}${isUsed?" is-used":""}${isOwn?" is-own":""}`;
              return(
                <button
                  type="button"
                  key={cell.iso}
                  className={cls}
                  onClick={()=>chooseDate(cell.iso)}
                  aria-pressed={selected}
                  aria-disabled={isUsed||undefined}
                  title={cellGame?`${formatAdminDate(cell.iso)}: ${cellGame.themeTitle}`:formatAdminDate(cell.iso)}
                >
                  <span>{cell.day}</span>
                  {cellGame&&<span className="ps-cal-status">{isOwn?"This":cellGame.status||"Used"}</span>}
                </button>
              );
            })}
          </div>
          <div className="ps-cal-legend">
            <span><span className="ps-cal-dot is-used"/>Day already has a puzzle</span>
            <span><span className="ps-cal-dot is-own"/>This puzzle's day</span>
          </div>
        </div>
      )}
    </div>
  );
}
