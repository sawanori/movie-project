# サブシーン追加機能の実装計画書（画像生成前）

## 概要

ストーリーボードのプロンプト生成後、画像生成前のタイミングでサブシーンを追加できるようにする機能の実装計画。

## 背景と目的

### 現在のフロー
```
1. upload    → 画像アップロード
2. mood      → ムード選択 → 4シーンのプロンプト生成
3. edit      → プロンプト確認・編集
              → 「画像を生成する」ボタン → 画像生成
              → 【画像生成後にのみサブシーン追加可能】
4. generating → 動画生成
5. review    → 動画プレビュー
```

### 要望のフロー
```
1. upload    → 画像アップロード
2. mood      → ムード選択 → 4シーンのプロンプト生成
3. edit      → プロンプト確認・編集
              → 【サブシーン追加可能】← シーン構成を確定
              → 「画像を生成する」ボタン → 全シーン（親+サブ）の画像を一括生成
4. generating → 動画生成
5. review    → 動画プレビュー
```

### 目的
- ユーザーが画像生成前にシーン構成（カット割り）を確定できる
- サブシーンのプロンプトはユーザーが自由に入力（自動生成ではない）
- 確定後に全シーンの画像を一括生成

---

## 実装難易度

**総合難易度: ★★☆☆☆（やや簡単）**

| 変更箇所 | 内容 | 難易度 |
|---------|------|--------|
| Frontend `storyboard/page.tsx` | サブシーン追加ボタンの表示条件変更 | ★★☆☆☆ |
| Backend `router.py` (add_sub_scene) | Gemini呼び出し削除、空プロンプトで作成 | ★☆☆☆☆ |
| Backend `router.py` (generate_images) | サブシーン含めた画像生成ロジック | ★★★☆☆ |
| テスト | シナリオテスト | ★★☆☆☆ |

### 工数見積もり: 3-5時間

---

## 詳細設計

### 1. フロントエンド変更

#### ファイル: `movie-maker/app/generate/storyboard/page.tsx`

**変更箇所: サブシーン追加ボタンの表示条件**

現在の条件（1642-1643行目付近）:
```tsx
{!scene.parent_scene_id && allScenesHaveImages && scene.scene_image_url && (
  // サブシーン追加ボタン
)}
```

変更後:
```tsx
{!scene.parent_scene_id && (
  // サブシーン追加ボタン（画像生成前でも表示）
)}
```

**追加変更: サブシーン追加後の編集モード**
- サブシーン追加後、自動的に編集モードを開く（ユーザーがプロンプトを入力しやすく）
- または空欄のプロンプト入力欄を表示

---

### 2. バックエンド変更

#### ファイル: `movie-maker-api/app/videos/router.py`

##### 2.1 `add_sub_scene` エンドポイントの修正

**現在の実装（1082-1089行目付近）:**
```python
# プロンプトを生成（Gemini呼び出し）
prompt_data = await generate_sub_scene_prompt(
    parent_prompt=parent_scene["runway_prompt"],
    parent_description_ja=parent_scene["description_ja"],
    sub_scene_order=new_sub_scene_order,
    camera_work=camera_work,
    video_provider=video_provider,
)
```

**変更後:**
```python
# プロンプトは空で作成（ユーザーが入力）
prompt_data = {
    "description_ja": "",  # ユーザーが入力
    "runway_prompt": "",   # ユーザーが翻訳で生成
}
```

**現在の実装（1093-1125行目付近）:**
```python
# 入力画像を決定（親シーンの動画がある場合は最終フレームを抽出）
scene_image_url = parent_scene.get("scene_image_url")

if parent_scene.get("video_url"):
    # 動画から最終フレーム抽出...
```

**変更後:**
```python
# 画像生成前の場合はNullで作成
scene_image_url = None

# 親に動画がある場合のみフレーム抽出（従来の動作を維持）
if parent_scene.get("video_url"):
    # 動画から最終フレーム抽出...
    # （既存コードをそのまま維持）
elif parent_scene.get("scene_image_url"):
    # 親に画像がある場合は継承（画像生成後の追加）
    scene_image_url = parent_scene.get("scene_image_url")
# else: scene_image_url = None（画像生成前の追加）
```

##### 2.2 `generate_storyboard_images` エンドポイントの修正

**現在の実装（899-900行目）:**
```python
if len(scenes) != 4:
    raise HTTPException(status_code=400, detail="ストーリーボードに4シーンが必要です")
```

**変更後:**
```python
if len(scenes) < 4:
    raise HTTPException(status_code=400, detail="ストーリーボードに最低4シーンが必要です")
```

**現在の実装（907-917行目）:**
```python
for scene in scenes:
    scene_number = scene["scene_number"]

    if scene_number == 1:
        # シーン1は元画像を使用
        ...
        continue
```

**変更後:**
```python
# シーンを親子関係でグループ化して処理
# 親シーン → そのサブシーン → 次の親シーン... の順で画像生成

# 親シーンのみ抽出（scene_number 1-4）
parent_scenes = [s for s in scenes if s.get("parent_scene_id") is None]

for parent in parent_scenes:
    parent_scene_number = parent["scene_number"]

    # 親シーンの画像生成
    if parent_scene_number == 1:
        # シーン1は元画像
        parent_image_url = source_image_url
    else:
        # シーン2-4は画像生成
        parent_image_url = await _generate_scene_image(...)

    # この親のサブシーンを取得
    sub_scenes = [s for s in scenes if s.get("parent_scene_id") == parent["id"]]

    for sub in sub_scenes:
        # サブシーンは親の画像を参照して生成
        await _generate_scene_image(
            ...
            reference_image_url=parent_image_url,
            previous_scene_image_url=parent_image_url,
        )
```

---

### 3. データフロー

#### サブシーン追加時（画像生成前）

```
User: サブシーン追加ボタンクリック
  ↓
Frontend: POST /storyboard/{id}/scenes/{parent}/add-sub-scene
  ↓
Backend:
  - 空のプロンプトでサブシーンレコード作成
  - scene_image_url = NULL
  - status = "pending"
  ↓
Frontend: 新しいシーンカードを表示（プロンプト入力欄）
  ↓
User: 日本語説明を入力
  ↓
User: 翻訳ボタン → 英語プロンプト生成
  ↓
User: 全シーン確定、「画像を生成する」ボタン
  ↓
Backend: POST /storyboard/{id}/generate-images
  - 親シーン1-4の画像生成
  - 各親のサブシーンも順次生成
```

---

## UI/UX設計

### 画像生成前のシーンカード表示

```
┌─────────────────────────────────────┐
│ [起]                          5秒   │
├─────────────────────────────────────┤
│  ┌─────────────────────────────┐    │
│  │                             │    │
│  │     📷 画像未生成            │    │
│  │                             │    │
│  └─────────────────────────────┘    │
│                                     │
│  日本語説明:                         │
│  「主人公が窓の外を見つめている」     │
│                                     │
│  Runway Prompt:                     │
│  A protagonist gazes out...         │
│                                     │
│  [📷 カメラ設定] [✏️ 編集]           │
│                                     │
│  ─────────────────────────────────  │
│  [＋ カット追加 (0/3)]              │  ← 画像生成前でも表示
└─────────────────────────────────────┘
```

### サブシーン追加後（プロンプト未入力）

```
┌─────────────────────────────────────┐
│ [起] +1                       5秒 🗑 │  ← サブシーンラベル
├─────────────────────────────────────┤
│  ┌─────────────────────────────┐    │
│  │                             │    │
│  │     📷 画像未生成            │    │
│  │                             │    │
│  └─────────────────────────────┘    │
│                                     │
│  日本語説明:                         │
│  ┌─────────────────────────────┐    │
│  │ プロンプトを入力...          │    │  ← 空欄、ユーザー入力待ち
│  └─────────────────────────────┘    │
│                                     │
│  [🌐 英語に翻訳]                     │
│                                     │
│  [📷 カメラ設定] [✏️ 編集]           │
└─────────────────────────────────────┘
```

---

## テスト計画

### 機能テスト

| # | テストケース | 期待結果 |
|---|-------------|---------|
| 1 | プロンプト生成後、画像生成前にサブシーン追加 | 空のサブシーンが追加される |
| 2 | サブシーンにプロンプトを入力して翻訳 | 英語プロンプトが生成される |
| 3 | サブシーン含めて画像一括生成 | 全シーン（親+サブ）の画像が生成される |
| 4 | サブシーン3つ追加後、さらに追加を試みる | エラーメッセージ表示 |
| 5 | サブシーンを削除 | シーン番号が再計算される |

### 既存機能への影響テスト

| # | テストケース | 期待結果 |
|---|-------------|---------|
| 1 | 画像生成後にサブシーン追加（従来動作） | 従来通り動作する |
| 2 | サブシーンなしで画像生成 | 従来通り4シーンのみ生成 |
| 3 | 動画生成・結合 | サブシーン含めて正常に動作 |

---

## 実装順序

1. **Backend: `add_sub_scene`修正** (30分)
   - Gemini呼び出し削除
   - 空プロンプトでシーン作成
   - 画像URLをNullで作成可能に

2. **Backend: `generate_storyboard_images`修正** (1-2時間)
   - シーン数チェックの緩和
   - 親子関係を考慮した画像生成順序

3. **Frontend: 表示条件変更** (30分)
   - `allScenesHaveImages`条件を削除
   - サブシーン追加後の編集モード

4. **テスト・デバッグ** (1-2時間)
   - 各シナリオの動作確認
   - エッジケースの確認

---

## リスクと対策

| リスク | 影響 | 対策 |
|-------|------|------|
| 空プロンプトのまま画像生成 | 画像生成失敗 | 生成前にバリデーション追加 |
| シーン順序の乱れ | 動画結合時の順序問題 | scene_numberの再計算ロジック確認 |
| 既存データとの互換性 | 既存ストーリーボードが壊れる | 既存データは影響なし（追加機能のみ） |

---

## 承認

- [ ] 仕様確認完了
- [ ] 実装開始承認

---

*作成日: 2026-01-01*
