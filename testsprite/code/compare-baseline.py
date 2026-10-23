import asyncio
from playwright import async_api
from playwright.async_api import expect

BASE_URL = "VAR_{url}".rstrip("/")


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

        # @@ts-step {"i":1,"type":"action","action":"navigate","selector":null,"desc":"Open RoomTrace and enter the sample journal","input":"VAR_{url}","field":null}
        await page.goto(BASE_URL, wait_until="domcontentloaded")
        await page.get_by_role("button", name="Open the clearly marked sample journal").click()

        # @@ts-step {"i":2,"type":"action","action":"click","selector":"role=button[name=Compare]","desc":"Open Compare from the journal navigation","input":null,"field":null}
        await page.get_by_role("navigation", name="Journal").get_by_role("button", name="Compare").click()

        # @@ts-step {"i":3,"type":"assertion","action":"visible","selector":"text=EXACT BASELINE LINK","desc":"Assert the sample move-out uses its exact move-in baseline","input":null,"field":null}
        await expect(page.get_by_text("EXACT BASELINE LINK", exact=True)).to_be_visible()
        await expect(page.locator(".compare-panel.arrival .compare-caption strong")).to_have_text("Sink cabinet · arrival")
        await expect(page.locator(".compare-panel.departure .compare-caption strong")).to_have_text("Sink cabinet · departure")

        # @@ts-step {"i":4,"type":"assertion","action":"visible","selector":"img[alt=Kitchen]","desc":"Assert both original sample photos appear in the comparison","input":null,"field":null}
        await expect(page.get_by_role("img", name="Kitchen")).to_have_count(2)

        # @@ts-step {"i":5,"type":"action","action":"click","selector":"role=button[name=View full record and all 1 photos]","desc":"Open the move-in record from Compare","input":null,"field":null}
        await page.get_by_role("button", name="View full record and all 1 photos").first.click()
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
