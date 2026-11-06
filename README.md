# Faraday Learning Observatory — v0.2
Exploratory eye-tracking prototype prepared for Bevin Carter. See dist/proposal.md for scope, demonstration instructions, estimates, privacy and limitations. See VERIFICATION.md for the functional checks and remaining validation.

Run locally from dist: `python -m http.server 4173 --bind 127.0.0.1`, then open http://127.0.0.1:4173. Camera access needs localhost or HTTPS plus browser/OS permission. Use a desktop browser.

Run regression checks from this project folder: `node camera.test.mjs`.

No build step. Main sources: dist/index.html, dist/style.css, dist/app.js, dist/reliability.js, dist/stories.js. Matching WebGazer/MediaPipe assets are bundled locally with embedded notices. No backend, video recording, paid API key or automatic session upload. Review dependencies' licensing before commercial distribution.
