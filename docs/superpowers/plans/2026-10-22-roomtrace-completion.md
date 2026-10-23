# RoomTrace completion plan

**Goal:** finish the main Season 4 project entry and submit by October 23, 2026 at 10 AM IST, ahead of the 12:29 PM IST deadline.

**Architecture:** React, TypeScript and Vite static app. IndexedDB holds original photos and fixed observations. Version 1 ZIP archives preserve original bytes; the PDF remains an index. Cloudflare Pages builds production and PR previews; the TestSprite GitHub App tests the matching deployed revision.

## Agreed constraints

- No monetary spending, purchases, trials that renew, or paid upgrades.
- Use at most the 150 existing TestSprite credits. Reserve the greater of 30 credits or two full-suite execution estimates for final verification and a correction rerun.
- Publish the repository immediately when execution starts.
- The owner supplies desktop/mobile Figma frames by 11 PM IST on October 22. Copy those frames; do not invent a separate redesign.
- Freeze design at 6 AM IST on October 23 and use the best working version if the redesign runs late.
- Saved observations stay fixed; corrections are new observations.
- English, Hindi and Marathi PDF text are required.
- The owner records English narration before midnight and posts the final Discord entry.
- Defer the CLI contribution bonus until the main project entry is confirmed submitted.

## Execution checklist

- [x] Confirm baseline: 17 tests, production build and production dependency audit pass.
- [x] Inspect committed history for credential patterns before publication.
- [x] Publish the source repository.
- [x] Merge the baseline app PR and deploy main through Cloudflare Pages Git integration.
- [x] Open the completion PR with real regression cases and synthetic fixtures.
- [x] Generate/review the TestSprite 3.0 suite and prove a real baseline failure-to-fix loop on the PR preview. The TestSprite GitHub App trigger remains.
- [x] Complete journal creation/switching, later room creation, onboarding restore, record details and every-photo viewing.
- [x] Validate decoded image inputs, enforce export-compatible storage limits, and fix stale archive-verification state.
- [x] Strengthen archive date/reference validation while preserving valid V1 and historical unpaired move-out records.
- [x] Complete PDF wrapping and pagination with embedded static OFL fonts; retain a reviewed multilingual rendering proof.
- [ ] Copy the supplied Figma desktop/mobile screens and preserve accessibility and functional behavior.
- [ ] Verify real browser persistence, pairing, downloads, fresh restore, keyboard use and mobile behavior.
- [x] Update README and quality links with actual deployed and baseline test evidence.
- [ ] Assemble the narration and final screen recording; include the final video asset before final-head checks.
- [ ] Pass the complete suite on the final PR head, require its emitted check, merge, and verify production.
- [ ] Prepare the final Discord entry and confirm the owner's posted permalink.

## TestSprite suite priorities

Use one focused suite and one automatic PR trigger. Cover journal lifecycle, capture and persistence, exact comparison, archive verification/restore, and PDF/accessibility. Assert outcomes and data preservation, not merely clicks. Use the completed Cloudflare deployment signal and verify the actual commit and preview URL before trusting a result. Never substitute a local check for the required real TestSprite PR result.

## Acceptance

All enabled TestSprite cases pass on the final PR head with no unexplained skips. All source, design, documentation and demo-asset commits precede that run. Later commits invalidate final-head acceptance. Production and demo links work without authentication, existing valid V1 archives remain readable, photos stay local, and the owner has confirmed the complete Discord post.

Official rules: https://www.testsprite.com/hackathon-s4
