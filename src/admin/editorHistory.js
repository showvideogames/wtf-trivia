// Leaving the editor safely: the browser's Back and Forward, and what a
// departure would lose.
import { useCallback, useEffect, useRef, useState } from "react";

// While the editor is open it keeps one history entry of its own, marked with
// a token for this mount, on top of the admin's. Browser Back then lands on
// the entry below, still in the editor, and onBrowserBack decides: stay
// (call the hold it is given, which puts the entry back) or go. Leaving
// through the app calls release, so no dead Back press is left behind.
// StrictMode's double effect holds once: the second finds the entry there.
//
// The address and state are the ones the editor opened with, never whatever
// the browser landed on: a jump of several entries (history.go, the history
// dropdown) can land on another page, and hold must bring back this one. The
// entry below is then that other page, so release can't step back onto it
// (the app would follow, to the wrong place): it turns this entry into a
// plain admin entry instead.
//
// The browser's own scroll restoring stays off meanwhile: the editor puts the
// page back itself after Preview, and a held Back must not move the page
// behind a dialog. The setting belongs to each history entry and a pushed
// entry copies it, so hold sets it before pushing: Back lands on the entry
// below, and that is the one that has to be manual.
export function useBrowserBackGuard(onBrowserBack){
  const[token]=useState(()=>`${Date.now()}-${Math.random().toString(36).slice(2)}`);
  const[home]=useState(()=>({href:window.location.href, state:window.history.state, scroll:window.history.scrollRestoration}));
  const latest=useRef(onBrowserBack);
  const releasing=useRef(false);
  const displaced=useRef(false); // the entry below this one isn't the admin's
  useEffect(()=>{ latest.current=onBrowserBack; });
  const hold=useCallback(()=>{
    if(window.history.state?.wtfEditor===token) return;
    displaced.current=window.location.href!==home.href;
    window.history.scrollRestoration="manual";
    window.history.pushState({...home.state, wtfEditor:token}, "", home.href);
  },[token,home]);
  const release=useCallback(()=>{
    if(window.history.state?.wtfEditor!==token) return;
    if(displaced.current){ window.history.replaceState(home.state, "", home.href); return; }
    releasing.current=true;
    window.history.back();
  },[token,home]);
  useEffect(()=>{
    const onPop=()=>{
      if(window.history.state?.wtfEditor===token) return;
      if(releasing.current){ releasing.current=false; return; }
      latest.current(hold);
    };
    hold();
    window.addEventListener("popstate",onPop);
    return ()=>window.removeEventListener("popstate",onPop);
  },[token,hold]);
  useEffect(()=>{
    window.history.scrollRestoration="manual";
    return ()=>{ window.history.scrollRestoration=home.scroll; };
  },[home]);
  return {hold, release};
}

// What browser Back does in the editor, first match wins. Everything but
// "exit" stays here. phoneQuestion: a question open in place of the list.
export function browserBackAction({preview, dialogOpen, phoneQuestion, saving, risk}){
  if(preview) return "preview";
  if(dialogOpen) return "dialog";
  if(phoneQuestion) return "list";
  if(saving) return "saving";
  if(risk) return "ask";
  return "exit";
}

// What leaving now would lose, or null. Edits are only at risk where no copy
// survives: a published puzzle (never kept on the device), a puzzle never
// saved to the database, or a draft the device couldn't store. An upload in
// progress is lost wherever it was going; it's named here only if nothing
// else is, and leaveCopy adds it to the others.
export function leaveRisk({dirty, published, inDb, autoSaveState, imagesBusy}){
  if(dirty&&published) return "published";
  if(dirty&&!inDb) return "new";
  if(dirty&&autoSaveState==="failed") return "device";
  return imagesBusy ? "upload" : null;
}

const LOSE_CHANGES = "Leave and lose changes";
const LEAVE_COPY = {
  upload: {title:"Leave while an image uploads?", lines:["An image is still uploading. If you leave now, it won't be kept."], confirmLabel:"Leave and lose image"},
  published: {title:"Leave without publishing?", lines:["Your changes to this live puzzle will be lost."], confirmLabel:LOSE_CHANGES},
  new: {title:"Leave without saving?", lines:["This new puzzle hasn't been saved yet, so it will be lost."], confirmLabel:LOSE_CHANGES},
  device: {title:"Leave without saving?", lines:["Your changes couldn't be kept on this device, so they will be lost."], confirmLabel:LOSE_CHANGES},
};

export function leaveCopy(risk, imagesBusy=false){
  const copy = LEAVE_COPY[risk];
  if(!imagesBusy||risk==="upload") return copy;
  return {...copy, lines:[...copy.lines, "An image is also still uploading, and it won't be kept either."]};
}
