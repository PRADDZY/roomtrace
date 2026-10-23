import asyncio
from playwright import async_api
from playwright.async_api import expect

BASE_URL = "VAR_{url}".rstrip("/")
TITLE = "TestSprite move-out departure"


async def image_payload(page):
    response = await page.request.get(f"{BASE_URL}/test-fixtures/departure.png")
    assert response.ok, f"departure fixture returned HTTP {response.status}"
    data = await response.body()
    assert data, "departure fixture is empty"
    return {"name": "departure.png", "mimeType": "image/png", "buffer": data}


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

        # @@ts-step {"i":1,"type":"action","action":"navigate","selector":null,"desc":"Open RoomTrace at the test target URL","input":"VAR_{url}","field":null}
        await page.goto(BASE_URL, wait_until="domcontentloaded")
        await page.get_by_role("button", name="Open the clearly marked sample journal").click()

        # @@ts-step {"i":2,"type":"action","action":"click","selector":"role=button[name=Add a record]","desc":"Start a Kitchen move-out observation","input":null,"field":null}
        journal_nav = page.get_by_role("navigation", name="Journal")
        await journal_nav.get_by_role("button", name="Add a record").click()
        await page.get_by_role("button", name="Move-out").click()
        await page.get_by_label("Room", exact=True).select_option(label="Kitchen")

        # @@ts-step {"i":3,"type":"action","action":"select","selector":"[aria-label='Matching move-in record']","desc":"Choose the precise Sink cabinet arrival baseline","input":"Sink cabinet · arrival","field":"Matching move-in record"}
        baseline = page.get_by_label("Matching move-in record")
        await baseline.select_option(index=1)
        assert "Sink cabinet" in await baseline.locator("option:checked").inner_text()

        # @@ts-step {"i":4,"type":"action","action":"fill","selector":"#record-title","desc":"Enter the move-out title and note","input":"TestSprite move-out departure","field":"record-title"}
        await page.get_by_label("What did you notice?").fill(TITLE)
        await page.get_by_label("A little more context").fill("Synthetic departure fixture for the TestSprite PR suite.")

        # @@ts-step {"i":5,"type":"action","action":"upload","selector":"#record-photos","desc":"Fetch and attach the same-origin synthetic departure photo","input":"/test-fixtures/departure.png","field":"record-photos"}
        await page.locator("#record-photos").set_input_files(await image_payload(page))
        await expect(page.get_by_text("1 photo ready", exact=True)).to_be_visible()

        # @@ts-step {"i":6,"type":"action","action":"click","selector":"role=button[name=Save this record]","desc":"Save the selected move-out record","input":null,"field":null}
        await page.get_by_role("button", name="Save this record").click()
        await expect(page.get_by_role("button", name=TITLE, exact=True)).to_be_visible()

        # @@ts-step {"i":7,"type":"action","action":"click","selector":"role=button[name=Compare]","desc":"Open Compare and choose the new Kitchen pair","input":null,"field":null}
        await page.get_by_role("navigation", name="Journal").get_by_role("button", name="Compare").click()
        pair = page.get_by_label("Choose comparison pair")
        await pair.select_option(label=f"Kitchen · {TITLE}")

        # @@ts-step {"i":8,"type":"assertion","action":"visible","selector":"text=EXACT BASELINE LINK","desc":"Assert the exact move-in baseline and move-out record appear together","input":null,"field":null}
        await expect(page.get_by_text("EXACT BASELINE LINK", exact=True)).to_be_visible()
        await expect(page.get_by_text("Sink cabinet · arrival", exact=True)).to_be_visible()
        await expect(page.locator(".compare-panel.departure .compare-caption strong")).to_have_text(TITLE)
        await expect(page.get_by_role("img", name="Kitchen")).to_have_count(2)

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
