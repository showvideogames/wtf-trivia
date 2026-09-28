import ColorSwatches from "./ColorSwatches.jsx";
import DatePicker from "./DatePicker.jsx";
import Icon from "./Icon.jsx";
import ImageField from "./ImageField.jsx";
import { paletteColor, useStudio } from "./StudioContext.js";

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
        {/* Placeholders show the fallback a blank share name uses. */}
        <TextField id="share-name-a" label="Share name for Category A" value={game.categoryAShareName} placeholder={game.categoryA||"Same as Category A"}
                   onChange={v=>set("categoryAShareName",v)} hint={SHARE_HINT}/>
        <TextField id="share-name-b" label="Share name for Category B" value={game.categoryBShareName} placeholder={game.categoryB||"Same as Category B"}
                   onChange={v=>set("categoryBShareName",v)} hint={SHARE_HINT}/>
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

function CategoryAppearance({game, set, trackImage}){
  return(
    <section className="ps-panel ps-card" aria-labelledby="ps-appearance-title">
      <CardHead icon="palette" title={<span id="ps-appearance-title">Category appearance</span>} sub="An image and a color for each side, so players can tell the two apart at a glance."/>
      <div className="ps-cat-cards">
        <CategoryCard side="A" game={game} set={set} trackImage={trackImage}/>
        <CategoryCard side="B" game={game} set={set} trackImage={trackImage}/>
      </div>
    </section>
  );
}

// The header image plus a small Home card preview drawn by the Home screen's
// own artwork component (it falls back to the category split, like Home).
function Artwork({game, set, trackImage}){
  const {HomeArt} = useStudio();
  return(
    <section className="ps-panel ps-card" aria-labelledby="ps-artwork-title">
      <CardHead icon="image" title={<span id="ps-artwork-title">Home &amp; Archive artwork</span>} sub="The wide image shown on the Home screen and in the Archive."/>
      <div className="ps-artwork">
        <ImageField label="Header image" value={game.headerImage||""} onChange={v=>set("headerImage",v)} preset="header"
                    onBusyChange={trackImage("headerImage")} fieldId="img-field-headerImage" layout="wide"/>
        <div className="ps-home-preview">
          <div className="ps-label">Preview (Home screen)</div>
          <div className="ps-home-mini">
            <HomeArt game={game}/>
            <div className="ps-home-mini-title">{game.themeTitle||"Untitled puzzle"}</div>
          </div>
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
