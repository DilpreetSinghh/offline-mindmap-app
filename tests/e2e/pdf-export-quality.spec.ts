import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

const fixture = "tests/fixtures/Offline Whiteboard.excalidraw";
const expectedText = "hey this is the test for quality of export";

async function exportPdf(page: Page, quality: "standard" | "high" | "maximum", dark: boolean) {
  await page.locator('input[type="file"]').setInputFiles(fixture);
  await expect(page.locator('[role="alert"]')).toHaveCount(0);
  await page.locator(".main-menu-trigger").click();
  await page.getByRole("button", { name: "Export PDF…" }).click();
  await page.getByRole("radio", { name: /One canvas-sized page/ }).check();
  await page.getByRole("combobox").selectOption(quality);
  if (dark) await page.getByRole("checkbox", { name: "Dark background and rendering" }).check();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export PDF", exact: true }).click();
  const download = await downloadPromise;
  expect(await download.failure()).toBeNull();
  const path = await download.path();
  expect(path).not.toBeNull();
  return readFile(path!);
}

async function extractPdfText(bytes: Uint8Array) {
  const pdf = await getDocument({ data: Uint8Array.from(bytes) }).promise;
  const pages: string[] = [];
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    pages.push(content.items.map((item) => "str" in item ? item.str : "").join(" "));
  }
  await pdf.cleanup();
  return pages.join(" ").replace(/\s+/g, " ").trim();
}

async function renderedCornerColour(page: Page, bytes: Uint8Array) {
  return page.evaluate(async (pdfBytes) => {
    const pdfjs = await import("/node_modules/pdfjs-dist/build/pdf.mjs");
    pdfjs.GlobalWorkerOptions.workerSrc = "/node_modules/pdfjs-dist/build/pdf.worker.mjs";
    const pdf = await pdfjs.getDocument({ data: new Uint8Array(pdfBytes) }).promise;
    const pdfPage = await pdf.getPage(1);
    const viewport = pdfPage.getViewport({ scale: 0.02 });
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("Canvas rendering is unavailable.");
    await pdfPage.render({ canvas, canvasContext: context, viewport }).promise;
    const pixel = context.getImageData(1, 1, 1, 1).data;
    await pdf.cleanup();
    return Array.from(pixel);
  }, Array.from(bytes));
}

test("real very-large export keeps the quality-check sentence readable at every quality", async ({ page }) => {
  const source = JSON.parse(await readFile(fixture, "utf8"));
  expect(source.elements.some((element: { type?: string; text?: string }) => element.type === "text" && element.text === expectedText)).toBe(true);

  for (const quality of ["standard", "high", "maximum"] as const) {
    await page.goto("/");
    const pdf = await exportPdf(page, quality, quality === "high");
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(await extractPdfText(pdf)).toContain(expectedText);
    if (quality === "high") {
      const [red, green, blue, alpha] = await renderedCornerColour(page, pdf);
      expect(alpha).toBe(255);
      expect(Math.max(red, green, blue)).toBeLessThan(40);
    }
  }
});
