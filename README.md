# Eldoria frontend

This repository contains only the shared React frontend for Eldoria.
The backend, models, saves, and media remain on the private home server.

Run `npm ci` and `npm run dev` in `frontend/` for local development.
Run `npm run build:hosted` there for the hosted build.
The workflow uploads only `frontend/dist-hosted`.

Configure GitHub Pages with custom domain `eldoria-play.jandalisoftware.com`.
Set repository variable `ELDORIA_FRONTEND_DOMAIN` to that hostname.
Set `ELDORIA_PRIVATE_BACKEND_READY=true` only after verifying the backend's protection for `eldoria-api.jandalisoftware.com` (Access, or its own password or google account mode).
Only for google account mode: set repository variable `ELDORIA_GOOGLE_CLIENT_ID` to the public OAuth client id for Sign in with Google (not a secret).
Do not commit passwords, keys, tunnel credentials, or private saves.
