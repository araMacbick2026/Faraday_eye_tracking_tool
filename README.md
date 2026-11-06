# Faraday Learning Observatory — v0.2
Exploratory eye-tracking prototype prepared for Bevin Carter. See dist/proposal.md for scope, demonstration instructions, estimates, privacy and limitations. See VERIFICATION.md for the functional checks and remaining validation.

Run locally from dist: `python -m http.server 4173 --bind 127.0.0.1`, then open http://127.0.0.1:4173. Camera access needs localhost or HTTPS plus browser/OS permission. Use a desktop browser.

Run regression checks from this project folder: `node camera.test.mjs`.

No build step. Main sources: dist/index.html, dist/style.css, dist/app.js, dist/reliability.js, dist/stories.js. Matching WebGazer/MediaPipe assets are bundled locally with embedded notices. No backend, video recording, paid API key or automatic session upload. Review dependencies' licensing before commercial distribution.

## GitHub and Railway deployment
The intended source repository is https://github.com/araMacbick2026/Faraday_eye_tracking_tool . Its existing Railway service follows main in project brave-compassion. Publication is pending explicit approval because the repository is public.

The app can now run with `npm start`; it listens on Railway's PORT (default 8080). No dependency installation or app secrets are required. Dockerfile builds a non-root Node 24 container and serves only dist. railway.json configures the /health readiness endpoint. `npm test` runs browser-logic regressions plus real HTTP delivery, MIME, healthcheck and file-exposure checks. GitHub Actions runs the same checks on pushes and pull requests after upload.

The Railway URL will expose the demo without the ChatGPT access gate used by Sites if a public domain is generated. Camera frames and samples remain in-browser; this server has no session-upload endpoint. The existing Sites deployment is separate.
