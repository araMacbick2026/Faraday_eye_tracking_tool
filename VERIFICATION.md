# Verification record — 6 November 2026

Passed JavaScript syntax validation. In the browser, checked initial layout and disabled camera button before consent, pointer rehearsal entry, all 45 calibration clicks across nine targets, independent five-target validation, accuracy results, learning activity start, pause, finish/review, JSON export and clear/reset. Downloaded JSON was parsed and confirmed to contain schema faraday.observatory.v1, pointer mode, rehearsal-not-gaze quality, 3820 ms and 69 raw samples.

Final code also removes the untrained-prediction gate from calibration (training must be allowed before a prediction exists) and records activity-relative coordinates to keep heatmap placement consistent when the page moves. Final source passed JavaScript syntax validation. These two final fixes were inspected in code; a complete second browser run was not performed.

Private hosting deployment succeeded for commit 01031b9f5e988d3ce1cf212ca095db68779e496f. Hosted access gate was verified. The hosted application requires the owner's ChatGPT sign-in. It is not publicly shared with Bevin.

Not verified: real webcam accuracy, model download success in the user's browser, cross-browser/device performance, and CSV download end-to-end. Do not present pointer results as camera reliability evidence.
