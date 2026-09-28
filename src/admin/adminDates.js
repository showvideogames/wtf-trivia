// Puzzle dates are plain local calendar days stored as YYYY-MM-DD. The Admin
// shows them as MM/DD/YYYY in lists and accepts that format when typed.

export function isoFromLocalDate(date){
  if(!(date instanceof Date)||Number.isNaN(date.getTime())) return "";
  const y = date.getFullYear();
  const m = String(date.getMonth()+1).padStart(2,"0");
  const d = String(date.getDate()).padStart(2,"0");
  return `${y}-${m}-${d}`;
}

export function localDateFromISO(iso){
  const match = String(iso||"").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if(!match) return null;
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  const date = new Date(y, m-1, d);
  if(date.getFullYear()!==y||date.getMonth()!==m-1||date.getDate()!==d) return null;
  return date;
}

export function formatAdminDate(iso){
  const date = localDateFromISO(iso);
  if(!date) return iso||"";
  return `${String(date.getMonth()+1).padStart(2,"0")}/${String(date.getDate()).padStart(2,"0")}/${date.getFullYear()}`;
}

// "September 28, 2026" for the editor's date row.
export function formatLongDate(iso){
  const date = localDateFromISO(iso);
  return date ? date.toLocaleDateString("en-US",{month:"long",day:"numeric",year:"numeric"}) : "";
}

export function parseAdminDate(value){
  const raw = String(value||"").trim();
  const us = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if(us){
    const m = Number(us[1]);
    const d = Number(us[2]);
    const y = Number(us[3]);
    const date = new Date(y, m-1, d);
    if(date.getFullYear()===y&&date.getMonth()===m-1&&date.getDate()===d) return isoFromLocalDate(date);
  }
  const iso = localDateFromISO(raw);
  return iso ? raw : "";
}

// Whole days from `today` to `iso` (both YYYY-MM-DD), or null.
export function daysFrom(today, iso){
  const a = localDateFromISO(today);
  const b = localDateFromISO(iso);
  if(!a||!b) return null;
  return Math.round((b-a)/86400000);
}
