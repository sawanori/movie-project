import { test, expect } from '@playwright/test';
import path from 'path';

test.describe('Camera Work VEO Compatibility', () => {
  test.beforeEach(async ({ page }) => {
    // Mock APIs
    await page.route('**/api/v1/videos/upload-image', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ image_url: 'https://example.com/test-image.jpg' }),
      });
    });
    await page.route('**/api/v1/templates/bgm/list', async route => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    });
    await page.route('**/api/v1/auth/me', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ id: 'test-user', email: 'test@example.com' }),
      });
    });

    // Navigate to the story generate page
    await page.goto('/generate/story');
    await page.waitForSelector('text=ワンシーン生成', { state: 'visible', timeout: 10000 });
  });

  async function uploadImage(page: import('@playwright/test').Page) {
    const testImagePath = path.join(__dirname, 'fixtures', 'test-image.jpg');
    const [fileChooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      page.locator('label:has(input[type="file"])').first().click(),
    ]);
    await fileChooser.setFiles(testImagePath);
    await page.waitForTimeout(2000);
  }

  test('should show camera work selector with all options when Runway is selected', async ({ page }) => {
    await uploadImage(page);

    // Runway is selected by default - check for "選択中" indicator
    await expect(page.locator('button:has-text("Runway")').locator('text=選択中')).toBeVisible();

    // Open custom camera work selector
    await page.waitForSelector('text=カメラの動き', { timeout: 10000 });

    // Click on "カスタム" preset to open the camera work grid
    const customButton = page.locator('button:has-text("カスタム")');
    await customButton.click();

    // Wait for camera work grid to appear
    await page.waitForSelector('text=カテゴリでフィルタリング', { timeout: 5000 }).catch(() => {
      // Alternative: wait for the grid itself
      return page.waitForSelector('text=カスタム - カメラワークを選ぶ', { timeout: 5000 });
    });

    // Check that orbit camera works are NOT disabled (Runway supports them)
    // Look for "ぐるっと一周" (360 shot) - should be clickable, not disabled
    const orbitButton = page.locator('button:has-text("ぐるっと一周")');
    if (await orbitButton.count() > 0) {
      // Should not have opacity-50 (disabled style)
      await expect(orbitButton).not.toHaveClass(/opacity-50/);
      // Should not show "非対応" badge
      await expect(orbitButton.locator('text=非対応')).not.toBeVisible();
    }
  });

  test('should show VEO-incompatible camera works as disabled when VEO is selected', async ({ page }) => {
    await uploadImage(page);

    // Wait for provider selector
    await page.waitForSelector('button:has-text("Veo")', { timeout: 10000 });

    // Select VEO provider
    await page.locator('button:has-text("Veo")').click();

    // Verify VEO is selected - check for "選択中" indicator
    await expect(page.locator('button:has-text("Veo")').locator('text=選択中')).toBeVisible();

    // Open custom camera work selector
    await page.waitForSelector('text=カメラの動き', { timeout: 10000 });

    // Click on "カスタム" preset
    const customButton = page.locator('button:has-text("カスタム")');
    await customButton.click();

    // Wait for camera work grid
    await page.waitForTimeout(1000);

    // Look for VEO-incompatible camera works - they should be disabled
    // Check for "非対応" badge on orbit camera works
    const veoUnsupportedBadges = page.locator('text=非対応');

    // There should be at least one 非対応 badge visible
    const badgeCount = await veoUnsupportedBadges.count();
    expect(badgeCount).toBeGreaterThan(0);
  });

  test('should not allow selecting VEO-incompatible camera works when VEO is selected', async ({ page }) => {
    await uploadImage(page);

    // Select VEO provider
    await page.waitForSelector('button:has-text("Veo")', { timeout: 10000 });
    await page.locator('button:has-text("Veo")').click();

    // Open custom camera work selector
    await page.waitForSelector('text=カメラの動き', { timeout: 10000 });
    await page.locator('button:has-text("カスタム")').click();

    // Wait for grid
    await page.waitForTimeout(1000);

    // Find a disabled camera work button (one with opacity-50)
    const disabledButtons = page.locator('button.opacity-50:has-text("非対応")');

    if (await disabledButtons.count() > 0) {
      const firstDisabled = disabledButtons.first();

      // Verify it's disabled
      await expect(firstDisabled).toBeDisabled();

      // Try to click it - should not select
      await firstDisabled.click({ force: true });

      // The "選択中" indicator should not appear on this button
      await expect(firstDisabled.locator('text=選択中')).not.toBeVisible();
    }
  });

  test('should switch camera work availability when toggling between Runway and VEO', async ({ page }) => {
    await uploadImage(page);

    // Start with Runway (default)
    await page.waitForSelector('button:has-text("Runway")', { timeout: 10000 });

    // Open custom camera work selector
    await page.waitForSelector('text=カメラの動き', { timeout: 10000 });
    await page.locator('button:has-text("カスタム")').click();
    await page.waitForTimeout(500);

    // With Runway, 非対応 badges should not be visible
    let veoUnsupportedCount = await page.locator('text=非対応').count();
    expect(veoUnsupportedCount).toBe(0);

    // Go back to presets
    await page.locator('text=プリセットに戻る').click();
    await page.waitForTimeout(300);

    // Switch to VEO
    await page.locator('button:has-text("Veo")').click();
    await page.waitForTimeout(300);

    // Open custom camera work selector again
    await page.locator('button:has-text("カスタム")').click();
    await page.waitForTimeout(500);

    // With VEO, 非対応 badges should be visible
    veoUnsupportedCount = await page.locator('text=非対応').count();
    expect(veoUnsupportedCount).toBeGreaterThan(0);
  });
});
