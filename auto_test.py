#!/usr/bin/env python3
"""Automated game tester - opens browser, screenshots, clicks, records video."""
import asyncio
from playwright.async_api import async_playwright

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(
            viewport={"width": 1280, "height": 800},
            record_video_dir="./test_videos/",
            record_video_size={"width": 1280, "height": 800}
        )
        page = await context.new_page()

        # Capture ALL console messages and JS errors
        console_logs = []
        page.on("console", lambda msg: console_logs.append(f"[{msg.type}] {msg.text}"))
        page.on("pageerror", lambda err: console_logs.append(f"[PAGE ERROR] {err}"))

        print("→ Opening game...")
        await page.goto("http://localhost:8080?v=auto")
        await asyncio.sleep(2)

        # Screenshot 1: initial state
        await page.screenshot(path="test_videos/shot_01_initial.png")
        print("→ Screenshot 1: initial state saved")

        # Wait up to 10 seconds for menu to appear
        print("→ Waiting for menu...")
        try:
            await page.wait_for_selector("#main-menu.active", timeout=10000)
            print("✓ Menu appeared!")
        except:
            print("✗ Menu did NOT appear within 10s")

        await page.screenshot(path="test_videos/shot_02_menu.png")

        # Click Quick Match
        print("→ Clicking Quick Match...")
        btn = await page.query_selector("#btn-quick-match")
        if btn:
            await btn.click()
            await asyncio.sleep(1)
            await page.screenshot(path="test_videos/shot_03_ingame.png")
        else:
            print("✗ Quick Match button not found")

        # Simulate mouse movement (move paddle left/right)
        print("→ Moving mouse around...")
        for i in range(10):
            x = 400 + i * 50
            y = 400
            await page.mouse.move(x, y)
            await asyncio.sleep(0.3)
            await page.screenshot(path=f"test_videos/shot_04_move_{i}.png")

        # Click to swing
        print("→ Clicking to swing...")
        await page.mouse.click(640, 400)
        await asyncio.sleep(0.5)
        await page.screenshot(path="test_videos/shot_05_after_click.png")

        # Press space
        print("→ Pressing Space...")
        await page.keyboard.press("Space")
        await asyncio.sleep(0.5)
        await page.screenshot(path="test_videos/shot_06_after_space.png")

        # Wait a bit for ball to move
        await asyncio.sleep(3)
        await page.screenshot(path="test_videos/shot_07_later.png")

        # Print all console logs
        print("\n========== CONSOLE LOGS ==========")
        for log in console_logs:
            print(log)
        print("==================================\n")

        await context.close()
        await browser.close()
        print("✓ Done! Video saved to test_videos/")

if __name__ == "__main__":
    asyncio.run(main())
