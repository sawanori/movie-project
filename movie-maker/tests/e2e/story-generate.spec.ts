import { test, expect } from '@playwright/test';
import path from 'path';

test.describe('Story Generate Page', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the story generate page
    await page.goto('/generate/story');
    // Wait for page to be ready - look for the page title
    await page.waitForSelector('text=ワンシーン生成', { state: 'visible', timeout: 10000 });
  });

  test('should display step 1 with image upload area', async ({ page }) => {
    // Check that step 1 title is shown
    await expect(page.locator('text=1. 素材を準備')).toBeVisible();

    // Check image drop zone is visible - use .first() to handle multiple matches
    await expect(page.locator('text=画像をドラッグ&ドロップ').first()).toBeVisible();
  });

  test('should show aspect ratio selector after image upload', async ({ page }) => {
    const testImagePath = path.join(__dirname, 'fixtures', 'test-image.jpg');

    // Mock the API response for image upload
    await page.route('**/api/v1/videos/upload-image', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          image_url: 'https://example.com/test-image.jpg'
        }),
      });
    });

    // Also mock templates/bgm API
    await page.route('**/api/v1/templates/bgm/list', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
    });

    // Use filechooser approach which properly triggers the change event
    const [fileChooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      // Click on the label element that wraps the file input
      page.locator('label:has(input[type="file"])').first().click(),
    ]);

    // Set the file through the filechooser
    await fileChooser.setFiles(testImagePath);

    // Wait for image processing
    await page.waitForTimeout(3000);

    // Check aspect ratio options are visible (9:16/16:9 ratio buttons)
    await expect(page.locator('text=9:16').first()).toBeVisible({ timeout: 15000 });
    await expect(page.locator('text=16:9').first()).toBeVisible();
  });

  test('should show subject type selector after image upload', async ({ page }) => {
    const testImagePath = path.join(__dirname, 'fixtures', 'test-image.jpg');

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

    // Upload file
    const [fileChooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      page.locator('label:has(input[type="file"])').first().click(),
    ]);
    await fileChooser.setFiles(testImagePath);

    // Wait for processing
    await page.waitForTimeout(3000);

    // Check subject type options are visible
    await expect(page.locator('text=人物').first()).toBeVisible({ timeout: 15000 });
    await expect(page.locator('text=物体').first()).toBeVisible();
  });

  test('should show video provider selector after image upload', async ({ page }) => {
    const testImagePath = path.join(__dirname, 'fixtures', 'test-image.jpg');

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

    // Upload file
    const [fileChooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      page.locator('label:has(input[type="file"])').first().click(),
    ]);
    await fileChooser.setFiles(testImagePath);

    // Wait for processing
    await page.waitForTimeout(3000);

    // Check video provider options are visible
    await expect(page.locator('text=Runway').first()).toBeVisible({ timeout: 15000 });
    await expect(page.locator('text=Veo').first()).toBeVisible();
  });

  test('should show camera work selector after image upload', async ({ page }) => {
    const testImagePath = path.join(__dirname, 'fixtures', 'test-image.jpg');

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

    // Upload file
    const [fileChooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      page.locator('label:has(input[type="file"])').first().click(),
    ]);
    await fileChooser.setFiles(testImagePath);

    // Wait for processing
    await page.waitForTimeout(3000);

    // Check camera work selector title is visible
    await expect(page.locator('text=カメラワーク').first()).toBeVisible({ timeout: 15000 });
  });

  test('should switch subject type and show selected state', async ({ page }) => {
    const testImagePath = path.join(__dirname, 'fixtures', 'test-image.jpg');

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

    // Upload file
    const [fileChooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      page.locator('label:has(input[type="file"])').first().click(),
    ]);
    await fileChooser.setFiles(testImagePath);

    // Wait for processing
    await page.waitForTimeout(3000);

    // Wait for subject type buttons
    await page.waitForSelector('button:has-text("人物")', { timeout: 15000 });

    // Default should be 'person' - check it's selected (has yellow #fce300 styling)
    const personButton = page.locator('button:has-text("人物")');
    // Check for "選択中" text which indicates selected state
    await expect(personButton.locator('text=選択中')).toBeVisible();

    // Click on 'object' subject type
    const objectButton = page.locator('button:has-text("物体")');
    await objectButton.click();

    // Object button should now be selected - check for "選択中" text
    await expect(objectButton.locator('text=選択中')).toBeVisible();
    // Person button should no longer show "選択中"
    await expect(personButton.locator('text=選択中')).not.toBeVisible();
  });

  test('should navigate to step 2 after clicking next', async ({ page }) => {
    const testImagePath = path.join(__dirname, 'fixtures', 'test-image.jpg');

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

    // Upload file
    const [fileChooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      page.locator('label:has(input[type="file"])').first().click(),
    ]);
    await fileChooser.setFiles(testImagePath);

    // Wait for processing
    await page.waitForTimeout(3000);

    // Click next button
    const nextButton = page.locator('button:has-text("次へ")');
    await nextButton.click();

    // Should now be on step 2 - look for step 2 heading
    await expect(page.locator('h2:has-text("プロンプトをプレビュー・編集")')).toBeVisible({ timeout: 15000 });
  });

  test('should display selected options in step 2', async ({ page }) => {
    const testImagePath = path.join(__dirname, 'fixtures', 'test-image.jpg');

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

    // Upload file
    const [fileChooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      page.locator('label:has(input[type="file"])').first().click(),
    ]);
    await fileChooser.setFiles(testImagePath);

    // Wait for processing
    await page.waitForTimeout(3000);

    // Select object subject type
    await page.waitForSelector('button:has-text("物体")', { timeout: 15000 });
    await page.locator('button:has-text("物体")').click();

    // Click next
    await page.locator('button:has-text("次へ")').click();

    // Wait for step 2
    await page.waitForTimeout(500);

    // Check step 2 shows selected options - look for step 2 heading
    await expect(page.locator('h2:has-text("プロンプトをプレビュー・編集")')).toBeVisible({ timeout: 15000 });
    // Should show object subject type somewhere in the display (物体 or object)
    await expect(page.locator('text=物体').first()).toBeVisible();
  });
});
