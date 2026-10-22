# TestSprite PR suite plan

The V3 RoomTrace project runs the deployed browser cases against the public Cloudflare Pages preview. Local Vitest checks independently inspect actual ZIP bytes; browser cases prove screens and stored records work together.

## Browser flow

1. Start with a clean browser context and create a journal with a property name, address, and two rooms.
2. Add a move-in observation to one room with a supplied image fixture, title, and note. Reload the preview and confirm the observation and original image are still present.
3. Add a move-out observation for the same room with a different image fixture. Select the exact move-in record in the baseline picker.
4. Open Compare. Assert the selected room, move-in title and image, move-out title and image, and the `EXACT BASELINE LINK` indicator are shown together.
5. Open Archive & restore and download the packet. Select that downloaded ZIP in the verification upload field. Assert all five checks pass: ZIP readability, manifest schema/version, expected entries, project/record references, and media SHA-256.
6. Restore the verified packet as a new journal. Assert the original journal remains available, the restored journal has the same records and images, and the paired move-out record still points to the correct move-in baseline.
7. Upload a fixture ZIP with a modified or missing media entry. Assert the packet is rejected and the existing journal remains unchanged.

## Test data

- Use synthetic, clearly non-personal JPEG or PNG fixtures.
- Keep fixture images small so preview runs stay fast.
- Never use a real tenant's address, lease, or photographs in the shared TestSprite workspace.

## Trigger setup

- Target each PR's public preview URL after its deployment is ready.
- Send a test event and confirm the run reports the PR head commit and preview URL.
- Start with a non-blocking trigger while the suite is being refined. Enable merge blocking after the preview flow is stable and the run has been confirmed on a real PR.
- Keep this account integration separate from `.github/workflows/quality.yml`: GitHub Actions runs the focused local suite and production build; TestSprite exercises the deployed browser journey.

## Current state

- Public repository: https://github.com/PRADDZY/roomtrace
- Production: https://roomtrace.pages.dev
- PR preview: https://fix-finish-roomtrace.roomtrace.pages.dev
- TestSprite V3 project: `RoomTrace`; 11 focused browser cases accepted from reviewed proposals.
- Free workspace balance is 142 credits; retain the 30-credit final reserve.
- Baseline `Reject creating a journal with no rooms` failed on preview commit `6503612`: after every setup room was removed, the app created an “Empty home” journal with zero rooms. Run `f45c4c9e-8eae-470e-8b53-4e8da2d5dfdf`; 8 of 10 steps passed and the two required failure assertions were observed.
- The same case passed after the fix on preview commit `a660607`: run `3c477143-689a-411b-950e-907d1954cf0f`, with all 9 executed steps passing. This is the real cloud failure-to-fix pair.
- The `Start a journal from the sample entry point` case passed on the baseline (`fd70879c-3d00-4993-94c0-ec836ab733ff`).
- An exact-comparison attempt was blocked because the hosted runner did not provide a photo file; it is not counted as a product failure. See the repo's `/test-fixtures/` assets and release brief for a fixture-backed replacement.
- The Cloudflare GitHub App is connected and deploys PR previews. The TestSprite GitHub App trigger is still pending; do not call the PR browser check or merge gate complete until its real check reports the tested commit and preview URL.
