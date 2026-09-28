// Small line icons for the Puzzle Studio. Always decorative: the control
// that holds one carries its own text or aria-label.
const PATHS = {
  back: <path d="M15 18l-6-6 6-6"/>,
  eye: <><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></>,
  pencil: <><path d="M4 20h4L19 9l-4-4L4 16v4z"/><path d="M13.5 6.5l4 4"/></>,
  list: <><path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1"/><circle cx="4.5" cy="12" r="1"/><circle cx="4.5" cy="18" r="1"/></>,
  calendar: <><rect x="3.5" y="5" width="17" height="15" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/></>,
  image: <><rect x="3.5" y="4.5" width="17" height="15" rx="2.5"/><circle cx="9" cy="10" r="1.8"/><path d="M20.5 16l-5-5-8.5 8.5"/></>,
  video: <><rect x="3" y="5.5" width="18" height="13" rx="3"/><path d="M10.5 9.5v5l4.5-2.5z" fill="currentColor"/></>,
  noMedia: <><rect x="3.5" y="4.5" width="17" height="15" rx="2.5"/><path d="M4 20L20 4"/></>,
  upload: <><path d="M12 16V4M7 9l5-5 5 5"/><path d="M4 16v3a1.5 1.5 0 001.5 1.5h13A1.5 1.5 0 0020 19v-3"/></>,
  link: <><path d="M10 14a4 4 0 005.66 0l3-3a4 4 0 00-5.66-5.66l-1 1"/><path d="M14 10a4 4 0 00-5.66 0l-3 3a4 4 0 005.66 5.66l1-1"/></>,
  trash: <><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12.5A1.5 1.5 0 008.5 21h7a1.5 1.5 0 001.5-1.5L18 7M9 7V4.5h6V7"/></>,
  check: <path d="M5 12.5l4.5 4.5L19 7.5"/>,
  plus: <path d="M12 5v14M5 12h14"/>,
  dots: <><circle cx="5.5" cy="12" r="1.6" fill="currentColor"/><circle cx="12" cy="12" r="1.6" fill="currentColor"/><circle cx="18.5" cy="12" r="1.6" fill="currentColor"/></>,
  grip: <><circle cx="9" cy="6" r="1.5" fill="currentColor"/><circle cx="15" cy="6" r="1.5" fill="currentColor"/><circle cx="9" cy="12" r="1.5" fill="currentColor"/><circle cx="15" cy="12" r="1.5" fill="currentColor"/><circle cx="9" cy="18" r="1.5" fill="currentColor"/><circle cx="15" cy="18" r="1.5" fill="currentColor"/></>,
  up: <path d="M6 15l6-6 6 6"/>,
  down: <path d="M6 9l6 6 6-6"/>,
  search: <><circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/></>,
  doc: <><path d="M6.5 3h8l4 4v13.5a.5.5 0 01-.5.5h-11.5a.5.5 0 01-.5-.5V3.5a.5.5 0 01.5-.5z"/><path d="M14 3v4.5h4.5M9 12h6M9 16h6"/></>,
  star: <path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"/>,
  palette: <><path d="M12 3.5a8.5 8.5 0 100 17c1.2 0 1.8-.8 1.8-1.7 0-1.2-1-1.6-1-2.6 0-.9.7-1.5 1.7-1.5h2.2a3.8 3.8 0 003.8-3.8c0-4.2-3.8-7.4-8.5-7.4z"/><circle cx="7.5" cy="11" r="1.2" fill="currentColor"/><circle cx="10.5" cy="7.5" r="1.2" fill="currentColor"/><circle cx="15" cy="8" r="1.2" fill="currentColor"/></>,
  warn: <><path d="M12 4l9 16H3z"/><path d="M12 10v4.5M12 17.5v.01"/></>,
  x: <path d="M6 6l12 12M18 6L6 18"/>,
  prev: <path d="M14.5 6l-6 6 6 6"/>,
  next: <path d="M9.5 6l6 6-6 6"/>,
};

export default function Icon({name, size=18, className=""}){
  return (
    <svg className={`ps-icon ${className}`} width={size} height={size} viewBox="0 0 24 24" fill="none"
         stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
         aria-hidden="true" focusable="false">
      {PATHS[name]}
    </svg>
  );
}
