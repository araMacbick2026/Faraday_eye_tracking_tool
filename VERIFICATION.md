# Verification record — 6 November 2026

Passed JavaScript syntax validation. In the browser, checked initial layout and disabled camera button before consent, pointer rehearsal entry, all 45 calibration clicks across nine targets, independent five-target validation, accuracy results, learning activity start, pause, finish/review, JSON export and clear/reset. Downloaded JSON was parsed and confirmed to contain schema faraday.observatory.v1, pointer mode, rehearsal-not-gaze quality, 3820 ms and 69 raw samples.

Final code also removes the untrained-prediction gate from calibration (training must be allowed before a prediction exists) and records activity-relative coordinates to keep heatmap placement consistent when the page moves. Final source passed JavaScript syntax validation. These two final fixes were inspected in code; a complete second browser run was not performed.

Private hosting deployment succeeded for commit 01031b9f5e988d3ce1cf212ca095db68779e496f. Hosted access gate was verified. The hosted application requires the owner's ChatGPT sign-in. It is not publicly shared with Bevin.

Not verified: real webcam accuracy, model download success in the user's browser, cross-browser/device performance, and CSV download end-to-end. Do not present pointer results as camera reliability evidence.

## Camera startup repair — 6 November 2026
The initial WebGazer download configured faceMeshSolutionPath as ./mediapipe/face_mesh, but that directory was absent. Bundled the corresponding official Brown-hosted MediaPipe JS, model data, graph and SIMD/non-SIMD WASM assets. The app now resolves that path explicitly, checks camera API/embedding policy, uses flexible video constraints, reports permission/device/model initialization failures, bounds startup time, and safely stops tracks during teardown. Retry after failure reloads to avoid partially initialized tracker state.

Validation: node camera.test.mjs passed five error categories, unavailable API, blocked embedding policy, successful configuration, camera track cleanup, and required-asset presence. node --check dist/app.js passed. Both WASM files have valid binary signatures. Private deployment succeeded for commit 2dfbdd8e63000156fc43029ffa179004483ff013. Browser verified updated consent wording and the startup progress message. Actual camera availability and gaze reliability depend on the browser/OS and still require a human session.
