import { test, expect } from '@playwright/test';

test.describe('Library Image Generation Debug', () => {
  test.setTimeout(180000); // 3 minutes for image generation

  test('should generate and save image to library', async ({ page }) => {
    // Enable console logging
    page.on('console', msg => console.log('BROWSER:', msg.text()));
    page.on('pageerror', err => console.log('PAGE ERROR:', err.message));

    // Navigate to library page
    console.log('1. Navigating to library page...');
    await page.goto('/library');

    // Wait for page load
    await page.waitForLoadState('networkidle');
    console.log('2. Page loaded');

    // Take screenshot of initial state
    await page.screenshot({ path: 'debug-1-library-page.png' });

    // Find and click the "画像を生成" button
    console.log('3. Looking for generate button...');
    const generateButton = page.getByRole('button', { name: /画像を生成/i });

    if (await generateButton.count() > 0) {
      console.log('4. Found generate button, clicking...');
      await generateButton.first().click();

      // Wait for modal to open
      await page.waitForTimeout(500);
      await page.screenshot({ path: 'debug-2-modal-open.png' });

      // Check if modal is open by looking for modal title
      const modalTitle = page.locator('text=画像を生成してライブラリに保存');
      if (await modalTitle.count() > 0) {
        console.log('5. Modal is open');

        // Fill in description
        console.log('6. Filling description...');
        const textarea = page.locator('textarea').first();
        await textarea.fill('青空の下で笑顔の女性');

        await page.screenshot({ path: 'debug-3-description-filled.png' });

        // Click generate button in modal
        console.log('7. Looking for generate button in modal...');
        const modalGenerateBtn = page.getByRole('button', { name: /画像を生成$/i });

        // Wait for button to be stable
        await page.waitForTimeout(500);

        if (await modalGenerateBtn.count() > 0) {
          // Use waitForFunction to check button state safely
          const isDisabled = await modalGenerateBtn.isDisabled().catch(() => true);
          console.log(`8. Generate button found, disabled: ${isDisabled}`);

          if (!isDisabled) {
            console.log('9. Clicking generate button...');
            await modalGenerateBtn.click();

            // Wait for image generation (up to 2 minutes)
            console.log('10. Waiting for image generation...');
            await page.waitForTimeout(2000);
            await page.screenshot({ path: 'debug-4-generating.png' });

            // Wait for loading to finish
            try {
              await page.waitForSelector('text=保存中', { state: 'hidden', timeout: 120000 });
              await page.waitForSelector('.animate-spin', { state: 'hidden', timeout: 120000 });
            } catch (e) {
              console.log('11. Loading timeout or not found');
            }

            await page.waitForTimeout(2000);
            await page.screenshot({ path: 'debug-5-after-generate.png' });

            // Check if image was generated
            const generatedImage = page.locator('img[alt="Generated image"]');
            if (await generatedImage.count() > 0) {
              console.log('12. Image generated successfully!');

              // Look for save button
              const saveButton = page.getByRole('button', { name: /ライブラリに保存/i });
              if (await saveButton.count() > 0) {
                console.log('13. Save button found, clicking...');
                await saveButton.click();

                await page.waitForTimeout(3000);
                await page.screenshot({ path: 'debug-6-after-save.png' });
                console.log('14. Save clicked');
              } else {
                console.log('ERROR: Save button not found');
                // List all buttons
                const allButtons = page.locator('button');
                const count = await allButtons.count();
                console.log(`Found ${count} buttons:`);
                for (let i = 0; i < count; i++) {
                  const text = await allButtons.nth(i).textContent();
                  console.log(`  - Button ${i}: "${text}"`);
                }
              }
            } else {
              console.log('ERROR: Generated image not found');
              // Check for error message
              const errorMsg = page.locator('text=エラーが発生しました');
              if (await errorMsg.count() > 0) {
                const errorText = await page.locator('.text-red-300, .text-red-400').textContent();
                console.log(`Error message: ${errorText}`);
              }
            }
          } else {
            console.log('ERROR: Generate button is disabled');
          }
        } else {
          console.log('ERROR: Generate button not found in modal');
        }
      } else {
        console.log('ERROR: Modal not opened');
      }
    } else {
      console.log('ERROR: Generate button not found on page');
      // Take full page screenshot for debugging
      await page.screenshot({ path: 'debug-error-no-button.png', fullPage: true });
    }
  });
});
