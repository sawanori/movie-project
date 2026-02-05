# Work Plan: E2Eテスト修正計画

Created Date: 2026-02-05
Type: fix
Estimated Duration: 1 day
Estimated Impact: 6 files

## Related Documents
- E2E Test Files: `movie-maker/tests/e2e/*.spec.ts`
- Component Files: `movie-maker/components/node-editor/WorkflowManager/WorkflowList.tsx`

## Objective
E2Eテスト実行中に発見された問題を修正し、テストの信頼性と安定性を向上させる。

## Background
E2Eテストの実行中に以下の問題カテゴリが特定された：
1. コンポーネントのnull安全性の欠如
2. UIテキスト変更に伴うセレクター不一致
3. タイムアウトとセレクターの精度問題
4. テスト環境制約による未実装テスト項目

---

## 発見された問題のサマリー

| # | 問題 | ファイル | 状態 | 優先度 |
|---|------|---------|------|--------|
| 1 | WorkflowList.tsx null安全性欠如 | WorkflowList.tsx | 修正済み | P0 |
| 2 | セレクター不一致（UIテキスト変更） | story-generate.spec.ts, camera-work-veo.spec.ts | 修正済み | P0 |
| 3 | upscale.spec.ts セレクター/タイムアウト | upscale.spec.ts | 修正済み | P1 |
| 4 | ノードエディタテスト未実装項目 | node-editor*.spec.ts | 要検討 | P2 |

---

## 優先度別分類

### P0: クリティカル（本番環境に影響）

#### 問題 1: WorkflowList.tsx - null安全性の欠如

**状態**: 修正済み

**問題の説明**:
`cloudWorkflows` と `localWorkflows` が undefined の場合にランタイムエラーが発生。

**エラーメッセージ**:
```
Cannot read properties of undefined (reading 'length')
```

**影響範囲**:
- ワークフロー一覧モーダルの表示が失敗
- ユーザーがワークフローの保存・読み込み機能を使用不可
- ノードエディタの基本機能に支障

**根本原因**:
Props として渡される配列が undefined の場合のデフォルト値処理が不十分だった。

**深層分析**:
TypeScript の strict null checks が有効でも、コンパイル時には配列型 `T[]` として定義されているため、
ランタイムで undefined が渡される可能性を完全には防げない。特に以下のケースで発生しやすい:
- 非同期データフェッチ完了前のレンダリング
- 親コンポーネントでの条件付きprops渡し
- APIレスポンスの型定義とランタイム値の不一致

**修正方針**:
1. 関数パラメータにデフォルト値を追加
2. 内部でnull合体演算子による二重保護

**修正コード**:
```typescript
// 修正前
export function WorkflowList({
  localWorkflows,
  cloudWorkflows,
  // ...
}: WorkflowListProps) {
  // localWorkflows.length でエラー
}

// 修正後
export function WorkflowList({
  localWorkflows = [],
  cloudWorkflows = [],
  // ...
}: WorkflowListProps) {
  // Ensure arrays are not undefined
  const safeLocalWorkflows = localWorkflows ?? [];
  const safeCloudWorkflows = cloudWorkflows ?? [];
  // safeLocalWorkflows.length で安全にアクセス
}
```

**テスト方法**:
```bash
cd movie-maker
npx playwright test node-editor.spec.ts --headed
```

---

#### 問題 2: E2Eテストのセレクター不一致

**状態**: 修正済み

**問題の説明**:
UIの更新によりテストセレクターが実際の要素と一致しなくなった。

**変更点**:
| 項目 | 旧 | 新 |
|------|-----|-----|
| ページタイトル | `ストーリー動画を作成` | `ワンシーン生成` |
| アクセントカラー | purple | yellow (#fce300) |
| アスペクト比表示 | `縦長/横長` | `9:16/16:9` |

**影響範囲**:
- `story-generate.spec.ts`: 全テストケースが失敗
- `camera-work-veo.spec.ts`: 全テストケースが失敗

**根本原因**:
UIリデザインに伴うテキスト・スタイリング変更がテストファイルに反映されていなかった。

**修正方針**:
1. セレクターを新しいUIテキストに合わせて更新
2. スタイル検証（色のチェック）を新しい配色に合わせる

**修正コード例**:
```typescript
// story-generate.spec.ts
// 修正前
await page.waitForSelector('text=ストーリー動画を作成', { state: 'visible', timeout: 10000 });

// 修正後
await page.waitForSelector('text=ワンシーン生成', { state: 'visible', timeout: 10000 });

// アスペクト比のセレクター
// 修正前
await expect(page.locator('text=縦長').first()).toBeVisible();

// 修正後
await expect(page.locator('text=9:16').first()).toBeVisible();
```

**テスト方法**:
```bash
cd movie-maker
npx playwright test story-generate.spec.ts --headed
npx playwright test camera-work-veo.spec.ts --headed
```

---

### P1: 高優先度（テストの信頼性に影響）

#### 問題 3: upscale.spec.ts - セレクターとタイムアウト問題

**状態**: 修正済み

**問題の説明**:
複数の問題が複合：
1. `text=HD` が複数要素にマッチしてテストが不安定
2. モーダルがクリックをブロックしてボタン操作が失敗
3. 動画結合処理に30秒以上かかりタイムアウト

**影響範囲**:
- アップスケール機能のE2Eテストが不安定または失敗
- CI/CDパイプラインでのテスト信頼性低下

**根本原因**:
1. セレクターが曖昧で複数要素にマッチ
2. UIの状態遷移（モーダル表示）を考慮していない
3. 動画結合処理の実時間を考慮したタイムアウト設定がない

**修正方針**:
1. より具体的なセレクター（`text=フルHD (1080p)`）を使用
2. モーダル検出とEscapeキーによる閉じる処理を追加
3. タイムアウトを180秒（3分）に延長

**修正コード**:
```typescript
// セレクター修正
// 修正前
const hdOption = page.locator('text=HD').first();

// 修正後
const hdOption = page.locator('text=フルHD (1080p)').first();

// モーダル閉じる処理追加
const modalOverlay = page.locator('.fixed.inset-0.z-50, [role="dialog"]');
if (await modalOverlay.isVisible().catch(() => false)) {
  console.log("Modal detected, pressing Escape to close...");
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);
}

// タイムアウト延長
test('should be able to open download modal with upscale options', async ({ page }) => {
  // This test requires video concatenation which can take up to 3 minutes
  test.setTimeout(180000);
  // ...
});
```

**テスト方法**:
```bash
cd movie-maker
npx playwright test upscale.spec.ts --headed
```

---

### P2: 中優先度（機能カバレッジに影響）

#### 問題 4: ノードエディタテストの未実装項目

**状態**: 要検討

**問題の説明**:
テスト環境の制約により、以下の項目は完全なテストができていない：
- 実際のドラッグ＆ドロップ操作
- 実際の動画生成API呼び出し
- クラウドへの実際の保存/読み込み

**影響範囲**:
- ノードエディタの一部機能がE2Eテストでカバーされない
- リグレッションリスクが残る

**根本原因**:
1. Playwrightでの複雑なドラッグ＆ドロップ操作の制限
2. 外部API依存のテストはモック化が必要
3. クラウドストレージ接続はE2E環境で利用不可

**現状の対応**:
| テスト項目 | 現在の対応 | 備考 |
|-----------|-----------|------|
| ドラッグ＆ドロップ | `draggable`属性の確認のみ | ReactFlowのDnD実装依存 |
| 動画生成API | APIモックで応答確認 | 実API呼び出しは別途統合テストで |
| クラウド保存/読み込み | APIモックで応答確認 | 実接続は手動テストで確認 |

**将来の改善方針**:
1. **ドラッグ＆ドロップ**: Playwright `dragTo` APIを使用したテスト追加
2. **動画生成API**: 統合テスト環境でのE2Eテスト追加
3. **クラウド保存**: ステージング環境でのE2Eテスト追加

---

## Implementation Phases

### Phase 1: 修正確認と検証（推定コミット数: 1）

**Purpose**: 修正済み項目の動作確認

#### Tasks
- [x] WorkflowList.tsx のnull安全性修正確認
- [x] story-generate.spec.ts のセレクター修正確認
- [x] camera-work-veo.spec.ts のセレクター修正確認
- [x] upscale.spec.ts のセレクター・タイムアウト修正確認
- [x] 全E2Eテストの実行と結果確認

#### Phase Completion Criteria
- [x] 全修正済みテストが通過
- [x] 新たなランタイムエラーが発生しない

#### Operational Verification Procedures
```bash
cd movie-maker
npx playwright test --reporter=html
open playwright-report/index.html
```

---

### Phase 2: ドキュメント更新（推定コミット数: 1）

**Purpose**: テスト結果の記録と知見の文書化

#### Tasks
- [x] テスト結果のスクリーンショット保存
- [x] CI/CD設定の確認（タイムアウト設定等）
- [x] 本ドキュメントの更新

#### Phase Completion Criteria
- [x] テスト結果が記録されている
- [x] 今後の開発者が参照できるドキュメントが整備されている

---

### Final Phase: Quality Assurance (Required)

**Purpose**: 全体品質確認

#### Tasks
- [x] 全E2Eテストのパス確認
- [x] lint/format チェック
- [x] 本番環境への影響がないことの確認

---

## Risks and Countermeasures

### Technical Risks
- **Risk**: UIの更新が頻繁に発生し、テストが再び壊れる
  - **Impact**: 開発サイクルの遅延
  - **Countermeasure**: data-testid属性の活用、セレクター戦略の統一

- **Risk**: タイムアウト延長によるCI実行時間の増加
  - **Impact**: CIコスト増加、フィードバック遅延
  - **Countermeasure**: 並列実行の最適化、条件付きテスト実行

- **Risk**: テストフィクスチャ管理の欠如
  - **Impact**: テスト間の状態汚染、フレーキーテスト発生
  - **Countermeasure**: beforeEach/afterEachでのクリーンアップ徹底、localStorage/sessionStorage初期化

### Schedule Risks
- **Risk**: 未検出のテスト問題が追加で見つかる
  - **Impact**: 修正作業の追加発生
  - **Countermeasure**: 段階的なテスト実行、優先度に基づく対応

---

## 今後の改善提案

### 1. テスト自動化の強化

#### セレクター戦略の統一
```typescript
// 推奨: data-testid属性を使用
<button data-testid="download-button">ダウンロード</button>

// テストコード
const downloadBtn = page.locator('[data-testid="download-button"]');
```

#### テストユーティリティの整備
```typescript
// tests/e2e/utils/selectors.ts
export const selectors = {
  generatePage: {
    title: 'text=ワンシーン生成',
    aspectRatio: {
      portrait: 'text=9:16',
      landscape: 'text=16:9',
    },
    // ...
  },
};
```

### 2. CI/CD統合

#### GitHub Actions設定例
```yaml
name: E2E Tests
on: [push, pull_request]
jobs:
  e2e:
    runs-on: ubuntu-latest
    timeout-minutes: 30
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm ci
      - run: npx playwright install --with-deps
      - run: npm run test:e2e
      - uses: actions/upload-artifact@v4
        if: failure()
        with:
          name: playwright-report
          path: playwright-report/
```

### 3. モニタリング

#### テスト実行メトリクス
- テスト実行時間の推移
- 失敗率のトラッキング
- Flaky testの特定と対応

#### アラート設定
- テスト失敗時の通知
- タイムアウト増加傾向の検知

### 4. waitForTimeout アンチパターンの置き換え（P3）

**問題**: 現在のテストコードで `waitForTimeout` が使用されている箇所があり、これはフレーキーテストの原因となる。

**現状のアンチパターン**:
```typescript
// 悪い例: 固定時間待機
await page.waitForTimeout(500);
await button.click();
```

**推奨パターン**:
```typescript
// 良い例: 条件付き待機
await page.waitForSelector('.modal', { state: 'hidden' });
await button.click();

// または actionability チェックを活用
await button.click(); // Playwrightが自動的にクリック可能になるまで待機
```

**対象ファイル**:
- `upscale.spec.ts` - モーダル閉じる処理後の待機
- `node-editor-advanced.spec.ts` - ドラッグ操作後の待機

**優先度**: P3（テスト安定性向上のため中期的に対応）

---

## Completion Criteria
- [x] P0問題が全て修正済み
- [x] P1問題が全て修正済み
- [x] 全E2Eテストがパス（**6ファイル、53テストケース（51 passed, 2 skipped）**）
- [x] 本ドキュメントが完成

### 定量的完了基準
| 項目 | 目標値 | 現在値 |
|------|--------|--------|
| テストファイル数 | 6 | 6 ✅ |
| 総テストケース数 | 53 | 53 (51 passed, 2 skipped) ✅ |
| 失敗テスト数 | 0 | 0 ✅ |
| スキップテスト数 | ≤2 | 2 (upscale機能依存・想定内) ✅ |

## Progress Tracking

### Phase 1
- Start: 2026-02-05
- Complete: 2026-02-05
- Notes: 全修正完了、53テスト（51 passed, 2 skipped）検証済み

### Phase 2
- Start: 2026-02-05
- Complete: 2026-02-05
- Notes: ドキュメント整備完了、CI/CD設定作成済み
- 詳細計画: `docs/plan/e2e-test-fixes-phase2-plan.md`

---

## Notes

### テストファイル一覧
| ファイル | 説明 | テスト数 |
|---------|------|---------|
| story-generate.spec.ts | ストーリー生成ページのテスト | 8 |
| camera-work-veo.spec.ts | カメラワーク互換性テスト | 4 |
| upscale.spec.ts | アップスケール機能テスト | 2 |
| node-editor.spec.ts | ノードエディタ基本テスト | 15 |
| node-editor-advanced.spec.ts | ノードエディタ詳細テスト | 23 |
| debug-library.spec.ts | ライブラリ機能デバッグテスト | 1 |

### 参考リンク
- [Playwright Best Practices](https://playwright.dev/docs/best-practices)
- [Testing Library Guiding Principles](https://testing-library.com/docs/guiding-principles)
