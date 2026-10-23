import asyncio
from playwright import async_api
from playwright.async_api import expect

BASE_URL = "VAR_{url}".rstrip("/")


async def archive_payload(page):
    response = await page.request.get(f"{BASE_URL}/test-fixtures/corrupt-media.zip")
    assert response.ok, f"corrupt-media.zip returned HTTP {response.status}"
    data = await response.body()
    assert data, "corrupt-media.zip is empty"
    return {"name": "corrupt-media.zip", "mimeType": "application/zip", "buffer": data}


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

        # @@ts-step {"i":1,"type":"action","action":"navigate","selector":null,"desc":"Open the labeled sample journal and Archive & restore","input":"VAR_{url}","field":null}
        await page.goto(BASE_URL, wait_until="domcontentloaded")
        await page.get_by_role("button", name="Open the clearly marked sample journal").click()
        await page.get_by_role("navigation", name="Journal").get_by_role("button", name="Archive & restore").click()

        # @@ts-step {"i":2,"type":"action","action":"upload","selector":"#archive-upload","desc":"Fetch and select the corrupted-media archive fixture","input":"/test-fixtures/corrupt-media.zip","field":"archive-upload"}
        await page.locator("#archive-upload").set_input_files(await archive_payload(page))

        # @@ts-step {"i":3,"type":"assertion","action":"visible","selector":"text=This packet needs attention.","desc":"Assert checksum verification rejects the archive","input":null,"field":null}
        await expect(page.get_by_text("This packet needs attention.", exact=True)).to_be_visible(timeout=20000)
        await expect(page.get_by_role("alert")).to_contain_text("No journal data has been changed")

        # @@ts-step {"i":4,"type":"assertion","action":"visible","selector":"restore action unavailable","desc":"Assert restore cannot proceed with a rejected archive","input":null,"field":null}
        await expect(page.get_by_role("button", name="Restore as new journal")).to_have_count(0)

        # @@ts-step {"i":5,"type":"assertion","action":"visible","selector":"active sample journal","desc":"Assert the original sample journal remains active with its observations","input":null,"field":null}
        journal_select = page.get_by_role("combobox", name="Active journal")
        await expect(journal_select.locator("option:checked")).to_have_text("Sunday apartment · sample")
        await expect(page.get_by_text("2 observations", exact=False)).to_be_visible()

        # @@ts-step {"i":6,"type":"assertion","action":"visible","selector":"sample observation title","desc":"Assert an original observation remains available","input":null,"field":null}
        await page.get_by_role("navigation", name="Journal").get_by_role("button", name="Overview").click()
        await expect(page.get_by_role("button", name="Sink cabinet · arrival")).to_be_visible()

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
