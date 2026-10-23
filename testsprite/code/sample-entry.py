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

        # @@ts-step {"i":1,"type":"action","action":"navigate","selector":null,"desc":"Open RoomTrace","input":"VAR_{url}","field":null}
        await page.goto(BASE_URL, wait_until="domcontentloaded")

        # @@ts-step {"i":2,"type":"action","action":"click","selector":"role=button[name=Open the clearly marked sample journal]","desc":"Open the clearly marked sample journal","input":null,"field":null}
        await page.get_by_role("button", name="Open the clearly marked sample journal").click()

        # @@ts-step {"i":3,"type":"assertion","action":"visible","selector":".sample-banner","desc":"Assert the sample is labeled as fictional demo data","input":null,"field":null}
        sample_banner = page.locator(".sample-banner")
        await expect(sample_banner).to_contain_text("DEMO DATA")
        await expect(sample_banner).to_contain_text("fictional examples")

        # @@ts-step {"i":4,"type":"assertion","action":"visible","selector":".record-open","desc":"Assert the sample journal and both Kitchen observations are available","input":null,"field":null}
        journal = page.get_by_role("combobox", name="Active journal")
        await expect(journal.locator("option:checked")).to_have_text("Sunday apartment · sample")
        await expect(page.locator(".record-open").filter(has_text="Sink cabinet · arrival")).to_have_count(1)
        await expect(page.locator(".record-open").filter(has_text="Sink cabinet · departure")).to_have_count(1)

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
