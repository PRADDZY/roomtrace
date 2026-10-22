# TestSprite PR suite plan

Connect this suite to the deployed PR preview after the project is available in the TestSprite workspace. Keep cases focused on user-visible behavior. The archive unit suite independently inspects the actual ZIP bytes; browser cases should prove that the screens and stored records work together.

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

The repository plan is ready. A TestSprite account trigger and first recorded PR run still require the workspace's Free plan CI availability and an authenticated project connection. Do not mark the external run as complete until the dashboard records it.
