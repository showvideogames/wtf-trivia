import { useState } from "react";
import ColorSwatches from "./ColorSwatches.jsx";
import DatePicker from "./DatePicker.jsx";
import Icon from "./Icon.jsx";
import ImageField from "./ImageField.jsx";
import { paletteColor, useStudio } from "./StudioContext.js";
import { TOPICS, normalizeTags, toggleTag } from "../topics.js";
import { answerButtonName } from "../categoryNames.js";
import { SHARE_OR, buildImageShareText, buildResultsShareText, normalizeShareLabel, shareCategoryName } from "../share.js";

function CardHead({icon, title, sub}){
  return(
    <div className="ps-card-head">
      <span className="ps-section-icon is-teal"><Icon name={icon} size={22}/></span>
      <div>
        <h2>{title}</h2>
        {sub&&<p>{sub}</p>}
      </div>
    </div>
  );
}

function TextField({id, label, value, placeholder, onChange, hint}){
  return(
    <div className="ps-field">
      <label className="ps-label" htmlFor={id}>{label}</label>
      <input id={id} className="ps-input" value={value||""} placeholder={placeholder} onChange={e=>onChange(e.target.value)}/>
      {hint&&<div className="ps-hint">{hint}</div>}
    </div>
  );
}

function PuzzleBasics({game, set, games}){
  return(
    <section className="ps-panel ps-card" aria-labelledby="ps-basics-title">
      <CardHead icon="doc" title={<span id="ps-basics-title">Puzzle basics</span>} sub="The date and the puzzle's overall title."/>
      <div className="ps-grid-2">
        <DatePicker value={game.date||""} onChange={v=>set("date",v)} games={games} currentGameId={game.id}/>
        <TextField id="ps-theme" label="Puzzle title" value={game.themeTitle} placeholder="Board Game or Nicolas Cage Movie?" onChange={v=>set("themeTitle",v)}
                   hint="The puzzle's overall name, shown on Home, Archive and Results."/>
      </div>
    </section>
  );
}

// Each category's names, one row per place a name appears, with Category A
// and B side by side. Every name is its own field: editing one never writes
// another. A blank optional name falls back as its placeholder shows, so the
// fallback is visible rather than silent. Names are display only; answers
// stay "A" / "B".
const NAME_ROWS = [
  {key:"", id:"name", label:"Matchup name",
   hint:"The category's main name: the gameplay matchup banner, plus Home, Archive and the answer reveal.",
   placeholder:side=>side==="A"?"Board Game":"Nicolas Cage Movie"},
  {key:"Subtitle", id:"sub", label:"Matchup subtitle",
   hint:"Optional second line in the same banner, e.g. Song. Either side can be blank.",
   placeholder:()=>"Optional"},
  {key:"ButtonName", id:"btn", label:"Answer button name",
   hint:"The label on the answer button players tap. Blank uses the matchup name.",
   placeholder:(side,game)=>game[`category${side}`]||"Same as matchup name"},
  {key:"ShareName", id:"share", label:"Share name",
   hint:"The name in copied share text, emoji allowed. Blank uses the matchup name.",
   placeholder:(side,game)=>game[`category${side}`]||"Same as matchup name"},
];

function NameInput({row, side, game, set, color}){
  const field = `category${side}${row.key}`;
  const id = `ps-${row.id}-${side.toLowerCase()}`;
  return(
    <div className="ps-name-input" style={{"--cat":color.mid}}>
      <label className="ps-name-side" htmlFor={id}>
        <span className="ps-name-letter" aria-hidden="true">{side}</span>
        <span className="ps-sr">Category {side} {row.label.toLowerCase()}</span>
      </label>
      <input id={id} className="ps-input" value={game[field]||""} placeholder={row.placeholder(side, game)}
             aria-describedby={`ps-${row.id}-hint`} onChange={e=>set(field, e.target.value)}/>
    </div>
  );
}

// A small picture of where each name lands: the banner, the buttons and the
// share text, drawn from the same values gameplay and the share formatter use.
function NamesPreview({game, colorA, colorB}){
  const sides = [["A", colorA], ["B", colorB]];
  return(
    <div className="ps-names-preview" aria-label="Where the names appear">
      <div className="ps-np-block">
        <div className="ps-np-label">Matchup banner</div>
        <div className="ps-np-banner">
          {sides.map(([s, c])=>(
            <div key={s} className="ps-np-half" style={{"--np-bg":c.mid, "--np-ink":c.isDark?"#fff":"#1A1A1A"}}>
              <span>{game[`category${s}`]||`Category ${s}`}</span>
              {normalizeShareLabel(game[`category${s}Subtitle`])&&<span>{normalizeShareLabel(game[`category${s}Subtitle`])}</span>}
            </div>
          ))}
          <span className="ps-np-or" aria-hidden="true">OR</span>
        </div>
      </div>
      <div className="ps-np-block">
        <div className="ps-np-label">Answer buttons</div>
        <div className="ps-np-buttons">
          {sides.map(([s, c])=>(
            <span key={s} className="ps-np-button" style={{"--np-bg":c.mid, "--np-edge":c.dark, "--np-ink":c.isDark?"#fff":"#1A1A1A"}}>
              {answerButtonName(game, s)||`Category ${s}`}
            </span>
          ))}
        </div>
      </div>
      <div className="ps-np-block">
        <div className="ps-np-label">Share text</div>
        <div className="ps-np-share">
          <div>{shareCategoryName(game.categoryAShareName, game.categoryA, "Category A")}</div>
          <div>{SHARE_OR.trim()}</div>
          <div>{shareCategoryName(game.categoryBShareName, game.categoryB, "Category B")}</div>
        </div>
      </div>
    </div>
  );
}

function CategoryNames({game, set}){
  const {palette} = useStudio();
  const colorA = paletteColor(palette, game.categoryAColor||"teal", 0);
  const colorB = paletteColor(palette, game.categoryBColor||"pink", 1);
  return(
    <section className="ps-panel ps-card" aria-labelledby="ps-names-title">
      <CardHead icon="pencil" title={<span id="ps-names-title">Category names</span>}
                sub="The two categories players sort items into. Each name below is edited on its own."/>
      <div className="ps-names">
        {NAME_ROWS.map(row=>(
          <div key={row.id} className="ps-names-row" role="group" aria-labelledby={`ps-${row.id}-label`}>
            <div className="ps-names-head">
              <div className="ps-label" id={`ps-${row.id}-label`}>
                {row.label}
              </div>
              <div className="ps-hint" id={`ps-${row.id}-hint`}>{row.hint}</div>
            </div>
            <NameInput row={row} side="A" game={game} set={set} color={colorA}/>
            <NameInput row={row} side="B" game={game} set={set} color={colorB}/>
          </div>
        ))}
      </div>
      <NamesPreview game={game} colorA={colorA} colorB={colorB}/>
    </section>
  );
}

// Topic tags from the shared list in src/topics.js. Toggle buttons
// (aria-pressed) rather than checkboxes, so each reads as "Music, toggle
// button, pressed". Optional: a puzzle may have none, one or many.
function Topics({game, set}){
  const tags = normalizeTags(game.tags);
  return(
    <section className="ps-panel ps-card" aria-labelledby="ps-topics-title">
      <CardHead icon="tag" title={<span id="ps-topics-title">Topics</span>} sub={<span id="ps-topics-help">Select every topic that fits this puzzle.</span>}/>
      <div className="ps-topics" role="group" aria-labelledby="ps-topics-title" aria-describedby="ps-topics-help">
        {TOPICS.map(t=>{
          const on = tags.includes(t.id);
          return(
            <button key={t.id} type="button" className={`ps-topic${on?" on":""}`} aria-pressed={on}
                    onClick={()=>set("tags", current=>toggleTag(current, t.id))}>
              <span className="ps-topic-check" aria-hidden="true">{on&&<Icon name="check" size={13}/>}</span>
              <span className="ps-topic-emoji" aria-hidden="true">{t.emoji}</span>
              <span className="ps-topic-label">{t.label}</span>
            </button>
          );
        })}
      </div>
      <div className="ps-topics-count" aria-live="polite">
        {tags.length ? `${tags.length} selected` : "No topics selected yet. Topics are optional."}
      </div>
    </section>
  );
}

// One category's identity: its name, image and accent colour together, with
// the card tinted in the colour actually chosen.
function CategoryCard({side, game, set, trackImage}){
  const {palette} = useStudio();
  const name = game[`category${side}`];
  const colorField = `category${side}Color`;
  const imageField = `category${side}Image`;
  const fallback = side==="A" ? 0 : 1;
  const color = paletteColor(palette, game[colorField]||(side==="A"?"teal":"pink"), fallback);
  return(
    <div className="ps-cat-card" style={{"--cat":color.mid,"--cat-dark":color.dark,"--cat-light":color.light}}>
      <div className="ps-cat-card-head">
        <span className="ps-cat-letter" aria-hidden="true">{side}</span>
        <div>
          <div className="ps-cat-card-kicker">Category {side}</div>
          <div className="ps-cat-card-name">{name||<span className="ps-muted">No name yet</span>}</div>
        </div>
      </div>
      <div className="ps-cat-card-body">
        <ImageField label="Image" value={game[imageField]||""} onChange={v=>set(imageField,v)} preset="category"
                    onBusyChange={trackImage(imageField)} fieldId={`img-field-${imageField}`} layout="stack"/>
        <ColorSwatches name={`cat-${side}`} value={game[colorField]||(side==="A"?"teal":"pink")} fallbackIndex={fallback} onChange={v=>set(colorField,v)}/>
      </div>
    </div>
  );
}

// The category split on its own, drawn by the Home screen's artwork
// component with the artwork left out, so an artwork upload never replaces it.
function CategoryMatchup({game}){
  const {HomeArt, palette} = useStudio();
  const colorA = paletteColor(palette, game.categoryAColor||"teal", 0);
  const colorB = paletteColor(palette, game.categoryBColor||"pink", 1);
  return(
    <div className="ps-matchup">
      <div className="ps-matchup-head">
        <div className="ps-label">Category matchup preview</div>
        <div className="ps-hint">Shows how the two category images, colors and names work together.</div>
      </div>
      <div className="ps-home-mini ps-matchup-card">
        <HomeArt game={{...game, headerImage:""}}/>
        <div className="ps-home-mini-title">{game.themeTitle||"Untitled puzzle"}</div>
        <div className="ps-matchup-names">
          <span><i style={{background:colorA.mid}} aria-hidden="true"/>{game.categoryA||"Category A"}</span>
          <span className="ps-matchup-or">or</span>
          <span><i style={{background:colorB.mid}} aria-hidden="true"/>{game.categoryB||"Category B"}</span>
        </div>
      </div>
    </div>
  );
}

function CategoryAppearance({game, set, trackImage}){
  return(
    <section className="ps-panel ps-card" aria-labelledby="ps-appearance-title">
      <CardHead icon="palette" title={<span id="ps-appearance-title">Category appearance</span>} sub="An image and a color for each side, so players can tell the two apart at a glance."/>
      <div className="ps-cat-cards">
        <CategoryCard side="A" game={game} set={set} trackImage={trackImage}/>
        <CategoryCard side="B" game={game} set={set} trackImage={trackImage}/>
      </div>
      <CategoryMatchup game={game}/>
    </section>
  );
}

// The square preview of the artwork, shown whole as Home shows it (never
// cropped). It notes, without blocking anything, when the image isn't
// square or is smaller than the recommended minimum.
function ArtworkPreview({src, title}){
  const[size,setSize]=useState(null); // {src, w, h} once the image loads
  const[broken,setBroken]=useState(null);
  const loaded = size&&size.src===src ? size : null;
  const notSquare = loaded && loaded.w!==loaded.h;
  const small = loaded && Math.min(loaded.w,loaded.h)<1200;
  return(
    <>
      <div className="ps-art-square">
        {broken===src
          ? <div className="ps-media-broken">This image couldn&rsquo;t be loaded.</div>
          : <img src={src} alt={title} onLoad={e=>setSize({src, w:e.currentTarget.naturalWidth, h:e.currentTarget.naturalHeight})} onError={()=>setBroken(src)}/>}
      </div>
      {loaded&&(
        <div className={`ps-art-size${notSquare||small?" is-warn":""}`}>
          {loaded.w}&times;{loaded.h}
          {notSquare&&" · Not square: shown whole with space around it"}
          {!notSquare&&small&&" · Smaller than the 1200×1200 minimum"}
        </div>
      )}
    </>
  );
}

// The puzzle's square poster: Home's centrepiece. Stored in the existing
// headerImage field. Shares and Up Next use it only when there's no wide
// artwork.
function Artwork({game, set, trackImage}){
  return(
    <section className="ps-panel ps-card" aria-labelledby="ps-artwork-title">
      <CardHead icon="image" title={<span id="ps-artwork-title">Square poster</span>} sub="The centerpiece on Home. Shares and Up Next use it only when there's no wide artwork."/>
      <div className="ps-artwork">
        <div className="ps-artwork-field">
          <ImageField label="Square poster" value={game.headerImage||""} onChange={v=>set("headerImage",v)} preset="header"
                      onBusyChange={trackImage("headerImage")} fieldId="img-field-headerImage" layout="square"/>
          <ul className="ps-art-guide" aria-label="Square poster guidelines">
            <li>Square, 1:1</li>
            <li>Recommended: 1600&times;1600 PNG or JPG</li>
            <li>Minimum: 1200&times;1200</li>
            <li>Keep important text and subjects away from the outer edges</li>
          </ul>
        </div>
        <div className="ps-home-preview">
          <div className="ps-label">Preview</div>
          {game.headerImage?(
            <ArtworkPreview src={game.headerImage} title={game.themeTitle||"Untitled puzzle"}/>
          ):(
            <div className="ps-home-empty">
              <strong>No square poster uploaded yet.</strong>
              <span>Home shows the category matchup instead.</span>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

// The 1200x630 shape the wide artwork is meant for.
const WIDE_W = 1200;
const WIDE_H = 630;

// The wide preview: the whole image at its own proportions (never cropped
// or boxed into another shape), with a note, without blocking anything,
// when it isn't 1200x630-shaped or is smaller than that.
function WideArtworkPreview({src, title}){
  const[size,setSize]=useState(null); // {src, w, h} once the image loads
  const[broken,setBroken]=useState(null);
  const loaded = size&&size.src===src ? size : null;
  const offShape = loaded && Math.abs(loaded.w/loaded.h - WIDE_W/WIDE_H) > 0.03;
  const small = loaded && (loaded.w<WIDE_W || loaded.h<WIDE_H);
  return(
    <>
      <div className="ps-art-wide">
        {broken===src
          ? <div className="ps-media-broken">This image couldn&rsquo;t be loaded.</div>
          : <img src={src} alt={title} onLoad={e=>setSize({src, w:e.currentTarget.naturalWidth, h:e.currentTarget.naturalHeight})} onError={()=>setBroken(src)}/>}
      </div>
      {loaded&&(
        <div className={`ps-art-size${offShape||small?" is-warn":""}`}>
          {loaded.w}&times;{loaded.h}
          {offShape&&" · Not the 1200×630 shape: shown whole at its own shape"}
          {!offShape&&small&&" · Smaller than 1200×630"}
        </div>
      )}
    </>
  );
}

// What a phone's share sheet sends for a finished game of this puzzle, from
// the same formatter and the same image choice players get: the wide
// artwork, else the square poster, with the short text; with neither, the
// full text alone. The result is an example (alternating answers).
function PhoneSharePreview({game}){
  const total = game.questions?.length || 12;
  const answers = Array.from({length:total}, (_, i)=>({questionIndex:i, correct:i%4!==1}));
  const record = {score:answers.filter(a=>a.correct).length, totalQuestions:total, answers};
  const image = game.wideImage || game.headerImage || "";
  const text = image ? buildImageShareText({record}) : buildResultsShareText({game, record});
  const note = game.wideImage ? "Phones attach the wide artwork."
    : game.headerImage ? "No wide artwork, so phones attach the square poster."
    : "No artwork, so phones share the full text only.";
  return(
    <div className="ps-share-phone-wrap">
      <div className="ps-label">Phone share preview</div>
      <div className="ps-hint">{note} Example result. Desktops copy the full text instead.</div>
      <div className="ps-share-phone" aria-label="Phone share preview">
        {image&&<img src={image} alt="" className="ps-share-phone-img"/>}
        <div className="ps-share-phone-text">{text}</div>
      </div>
    </div>
  );
}

// The wide artwork, separate from the square poster: the image phones
// attach when sharing, Home's Up Next, and Home's poster on short phone
// screens. Stored in wideImage.
function WideArtwork({game, set, trackImage}){
  return(
    <section className="ps-panel ps-card" aria-labelledby="ps-wide-title">
      <CardHead icon="image" title={<span id="ps-wide-title">Wide artwork</span>} sub="Attached when players share, shown in Home's Up Next before the puzzle's day, and used as Home's poster on short phone screens."/>
      <div className="ps-artwork ps-artwork-wide">
        <div className="ps-artwork-field">
          <ImageField label="Wide artwork" value={game.wideImage||""} onChange={v=>set("wideImage",v)} preset="wide"
                      onBusyChange={trackImage("wideImage")} fieldId="img-field-wideImage" layout="wide"/>
          <ul className="ps-art-guide" aria-label="Wide artwork guidelines">
            <li>Landscape, 1200&times;630 (about 1.9:1)</li>
            <li>PNG, JPG or WebP</li>
            <li>Shown whole at its own shape: never cropped or stretched</li>
            <li>Keep important text and subjects away from the outer edges</li>
          </ul>
        </div>
        <div className="ps-home-preview">
          <div className="ps-label">Preview</div>
          {game.wideImage?(
            <WideArtworkPreview src={game.wideImage} title={game.themeTitle||"Untitled puzzle"}/>
          ):(
            <div className="ps-home-empty">
              <strong>No wide artwork uploaded yet.</strong>
              <span>Shares and Up Next use the square poster instead, and short phone screens keep the square poster.</span>
            </div>
          )}
        </div>
      </div>
      <PhoneSharePreview game={game}/>
    </section>
  );
}

// onDelete: any saved puzzle, but the database refuses once anyone has
// played it. onRetire: published puzzles. A played puzzle is retired
// instead: hidden from players, its date freed, its plays and stats kept.
export default function SetupTab({game, set, games, trackImage, onDelete, onRetire}){
  const isDraft = game.status!=="published"&&game.status!=="retired";
  return(
    <div className="ps-setup">
      <PuzzleBasics game={game} set={set} games={games}/>
      <CategoryNames game={game} set={set}/>
      <Topics game={game} set={set}/>
      <CategoryAppearance game={game} set={set} trackImage={trackImage}/>
      <Artwork game={game} set={set} trackImage={trackImage}/>
      <WideArtwork game={game} set={set} trackImage={trackImage}/>
      {onDelete&&(
        <div className="ps-danger">
          <span>{isDraft
            ? "Delete this draft and all its questions."
            : "Delete this puzzle and all its questions. Only possible while nobody has played it; after that, retire it."}</span>
          <button type="button" className="ps-btn ps-btn-sm ps-btn-danger" onClick={onDelete}><Icon name="trash" size={16}/>{isDraft?"Delete draft":"Delete puzzle"}</button>
        </div>
      )}
      {onRetire&&(
        <div className="ps-danger">
          <span>Retire this puzzle: players stop seeing it and its date becomes free. Its plays and stats are kept.</span>
          <button type="button" className="ps-btn ps-btn-sm ps-btn-danger" onClick={onRetire}>Retire puzzle</button>
        </div>
      )}
      {game.status==="retired"&&(
        <div className="ps-danger">
          <span>This puzzle is retired, so players don't see it. Publish it again to bring it back (its date must be free).</span>
        </div>
      )}
    </div>
  );
}
