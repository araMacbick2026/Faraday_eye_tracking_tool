# Verification — Faraday v0.2

Automated regression checks (`node camera.test.mjs`) passed:
- Camera startup error handling for permission denial, missing/busy device, constraints and timeout; unavailable API and blocked embedding policy; successful configuration and safe cleanup.
- Nine calibration targets with 135 spaced accepted samples; no training without a visible stable face; calibration layer above webcam preview.
- Validation never trains the model; per-target median/p90/coverage/minimum-count gates; two consecutive successful pre-checks; failed check resets streak.
- Unique callback accounting, stale estimates and scheduler gaps; signal-loss pause and movement invalidation; camera recording blocked without passing checks.
- Post-check drift, skipped/cancelled check, low recording coverage and failed-session heatmap restrictions.
- Six original stories with no immediate random repeat; JSON/CSV serialization includes story and quality labels.

Browser walkthrough (pointer rehearsal) passed: startup layout and consent, all nine hold-to-collect targets, 135 calibration samples, five-target pre-check results and failed gate, rehearsal-only preview, story randomization, recording locks shuffle, pause, finish, post-story five-target check, before/after results, heatmap review and JSON download. No JavaScript warnings/errors were observed in the local walkthrough. The downloaded JSON was parsed: 137 recording slots with 137 unique prediction IDs, correct clock story and complete text, all 135 calibration samples, validation history including post-check, and one manual pause.

CSV content/column alignment and labelling passed automated checks. A CSV download was clicked in the browser, but a second downloaded file was not found; the complete browser-to-file CSV download remains unverified. JSON download-event notification timed out in the automation tool even though the JSON file was saved and parsed successfully.

Functional testing is not human accuracy validation. No new real webcam session, participant pilot, cross-device, glasses or lighting study was performed. Thresholds and movement proxy remain engineering heuristics. Do not claim improved numerical accuracy until measured in repeated human sessions.
