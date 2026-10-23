import asyncio
import os
import zipfile
from playwright import async_api
from playwright.async_api import expect


async def run_test():
    playwright = None
    browser = None
    context = None
    try:
        playwright = await async_api.async_playwright().start()
        browser = await playwright.chromium.launch(
            headless=True,
            args=[
                "--window-size=1280,720",
                "--disable-dev-shm-usage",
                "--ipc=host",
                "--single-process",
            ],
        )
        context = await browser.new_context(accept_downloads=True)
        context.set_default_timeout(15000)
        page = await context.new_page()

        # @@ts-step {"i":1,"type":"action","action":"navigate","selector":null,"desc":"Open RoomTrace at the test target URL","input":"VAR_{url}","field":null}
        await page.goto("VAR_{url}", wait_until="domcontentloaded")

        # @@ts-step {"i":2,"type":"action","action":"click","selector":"role=button[name=Open the clearly marked sample journal]","desc":"Open the clearly labeled sample journal","input":null,"field":null}
        await page.get_by_role("button", name="Open the clearly marked sample journal").click()

        # @@ts-step {"i":3,"type":"action","action":"click","selector":"role=button[name=Archive & restore]","desc":"Open Archive & restore and confirm the sample journal contents","input":null,"field":null}
        await page.get_by_role("button", name="Archive & restore").click()
        await expect(page.get_by_text("2 observations", exact=False)).to_be_visible()
        await expect(page.get_by_text("2 original files", exact=False)).to_be_visible()

        # @@ts-step {"i":4,"type":"action","action":"click","selector":"role=button[name=Download verified packet]","desc":"Capture and start the ZIP download","input":null,"field":null}
        async with page.expect_download(timeout=30000) as pending_download:
            await page.get_by_role("button", name="Download verified packet").click()
        download = await pending_download.value

        # @@ts-step {"i":5,"type":"assertion","action":"visible","selector":"download filename","desc":"Assert the download is a non-empty ZIP file","input":null,"field":null}
        assert download.suggested_filename.endswith(".zip"), download.suggested_filename
        download_path = await download.path()
        assert download_path and os.path.getsize(download_path) > 0

        # @@ts-step {"i":6,"type":"assertion","action":"visible","selector":"ZIP manifest and media entries","desc":"Assert the ZIP contains a manifest and the two original media files","input":null,"field":null}
        with zipfile.ZipFile(download_path) as archive:
            names = archive.namelist()
            assert "manifest.json" in names, names
            media_files = [name for name in names if name.startswith("media/") and not name.endswith("/")]
            assert len(media_files) == 2, media_files

        # @@ts-step {"i":7,"type":"assertion","action":"visible","selector":"text=Sunday apartment · sample","desc":"Assert the sample journal remains available after export","input":null,"field":null}
        await expect(
            page.get_by_role("combobox", name="Active journal").locator("option:checked")
        ).to_have_text("Sunday apartment · sample")

    finally:
        if context:
            try:
                await context.close()
            except Exception:
                pass
        if browser:
            try:
                await browser.close()
            except Exception:
                pass
        if playwright:
            await playwright.stop()


asyncio.run(run_test())
