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

        # @@ts-step {"i":1,"type":"action","action":"navigate","selector":null,"desc":"Open the sample journal","input":"VAR_{url}","field":null}
        await page.goto(BASE_URL, wait_until="domcontentloaded")
        await page.get_by_role("button", name="Open the clearly marked sample journal").click()

        # @@ts-step {"i":2,"type":"action","action":"click","selector":"role=button[name=Archive & restore]","desc":"Open Archive & restore from the journal navigation","input":null,"field":null}
        await page.get_by_role("navigation", name="Journal").get_by_role("button", name="Archive & restore").click()

        # @@ts-step {"i":3,"type":"assertion","action":"visible","selector":"heading=Take the originals with you.","desc":"Assert the archive view summarizes both sample records and original files","input":null,"field":null}
        await expect(page.get_by_role("heading", name="Take the originals with you.")).to_be_visible()
        await expect(page.get_by_text("2 observations", exact=True)).to_be_visible()
        await expect(page.get_by_text("2 original files", exact=True)).to_be_visible()

        # @@ts-step {"i":4,"type":"assertion","action":"visible","selector":"role=button[name=Download verified packet]","desc":"Assert ZIP and PDF export actions are available","input":null,"field":null}
        await expect(page.get_by_role("button", name="Download verified packet")).to_be_enabled()
        await expect(page.get_by_role("button", name="Download PDF index")).to_be_enabled()

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
