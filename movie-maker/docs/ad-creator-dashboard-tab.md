# アドクリエイター ダッシュボードタブ実装計画書

## 概要

ダッシュボードページに「アドクリエイター」タブを追加し、ユーザーが作成したAd Creator プロジェクトの一覧表示・管理機能を実装する。

## 実装難易度

**中程度** - 既存のストーリー動画タブの構造を参考にできるが、新規テーブル作成とAPI実装が必要。

## 前提条件

- 既存の `app/dashboard/page.tsx` にタブ切り替え機能を追加
- Ad Creator プロジェクト用のSupabaseテーブルが必要
- バックエンドAPIの新規エンドポイント実装が必要

---

## Phase 1: データベース設計とマイグレーション

### 1.1 テーブル設計

```sql
-- ad_creator_projects テーブル
CREATE TABLE ad_creator_projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  aspect_ratio TEXT NOT NULL DEFAULT '16:9',
  target_duration INTEGER NOT NULL DEFAULT 30,
  theory TEXT, -- aida, pasona, kishoutenketsu, storytelling
  status TEXT NOT NULL DEFAULT 'draft', -- draft, processing, completed, failed
  thumbnail_url TEXT,
  final_video_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS ポリシー
ALTER TABLE ad_creator_projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own projects"
  ON ad_creator_projects FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own projects"
  ON ad_creator_projects FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own projects"
  ON ad_creator_projects FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own projects"
  ON ad_creator_projects FOR DELETE
  USING (auth.uid() = user_id);

-- インデックス
CREATE INDEX idx_ad_creator_projects_user_id ON ad_creator_projects(user_id);
CREATE INDEX idx_ad_creator_projects_created_at ON ad_creator_projects(created_at DESC);
```

### 1.2 マイグレーション実行

> **注意**: Supabase MCPツール (`mcp__supabase__apply_migration`) を使用してマイグレーションを実行すること。

```
マイグレーション名: create_ad_creator_projects_table
```

---

## Phase 2: バックエンドAPI実装

### 2.1 スキーマ定義 (`movie-maker-api/app/videos/schemas.py`)

```python
class AdCreatorProjectBase(BaseModel):
    title: str
    description: str | None = None
    aspect_ratio: str = "16:9"
    target_duration: int = 30
    theory: str | None = None

class AdCreatorProjectCreate(AdCreatorProjectBase):
    pass

class AdCreatorProjectResponse(AdCreatorProjectBase):
    id: str
    user_id: str
    status: str
    thumbnail_url: str | None = None
    final_video_url: str | None = None
    created_at: datetime
    updated_at: datetime

class AdCreatorProjectListResponse(BaseModel):
    projects: list[AdCreatorProjectResponse]
    total: int
    page: int
    per_page: int
```

### 2.2 APIエンドポイント (`movie-maker-api/app/videos/router.py`)

| メソッド | パス | 説明 |
|---------|------|------|
| GET | `/ad-creator/projects` | プロジェクト一覧取得 |
| GET | `/ad-creator/projects/{id}` | プロジェクト詳細取得 |
| POST | `/ad-creator/projects` | プロジェクト作成 |
| PUT | `/ad-creator/projects/{id}` | プロジェクト更新 |
| DELETE | `/ad-creator/projects/{id}` | プロジェクト削除 |

### 2.3 実装タスク

1. `schemas.py` にスキーマ追加
2. `router.py` にエンドポイント追加
3. `service.py` にビジネスロジック追加（必要に応じて）

---

## Phase 3: フロントエンド実装

### 3.1 APIクライアント (`movie-maker/lib/api/client.ts`)

```typescript
// Ad Creator Projects API
adCreatorProjects: {
  list: async (page?: number, perPage?: number): Promise<AdCreatorProjectListResponse>
  get: async (id: string): Promise<AdCreatorProjectResponse>
  create: async (data: AdCreatorProjectCreate): Promise<AdCreatorProjectResponse>
  update: async (id: string, data: Partial<AdCreatorProjectCreate>): Promise<AdCreatorProjectResponse>
  delete: async (id: string): Promise<void>
}
```

### 3.2 ダッシュボードタブ追加 (`movie-maker/app/dashboard/page.tsx`)

#### タブ構造の変更

```typescript
type TabType = "story" | "ad-creator";

const [activeTab, setActiveTab] = useState<TabType>("story");
```

#### UIコンポーネント

1. タブ切り替えUI
   - 「ストーリー動画」タブ
   - 「アドクリエイター」タブ

2. Ad Creator プロジェクト一覧
   - サムネイル表示
   - タイトル・説明
   - ステータスバッジ（draft, processing, completed, failed）
   - 作成日時
   - アクションボタン（編集、削除、ダウンロード）

3. 空状態表示
   - プロジェクトがない場合の案内UI
   - 「新規作成」ボタン

### 3.3 コンポーネント分割（推奨）

```
components/
  dashboard/
    ad-creator-project-list.tsx  # プロジェクト一覧
    ad-creator-project-card.tsx  # プロジェクトカード
    dashboard-tabs.tsx           # タブコンポーネント
```

---

## Phase 4: 状態管理と連携

### 4.1 concat/page.tsx との連携

Ad Creator の編集完了時に以下を実行:

1. プロジェクトをSupabaseに保存（未保存の場合は作成、既存なら更新）
2. サムネイル生成・アップロード
3. ステータス更新

### 4.2 プロジェクト保存タイミング

| タイミング | アクション |
|-----------|-----------|
| 脚本生成完了時 | プロジェクト作成（status: draft） |
| カット編集中 | 自動保存（将来実装） |
| 動画生成完了時 | ステータス更新（status: completed） |
| エクスポート完了時 | final_video_url 更新 |

---

## 実装順序

### Step 1: データベース準備
- [ ] Supabase MCP でマイグレーション実行
- [ ] RLS ポリシー確認

### Step 2: バックエンド実装
- [ ] スキーマ定義追加
- [ ] APIエンドポイント実装
- [ ] 動作確認（curl/Postman）

### Step 3: フロントエンド実装
- [ ] APIクライアント関数追加
- [ ] ダッシュボードタブUI実装
- [ ] プロジェクト一覧コンポーネント実装
- [ ] 空状態UI実装

### Step 4: 連携実装
- [ ] concat/page.tsx からプロジェクト保存処理追加
- [ ] サムネイル生成・保存処理追加

### Step 5: テスト
- [ ] APIエンドポイントテスト
- [ ] E2Eテスト（プロジェクト作成→一覧表示）
- [ ] RLS ポリシーテスト（他ユーザーのデータが見えないこと）

---

## テスト計画

### バックエンドテスト

```python
# tests/videos/test_ad_creator_projects.py

def test_create_project():
    """プロジェクト作成テスト"""
    pass

def test_list_projects():
    """プロジェクト一覧取得テスト"""
    pass

def test_get_project():
    """プロジェクト詳細取得テスト"""
    pass

def test_update_project():
    """プロジェクト更新テスト"""
    pass

def test_delete_project():
    """プロジェクト削除テスト"""
    pass

def test_rls_policy():
    """RLSポリシーテスト - 他ユーザーのデータにアクセスできないこと"""
    pass
```

### フロントエンドテスト

1. **手動テスト**
   - タブ切り替えが正常に動作すること
   - プロジェクト一覧が正しく表示されること
   - 新規作成ボタンから concat ページに遷移すること
   - 削除確認ダイアログが表示されること

2. **E2Eテスト（Playwright）**
   - ログイン → ダッシュボード → アドクリエイタータブ選択
   - プロジェクト作成 → 一覧に表示されること
   - プロジェクト削除 → 一覧から消えること

---

## 見積もり工数

| フェーズ | 作業内容 | 目安 |
|---------|---------|------|
| Phase 1 | DB設計・マイグレーション | 小 |
| Phase 2 | バックエンドAPI | 中 |
| Phase 3 | フロントエンドUI | 中〜大 |
| Phase 4 | 連携・保存処理 | 中 |
| テスト | 全体テスト | 小〜中 |

---

## 注意事項

1. **RLSポリシー必須**: ユーザーデータの分離を確実にする
2. **サムネイル生成**: 既存の動画サムネイル生成ロジックを流用可能
3. **ステータス管理**: 非同期処理（動画生成等）のステータス更新を正確に
4. **エラーハンドリング**: API呼び出し失敗時のUI表示を考慮

---

## 関連ファイル

- `movie-maker/app/dashboard/page.tsx` - ダッシュボードページ
- `movie-maker/app/concat/page.tsx` - Ad Creator 編集ページ
- `movie-maker-api/app/videos/router.py` - バックエンドAPI
- `movie-maker-api/app/videos/schemas.py` - スキーマ定義
- `movie-maker/lib/api/client.ts` - APIクライアント
