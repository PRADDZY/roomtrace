# RoomTrace

RoomTrace is a local-first field journal for rental move-in and move-out observations. It keeps full-size photos, notes, and exact before/after links in the browser that created them.

## Try it

```sh
npm ci
npm run dev
```

Choose **Open the clearly marked sample journal** to explore the screens without entering property details. Sample notes and illustrations are fictional and labeled as sample data. Create a journal to record your own rooms.

## Live demo

Production: [roomtrace.pages.dev](https://roomtrace.pages.dev). The public PR preview is [fix-finish-roomtrace.roomtrace.pages.dev](https://fix-finish-roomtrace.roomtrace.pages.dev). Cloudflare Pages builds this static app from the public GitHub repository with `npm run build` and publishes `dist/`.

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

The Vitest suite reads actual ZIP entries and byte arrays and exercises the journal, capture, restore, and PDF flows. GitHub Actions runs the suite and a production build for pull requests and pushes to `main`. TestSprite V3's browser cases and current run evidence are tracked in [`testsprite/plan.md`](testsprite/plan.md).

## Evidence format

Version 1 has one `manifest.json` with the project, observations, and media metadata. Original media files are stored under `media/`; each entry records its SHA-256 digest and observation link. Restore validates the complete packet before its IndexedDB write transaction and remaps project, observation, media, and baseline IDs.
