import asyncio
from playwright import async_api
from playwright.async_api import expect

BASE_URL = "VAR_{url}".rstrip("/")
ROOMS = ["Living room", "Kitchen", "Bedroom", "Bathroom", "Entry"]
JOURNAL = "TestSprite room setup"


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

        # @@ts-step {"i":1,"type":"action","action":"navigate","selector":null,"desc":"Open journal setup and name the new journal","input":"VAR_{url}","field":null}
        await page.goto(BASE_URL, wait_until="domcontentloaded")
        await page.get_by_label("Journal name").fill(JOURNAL)

        # @@ts-step {"i":2,"type":"action","action":"click","selector":"role=button[name=Remove room]","desc":"Remove every default room before creation","input":null,"field":null}
        for room in ROOMS:
            await page.get_by_role("button", name=f"Remove {room}").click()
        await page.get_by_role("button", name="Create my journal").click()

        # @@ts-step {"i":3,"type":"assertion","action":"visible","selector":"role=alert","desc":"Assert an empty room list is rejected","input":null,"field":null}
        await expect(page.get_by_role("alert")).to_contain_text("at least one room")
        await expect(page.get_by_role("heading", name="Start a journal")).to_be_visible()

        # @@ts-step {"i":4,"type":"action","action":"fill","selector":"input[placeholder='Add a room']","desc":"Add a Study room to the setup form","input":"Study","field":"Add a room"}
        await page.get_by_placeholder("Add a room").fill("Study")
        await page.get_by_role("button", name="Add room").click()

        # @@ts-step {"i":5,"type":"assertion","action":"visible","selector":"role=button[name=Remove Study]","desc":"Assert Study is listed before creation","input":null,"field":null}
        await expect(page.get_by_role("button", name="Remove Study")).to_be_visible()

        # @@ts-step {"i":6,"type":"action","action":"click","selector":"role=button[name=Create my journal]","desc":"Create the journal with its Study room","input":null,"field":null}
        await page.get_by_role("button", name="Create my journal").click()

        # @@ts-step {"i":7,"type":"assertion","action":"visible","selector":"select[aria-label='Active journal']","desc":"Assert the new journal is active","input":null,"field":null}
        journal = page.get_by_role("combobox", name="Active journal")
        await expect(journal.locator("option:checked")).to_have_text(JOURNAL)

        # @@ts-step {"i":8,"type":"assertion","action":"visible","selector":".floor-room","desc":"Assert the new journal contains the Study room","input":null,"field":null}
        await expect(page.locator(".floorplan-grid .floor-room").filter(has_text="Study")).to_have_count(1)

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
