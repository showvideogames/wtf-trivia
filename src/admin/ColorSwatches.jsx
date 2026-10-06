import Icon from "./Icon.jsx";
import { paletteColor, swatchOrder, useStudio } from "./StudioContext.js";

// The category accent picker: the current colour and name, then one swatch
// per palette colour, grouped by family. Same palette ids as before, so saved
// puzzles keep theirs. A saved value that isn't in the palette is kept as
// is (it only changes when another swatch is picked) and shown as its own
// selected swatch, in the colour players actually see for it.
export default function ColorSwatches({value, fallbackIndex=0, onChange, name}){
  const {palette, paletteFamilies} = useStudio();
  const sel = paletteColor(palette, value, fallbackIndex);
  const unknown = Boolean(value) && !palette.some(p=>p.id===value);
  const unknownLabel = `Saved color “${value}”, not in the palette (players see ${sel.name})`;
  return(
    <div className="ps-colors">
      <div className="ps-label" id={`${name}-color-label`}>Accent color</div>
      <div className="ps-color-current">
        <span className="ps-color-dot" style={{background:sel.mid}} aria-hidden="true"/>
        <span>{unknown ? <>Saved color <code>{value}</code></> : sel.name}</span>
      </div>
      <div className="ps-swatches" role="radiogroup" aria-labelledby={`${name}-color-label`}>
        {unknown&&(
          <button type="button" role="radio" aria-checked={true} aria-label={unknownLabel} title={unknownLabel}
                  className="ps-swatch on is-saved" style={{"--sw":sel.mid,"--sw-dark":sel.dark}}>
            <Icon name="check" size={16}/>
          </button>
        )}
        {swatchOrder(palette, paletteFamilies).map(p=>{
          const on = !unknown && p.id===sel.id;
          return(
            <button
              key={p.id}
              type="button"
              role="radio"
              aria-checked={on}
              aria-label={p.name}
              title={p.name}
              className={`ps-swatch${on?" on":""}`}
              style={{"--sw":p.mid,"--sw-dark":p.dark}}
              onClick={()=>onChange(p.id)}
            >
              {on&&<Icon name="check" size={16}/>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
