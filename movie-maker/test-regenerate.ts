import { chromium } from 'playwright';

async function testRegenerate() {
  const browser = await chromium.launch({
    headless: false,
    slowMo: 500 // 動作を見やすくするため遅延
  });

  const context = await browser.newContext({
    storageState: undefined // 認証状態がある場合はここで指定
  });

  const page = await context.newPage();

  // コンソールログを出力
  page.on('console', msg => {
    if (msg.text().includes('[DEBUG]')) {
      console.log('BROWSER:', msg.text());
    }
  });

  // ネットワークリクエストを監視
  page.on('request', request => {
    if (request.url().includes('regenerate-video')) {
      console.log('>>> REQUEST:', request.method(), request.url());
      console.log('>>> BODY:', request.postData());
    }
  });

  page.on('response', response => {
    if (response.url().includes('regenerate-video')) {
      console.log('<<< RESPONSE:', response.status(), response.url());
    }
  });

  try {
    // ダッシュボードにアクセス
    console.log('Navigating to dashboard...');
    await page.goto('http://localhost:3000/dashboard');
    await page.waitForTimeout(3000);

    // スクリーンショットを撮影
    await page.screenshot({ path: 'screenshot-1-dashboard.png' });
    console.log('Screenshot saved: screenshot-1-dashboard.png');

    // ログイン画面にリダイレクトされた場合
    if (page.url().includes('/login')) {
      console.log('Redirected to login page. Please login manually.');
      console.log('Waiting 60 seconds for manual login...');
      await page.waitForTimeout(60000);
    }

    // ストーリーボードを探してクリック
    console.log('Looking for storyboard items...');
    await page.screenshot({ path: 'screenshot-2-after-login.png' });

    // 完成した動画のリンクを探す
    const storyboardLinks = await page.locator('a[href*="/generate/storyboard?id="]').all();
    console.log(`Found ${storyboardLinks.length} storyboard links`);

    if (storyboardLinks.length > 0) {
      // 最初のストーリーボードをクリック
      await storyboardLinks[0].click();
      await page.waitForTimeout(3000);
      await page.screenshot({ path: 'screenshot-3-storyboard-page.png' });
      console.log('Screenshot saved: screenshot-3-storyboard-page.png');

      // 「編集に戻る」ボタンがあるか確認
      const editButton = page.locator('button:has-text("編集に戻る")');
      if (await editButton.isVisible()) {
        console.log('Found "編集に戻る" button, clicking...');
        await editButton.click();
        await page.waitForTimeout(2000);
        await page.screenshot({ path: 'screenshot-4-review-step.png' });
        console.log('Screenshot saved: screenshot-4-review-step.png');
      }

      // 再生成ボタンを探す
      const regenerateButton = page.locator('button:has-text("再生成")').first();
      if (await regenerateButton.isVisible()) {
        console.log('Found regenerate button, clicking...');
        await regenerateButton.click();
        await page.waitForTimeout(1000);
        await page.screenshot({ path: 'screenshot-5-modal-open.png' });
        console.log('Screenshot saved: screenshot-5-modal-open.png');

        // モーダル内のテキストエリアを確認
        const textareas = await page.locator('textarea').all();
        console.log(`Found ${textareas.length} textareas in modal`);

        for (let i = 0; i < textareas.length; i++) {
          const value = await textareas[i].inputValue();
          console.log(`Textarea ${i}: ${value.substring(0, 100)}...`);
        }

        // 英語プロンプトを変更
        const promptTextarea = page.locator('textarea').last();
        const originalPrompt = await promptTextarea.inputValue();
        console.log('Original prompt:', originalPrompt.substring(0, 100));

        // プロンプトを変更
        const newPrompt = 'TEST_PROMPT_CHANGED_' + Date.now() + ' ' + originalPrompt;
        await promptTextarea.fill(newPrompt);
        console.log('Changed prompt to:', newPrompt.substring(0, 100));

        await page.screenshot({ path: 'screenshot-6-prompt-changed.png' });

        // 再生成ボタンをクリック
        const submitButton = page.locator('button:has-text("再生成")').last();
        console.log('Clicking regenerate submit button...');
        await submitButton.click();

        await page.waitForTimeout(5000);
        await page.screenshot({ path: 'screenshot-7-after-regenerate.png' });
        console.log('Screenshot saved: screenshot-7-after-regenerate.png');

      } else {
        console.log('Regenerate button not found');
      }
    } else {
      console.log('No storyboard links found');
    }

    console.log('Test completed. Check screenshots.');
    await page.waitForTimeout(10000); // 結果を確認するため待機

  } catch (error) {
    console.error('Error:', error);
    await page.screenshot({ path: 'screenshot-error.png' });
  } finally {
    await browser.close();
  }
}

testRegenerate();
