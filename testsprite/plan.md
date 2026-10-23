# TestSprite PR suite

RoomTrace's TestSprite project runs real browser journeys against the Cloudflare Pages preview for each pull request. Every case has a versioned JSON plan and authored Playwright Python code in this repository. The local Vitest suite remains responsible for detailed archive byte and PDF text checks; TestSprite verifies the deployed UI flows.

## Coverage

| Journey | Test plan | Browser code |
| --- | --- | --- |
| Open the fictional sample journal | `plans/sample-entry.json` | `code/sample-entry.py` |
| Add a room and reject an empty room list during setup | `plans/journal-rooms.json` | `code/journal-rooms.py` |
| Reject journal creation when no rooms are provided | `plans/reject-no-rooms.json` | `code/reject-no-rooms.py` |
| Save a move-in record and reopen its original photo | `plans/move-in.json` | `code/move-in.py` |
| Save a move-out record paired to the selected baseline | `plans/move-out.json` | `code/move-out.py` |
| Compare the sample move-in and move-out records | `plans/compare-baseline.json` | `code/compare-baseline.py` |
| Navigate to archive and restore | `plans/archive-navigation.json` | `code/archive-navigation.py` |
| Download and inspect a verified ZIP archive | `plans/archive-export.json` | `code/archive-export.py` |
| Restore a verified ZIP as a separate journal | `plans/archive-restore.json` | `code/archive-restore.py` |
| Reject an archive with damaged media and preserve existing data | `plans/archive-reject.json` | `code/archive-reject.py` |
| Export a PDF after adding Hindi and Marathi notes | `plans/pdf-multilingual.json` | `code/pdf-multilingual.py` |

The suite uses same-origin, synthetic fixtures from `public/test-fixtures/`. No real property information or photos are used. Upload tests fetch those small files from the preview and attach them through the actual file inputs.

## Pull request gate

- `.github/workflows/testsprite.yml` runs on opened, updated, reopened, and ready-for-review pull requests from this repository.
- The job waits for Cloudflare Pages to finish the deployment for the exact PR head commit, then extracts and validates that commit's preview URL from Cloudflare's PR comment.
- `testsprite ci run --all` executes all eleven cases against that preview. The workflow fails if a case fails or is skipped and uploads the machine-readable run summary.
- The repository Actions secret `TESTSPRITE_API_KEY` supplies TestSprite authentication. The key is not stored in this repository.
- `.github/workflows/quality.yml` separately runs the local Vitest suite and production build.
- The TestSprite GitHub App trigger is not used: this repository does not emit a GitHub deployment-status event for Cloudflare Pages. The CLI-based PR workflow passes the exact preview URL directly.

## Current state

- TestSprite project: `RoomTrace`, project ID `af18abeb-02e3-423e-8ced-c5db01f095d7`.
- Repository and PR: [PRADDZY/roomtrace](https://github.com/PRADDZY/roomtrace/pull/2).
- Production: https://roomtrace.pages.dev.
- PR preview: https://fix-finish-roomtrace.roomtrace.pages.dev.
- All eleven cloud cases have authored, versioned plans and browser scripts. The six cases that were previously blocked for missing uploads or ambiguous assertions now use deterministic fixture-backed tests.
- Individual TestSprite runs passed for all eleven cases against the PR preview. The complete GitHub Actions PR run is the final merge-gate check for each new commit.
- The account remains on the free plan. No purchase or plan upgrade was made.

## Test authoring notes

- Keep browser contexts isolated so each run starts with an empty local database.
- Use exact accessible names or scoped locators when a record title appears in both a room card and the observation list.
- Keep download assertions tied to real browser download events; inspect ZIP entries in the archive test.
- For restore tests, assert the original journal remains selectable and that the restored Kitchen records retain their exact baseline link.
- Keep the PDF browser check focused on UI and download behavior. `src/data/pdf.test.ts` independently extracts and checks the Unicode text in the PDF bytes.
