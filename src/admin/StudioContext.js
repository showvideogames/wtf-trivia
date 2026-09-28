import { createContext, useContext } from "react";

// What the Puzzle Studio components need from App.jsx (storage, the colour
// palette, YouTube parsing, a couple of shared renderers) without importing
// App.jsx back. App.jsx provides the value once for the whole Admin.
//   palette         the category colour list
//   uploadBytes     (blob, mime, folder) => Promise<url>
//   isStoredImage   url => true when it already lives in our storage
//   youtubeEmbedUrl url => embed URL or null
//   loadOptimizer   () => import of admin/imageOptimizer.js
//   HomeArt         the Home screen's puzzle artwork component
//   BrandIcon       the fudge icon renderer ({name,size})
export const StudioContext = createContext(null);

export function useStudio(){
  return useContext(StudioContext);
}

export function paletteColor(palette, id, fallbackIndex=0){
  return palette.find(p=>p.id===id) || palette[fallbackIndex];
}
