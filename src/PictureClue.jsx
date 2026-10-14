import { useEffect, useState } from "react";
import { getImageStatus, preloadImage } from "./mediaPreloader.js";
import { pictureAlt, questionPicture } from "./pictureQuiz.js";
import "./pictureQuiz.css";

// How long a picture may keep loading before the frame says so and offers
// Retry (answering stays off either way until the picture is up).
export const PICTURE_SLOW_MS = 8000;

// Tracks one picture's status through the shared preloader cache (so a
// picture GameScreen already warmed paints at once): "none" | "pending" |
// "loaded" | "error". `attempt` restarts a load (Retry), straight from the
// network rather than the cached result.
function usePictureStatus(src, attempt){
  const[state,setState]=useState(()=>({src, attempt, status:src ? (preloadImage(src), getImageStatus(src)) : "none"}));
  const current = state.src===src && state.attempt===attempt ? state.status : src ? "pending" : "none";
  const settle = status=>setState(s=>s.src===src&&s.attempt===attempt&&s.status===status ? s : {src, attempt, status});
  useEffect(()=>{
    if(!src) return;
    let live = true;
    const done = status=>{ if(live) setState(s=>s.src===src&&s.attempt===attempt&&s.status===status ? s : {src, attempt, status}); };
    if(attempt===0){
      preloadImage(src).then(done);
    }else{
      const img = new Image();
      img.onload = ()=>done("loaded");
      img.onerror = ()=>done("error");
      img.src = src;
    }
    return ()=>{ live = false; };
  },[src, attempt]);
  return [current, settle];
}

const MESSAGES = {
  none: "This question has no picture yet.",
  error: "The picture didn’t load.",
  slow: "The picture is still loading.",
};

// A picture quiz's question: the picture in a fixed frame that fills the
// room between the progress and the answer buttons, so its size never
// depends on the picture or on whether it has loaded, and the buttons never
// move. The whole picture is shown (contained): portrait, square and
// landscape pictures all keep their own shape inside the same frame.
//
// The answer's name is never shown here, in any state: no caption, no
// tooltip, and the alt text is the question's neutral description. Until
// the picture is up, onReady(false) tells GameScreen to hold the answer
// buttons; a picture that fails or stalls says so in the frame with Retry,
// and the question simply waits (nothing is scored, nothing advances).
export default function PictureClue({question, onReady}){
  const src = questionPicture(question);
  const[attempt,setAttempt]=useState(0);
  const[status,settle] = usePictureStatus(src, attempt);
  const[slowFor,setSlowFor]=useState(null);
  const key = `${src}#${attempt}`;
  useEffect(()=>{
    if(status!=="pending") return;
    const id = setTimeout(()=>setSlowFor(key), PICTURE_SLOW_MS);
    return ()=>clearTimeout(id);
  },[status, key]);
  const shown = status==="pending" && slowFor===key ? "slow" : status;
  useEffect(()=>{ onReady?.(status==="loaded"); },[status, onReady]);
  const retry = ()=>{ setSlowFor(null); setAttempt(n=>n+1); };
  return(
    <figure className={`gp-pic is-${shown}`}>
      {status==="loaded"&&(
        <img className="gp-pic-img" src={src} alt={pictureAlt(question)} draggable="false" onError={()=>settle("error")}/>
      )}
      {status==="pending"&&<div className="gp-pic-loading" aria-hidden="true"/>}
      <div className="gp-pic-status" role="status" aria-live="polite">
        {status==="pending"&&shown!=="slow"&&<span className="gp-sr">Loading the picture…</span>}
        {MESSAGES[shown]&&(
          <div className="gp-pic-problem">
            <span className="gp-pic-note">{MESSAGES[shown]}</span>
            {src&&<button type="button" className="gp-pic-retry" onClick={retry}>Retry</button>}
            <span className="gp-pic-hint">{src ? "You can answer once it’s showing." : "Answering opens once it has one."}</span>
          </div>
        )}
      </div>
    </figure>
  );
}
