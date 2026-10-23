import asyncio
from playwright import async_api
from playwright.async_api import expect

BASE_URL = "VAR_{url}".rstrip("/")


async def archive_payload(page, filename):
    response = await page.request.get(f"{BASE_URL}/test-fixtures/{filename}")
    assert response.ok, f"{filename} returned HTTP {response.status}"
    data = await response.body()
    assert data, f"{filename} is empty"
    return {"name": filename, "mimeType": "application/zip", "buffer": data}


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

        # @@ts-step {"i":1,"type":"action","action":"navigate","selector":null,"desc":"Open RoomTrace and enter the labeled sample journal","input":"VAR_{url}","field":null}
        await page.goto(BASE_URL, wait_until="domcontentloaded")
        await page.get_by_role("button", name="Open the clearly marked sample journal").click()
        await page.get_by_role("navigation", name="Journal").get_by_role("button", name="Archive & restore").click()

        # @@ts-step {"i":2,"type":"action","action":"upload","selector":"#archive-upload","desc":"Fetch and select the valid synthetic archive fixture","input":"/test-fixtures/valid-archive.zip","field":"archive-upload"}
        await page.locator("#archive-upload").set_input_files(await archive_payload(page, "valid-archive.zip"))

        # @@ts-step {"i":3,"type":"assertion","action":"visible","selector":"text=All archive checks passed.","desc":"Assert verification succeeds before restore","input":null,"field":null}
        await expect(page.get_by_text("All archive checks passed.", exact=True)).to_be_visible(timeout=20000)
        await expect(page.get_by_role("button", name="Restore as new journal")).to_be_enabled()

        # @@ts-step {"i":4,"type":"action","action":"click","selector":"role=button[name=Restore as new journal]","desc":"Restore the verified packet as a separate journal","input":null,"field":null}
        await page.get_by_role("button", name="Restore as new journal").click()
        journal_select = page.get_by_role("combobox", name="Active journal")
        await expect(journal_select.locator("option")).to_have_count(2, timeout=15000)
        options = await journal_select.locator("option").all_text_contents()
        assert any("Sunday apartment" in option for option in options), options
        assert any("RoomTrace synthetic fixture" in option for option in options), options

        # @@ts-step {"i":5,"type":"assertion","action":"visible","selector":"text=Restored RoomTrace synthetic fixture","desc":"Assert the restored journal was added and the source journal remains","input":null,"field":null}
        await expect(page.get_by_role("status")).to_contain_text("Restored RoomTrace synthetic fixture")

        # @@ts-step {"i":6,"type":"assertion","action":"visible","selector":"text=EXACT BASELINE LINK","desc":"Assert the restored Kitchen comparison retains its exact baseline","input":null,"field":null}
        await page.get_by_role("navigation", name="Journal").get_by_role("button", name="Compare").click()
        await expect(page.get_by_text("EXACT BASELINE LINK", exact=True)).to_be_visible()
        await expect(page.locator(".compare-panel.arrival .compare-caption strong")).to_have_text("Synthetic arrival photo")
        await expect(page.locator(".compare-panel.departure .compare-caption strong")).to_have_text("Synthetic departure photo")

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
