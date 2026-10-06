import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import AuthCallback from "./account/AuthCallback.jsx";

// /auth/callback is the only page that turns a sign-in code into a session.
// Everything else is the game (including /admin, which App routes itself).
// No router: Vercel serves index.html for both paths (vercel.json).
const isAuthCallback = window.location.pathname.replace(/\/+$/, "") === "/auth/callback";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    {isAuthCallback ? <AuthCallback /> : <App />}
  </StrictMode>
);
