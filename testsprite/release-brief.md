# RoomTrace release verification brief

RoomTrace is a browser-local rental condition journal. It has no sign-in or remote data API. Tests must use fictional data and a fresh browser context per case. Preserve session state only within a case when verifying reload behavior.

## Target and fixtures

The PR run must use the public preview of the exact PR revision whose deployment has completed. Resolve fixture URLs relative to that run's target origin; do not hard-code a production URL inside a test.

Fixtures are public static files under `/test-fixtures/`:

- `arrival.png` and `departure.png`: distinct, small, real synthetic PNGs.
- `valid-archive.zip`: two records, two original images, Kitchen, and an exact arrival/departure baseline link.
- `corrupt-media.zip`: a media byte changed without updating the manifest hash.
- `missing-media.zip`: an expected media entry removed.

If a shared workspace's upload feature is unavailable on Free, a generated Python test can download these same-origin fixtures to its temporary directory and select them through the normal file input. Do not purchase upload features or add test-only controls to the product.

## Cases and required assertions

| Case | Group | Outcome to verify |
|---|---|---|
| RT-01 | Journal lifecycle | Open the labeled sample, then create a personal journal. Both journals remain selectable and distinct. |
| RT-02 | Journal lifecycle | Remove all setup rooms. Creating a new journal is blocked with a useful room error and no unusable journal is created. |
| RT-03 | Journal lifecycle | Add a room after creating a journal; reject blank and duplicate names; switch journals on a phone viewport without losing either journal's records. |
| RT-04 | Capture and persistence | Capture a valid original image and note, reload, and confirm the saved title, room, note and image survive. |
| RT-05 | Capture and persistence | Reject an invalid or undecodable image visibly. Confirm no partial observation appears and the draft can be corrected. |
| RT-06 | Exact comparison | Create move-in records in two rooms, then pair a move-out to the exact matching-room baseline. Changing rooms clears an incompatible selection; comparison shows the chosen records. |
| RT-07 | Record viewing | Save ten images and a long note. Open the full record, access all ten originals, and close the gallery with Escape while returning keyboard focus. |
| RT-08 | Archive round trip | Export the ZIP, inspect its manifest and original file bytes, verify it in the UI, then restore as a separate journal. Original records remain available and the restored exact pair works. |
| RT-09 | Fresh restore | On a fresh browser's onboarding screen, restore the valid fixture without creating a dummy journal. Confirm both fixture records, photos and pairing are available. |
| RT-10 | Damaged archive | Attempt the corrupt and missing-media fixtures while another journal exists. Both are rejected; its records and photos remain unchanged. |
| RT-11 | Printable index | Create English/Hindi/Marathi text and download a real PDF. Confirm it opens, contains the expected indexed records and has no lossy question-mark substitution for supported text. Check visual shaping locally as well. |
| RT-12 | Accessible operation | Complete keyboard-only navigation and upload selection, open comparison/archive views at a phone width, and reload `/quality` directly without a routing error. |

Every case must assert the result and data-preservation promise. A successful click or download event alone is insufficient. Do not silently skip a failed or unsupported assertion to obtain a green PR.

## Evidence and credit controls

- Preserve a real failing run from an existing product gap, its root-cause fix and the automatic passing rerun.
- Confirm the GitHub App reports the tested PR commit and preview URL. Enable the blocking check and require its actual emitted name on main.
- Use one cloud trigger. Keep local tests/build separate from the TestSprite GitHub App.
- The authorized allowance is 150 existing credits total. Preserve the greater of 30 credits or two full-suite execution estimates for final checks; generation/exploration charges count too.
- Check usage before consuming actions. Extra requested credits are unavailable until actually granted. Stop nonfinal cloud actions before crossing the final-run reserve.
- All source/design/documentation/video commits must precede final-head verification. Add final execution links to the PR description after the run rather than making another source commit.
