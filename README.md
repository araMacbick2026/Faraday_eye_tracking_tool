# Faraday Learning Observatory — v0.2
Exploratory eye-tracking prototype prepared for Bevin Carter. See dist/proposal.md for scope, demonstration instructions, estimates, privacy and limitations. See VERIFICATION.md for the functional checks and remaining validation.

Run locally from dist: `python -m http.server 4173 --bind 127.0.0.1`, then open http://127.0.0.1:4173. Camera access needs localhost or HTTPS plus browser/OS permission. Use a desktop browser.

Run regression checks from this project folder: `node camera.test.mjs`.

No build step. Main sources: dist/index.html, dist/style.css, dist/app.js, dist/reliability.js, dist/stories.js. Matching WebGazer/MediaPipe assets are bundled locally with embedded notices. No backend, video recording, paid API key or automatic session upload. Review dependencies' licensing before commercial distribution.

## GitHub and Railway deployment
The intended source repository is https://github.com/araMacbick2026/Faraday_eye_tracking_tool . Its existing Railway service follows main in project brave-compassion. The source is published with owner approval. Live Railway app: https://faradayeyetrackingtool-production.up.railway.app . The repository and Railway app are public.

The app can now run with `npm start`; it listens on Railway's PORT (default 8080). No dependency installation or app secrets are required. Dockerfile builds a non-root Node 24 container and serves only dist. railway.json configures the /health readiness endpoint. `npm test` runs browser-logic regressions plus real HTTP delivery, MIME, healthcheck and file-exposure checks. GitHub Actions runs the same checks on pushes and pull requests after upload.

The Railway URL exposes the demo without the ChatGPT access gate used by Sites. Camera frames and raw gaze samples remain in the browser. The existing Sites deployment is separate.

## Athlete pilot

Run `npm run pilot:preview` to open a local preview at http://127.0.0.1:4180/. Choose Coach, Athlete, or Parent and select **Open dashboard**. The fictional local preview opens without a code. Changes are saved in `outputs/pilot-preview-data.json`. Sign out to try another role.

The coach records the same hockey passing drill, a follow-up learning check, and a school update from an agreed source. The athlete records reflections and one nutrition check-in per day. The parent account is read-only and can see only the linked pilot athlete. Its nutrition summary is optional. The pilot uses manual entry and has no HockeyShare or school-system connection.

To enable the pilot on a hosted server, set distinct, randomly generated `PILOT_COACH_CODE`, `PILOT_ATHLETE_CODE`, and `PILOT_PARENT_CODE` values of at least 16 characters. Use HTTPS and production mode. Set `PILOT_DATA_FILE` to an absolute file path in a writable persistent volume outside `dist`, using one app instance. With no data file, records are in memory. Parent nutrition is off by default and can be enabled with `PILOT_SHARE_NUTRITION=true`. This single-roster pilot uses role access codes. Use individual accounts and athlete assignments before onboarding real families.

Set `PILOT_DEMO=true` to make the sign-in page the hosted landing page and load the fictional report-card and weekly sample data. This in-memory demo also accepts three distinct four-digit codes when `PILOT_DATA_FILE` is unset. Hosted users enter their role's access code manually.

For a shareable demo with no access codes, also set `PILOT_OPEN_DEMO=true` and leave `PILOT_DATA_FILE` unset. The open demo has Coach, Athlete, and Parent views. The read-only Parent view opens on weekly sports and academic progress, with nutrition shown when enabled. Each browser starts with its own sample data and keeps its changes when switching roles. Demo changes expire with the session or service restart.

Coach and athlete can run an activity and review its heatmap inside the dashboard's **Eye tracking** tab. Saving updates the latest observation card immediately. Only the story, session counts, and quality metrics are shared with those two roles. Export from the review to keep the full results. Closing the activity or switching tabs disconnects the camera and clears the in-page session. The saved summary is held in memory and resets on restart.
