# Eldoria frontend

This repository contains only the shared React frontend for Eldoria.
The backend, models, saves, and media remain on the private home server.

Run `npm ci` and `npm run dev` in `frontend/` for local development.
Run `npm run build:hosted` there for the hosted build.
The workflow uploads only `frontend/dist-hosted`.

Configure GitHub Pages with custom domain `eldoria-play.pre-scribe.org`.
Set repository variable `ELDORIA_FRONTEND_DOMAIN` to that hostname.
Set `ELDORIA_PRIVATE_BACKEND_READY=true` only after verifying invite-only Access protection for `eldoria-api.pre-scribe.org`.
Do not commit passwords, keys, tunnel credentials, or private saves.
