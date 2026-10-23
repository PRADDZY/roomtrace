import asyncio
from playwright import async_api
from playwright.async_api import expect

BASE_URL = "VAR_{url}".rstrip("/")
TITLE = "TestSprite move-in arrival"


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

        # @@ts-step {"i":1,"type":"action","action":"navigate","selector":null,"desc":"Open RoomTrace at the test target URL","input":"VAR_{url}","field":null}
        await page.goto(BASE_URL, wait_until="domcontentloaded")

        # @@ts-step {"i":2,"type":"action","action":"click","selector":"role=button[name=Open the clearly marked sample journal]","desc":"Open the clearly labeled sample journal","input":null,"field":null}
        await page.get_by_role("button", name="Open the clearly marked sample journal").click()

        # @@ts-step {"i":3,"type":"action","action":"click","selector":"role=button[name=Add a record]","desc":"Start a new observation","input":null,"field":null}
        journal_nav = page.get_by_role("navigation", name="Journal")
        await journal_nav.get_by_role("button", name="Add a record").click()

        # @@ts-step {"i":4,"type":"action","action":"select","selector":"#record-room","desc":"Choose Move-in and Kitchen","input":"Kitchen","field":"record-room"}
        await page.get_by_role("button", name="Move-in").click()
        await page.get_by_label("Room", exact=True).select_option(label="Kitchen")

        # @@ts-step {"i":5,"type":"action","action":"fill","selector":"#record-title","desc":"Enter a unique observation title and note","input":"TestSprite move-in arrival","field":"record-title"}
        await page.get_by_label("What did you notice?").fill(TITLE)
        await page.get_by_label("A little more context").fill("Synthetic arrival fixture for the TestSprite PR suite.")

        # @@ts-step {"i":6,"type":"action","action":"upload","selector":"#record-photos","desc":"Fetch and attach the same-origin synthetic arrival photo","input":"/test-fixtures/arrival.png","field":"record-photos"}
        await page.locator("#record-photos").set_input_files(await image_payload(page))
        await expect(page.get_by_text("1 photo ready", exact=True)).to_be_visible()

        # @@ts-step {"i":7,"type":"action","action":"click","selector":"role=button[name=Save this record]","desc":"Save the observation and reload the journal","input":null,"field":null}
        await page.get_by_role("button", name="Save this record").click()
        await expect(page.get_by_role("button", name=TITLE, exact=True)).to_be_visible()
        await page.reload(wait_until="domcontentloaded")
        await expect(page.get_by_role("button", name=TITLE, exact=True)).to_be_visible()

        # @@ts-step {"i":8,"type":"assertion","action":"visible","selector":"link=Download original photo","desc":"Assert the saved original photo remains accessible after reload","input":null,"field":null}
        await page.get_by_role("button", name=TITLE, exact=True).click()
        await expect(page.get_by_role("link", name="Download original photo")).to_be_visible()

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
