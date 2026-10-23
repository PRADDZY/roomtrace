import asyncio
from playwright import async_api
from playwright.async_api import expect

BASE_URL = "VAR_{url}".rstrip("/")
ROOMS = ["Living room", "Kitchen", "Bedroom", "Bathroom", "Entry"]


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

        # @@ts-step {"i":1,"type":"action","action":"navigate","selector":null,"desc":"Open RoomTrace journal setup","input":"VAR_{url}","field":null}
        await page.goto(BASE_URL, wait_until="domcontentloaded")
        await page.get_by_label("Journal name").fill("TestSprite empty-room rejection")

        # @@ts-step {"i":2,"type":"action","action":"click","selector":"role=button[name=Remove room]","desc":"Remove all default rooms","input":null,"field":null}
        for room in ROOMS:
            await page.get_by_role("button", name=f"Remove {room}").click()

        # @@ts-step {"i":3,"type":"action","action":"click","selector":"role=button[name=Create my journal]","desc":"Submit the setup form with no rooms","input":null,"field":null}
        await page.get_by_role("button", name="Create my journal").click()

        # @@ts-step {"i":4,"type":"assertion","action":"visible","selector":"role=alert","desc":"Assert the form explains that at least one room is required","input":null,"field":null}
        await expect(page.get_by_role("alert")).to_contain_text("at least one room")

        # @@ts-step {"i":5,"type":"assertion","action":"visible","selector":"heading=Start a journal","desc":"Assert setup remains visible and no journal was created","input":null,"field":null}
        await expect(page.get_by_role("heading", name="Start a journal")).to_be_visible()
        await expect(page.get_by_role("combobox", name="Active journal")).to_have_count(0)

        # @@ts-step {"i":6,"type":"assertion","action":"visible","selector":"role=alert","desc":"Assert rejected creation leaves the user in setup with no active journal","input":null,"field":null}
        await expect(page.get_by_role("alert")).to_be_visible()
        await expect(page.get_by_role("button", name="Create my journal")).to_be_visible()

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
