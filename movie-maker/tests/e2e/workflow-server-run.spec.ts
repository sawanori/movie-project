import { test, expect, type Page } from '@playwright/test';

/**
 * サーバーサイド・ワークフロー実行基盤 E2E テスト
 *
 * 検証フロー（実生成は行わず全 API をモック）:
 *   ノードモード → 「サーバーで実行」→ クラウド保存促し → クラウド保存
 *   → ExecuteOnServerModal（消費見込み/残数） → 実行 → WorkflowRunsPanel
 *   → ステップ進捗が pending→processing→completed に更新 → 成果物/キャンセル表示
 *
 * ゲート: cloudWorkflowId は POST /api/v1/workflows の成功で確定する。
 * E2E テストモードでは AuthProvider が MOCK_USER を返すため isLoggedIn=true。
 */

const CLOUD_WORKFLOW_ID = 'wf-server-run-e2e';
const BATCH_ID = 'batch-e2e-001';
const RUN_ID = 'run-e2e-001';

/** listRuns / getRun のポーリング進行を pending→processing→completed で表現するための共有状態。 */
interface RunPhaseState {
  listCalls: number;
  detailCalls: number;
  canceled: boolean;
}

function runStatusForCall(state: RunPhaseState): 'pending' | 'processing' | 'completed' {
  if (state.canceled) return 'completed'; // canceled は別途 status='canceled' で返すため未使用
  // 1 回目: pending / 2 回目: processing / 3 回目以降: completed
  const n = state.detailCalls;
  if (n <= 1) return 'pending';
  if (n === 2) return 'processing';
  return 'completed';
}

async function mockCommonApis(page: Page, state: RunPhaseState): Promise<void> {
  // 認証
  await page.route('**/api/v1/auth/me', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ id: 'test-user', email: 'test@example.com' }),
    });
  });

  // 残数（ExecuteOnServerModal が消費見込み/残数表示に使用）
  await page.route('**/api/v1/auth/usage', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        plan_type: 'pro',
        videos_used: 3,
        videos_limit: 100,
        videos_remaining: 97,
      }),
    });
  });

  // ライブラリ画像（バッチ選択 UI が listAll を呼ぶ。空配列で「未選択=1本予約」経路）
  await page.route('**/api/v1/library/all-images**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        library_images: [],
        total: 0,
        page: 1,
        per_page: 20,
      }),
    });
  });

  // BGM リスト（ページ初期化で呼ばれる場合がある）
  await page.route('**/api/v1/templates/bgm/list', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });

  // クラウドワークフロー一覧（保存後の refreshCloudList 用）
  // 作成前は空、作成後も同じレスポンスで問題ない（一覧表示は本テスト対象外）
  await page.route('**/api/v1/workflows', async (route) => {
    const method = route.request().method();
    if (method === 'POST') {
      // クラウド保存 → cloudWorkflowId 確定
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: CLOUD_WORKFLOW_ID,
          name: 'E2E Server Run',
          nodes: [],
          edges: [],
          is_public: false,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }),
      });
    } else {
      // GET 一覧
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ workflows: [], total: 0 }),
      });
    }
  });

  // ワークフロー実行 → batch_id / run_ids
  await page.route(`**/api/v1/workflows/${CLOUD_WORKFLOW_ID}/execute`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ batch_id: BATCH_ID, run_ids: [RUN_ID] }),
    });
  });

  // 実行一覧（workflow_id クエリ付き）
  // NOTE: Playwright は後から登録した route が優先されるため、
  //       一覧 (runs**) を先に登録し、詳細 (runs/ID)・キャンセル (runs/ID/cancel)
  //       を後から登録して詳細・キャンセルが一覧より優先されるようにする。
  await page.route('**/api/v1/workflows/runs**', async (route) => {
    state.listCalls += 1;
    const status = state.canceled ? 'canceled' : runStatusForCall(state);
    const isCompleted = status === 'completed';
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        runs: [
          {
            id: RUN_ID,
            workflow_id: CLOUD_WORKFLOW_ID,
            batch_id: BATCH_ID,
            status,
            progress: isCompleted ? 100 : status === 'processing' ? 50 : 0,
            final_output_url: isCompleted
              ? 'https://example.com/output/run-e2e-001.mp4'
              : null,
            error_message: null,
            created_at: new Date().toISOString(),
          },
        ],
        total: 1,
        page: 1,
        per_page: 20,
      }),
    });
  });

  // 実行詳細（steps 含む）— 一覧より後に登録して優先させる
  await page.route(`**/api/v1/workflows/runs/${RUN_ID}`, async (route) => {
    state.detailCalls += 1;
    const status = state.canceled ? 'canceled' : runStatusForCall(state);
    const isCompleted = status === 'completed';
    const isProcessing = status === 'processing';
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: RUN_ID,
        workflow_id: CLOUD_WORKFLOW_ID,
        batch_id: BATCH_ID,
        status,
        progress: isCompleted ? 100 : isProcessing ? 50 : 0,
        final_output_url: isCompleted
          ? 'https://example.com/output/run-e2e-001.mp4'
          : null,
        error_message: null,
        created_at: new Date().toISOString(),
        steps: [
          {
            node_id: 'generate-1',
            node_type: 'generate',
            status: isCompleted ? 'completed' : isProcessing ? 'processing' : 'pending',
            output_url: isCompleted
              ? 'https://example.com/output/run-e2e-001.mp4'
              : null,
            error_message: null,
            provider_used: isCompleted || isProcessing ? 'runway' : null,
          },
        ],
      }),
    });
  });

  // 実行キャンセル — 詳細より後に登録して優先させる
  await page.route(`**/api/v1/workflows/runs/${RUN_ID}/cancel`, async (route) => {
    state.canceled = true;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: RUN_ID,
        workflow_id: CLOUD_WORKFLOW_ID,
        batch_id: BATCH_ID,
        status: 'canceled',
        progress: 0,
        final_output_url: null,
        error_message: null,
        created_at: new Date().toISOString(),
      }),
    });
  });
}

/**
 * ExecuteOnServerModal フッターの実行ボタン。
 * ツールバーの「サーバーで実行」ボタンは title 属性を持つため、
 * title 無し（=モーダル内）に限定して区別する。
 */
function modalExecuteButton(page: Page) {
  return page
    .locator('button:not([title])')
    .filter({ hasText: 'サーバーで実行' });
}

async function enterNodeMode(page: Page): Promise<void> {
  await page.goto('/generate/story');
  await page.waitForSelector('text=ワンシーン生成', { state: 'visible', timeout: 15000 });
  await page.locator('button:has-text("ノードモード")').first().click();
  // ReactFlow が描画されるまで待機
  await expect(page.locator('.react-flow')).toBeVisible({ timeout: 15000 });
}

/** 「サーバーで実行」→ クラウド保存 → ExecuteOnServerModal 表示まで進める。 */
async function openExecuteModalViaCloudSave(page: Page): Promise<void> {
  // ツールバーの「サーバーで実行」ボタン
  const executeButton = page.locator('button[title="サーバーで実行"]');
  await expect(executeButton).toBeVisible({ timeout: 15000 });
  await executeButton.click();

  // クラウド未保存 → 保存促しダイアログ
  await expect(page.getByText('サーバー実行には保存が必要です')).toBeVisible({
    timeout: 10000,
  });
  await page.locator('button:has-text("クラウドに保存")').click();

  // SaveWorkflowModal → クラウドを選択して保存
  await expect(page.getByText('ワークフローを保存')).toBeVisible({ timeout: 10000 });
  await page.locator('button:has-text("クラウド")').click();
  await page.locator('button:has-text("保存")').last().click();

  // クラウド保存成功 → ExecuteOnServerModal が開く
  await expect(
    page.getByRole('heading', { name: 'サーバーで実行' }),
  ).toBeVisible({ timeout: 15000 });
}

test.describe('サーバーサイド・ワークフロー実行', () => {
  test('サーバーで実行モーダルが消費見込みと残数を表示する', async ({ page }) => {
    const state: RunPhaseState = { listCalls: 0, detailCalls: 0, canceled: false };
    await mockCommonApis(page, state);
    await enterNodeMode(page);
    await openExecuteModalViaCloudSave(page);

    // 消費見込み（未選択のため 1 本予約）と残数が表示される
    await expect(page.getByText('この実行で 1 本を予約します')).toBeVisible();
    await expect(page.getByText('残り 97 本')).toBeVisible();

    // モーダル内の実行ボタン（ツールバーの同名ボタンと区別するため footer=title無しに限定）が押下可能
    const modalExecuteBtn = modalExecuteButton(page);
    await expect(modalExecuteBtn).toBeEnabled();
  });

  test('実行するとパネルでステップ進捗が更新され成果物とキャンセルが見える', async ({
    page,
  }) => {
    const state: RunPhaseState = { listCalls: 0, detailCalls: 0, canceled: false };
    await mockCommonApis(page, state);
    await enterNodeMode(page);
    await openExecuteModalViaCloudSave(page);

    // モーダル内「サーバーで実行」を押下 → execute 呼び出し
    await modalExecuteButton(page).click();

    // WorkflowRunsPanel が開く
    const panel = page.getByRole('dialog', { name: 'サーバー実行履歴' });
    await expect(panel).toBeVisible({ timeout: 15000 });

    // run が一覧に現れる（batch 見出し）
    await expect(panel.getByText(/バッチ/)).toBeVisible({ timeout: 10000 });

    // 初期詳細（activeBatchRunId で先頭 run が選択済み）: ステップが表示される
    await expect(panel.getByText('ステップ')).toBeVisible({ timeout: 10000 });
    await expect(panel.getByText('generate').first()).toBeVisible({ timeout: 10000 });

    // ポーリング（3s間隔）で processing → completed へ遷移し、成果物が現れる
    // 進捗更新の実証: 最終的に 100% と最終成果物 video / ダウンロードリンクが表示される
    await expect(panel.getByText('100%')).toBeVisible({ timeout: 20000 });
    await expect(panel.locator('video')).toBeVisible({ timeout: 20000 });
    await expect(
      panel.getByRole('link', { name: 'ダウンロード' }),
    ).toBeVisible({ timeout: 20000 });

    // キャンセルボタンが存在する（completed 後は disabled だが要素は見える）
    await expect(panel.getByRole('button', { name: 'キャンセル' })).toBeVisible();
  });
});
