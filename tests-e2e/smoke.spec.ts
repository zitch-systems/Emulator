import { test, expect } from '@playwright/test';
import JSZip from 'jszip';

test.describe('EMulator Studio — end to end', () => {
  test('loads the shell and all panels', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('EMulator Studio')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Load' })).toBeVisible();
    await expect(page.getByRole('button', { name: /APK \/ IPA/ })).toBeVisible();
    // device frame placeholder is shown before anything is loaded
    await expect(page.locator('.device')).toBeVisible();
  });

  test('demo runs live, captures console, screenshots, builds + previews report', async ({ page }) => {
    await page.goto('/');

    // Load the bundled Capacitor demo.
    await page.getByRole('button', { name: /Demo/ }).click();

    // The demo boots and logs via the console bridge.
    await page.getByRole('button', { name: 'Console' }).click();
    await expect(page.locator('.log-list')).toContainText('Capacitor demo booted');

    // Interact inside the (same-origin blob) guest to generate a warning.
    const guest = page.frameLocator('iframe[title="device-content"]');
    await guest.locator('#warn').click();
    await expect(page.locator('.log-row.warn')).toBeVisible();

    // Generate an error too.
    await guest.locator('#throw').click();
    await expect(page.locator('.log-row.error')).toBeVisible();

    // The Console tab badge should now show an error count.
    await expect(page.locator('.tab .badge-err')).toBeVisible();

    // Capture a screenshot from the device toolbar.
    await page.locator('.toolbar .tbtn[title="Screenshot"]').click();

    // It lands in the Report strip.
    await page.getByRole('button', { name: 'Report' }).click();
    await expect(page.locator('.shot img')).toHaveCount(1);

    // Preview the Markdown report.
    await page.getByRole('button', { name: 'Preview' }).click();
    await expect(page.locator('.preview-pre')).toContainText('EMulator Studio — Test Report');
    await expect(page.locator('.preview-pre')).toContainText('Capacitor Demo');
  });

  test('uploaded web-build .zip runs live and captures console', async ({ page }) => {
    await page.goto('/');

    // Build an in-memory web-build zip (index.html at the root).
    const zip = new JSZip();
    zip.file('index.html', '<!doctype html><h1>Zip build</h1><script src="app.js"></script>');
    zip.file('app.js', 'console.log("web build via zip booted")');
    const buffer = await zip.generateAsync({ type: 'nodebuffer' });

    // Upload through the APK/IPA/zip input (hidden, but setInputFiles works).
    await page.locator('input[accept=".apk,.ipa,.zip,.html"]').setInputFiles({
      name: 'webbuild.zip',
      mimeType: 'application/zip',
      buffer,
    });

    // It should run live (iframe present) and the bridge should capture its log.
    await expect(page.locator('iframe[title="device-content"]')).toBeVisible({ timeout: 15_000 });
    await page.getByRole('button', { name: 'Console' }).click();
    await expect(page.locator('.log-list')).toContainText('web build via zip booted');
  });

  test('inspect pane shows demo metadata', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /Demo/ }).click();
    await page.getByRole('button', { name: 'Inspect' }).click();
    await expect(page.locator('.app-name')).toContainText('Capacitor Demo');
    await expect(page.locator('.chip-ok')).toContainText('Runnable');
    await expect(page.getByText('com.emulator.demo')).toBeVisible();
  });
});
