# シーン動画生成 プロンプト翻訳機能 実装計画書

## 概要

シーン動画生成（1シーンのみ）において、ストーリーボード機能と同様に：
- 日本語プロンプト → 英語プロンプト翻訳
- プロバイダー別テンプレート適用（Runway / Veo）

を実現する。

## 設計方針

**「既存コードを触らない」を最優先**

- ストーリーボード関連のAPI・スキーマ・テーブルは一切変更しない
- `gemini_client.py`の既存関数`translate_scene_to_runway_prompt`を呼び出すのみ
- 新規追加のみで実装し、問題発生時のロールバックを容易にする

## 工数見積もり

| 作業内容 | 工数 | 難易度 |
|---------|------|--------|
| バックエンド: スキーマ追加 | 0.5h | 低 |
| バックエンド: 翻訳エンドポイント追加 | 0.5h | 低 |
| フロントエンド: Step 1にプロバイダー選択移動 | 0.5h | 低 |
| フロントエンド: APIクライアントにメソッド追加 | 0.5h | 低 |
| フロントエンド: Step 2 UI改修 | 1.5h | 中 |
| テスト・動作確認 | 0.5h | - |
| **合計** | **4〜4.5時間** | **低〜中** |

## 現状分析

### 再利用する既存コンポーネント（変更なし）

| ファイル | 関数/クラス | 用途 |
|---------|-------------|------|
| `app/external/gemini_client.py` | `translate_scene_to_runway_prompt()` | 日本語→英語翻訳（テンプレート適用） |
| `app/external/gemini_client.py` | `load_prompt_template()` | Runway/Veoテンプレート読み込み |
| `docs/prompt/runway_template.yaml` | - | Runwayプロンプトテンプレート |
| `docs/prompt/veo_template.yaml` | - | Veoプロンプトテンプレート |

### 新規追加するコンポーネント

| ファイル | 追加内容 |
|---------|----------|
| `app/videos/schemas.py` | `TranslateStoryPromptRequest`, `TranslateStoryPromptResponse` |
| `app/videos/router.py` | `POST /api/v1/videos/story/translate` エンドポイント |
| `lib/api/client.ts` | `translateStoryPrompt()` メソッド |
| `app/generate/story/page.tsx` | UI改修（Step 1, Step 2） |

## 実装詳細

### Phase 1: バックエンド

#### 1.1 スキーマ追加 (`app/videos/schemas.py`)

```python
# ===== シーン動画プロンプト翻訳用 =====

class TranslateStoryPromptRequest(BaseModel):
    """シーン動画用の日本語→英語翻訳リクエスト"""
    description_ja: str = Field(..., description="日本語のシーン説明")
    video_provider: VideoProvider = Field(
        default=VideoProvider.RUNWAY,
        description="動画生成プロバイダー（テンプレート選択用）"
    )


class TranslateStoryPromptResponse(BaseModel):
    """翻訳結果"""
    english_prompt: str = Field(..., description="英語プロンプト（テンプレート適用済み）")
```

#### 1.2 エンドポイント追加 (`app/videos/router.py`)

```python
@router.post("/story/translate", response_model=TranslateStoryPromptResponse)
async def translate_story_prompt(
    request: TranslateStoryPromptRequest,
    current_user: dict = Depends(get_current_user),
):
    """
    シーン動画用：日本語プロンプトを英語に翻訳（テンプレート適用）

    - Runway/Veoプロバイダー別のテンプレートを適用
    - 既存のtranslate_scene_to_runway_prompt関数を再利用
    """
    from app.external.gemini_client import translate_scene_to_runway_prompt

    try:
        english_prompt = await translate_scene_to_runway_prompt(
            description_ja=request.description_ja,
            scene_number=1,  # シーン生成は1シーンのみ
            video_provider=request.video_provider.value,
            scene_act=None,  # シーン生成ではact不要
        )
        return TranslateStoryPromptResponse(english_prompt=english_prompt)
    except Exception as e:
        logger.exception(f"Story prompt translation failed: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"翻訳に失敗しました: {str(e)}"
        )
```

### Phase 2: フロントエンド

#### 2.1 APIクライアント追加 (`lib/api/client.ts`)

```typescript
// videosApi に追加
translateStoryPrompt: (data: {
  description_ja: string;
  video_provider?: 'runway' | 'veo';
}): Promise<{ english_prompt: string }> =>
  fetchWithAuth("/api/v1/videos/story/translate", {
    method: "POST",
    body: JSON.stringify(data),
  }),
```

#### 2.2 Step 1 UI改修 (`app/generate/story/page.tsx`)

プロバイダー選択をStep 3からStep 1に移動：

```
Step 1: 画像アップロード
┌─────────────────────────────────────────────────────────┐
│  1. 物語の始まりとなる画像をアップロード                 │
│                                                         │
│  [画像アップロードエリア]                               │
│                                                         │
│  アスペクト比を選択:                                    │
│  ┌─────────┐  ┌─────────┐                              │
│  │  9:16   │  │  16:9   │                              │
│  │ (縦長)  │  │ (横長)  │                              │
│  └─────────┘  └─────────┘                              │
│                                                         │
│  動画生成エンジン:                    ← Step 3から移動  │
│  ┌─────────┐  ┌─────────┐                              │
│  │ Runway  │  │   Veo   │                              │
│  │ (推奨)  │  │(高品質) │                              │
│  └─────────┘  └─────────┘                              │
│                                                         │
│                              [次へ →]                   │
└─────────────────────────────────────────────────────────┘
```

#### 2.3 Step 2 UI改修 (`app/generate/story/page.tsx`)

日本語/英語プロンプトの両方を表示：

```
Step 2: プロンプトをプレビュー・編集
┌─────────────────────────────────────────────────────────┐
│  2. プロンプトをプレビュー・編集                         │
│                                                         │
│  ┌──────┐  ┌────────────────────────────────────────┐  │
│  │      │  │  日本語プロンプト                       │  │
│  │ 画像 │  │  ┌────────────────────────────────┐    │  │
│  │      │  │  │ AIが生成した日本語の説明...     │    │  │
│  │      │  │  │ （編集可能）                    │    │  │
│  │      │  │  └────────────────────────────────┘    │  │
│  └──────┘  │                                         │  │
│            │  [🔄 再生成]  [📝 英語に翻訳]           │  │
│            │                                         │  │
│            │  英語プロンプト（APIに送信）             │  │
│            │  ┌────────────────────────────────┐    │  │
│            │  │ [Runway Template applied]       │    │  │
│            │  │ The scene opens with...         │    │  │
│            │  │ （編集可能）                    │    │  │
│            │  └────────────────────────────────┘    │  │
│            │  ※ 選択中のエンジン: Runway             │  │
│            └────────────────────────────────────────┘  │
│                                                         │
│  [← 戻る]                              [次へ →]        │
└─────────────────────────────────────────────────────────┘
```

#### 2.4 State変更

```typescript
// 既存
const [storyText, setStoryText] = useState("");

// 変更後
const [japanesePrompt, setJapanesePrompt] = useState("");  // 日本語プロンプト
const [englishPrompt, setEnglishPrompt] = useState("");    // 英語プロンプト（API送信用）
const [translating, setTranslating] = useState(false);     // 翻訳中フラグ
```

#### 2.5 翻訳処理

```typescript
const handleTranslate = async () => {
  if (!japanesePrompt) return;

  setTranslating(true);
  try {
    const res = await videosApi.translateStoryPrompt({
      description_ja: japanesePrompt,
      video_provider: videoProvider,
    });
    setEnglishPrompt(res.english_prompt);
  } catch (error) {
    alert("翻訳に失敗しました");
  } finally {
    setTranslating(false);
  }
};
```

#### 2.6 API送信時の変更

```typescript
// 変更前
const videoRes = await videosApi.createStoryVideo({
  story_text: storyText,
  ...
});

// 変更後
const videoRes = await videosApi.createStoryVideo({
  story_text: englishPrompt,  // 英語プロンプトを送信
  ...
});
```

## UI/UXフロー

```
1. ユーザーが画像をアップロード
2. アスペクト比を選択（9:16 / 16:9）
3. 動画生成エンジンを選択（Runway / Veo）← Step 1で選択
4. 「次へ」をクリック → Step 2へ

5. AIが日本語プロンプトを自動生成（既存機能）
6. ユーザーが日本語プロンプトを確認・編集
7. 「英語に翻訳」ボタンをクリック
8. 選択したエンジンのテンプレートで英語プロンプト生成
9. 必要に応じて英語プロンプトも編集可能
10. 「次へ」をクリック → Step 3へ

11. オプション設定（BGM, オーバーレイ等）
12. 「動画を生成」→ 英語プロンプトがAPIに送信される
```

## ファイル変更一覧

### 変更するファイル（追加のみ）

| ファイル | 変更内容 |
|---------|----------|
| `app/videos/schemas.py` | 新規スキーマ2つ追加 |
| `app/videos/router.py` | 新規エンドポイント1つ追加 |
| `lib/api/client.ts` | メソッド1つ追加 |
| `app/generate/story/page.tsx` | Step 1, Step 2 UI改修 |

### 変更しないファイル（明示的に保護）

| ファイル | 理由 |
|---------|------|
| `app/external/gemini_client.py` | 既存関数を呼び出すのみ |
| `app/tasks/story_processor.py` | 変更不要 |
| `app/tasks/storyboard_processor.py` | ストーリーボードは触らない |
| ストーリーボード関連全て | 触らない |

## テスト項目

### 機能テスト

- [ ] 日本語プロンプトから英語プロンプトに翻訳できること
- [ ] Runwayテンプレートが適用されること
- [ ] Veoテンプレートが適用されること
- [ ] 英語プロンプトが編集できること
- [ ] 英語プロンプトがAPIに正しく送信されること

### UIテスト

- [ ] Step 1でプロバイダー選択ができること
- [ ] Step 2で日本語/英語両方のテキストエリアが表示されること
- [ ] 翻訳ボタンが動作すること
- [ ] 翻訳中のローディング表示があること
- [ ] Step 3からプロバイダー選択が削除されていること

### 後方互換性テスト

- [ ] ストーリーボード機能が正常に動作すること（変更なし確認）

## 実装順序

1. バックエンド: スキーマ追加
2. バックエンド: エンドポイント追加
3. フロントエンド: APIクライアント追加
4. フロントエンド: Step 1 UI改修（プロバイダー選択移動）
5. フロントエンド: Step 2 UI改修（日本語/英語プロンプト）
6. フロントエンド: Step 3からプロバイダー選択削除
7. テスト・動作確認

---

作成日: 2025-12-27
