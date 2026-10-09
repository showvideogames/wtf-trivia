import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import AuthCallback from "./account/AuthCallback.jsx";
import StreakLab from "./StreakLab.jsx";

// /auth/callback is the only page that turns a sign-in code into a session.
// /streak-lab is a hidden QA page (StreakLab.jsx), not linked from anywhere.
// Everything else is the game (including /admin, which App routes itself).
// No router: Vercel serves index.html for these paths (vercel.json), and
// App moves between the site's own sections itself (siteRoutes.js).
const path = window.location.pathname.replace(/\/+$/, "");
const isAuthCallback = path === "/auth/callback";
const isStreakLab = path === "/streak-lab";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    {isAuthCallback ? <AuthCallback /> : isStreakLab ? <StreakLab /> : <App />}
  </StrictMode>
);
