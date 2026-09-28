import { useEffect, useRef, useState } from "react";
import Icon from "./Icon.jsx";
import { useStudio } from "./StudioContext.js";

// ============================================================
// IMAGE FIELD — upload a file or paste a link, with live preview
// ============================================================
// A chosen file is validated, oriented, resized and compressed in the
// browser (admin/imageOptimizer.js, loaded on first use) and uploaded
// straight away. The field only changes once the upload has succeeded, so a
// failure at any step leaves the current image exactly as it was.
//
// With an image already set, the field is a compact card (thumbnail,
// Replace, Remove). The full uploader opens only when there is no image or
// Replace is pressed, and closes again once a new image is in.
const UPLOAD_FOLDERS = {header:"headers", question:"questions", category:"categories"};
const UPLOAD_STAGE_COPY = {checking:"Checking image…", optimizing:"Optimizing image…", uploading:"Uploading…"};
const UPLOAD_ACCEPT = "image/jpeg,image/png,image/webp";
function roughBytes(n){return n<1024*1024?`${Math.max(1,Math.round(n/1024))} KB`:`${(n/1024/1024).toFixed(1)} MB`;}

export default function ImageField({value:rawValue, onChange, label, labelNote, preset="question", allowYouTube=false, onBusyChange, fieldId, layout="row"}){
  const {uploadBytes, isStoredImage, youtubeEmbedUrl, loadOptimizer} = useStudio();
  const value = typeof rawValue==="string" ? rawValue : "";
  const isUploadedValue = v=>Boolean(v) && (v.startsWith("data:") || v.startsWith("blob:") || isStoredImage(v));
  const[tab,setTab]=useState(value&&!isUploadedValue(value)?"url":"upload");
  const[urlDraft,setUrlDraft]=useState(value&&!isUploadedValue(value)?value:"");
  const[replacing,setReplacing]=useState(false);
  const[dragOver,setDragOver]=useState(false);
  const[stage,setStage]=useState(null); // null | "checking" | "optimizing" | "uploading"
  const[error,setError]=useState(null); // {message, retry}
  const[report,setReport]=useState(null); // what the last successful upload did, keyed by its URL
  const[pending,setPending]=useState(null); // {result, previewUrl} awaiting (re)upload
  const[brokenPreview,setBrokenPreview]=useState(null);
  const fileRef=useRef(null);
  const busyRef=useRef(false);
  const mountedRef=useRef(true);
  const pendingRef=useRef(null);
  const onBusyRef=useRef(onBusyChange);
  onBusyRef.current=onBusyChange;
  const busy=Boolean(stage);
  const youtubePreview = allowYouTube ? youtubeEmbedUrl(value) : null;

  useEffect(()=>{ onBusyRef.current?.(busy); },[busy]);
  useEffect(()=>{
    mountedRef.current=true;
    return ()=>{
      mountedRef.current=false;
      if(pendingRef.current) URL.revokeObjectURL(pendingRef.current.previewUrl);
      pendingRef.current=null;
      onBusyRef.current?.(false);
    };
  },[]);

  const replacePending=next=>{
    if(pendingRef.current && pendingRef.current!==next) URL.revokeObjectURL(pendingRef.current.previewUrl);
    pendingRef.current=next;
    setPending(next);
  };

  const upload=async job=>{
    busyRef.current=true;
    setError(null);
    setStage("uploading");
    try{
      const url = await uploadBytes(job.result.blob, job.result.mime, UPLOAD_FOLDERS[preset]||"images");
      if(!mountedRef.current) return;
      const r = job.result;
      setReport({url, summary:r.summary, note:r.note, reused:r.reused, hasAlpha:r.hasAlpha, orientationCorrected:r.orientationCorrected});
      replacePending(null);
      setReplacing(false);
      onChange(url);
    }catch(err){
      console.error(err);
      if(!mountedRef.current) return;
      setError({message:`Upload failed, so ${value?"your current image is unchanged":"nothing was saved"}. Check your connection and try again.`, retry:true});
    }finally{
      busyRef.current=false;
      if(mountedRef.current) setStage(null);
    }
  };

  const processFile=async f=>{
    if(!f||busyRef.current) return;
    busyRef.current=true;
    setError(null);
    setStage("checking");
    let result;
    try{
      const { optimizeImage } = await loadOptimizer();
      result = await optimizeImage(f, preset, {onStage:s=>{ if(mountedRef.current) setStage(s); }});
    }catch(err){
      busyRef.current=false;
      if(err?.name!=="ImageOptimizeError") console.error(err);
      if(!mountedRef.current) return;
      setStage(null);
      replacePending(null);
      setError({
        message: err?.name==="ImageOptimizeError"
          ? err.message
          : `Something went wrong while preparing that image, so ${value?"your current image is unchanged":"nothing was saved"}. Try again, or try a different file.`,
        retry:false
      });
      return;
    }
    if(!mountedRef.current) return;
    const job={result, previewUrl:URL.createObjectURL(result.blob)};
    replacePending(job);
    await upload(job);
  };

  const handleFile=e=>{
    const f=e.target.files?.[0];
    e.target.value=""; // lets the same file be chosen again after an error
    processFile(f);
  };
  // A dropped file goes through exactly the same checks as a chosen one.
  const handleDrop=e=>{
    e.preventDefault();
    setDragOver(false);
    if(busy) return;
    processFile(e.dataTransfer?.files?.[0]);
  };

  const retry=()=>{ if(pending&&!busyRef.current) upload(pending); };
  const dismissError=()=>{ setError(null); replacePending(null); };
  const chooseAnother=()=>{ setError(null); replacePending(null); setTab("upload"); setReplacing(true); fileRef.current?.click(); };

  const applyUrl=()=>{
    const v=urlDraft.trim();
    if(v===value) return;
    setReport(null);
    if(v) setReplacing(false);
    onChange(v);
  };

  const clear=()=>{
    if(busyRef.current) return;
    setReport(null);
    setError(null);
    setUrlDraft("");
    setReplacing(false);
    onChange("");
  };

  const startReplace=()=>{ setTab("upload"); setReplacing(true); };

  const showingPending = stage==="uploading" && pending;
  const stageText = stage==="uploading" && pending
    ? `Uploading ${roughBytes(pending.result.size)} ${pending.result.mime==="image/webp"?"WebP":pending.result.mime.split("/")[1].toUpperCase()}…`
    : UPLOAD_STAGE_COPY[stage];
  const shownReport = !busy && !error && report && report.url===value ? report : null;
  const showUploader = !busy && (!value || replacing);
  const kind = youtubePreview ? "YouTube video" : isUploadedValue(value) ? "Uploaded image" : "Linked image";
  const linkLabel = allowYouTube ? "YouTube or link" : "Image link";

  const thumb = src=>(
    youtubePreview&&!showingPending?(
      <iframe className="ps-media-video" src={youtubePreview} title="YouTube preview" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowFullScreen/>
    ):brokenPreview===src?(
      <div className="ps-media-broken">This image couldn't be loaded. Check the link, or upload the file instead.</div>
    ):(
      <img src={src} alt="" onError={()=>setBrokenPreview(src)}/>
    )
  );

  return(
    <div id={fieldId} className={`ps-media ps-media-${layout} ps-media-${preset}`}>
      {/* Always mounted, so "Choose another file" can open it from any state. */}
      <input ref={fileRef} type="file" accept={UPLOAD_ACCEPT} onChange={handleFile} disabled={busy} hidden/>
      {label&&<div className="ps-label">{label}{labelNote&&<span className="ps-label-note"> {labelNote}</span>}</div>}

      {busy&&(
        <div className="ps-media-card is-busy">
          <div className="ps-media-thumb">{showingPending?thumb(pending.previewUrl):value?thumb(value):<Icon name="image" size={28}/>}</div>
          <div className="ps-media-meta">
            <div className="ps-media-stage" role="status" aria-live="polite"><span className="ps-spinner" aria-hidden="true"/>{stageText}</div>
            {value&&<div className="ps-media-sub">The current image stays until the new one is uploaded.</div>}
          </div>
        </div>
      )}

      {!busy&&value&&!replacing&&(
        <div className="ps-media-card">
          <div className="ps-media-thumb">{thumb(value)}</div>
          <div className="ps-media-meta">
            <div className="ps-media-kind">{kind}</div>
            {shownReport&&(
              <div className="ps-media-report">
                <b>✓ Uploaded</b> · {shownReport.summary}
                {(shownReport.hasAlpha||shownReport.orientationCorrected)&&(
                  <div>{[shownReport.hasAlpha&&"Transparency kept",shownReport.orientationCorrected&&"Rotated upright from the photo's orientation tag"].filter(Boolean).join(" · ")}</div>
                )}
                {shownReport.note&&<div className="ps-media-note">{shownReport.note}</div>}
              </div>
            )}
            <div className="ps-media-actions">
              <button type="button" className="ps-btn ps-btn-sm" data-replace onClick={startReplace}><Icon name="upload" size={16}/>Replace</button>
              <button type="button" className="ps-btn ps-btn-sm ps-btn-danger" onClick={clear}><Icon name="trash" size={16}/>Remove</button>
            </div>
          </div>
        </div>
      )}

      {showUploader&&(
        <div className="ps-uploader">
          <div className="ps-seg" role="tablist" aria-label="Image source">
            <button type="button" role="tab" aria-selected={tab==="upload"} className={`ps-seg-btn${tab==="upload"?" on":""}`} data-tab-upload onClick={()=>setTab("upload")}><Icon name="upload" size={16}/>Upload</button>
            <button type="button" role="tab" aria-selected={tab==="url"} className={`ps-seg-btn${tab==="url"?" on":""}`} onClick={()=>setTab("url")}><Icon name={allowYouTube?"video":"link"} size={16}/>{linkLabel}</button>
          </div>

          {tab==="upload"&&(
            <div className={`ps-drop${dragOver?" is-over":""}`}
                 onDragOver={e=>{e.preventDefault();if(!dragOver)setDragOver(true);}}
                 onDragLeave={()=>setDragOver(false)}
                 onDrop={handleDrop}>
              <Icon name="image" size={26}/>
              <div className="ps-drop-title">Drag and drop an image here</div>
              <div className="ps-drop-hint">JPEG, PNG or WebP · Resized and compressed automatically</div>
              <button type="button" className="ps-btn ps-btn-sm ps-drop-choose" onClick={()=>fileRef.current?.click()}>Choose image</button>
            </div>
          )}

          {tab==="url"&&(
            <div className="ps-url">
              <input
                className="ps-input"
                value={urlDraft}
                aria-label={linkLabel}
                placeholder={allowYouTube?"Paste an image URL or YouTube link":"https://example.com/image.jpg"}
                onChange={e=>setUrlDraft(e.target.value)}
                onBlur={applyUrl}
                onKeyDown={e=>e.key==="Enter"&&applyUrl()}
              />
              <div className="ps-hint">{allowYouTube?"Supports youtube.com, youtu.be, Shorts and timestamp links. Press Enter to use it.":"Press Enter or click away to use it."}</div>
            </div>
          )}

          {value&&replacing&&(
            <div className="ps-uploader-foot">
              <button type="button" className="ps-link-btn" onClick={()=>setReplacing(false)}>Keep the current image</button>
            </div>
          )}
        </div>
      )}

      {error&&(
        <div className="ps-alert is-error ps-media-error" role="alert">
          <div>{error.message}</div>
          <div className="ps-alert-actions">
            {error.retry&&pending&&<button type="button" className="ps-btn ps-btn-sm ps-btn-primary" onClick={retry}>Try again</button>}
            <button type="button" className="ps-btn ps-btn-sm" onClick={chooseAnother}>Choose another file</button>
            <button type="button" className="ps-btn ps-btn-sm ps-btn-quiet" onClick={dismissError}>Dismiss</button>
          </div>
        </div>
      )}
    </div>
  );
}
