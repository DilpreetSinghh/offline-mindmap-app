import { expect, test, type Page } from "@playwright/test";

async function latestSceneTypes(page: Page): Promise<string[]> {
  return page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("offline-whiteboard-v1");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const revisions = await new Promise<Array<{ createdAt: number; scene: { elements: Array<{ type: string }> } }>>((resolve, reject) => {
      const transaction = database.transaction("revisions", "readonly");
      const request = transaction.objectStore("revisions").getAll();
      request.onsuccess = () => resolve(request.result as Array<{ createdAt: number; scene: { elements: Array<{ type: string }> } }>);
      request.onerror = () => reject(request.error);
    });
    const latest = revisions.sort((a, b) => b.createdAt - a.createdAt)[0];
    return latest ? latest.scene.elements.map((element) => element.type) : [];
  });
}

async function drawFreehandCircle(page: Page, centerX: number, centerY: number, radius: number) {
  await page.mouse.move(centerX + radius, centerY);
  await page.mouse.down();
  for (let step = 1; step <= 30; step += 1) {
    const angle = (step / 30) * Math.PI * 2;
    await page.mouse.move(centerX + radius * Math.cos(angle), centerY + radius * Math.sin(angle));
  }
  await page.mouse.up();
}

test("converts a freehand circle into an ellipse and back via the menu toggle", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".excalidraw")).toBeVisible();
  await page.evaluate(() => new Promise<void>((resolve) => {
    const request = indexedDB.deleteDatabase("offline-whiteboard-v1");
    request.onsuccess = () => resolve();
    request.onerror = () => resolve();
    request.onblocked = () => resolve();
  }));
  await page.reload();
  await expect(page.locator(".excalidraw")).toBeVisible();

  await page.mouse.click(200, 100);
  await page.keyboard.press("p");
  await drawFreehandCircle(page, 640, 360, 40);
  await page.keyboard.press("ControlOrMeta+s");
  await expect.poll(async () => (await latestSceneTypes(page)).includes("ellipse")).toBe(true);

  await page.getByTestId("main-menu-trigger").click();
  await expect(page.getByTestId("toggle-shape-recognition")).toContainText("on");
  await page.getByTestId("toggle-shape-recognition").click();
  await page.getByTestId("main-menu-trigger").click();
  await expect(page.getByTestId("toggle-shape-recognition")).toContainText("off");
  await page.keyboard.press("Escape");
  await page.mouse.click(200, 100);
  await page.keyboard.press("p");
  await drawFreehandCircle(page, 640, 460, 40);
  await page.keyboard.press("ControlOrMeta+s");
  const types = await latestSceneTypes(page);
  expect(types.filter((type) => type === "freedraw").length).toBeGreaterThan(0);
});
