import { createContext } from "react";

// What the shared PlayerHeader shows on the current screen (see
// PlayerHeader.jsx): current, nav, sound, account and admin. App provides it
// for the player app; Admin Preview provides its own for the preview stage.
export const PlayerChromeContext = createContext(null);
