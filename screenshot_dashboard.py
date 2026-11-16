from playwright.sync_api import sync_playwright
import time

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1400, "height": 900})
    page.goto("http://127.0.0.1:8000")
    page.wait_for_load_state("networkidle")
    time.sleep(1)

    page.evaluate("document.getElementById('budget-min').value = 8")
    page.evaluate("document.getElementById('budget-max').value = 90")
    page.evaluate("runAIMatch()")
    time.sleep(3)
    page.wait_for_load_state("networkidle")

    page.set_viewport_size({"width": 1400, "height": 1800})
    time.sleep(1)
    page.screenshot(path="dashboard_all_vehicles.png", full_page=True)
    print("Done")
    browser.close()
