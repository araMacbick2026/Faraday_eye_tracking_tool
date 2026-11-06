# Faraday — exploratory eye-tracking prototype
Prepared for Bevin Carter by Ara · 6 November 2026 · Version 0.2

## Proposed approach
Use a browser and ordinary webcam to estimate gaze during a short reading activity. Establish measurement quality before interpreting content-region patterns. This remains an adult, exploratory, nonclinical prototype.

The workflow is now:
1. Enable the camera (or choose explicitly labelled pointer rehearsal).
2. Click each of nine calibration targets once, then look steadily at its centre. Collect 15 spaced eye-feature samples per target only with a visible, stable face. Significant position changes require restarting calibration.
3. Pass two consecutive independent five-target checks. No validation sample trains the model. Show median error, p90 error, coverage and result for each target.
4. Choose one of six randomly selected original short stories. Story identity stays fixed during the 45-second recording. Signal loss pauses the activity; position changes invalidate it.
5. Complete another five-target check after reading to detect drift.
6. Review quality flags and raw measurements, then export JSON/CSV. Failed or unverified webcam sessions hide the heatmap by default; it can be opened explicitly as a diagnostic.

## Provisional quality criteria
Every validation target: median error ≤120 pixels, p90 error ≤200 pixels, fresh-sample coverage ≥70%, and at least 10 unique predictions. Both pre-checks and the post-check must pass, recording coverage must be ≥70%, and post-check median error must not increase by more than 60 pixels. These are engineering heuristics, not validated research standards; agree criteria based on content-region separation before a pilot.

Coverage counts each prediction callback ID once in a 50 ms sampling grid. Stale or repeated predictions and scheduler gaps remain as missing slots. Heatmaps show density of sampled predictions, not verified fixations. Face movement is monitored using normalized face position and eye distance; this proxy is not calibrated head pose.

## Timeline
This working prototype is the starting deliverable. Allow 2–3 weeks for pilot readiness: days 1–3 define research questions, devices and acceptance criteria; days 4–7 camera/device/lighting/glasses tests and improvements; days 8–10 usability sessions and fixes; optional week 3 supervised pilot and findings. Timing depends on feedback and participant availability.

## Cost estimate
Pilot hardening: 40–80 hours at an assumed US$50/hour = US$2,000–4,000. Optional pilot facilitation and analysis: 20–40 hours = US$1,000–2,000. These are planning estimates, not an invoice, quote or commitment. Hosting, participant compensation, specialist hardware and commercial licensing review are excluded. There is no paid tracking API integration.

## Inputs when ready
A representative learning activity and research question; intended adult participant group and browser/device list; agreed acceptable content-region error and coverage; approved Faraday brand assets; consent, retention, export and access requirements. No inputs are needed to demonstrate the prototype. The current visual identity is provisional.

## Presentation
For a camera-free walkthrough, choose pointer rehearsal. It follows the same timing. After a failed pointer check, “Preview story (rehearsal only)” can demonstrate the story, recording, drift check and review without implying webcam reliability. For actual webcam measurement, failed pre-checks block recording.

## Exports and privacy
The camera frames and session remain in-browser. No video is recorded and no session is uploaded by this app. Matching WebGazer/MediaPipe runtime and model files are served by this site. Exported files stay wherever the user saves them. JSON schema faraday.observatory.v2 includes story text and ID, calibration target counts, validation history, thresholds, quality flags, pauses, viewport and raw samples. CSV labels mode, quality and story ID on each row.

## Testing and remaining work
Functional checks cover camera failure recovery, calibration collection gates, validation independence and per-target criteria, drift and coverage rules, repeated/stale/gap accounting, loss/movement pauses, failed-session heatmap controls, exports, and story randomization. Browser walkthroughs are pointer rehearsals; they do not establish real webcam accuracy. Test repeatability and failure rates across multiple adults, cameras, glasses, browsers and lighting conditions. Compare pre/post errors and all target-level failures. If broad content regions cannot be reliably distinguished, simplify the layout or compare dedicated hardware.

Do not infer attention, emotion, diagnosis, comprehension or learning outcomes from gaze alone. The stories are original fictional practice material, not validated reading assessments.

## Technical handoff
Static HTML/CSS/JavaScript with no app backend or paid API key. Serve dist over localhost or HTTPS; for example run `python -m http.server 4173 --bind 127.0.0.1` inside dist. Camera permission is required; an embedded browser may deny it. Run `node camera.test.mjs` from the project folder for automated regression checks. Source: dist/app.js, dist/reliability.js, dist/stories.js and dist/style.css. Vendored tracker and project: https://webgazer.cs.brown.edu/ . Preserve embedded notices and review licensing before commercial distribution.


## Calibration movement correction — v0.2.2
Removed first-target absolute-pose rejection during calibration and validation. Each calibration target establishes a local pose; within-target movement pauses for settling and resumes, retaining accepted stable samples. Independent target-error checks still decide measurement quality. Recording uses a provisional large-position-change proxy (normalized displacement >0.12 or eye-distance scale change >35%, sustained for 1000 ms); smaller shifts no longer immediately invalidate a session. These movement limits are exported as engineering heuristics, not validated head-pose measurements. Automated regression tests now complete nine simulated webcam targets with different stable poses, reproduce within-target movement/recovery, and retain invalidation for sustained large movement. Human webcam performance remains unverified for this patch.
