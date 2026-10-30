import Icon from "./Icon.jsx";
import ImageField from "./ImageField.jsx";
import { useStudio } from "./StudioContext.js";
import { hasText, missingSummary, questionGaps } from "./questionStatus.js";
import { descriptionNamesAnswer, questionPicture } from "../pictureQuiz.js";

// Labels only: the saved fields stay explanationCopy and flavorCopy, and the
// player still sees them as "Actual info" and "Needless commentary".
function AnswerCard({letter, name, color, on, onPick}){
  return(
    <button type="button" role="radio" aria-checked={on} className={`ps-answer${on?" on":""}`}
            style={{"--cat":color.mid,"--cat-dark":color.dark,"--cat-light":color.light}} onClick={onPick}>
      <span className="ps-answer-letter" aria-hidden="true">{letter}</span>
      <span className="ps-answer-name">{name||`Category ${letter}`}</span>
      <span className="ps-answer-check" aria-hidden="true">{on&&<Icon name="check" size={16}/>}</span>
    </button>
  );
}

// A picture quiz's own fields: the picture players identify, a neutral
// description of it, and the answer name, shown only after the guess. The
// picture's thumbnail is framed as players get it (layout "picture"): the
// whole picture, contained in a frame of the gameplay frame's rough shape.
function PictureFields({q, fresh, onChange, onBusyChange, fieldId}){
  const picture = questionPicture(q);
  const blankItem = !hasText(q.itemText);
  const blankAlt = !hasText(q.questionImageAlt);
  const namesAnswer = descriptionNamesAnswer(q);
  return(
    <>
      <div className="ps-pq-field">
        <ImageField label={<>Question picture <span className="ps-req" aria-hidden="true">*</span></>} labelNote="(players see this instead of the name)"
                    value={q.questionImage||""} onChange={v=>onChange({questionImage:v})} preset="question" allowLink={false}
                    onBusyChange={onBusyChange} fieldId={fieldId} layout="picture"/>
        {picture
          ? <div className="ps-hint">Players see the whole picture like this, never cropped or stretched, above the two answer buttons.</div>
          : <div className="ps-hint ps-pq-need">Needed before this picture quiz can be published. Drafts can be saved without it.</div>}
      </div>
      <div className="ps-grid-2">
        <div className="ps-field">
          <label className="ps-label" htmlFor="ps-q-pic-alt">Picture description <span className="ps-label-note">(for screen readers)</span></label>
          <input id="ps-q-pic-alt" className="ps-input" value={q.questionImageAlt||""} placeholder="e.g. Cartoon mascot with a baseball for a head"
                 aria-invalid={namesAnswer||undefined} aria-describedby="ps-q-pic-alt-note" onChange={e=>onChange({questionImageAlt:e.target.value})}/>
          {namesAnswer
            ? <div className="ps-field-warn" id="ps-q-pic-alt-note"><Icon name="warn" size={15}/>This names the answer, so screen readers would hear it before the guess. Describe what the picture shows instead.</div>
            : <div className="ps-hint" id="ps-q-pic-alt-note">Describe what&rsquo;s shown without naming the answer.{blankAlt&&" Blank reads as “Picture clue”."}</div>}
        </div>
        <div className="ps-field">
          <label className="ps-label" htmlFor="ps-q-item">Answer name <span className="ps-req" aria-hidden="true">*</span></label>
          <input id="ps-q-item" className="ps-input" value={q.itemText||""} placeholder="e.g. Mr. Met" aria-required="true"
                 aria-invalid={blankItem&&!fresh||undefined} aria-describedby="ps-q-item-note" onChange={e=>onChange({itemText:e.target.value})}/>
          {blankItem&&!fresh
            ? <div className="ps-field-error" id="ps-q-item-note">The answer name is required before the puzzle can be saved.</div>
            : <div className="ps-hint" id="ps-q-item-note">Shown to players only after they answer. Also names this question in the list.</div>}
        </div>
      </div>
    </>
  );
}

// Edits one question in place: every change goes straight into the puzzle
// (and its on-device draft), so there is no separate Update step. A question
// Add question just appended (fresh) shows its blank item text as a to-do
// rather than an error; saving still refuses blank item text.
// picture: the puzzle is a picture quiz, so the question's picture leads and
// its item text is the answer name.
export default function QuestionEditor({question:q, number, fresh, picture=false, catA, catB, colorA, colorB, onChange, onBusyChange, fieldId,
                                        pictureFieldId, onPictureBusyChange, onPrev, onNext, onBackToList}){
  const {youtubeEmbedUrl} = useStudio();
  const isYouTube = url=>Boolean(youtubeEmbedUrl(url));
  const gaps = questionGaps(q, isYouTube, {picture});
  const media = q.imageUrl||"";
  const video = isYouTube(media);
  const blankItem = !hasText(q.itemText);
  const itemWord = picture ? "answer name" : "item text";

  return(
    <section className="ps-panel ps-qeditor" aria-labelledby="ps-qeditor-title">
      <button type="button" className="ps-link-btn ps-qeditor-back" onClick={onBackToList}><Icon name="back" size={16}/>All questions</button>
      <div className="ps-qeditor-head">
        <h2 id="ps-qeditor-title">{`Question ${number}`}<span className="ps-qeditor-dot" aria-hidden="true"> · </span><span className={`ps-qeditor-item${blankItem?" ps-muted":""}`}>{blankItem?`No ${itemWord} yet`:q.itemText}</span></h2>
        <span className={`ps-complete${gaps.length?" is-missing":""}`}>
          {gaps.length?<><Icon name="warn" size={16}/>{missingSummary(gaps)}</>:<><Icon name="check" size={16}/>Complete</>}
        </span>
      </div>

      {picture&&<PictureFields q={q} fresh={fresh} onChange={onChange} onBusyChange={onPictureBusyChange} fieldId={pictureFieldId}/>}

      <div className="ps-grid-2">
        {!picture&&(
          <div className="ps-field ps-span-2">
            <label className="ps-label" htmlFor="ps-q-item">Item text <span className="ps-req" aria-hidden="true">*</span></label>
            <input id="ps-q-item" className="ps-input" value={q.itemText||""} placeholder="e.g. Jumanji" aria-required="true"
                   aria-invalid={blankItem&&!fresh||undefined} aria-describedby={blankItem?"ps-q-item-note":undefined} onChange={e=>onChange({itemText:e.target.value})}/>
            {blankItem&&(fresh
              ? <div className="ps-hint" id="ps-q-item-note">Needed before the puzzle can be saved.</div>
              : <div className="ps-field-error" id="ps-q-item-note">Item text is required before the puzzle can be saved.</div>)}
          </div>
        )}
        <div className="ps-field ps-span-2">
          <div className="ps-label" id="ps-q-correct">Correct answer <span className="ps-req" aria-hidden="true">*</span></div>
          <div className="ps-answers" role="radiogroup" aria-labelledby="ps-q-correct">
            <AnswerCard letter="A" name={catA} color={colorA} on={q.correctCategory!=="B"} onPick={()=>onChange({correctCategory:"A"})}/>
            <AnswerCard letter="B" name={catB} color={colorB} on={q.correctCategory==="B"} onPick={()=>onChange({correctCategory:"B"})}/>
          </div>
        </div>
        <div className="ps-field">
          <label className="ps-label" htmlFor="ps-q-info">Actual Info <span className="ps-label-note">(the explanation)</span></label>
          <textarea id="ps-q-info" className="ps-input ps-textarea" value={q.explanationCopy||""} placeholder="One factual sentence…" onChange={e=>onChange({explanationCopy:e.target.value})}/>
        </div>
        <div className="ps-field">
          <label className="ps-label" htmlFor="ps-q-flavor">Needless Commentary <span className="ps-label-note">(the flavor text)</span></label>
          <textarea id="ps-q-flavor" className="ps-input ps-textarea" value={q.flavorCopy||""} placeholder="Funny reaction line…" onChange={e=>onChange({flavorCopy:e.target.value})}/>
        </div>
      </div>

      <ImageField label="Reveal media" labelNote={picture?"(optional image or YouTube link; without one, the reveal shows the question picture)":"(image or YouTube link)"} value={media} onChange={v=>onChange({imageUrl:v})}
                  preset="question" allowYouTube onBusyChange={onBusyChange} fieldId={fieldId} layout="row"/>

      {media&&(
        <div className="ps-grid-2 ps-media-fields">
          {!video&&(
            <div className="ps-field">
              <label className="ps-label" htmlFor="ps-q-alt">Alt text <span className="ps-req" aria-hidden="true">*</span></label>
              <input id="ps-q-alt" className="ps-input" value={q.imageAlt||""} placeholder="Screen reader description…" onChange={e=>onChange({imageAlt:e.target.value})}/>
            </div>
          )}
          <div className="ps-field">
            <label className="ps-label" htmlFor="ps-q-source">Media source</label>
            <input id="ps-q-source" className="ps-input" value={q.imageSource||""} placeholder={video?"Official music video, lyric video, etc.":"Via Wikimedia Commons"} onChange={e=>onChange({imageSource:e.target.value})}/>
          </div>
        </div>
      )}

      <div className="ps-qeditor-foot">
        <span className="ps-hint">Changes apply as you type and are stored when you save or publish.</span>
        <div className="ps-foot-buttons">
          <button type="button" className="ps-btn ps-btn-sm" onClick={onPrev} disabled={!onPrev}><Icon name="prev" size={16}/>Previous</button>
          <button type="button" className="ps-btn ps-btn-sm" onClick={onNext} disabled={!onNext}>Next<Icon name="next" size={16}/></button>
        </div>
      </div>
    </section>
  );
}
