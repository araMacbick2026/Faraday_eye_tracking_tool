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

## Calibration stall recovery — v0.2.1
Added explicit missing/stale-frame, unstable-face, repeated-frame, tracker-error and movement messages; collection stops after 15 seconds without accepted samples. Added centred controls to restart all nine points, reconnect/clear the camera or cancel. Sample requirements remain 15 unique eye-feature frames per target. Face-model exceptions now return a missing-frame result rather than rejecting the tracker loop; a good frame clears the error. Regression tests reproduce an 11/15 stall, fresh-frame recovery, timeout, restart, cancel and transient model-error recovery. Real webcam behaviour on the user's device remains to be retested.


## Calibration movement correction — v0.2.2
Removed first-target absolute-pose rejection during calibration and validation. Each calibration target establishes a local pose; within-target movement pauses for settling and resumes, retaining accepted stable samples. Independent target-error checks still decide measurement quality. Recording uses a provisional large-position-change proxy (normalized displacement >0.12 or eye-distance scale change >35%, sustained for 1000 ms); smaller shifts no longer immediately invalidate a session. These movement limits are exported as engineering heuristics, not validated head-pose measurements. Automated regression tests now complete nine simulated webcam targets with different stable poses, reproduce within-target movement/recovery, and retain invalidation for sustained large movement. Human webcam performance remains unverified for this patch.
