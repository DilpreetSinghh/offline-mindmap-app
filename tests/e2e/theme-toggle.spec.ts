import { expect, test } from "@playwright/test";

test("sidebar menu theme control switches the complete whiteboard theme", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("main-menu-trigger").click();
  await page.getByTestId("toggle-dark-mode").click();
  await expect(page.locator("main.whiteboard-app")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator(".excalidraw.theme--dark")).toBeVisible();
  await page.getByTestId("main-menu-trigger").click();
  await expect(page.getByTestId("toggle-dark-mode")).toContainText("Light mode");
  await page.screenshot({ path: "/tmp/offline-whiteboard-dark-theme.png", fullPage: true });
});
