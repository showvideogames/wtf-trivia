import Icon from "./Icon.jsx";
import { paletteColor, useStudio } from "./StudioContext.js";

// The category accent picker: the current colour and name, then one swatch
// per palette colour. Same palette ids as before, so saved puzzles keep theirs.
export default function ColorSwatches({value, fallbackIndex=0, onChange, name}){
  const {palette} = useStudio();
  const sel = paletteColor(palette, value, fallbackIndex);
  return(
    <div className="ps-colors">
      <div className="ps-label" id={`${name}-color-label`}>Accent color</div>
      <div className="ps-color-current">
        <span className="ps-color-dot" style={{background:sel.mid}} aria-hidden="true"/>
        <span>{sel.name}</span>
      </div>
      <div className="ps-swatches" role="radiogroup" aria-labelledby={`${name}-color-label`}>
        {palette.map(p=>{
          const on = p.id===sel.id;
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
