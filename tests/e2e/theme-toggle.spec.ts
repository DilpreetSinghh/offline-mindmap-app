import { expect, test } from "@playwright/test";

test("sidebar theme control switches the complete whiteboard theme", async ({ page }) => {
  await page.goto("/");
  const toggle = page.getByRole("button", { name: "Switch to dark mode" });
  await expect(toggle).toBeVisible();
  await toggle.click();
  await expect(page.locator("main.whiteboard-app")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator(".excalidraw.theme--dark")).toBeVisible();
  await expect(page.getByRole("button", { name: "Switch to light mode" })).toBeVisible();
  await page.screenshot({ path: "/tmp/offline-whiteboard-dark-theme.png", fullPage: true });
});
