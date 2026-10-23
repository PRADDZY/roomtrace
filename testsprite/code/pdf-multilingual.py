import asyncio
import os
from playwright import async_api
from playwright.async_api import expect

BASE_URL = "VAR_{url}".rstrip("/")
TITLE = "TestSprite multilingual notes"
NOTES = "रसोई की दीवार पर हल्की रेखा। स्वयंपाकघरातील भिंतीवर हलकी रेषा."


async def image_payload(page):
    response = await page.request.get(f"{BASE_URL}/test-fixtures/arrival.png")
    assert response.ok, f"arrival fixture returned HTTP {response.status}"
    data = await response.body()
    assert data, "arrival fixture is empty"
    return {"name": "arrival.png", "mimeType": "image/png", "buffer": data}


async def run_test():
    playwright = None
    browser = None
    context = None
    try:
        playwright = await async_api.async_playwright().start()
        browser = await playwright.chromium.launch(
            headless=True,
            args=["--window-size=1280,720", "--disable-dev-shm-usage", "--ipc=host", "--single-process"],
        )
        context = await browser.new_context(accept_downloads=True)
        context.set_default_timeout(15000)
        page = await context.new_page()

        # @@ts-step {"i":1,"type":"action","action":"navigate","selector":null,"desc":"Open RoomTrace, enter the sample journal, and add a Kitchen move-in record","input":"VAR_{url}","field":null}
        await page.goto(BASE_URL, wait_until="domcontentloaded")
        await page.get_by_role("button", name="Open the clearly marked sample journal").click()
        await page.get_by_role("navigation", name="Journal").get_by_role("button", name="Add a record").click()
        await page.get_by_role("button", name="Move-in").click()
        await page.get_by_label("Room", exact=True).select_option(label="Kitchen")
        await page.get_by_label("What did you notice?").fill(TITLE)
        await page.get_by_label("A little more context").fill(NOTES)

        # @@ts-step {"i":2,"type":"action","action":"upload","selector":"#record-photos","desc":"Fetch and attach a synthetic original photo","input":"/test-fixtures/arrival.png","field":"record-photos"}
        await page.locator("#record-photos").set_input_files(await image_payload(page))
        await expect(page.get_by_text("1 photo ready", exact=True)).to_be_visible()

        # @@ts-step {"i":3,"type":"action","action":"click","selector":"role=button[name=Save this record]","desc":"Save and verify the multilingual observation","input":null,"field":null}
        await page.get_by_role("button", name="Save this record").click()
        await expect(page.get_by_role("button", name=TITLE, exact=True)).to_be_visible()

        # @@ts-step {"i":4,"type":"action","action":"click","selector":"role=button[name=Archive & restore]","desc":"Open Archive & restore","input":null,"field":null}
        await page.get_by_role("navigation", name="Journal").get_by_role("button", name="Archive & restore").click()

        # @@ts-step {"i":5,"type":"action","action":"click","selector":"role=button[name=Download PDF index]","desc":"Capture and start the PDF index download","input":null,"field":null}
        async with page.expect_download(timeout=30000) as pending_download:
            await page.get_by_role("button", name="Download PDF index").click()
        download = await pending_download.value

        # @@ts-step {"i":6,"type":"assertion","action":"visible","selector":"download filename","desc":"Assert the non-empty PDF download is present","input":null,"field":null}
        assert download.suggested_filename.endswith(".pdf"), download.suggested_filename
        download_path = await download.path()
        assert download_path and os.path.getsize(download_path) > 500
        with open(download_path, "rb") as pdf_file:
            assert pdf_file.read(5) == b"%PDF-"

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
