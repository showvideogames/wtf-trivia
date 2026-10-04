import { useState } from "react";
import ColorSwatches from "./ColorSwatches.jsx";
import DatePicker from "./DatePicker.jsx";
import Icon from "./Icon.jsx";
import ImageField from "./ImageField.jsx";
import { paletteColor, useStudio } from "./StudioContext.js";
import { TOPICS, normalizeTags, toggleTag } from "../topics.js";

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

const SUBTITLE_HINT = "Optional. A second line under the name in the gameplay matchup banner, e.g. Song. Leave blank for none.";
const SHARE_HINT = "Optional. Only changes the copied Results text, emoji included. Leave blank to use the category name.";

function PuzzleBasics({game, set, games}){
  return(
    <section className="ps-panel ps-card" aria-labelledby="ps-basics-title">
      <CardHead icon="doc" title={<span id="ps-basics-title">Puzzle basics</span>} sub="The date, title and the two categories players sort items into."/>
      <div className="ps-grid-2">
        <DatePicker value={game.date||""} onChange={v=>set("date",v)} games={games} currentGameId={game.id}/>
        <TextField id="ps-theme" label="Theme title" value={game.themeTitle} placeholder="Board Game or Nicolas Cage Movie?" onChange={v=>set("themeTitle",v)}/>
        <TextField id="ps-cat-a" label="Category A" value={game.categoryA} placeholder="Board Game" onChange={v=>set("categoryA",v)}/>
        <TextField id="ps-cat-b" label="Category B" value={game.categoryB} placeholder="Nicolas Cage Movie" onChange={v=>set("categoryB",v)}/>
        <TextField id="ps-sub-a" label="Category A subtitle" value={game.categoryASubtitle} placeholder="e.g. Song"
                   onChange={v=>set("categoryASubtitle",v)} hint={SUBTITLE_HINT}/>
        <TextField id="ps-sub-b" label="Category B subtitle" value={game.categoryBSubtitle} placeholder="e.g. Song"
                   onChange={v=>set("categoryBSubtitle",v)} hint={SUBTITLE_HINT}/>
        {/* Placeholders show the fallback a blank share name uses. */}
        <TextField id="share-name-a" label="Share name for Category A" value={game.categoryAShareName} placeholder={game.categoryA||"Same as Category A"}
                   onChange={v=>set("categoryAShareName",v)} hint={SHARE_HINT}/>
        <TextField id="share-name-b" label="Share name for Category B" value={game.categoryBShareName} placeholder={game.categoryB||"Same as Category B"}
                   onChange={v=>set("categoryBShareName",v)} hint={SHARE_HINT}/>
      </div>
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

// The puzzle's Home & Share artwork: a square poster that is Home's
// centrepiece and the image a phone's share sheet sends with the result.
// Stored in the existing headerImage field.
function Artwork({game, set, trackImage}){
  return(
    <section className="ps-panel ps-card" aria-labelledby="ps-artwork-title">
      <CardHead icon="image" title={<span id="ps-artwork-title">Home &amp; Share artwork</span>} sub="Upload a square image used as the centerpiece on Home and attached when players share their result."/>
      <div className="ps-artwork">
        <div className="ps-artwork-field">
          <ImageField label="Artwork" value={game.headerImage||""} onChange={v=>set("headerImage",v)} preset="header"
                      onBusyChange={trackImage("headerImage")} fieldId="img-field-headerImage" layout="square"/>
          <ul className="ps-art-guide" aria-label="Artwork guidelines">
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
              <strong>No artwork uploaded yet.</strong>
              <span>Home shows the category matchup instead, and shares send text only.</span>
            </div>
          )}
        </div>
      </div>
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
      <Topics game={game} set={set}/>
      <CategoryAppearance game={game} set={set} trackImage={trackImage}/>
      <Artwork game={game} set={set} trackImage={trackImage}/>
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
