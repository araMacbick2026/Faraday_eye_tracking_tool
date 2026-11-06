# Faraday Learning Observatory
A working exploratory prototype prepared for Bevin Carter. See dist/proposal.md for the proposal, demonstration instructions, estimates and limitations.

Start locally: run `python -m http.server 4173 --bind 127.0.0.1` from `dist`, then open http://127.0.0.1:4173.

No build step. Source is dist/index.html, dist/style.css and dist/app.js. WebGazer is vendored in dist/vendor/webgazer.js with embedded third-party notices. Live model loading may require network. No backend, no video recording and no automatic session upload.
