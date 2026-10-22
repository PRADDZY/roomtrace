# RoomTrace demo narration

Record in English at a comfortable pace. The script is roughly two minutes. Leave a short pause between paragraphs so the final screen recording can be aligned. The test section must be shown with actual PR results before publishing the video.

## Narration

Moving out should not depend on remembering how a room looked months earlier. RoomTrace keeps the small details you notice when you move in, and lets you compare the same place when you leave.

Start a journal, name your rooms, and add a move-in observation. Attach the original photos and describe what you can see. The journal stays in this browser. There is no account, photo upload service, or remote database.

When you record a room again, choose the exact move-in observation it belongs with. Compare shows both records together, including their notes and every attached photo. RoomTrace does not guess what changed or who caused it. It keeps your chosen link clear.

Browser storage is not a permanent backup. Export a portable packet with the original files and a manifest. RoomTrace checks the actual file bytes against their SHA-256 checksums before restoring that packet as a separate journal. A rejected packet leaves your existing records unchanged. Those checks establish file integrity; they do not authenticate when or where a photo was taken.

The printable index supports English, Hindi and Marathi, while the ZIP keeps the original evidence files.

The other half of RoomTrace is how it ships. TestSprite exercises the deployed browser journey on pull requests. Here is the real failing case, the change that fixes it, and the passing rerun against the updated preview. The merge is held until the required checks pass.

That is RoomTrace: private records you can carry with you, and a development loop whose results you can inspect.

## Screen sequence

1. Journal setup and labeled sample; show a personal journal after exploring the sample.
2. Capture an original synthetic photo and reload to demonstrate persistence.
3. Choose an exact baseline, compare both records, and open the photo gallery.
4. Export the ZIP, verify it, and restore as a new journal.
5. Open the English/Hindi/Marathi PDF index.
6. Show the actual failing and passing TestSprite PR executions and required check.

Use fictional fixture records only. Do not place account credentials, tenant details, or payment information in the recording.
