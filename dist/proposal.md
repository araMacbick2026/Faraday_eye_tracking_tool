# Faraday — initial prototype proposal
Prepared for Bevin Carter by Ara · 6 November 2026

## Proposed approach
The working browser demo uses WebGazer webcam estimates, nine-point calibration, and five separate validation targets before a 45-second reading activity. It includes missing-sample accounting, a sample-density heatmap, broad reading/diagram regions, and raw JSON/CSV export. Pointer rehearsal is explicitly labelled and never described as eye tracking.

Measure median and 90th-percentile target error in screen pixels, sample availability, and per-target coverage. The provisional gate (median ≤120px, ≥70% availability, at least 10 samples per target) is a configurable pilot heuristic, not a validated research standard. Validation never trains the model. Recalibrate after window changes or movement. Dedicated hardware should be considered if the research requires word-level accuracy.

## Timeline
This initial working demo is delivered. Allow 2–3 weeks for pilot readiness: days 1–3 scope and protocol; days 4–7 calibration/device testing and improvements; days 8–10 usability sessions and fixes; optional week 3 supervised pilot and findings. Dates depend on feedback, participant access, and agreed requirements.

## Cost estimate
Pilot hardening: 40–80 hours at an assumed US$50/hour = US$2,000–4,000. Optional pilot facilitation and analysis: 20–40 hours = US$1,000–2,000. This is a planning estimate, not a quote, invoice, or commitment. Hosting, participant compensation, specialist hardware, and commercial licensing review are excluded. The demo has no paid tracking API integration. Review WebGazer licensing and third-party assets before commercial distribution.

## Inputs when ready
- One representative learning activity and the research question.
- Intended adult participant group, browser/device list, and expected testing conditions.
- Acceptable measurement error and minimum sample availability.
- Approved Faraday brand assets (the current identity is provisional).
- Consent, retention, access, and export requirements.
No inputs are required to present the demo.

## Presentation flow
1. Open Observation studio; choose pointer rehearsal for a camera-free walkthrough.
2. Click each of nine targets five times.
3. Run the five-target accuracy check, moving the pointer to each target for rehearsal.
4. Start the reading activity, move around the reading and diagram areas, then finish.
5. Show the heatmap, availability and region summary; export JSON and CSV.
6. Open Project brief to discuss approach, timeline, budget and next inputs.
For actual gaze testing, choose Connect camera, give camera permission, and look at the targets. Rehearsal precision is not evidence of webcam reliability.

## Privacy and interpretation
Frames are processed in-browser; the application records no video and uploads no session data. WebGazer model assets may be fetched from third-party servers; network metadata is disclosed in those requests. Sessions remain in memory until cleared or the page closes. Exported files remain wherever the user saves them. Do not infer attention, emotion, diagnosis, comprehension, or learning outcomes from gaze. Adult, exploratory, nonclinical testing only in this initial scope.

## Technical handoff
Static HTML/CSS/JavaScript, no app backend or paid API key. Run `python -m http.server 4173 --bind 127.0.0.1` inside `dist`, then visit http://127.0.0.1:4173. Camera access needs localhost or HTTPS and initial model downloads need internet. Vendored tracker: https://webgazer.cs.brown.edu/webgazer.js ; project and license: https://webgazer.cs.brown.edu/ . Keep the library's embedded notices.

## Acceptance checks for the adult pilot
- Run real webcam validation on the agreed devices, including glasses and varied lighting.
- Compare pre-activity and post-activity target error to quantify drift.
- Review target-level missing samples and worst-case errors, not just a global median.
- Confirm camera-denial and model-download failure recovery.
- Confirm no session upload in browser network tools and inspect downloaded raw exports.
- Agree thresholds before evaluating participant results; report failed sessions.
