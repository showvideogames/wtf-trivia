// The heart on an Archive card: outlined, or filled pink once it's one of
// this player's favorites, with the puzzle's total favorites beside it.
//   count     the total, or null when it couldn't load (no false number)
//   busy      a save is in flight: the press is ignored, the heart stays
//             focusable and says so
//   disabled  this player's favorites couldn't load, so the heart can't be
//             trusted to toggle the right way
// Never `disabled` in the HTML sense: a disabled button can let the click
// fall through to the card underneath, which would open the puzzle. Every
// press stops here.
export default function ArchiveFavoriteButton({title, selected, count, busy=false, disabled=false, onToggle}){
  const label = selected ? `Remove ${title} from favorites` : `Add ${title} to favorites`;
  const unavailable = busy || disabled;
  const onClick = e=>{
    e.stopPropagation();
    if(!unavailable) onToggle();
  };
  const hasCount = Number.isFinite(count);
  return(
    <span className="arc-fav-wrap">
      <button type="button" className={`arc-fav${selected?" is-on":""}${busy?" is-busy":""}`}
              aria-pressed={selected} aria-label={label} aria-disabled={unavailable||undefined}
              aria-busy={busy||undefined}
              title={disabled?"Your favorites couldn't load":undefined}
              onClick={onClick}>
        <svg className="arc-fav-heart" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M12 20.6s-7.6-4.6-9.3-9.5C1.6 7.9 3.6 4.4 7 4.4c2.1 0 3.6 1.2 5 3 1.4-1.8 2.9-3 5-3 3.4 0 5.4 3.5 4.3 6.7-1.7 4.9-9.3 9.5-9.3 9.5z"/>
        </svg>
        {hasCount&&<span className="arc-fav-count" aria-hidden="true">{count}</span>}
      </button>
      {hasCount&&<span className="arc-sr-only">{count===1?"1 favorite":`${count} favorites`}</span>}
    </span>
  );
}
