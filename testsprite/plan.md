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

- `.github/workflows/testsprite.yml` runs for same-repository PRs, waits for the successful Cloudflare Pages check and matching preview comment, then passes that exact preview URL to `testsprite ci run`.
- The workflow uses the TestSprite API key stored as the repository Actions secret `TESTSPRITE_API_KEY`. Never add the key to the repository.
- Keep this cloud suite separate from `.github/workflows/quality.yml`: GitHub Actions runs the focused local suite and production build; TestSprite exercises the deployed browser journey.
- Confirm the result reports the PR head commit and preview URL before requiring the check on `main`.

## Current state

- Public repository: https://github.com/PRADDZY/roomtrace
- Production: https://roomtrace.pages.dev
- PR preview: https://fix-finish-roomtrace.roomtrace.pages.dev
- TestSprite V3 project: `RoomTrace`; 11 focused browser cases accepted from reviewed proposals.
- The TestSprite workspace currently has 392 free credits; the CLI reports 0.5 credits per frontend test execution. No paid plan is enabled.
- The current 11-case suite has two passed cases, one blocked comparison case, and eight ready cases. The comparison run stopped at the move-out save assertion; inspect and repair that case before treating the suite as a reliable merge gate.
- Baseline `Reject creating a journal with no rooms` failed on preview commit `6503612`: after every setup room was removed, the app created an “Empty home” journal with zero rooms. Run `f45c4c9e-8eae-470e-8b53-4e8da2d5dfdf`; 8 of 10 steps passed and the two required failure assertions were observed.
- The same case passed after the fix on preview commit `a660607`: run `3c477143-689a-411b-950e-907d1954cf0f`, with all 9 executed steps passing. This is the real cloud failure-to-fix pair.
- The `Start a journal from the sample entry point` case passed on the baseline (`fd70879c-3d00-4993-94c0-ec836ab733ff`).
- An exact-comparison attempt was blocked because the hosted runner did not provide a photo file; it is not counted as a product failure. See the repo's `/test-fixtures/` assets and release brief for a fixture-backed replacement.
- The Cloudflare GitHub App is connected and deploys PR previews. The TestSprite GitHub App trigger is not used because this repository exposes no GitHub deployment event; the CLI-based PR workflow is the selected path. Do not call the PR browser check or merge gate complete until a real TestSprite result reports the tested commit and preview URL.
