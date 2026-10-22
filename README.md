# RoomTrace

RoomTrace is a local-first field journal for rental move-in and move-out observations. It keeps full-size photos, notes, and exact before/after links in the browser that created them.

## Try it

```sh
npm ci
npm run dev
```

Choose **Open the clearly marked sample journal** to explore the screens without entering property details. Sample notes and illustrations are fictional and labeled as sample data. Create a journal to record your own rooms.

## Live demo

The production build is ready, but no public URL has been deployed yet. The intended zero-cost host is Cloudflare Pages Git integration, configured to build with `npm run build` and publish `dist/`. Add the deployed `pages.dev` URL here after connecting the GitHub repository and finishing the first deployment.

## What it does

- Creates a journal with a property name, optional address, and custom room list.
- Saves move-in and move-out observations with original image files in IndexedDB.
- Requires a move-out observation to select an exact move-in record for the same room.
- Shows the linked images and notes side by side.
- Exports an `EvidenceArchiveV1` ZIP with a manifest and the original image bytes, plus a printable PDF index.
- Checks the ZIP's structure, references, expected files, and SHA-256 values calculated from the media bytes.
- Restores a verified packet as a new journal with new record IDs, leaving existing journals in place.

## Privacy and limits

Property data and photos stay in the browser's IndexedDB. RoomTrace has no account, backend, analytics, or image upload service. Browser storage can be cleared, so download the ZIP before changing devices or clearing site data.

The archive hash checks detect byte changes relative to the manifest. They do not authenticate the time, location, author, or real-world condition shown in a photo. The PDF is an index; the ZIP contains the original files.

## Checks

```sh
npm test
npm run build
```

The Vitest archive suite reads actual ZIP entries and byte arrays. GitHub Actions runs that suite and a production build for pull requests and pushes to `main`. The TestSprite PR browser suite is described in [`testsprite/plan.md`](testsprite/plan.md); its first dashboard trigger and recorded PR run remain pending workspace access.

## Evidence format

Version 1 has one `manifest.json` with the project, observations, and media metadata. Original media files are stored under `media/`; each entry records its SHA-256 digest and observation link. Restore validates the complete packet before its IndexedDB write transaction and remaps project, observation, media, and baseline IDs.
