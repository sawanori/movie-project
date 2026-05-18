# Design Doc: TTS 感情・トーン指定機能 (gpt-4o-mini-tts instructions 活用)

- **作成日**: 2026-05-18
- **最終更新**: 2026-05-18
- **ステータス**: Draft
- **対象バージョン**: movie-maker-api (FastAPI, Python 3.11+), movie-maker (Next.js 16 / React 19)
- **関連 Design Doc**:
  - [`2026-05-14_dialogue-node.md`](./2026-05-14_dialogue-node.md) — DialogueNode (Pipeline 型 TTS ミックス ノード) の既存仕様
  - [`2026-05-17_prompt-translation-improvements.md`](./2026-05-17_prompt-translation-improvements.md) — DialogueNode への入力 (セリフ) を生成する翻訳側の仕様
- **関連コミット**:
  - `843e6b7` — `TTSProviderInterface.generate_speech()` に `instructions: Optional[str]` 引数を追加 (本 doc 作業の前提)
- **複雑度評価**: `complexity_level: medium`
  - **complexity_rationale**:
    1. 要件/AC: バックエンド 4 ファイル + フロントエンド 4 ファイルの横断改修。Provider レイヤ (OpenAI: 適用 / ElevenLabs: 無視) で挙動が分岐し、UI 側もプロバイダー非対応時の注記表示を必要とする。
    2. 制約/リスク: 既存 `dialogue_generations` テーブルへの後方互換 (新フィールド未指定時に既存挙動を維持)、Gemini や OpenAI が日本語より英語 instructions の方を精密に解釈する点を踏まえたデフォルト文の英語化、Pydantic / TS 型の整合性、TTS_PROVIDER=elevenlabs のユーザーへの誤解防止 (instructions が静かに無視される事故)。

---

## 0. Agreement Checklist (合意事項)

ユーザーから受領した要件:

- **A** デフォルト instructions を強化し、何もしなくても感情豊かにする。
  - 反映先: §4-1-3 (`OpenAITTSProvider.generate_speech` デフォルト文の差し替え) / §5 デフォルト instructions 強化
- **B** UI で 6 プリセット感情から選択可能にする。
  - 反映先: §4-2-2 (`DialogueNode.tsx` プリセットボタン群) / §6 プリセット定義
- **C** UI で自由記述で細かい感情指定可能にする。
  - 反映先: §4-2-2 (`DialogueNode.tsx` textarea) / §7 エッジケース
- **D** ElevenLabs プロバイダー使用時は instructions が無視されることを明示する。
  - 反映先: §4-2-2 (注記コンポーネント) / §7-4 ElevenLabs 互換性
- **スコープ**: DialogueNode 内の TTS instructions のみ。TTS 単独 API (`/api/v1/tts`) や Storyboard 経由の TTS は対象外 (今 doc では取り扱わない)。
- **非スコープ**: 音声プレビュー、instructions 履歴保存、感情強度スライダー、SSML 入力。

各合意項目はそれぞれ後段セクションに明確に反映される (反映先未記入の項目なし)。

レビュー指摘事項反映ステータス (2026-05-18 更新):

| 指摘 | 内容 | 反映先 | ステータス |
|------|------|--------|----------|
| B1 | `max_length` を 2000 → 1000 文字に切り下げ | §4-1-1、§11 未解決事項 | 反映済 |
| B2 | `tts_processor.py` の `select("*")` / `generate_speech` 呼び出し箇所の明記 | §4-1-2 | 反映済 |
| B3 | プロバイダー注記 = A 案 (常時表示) 採用確定 | §4-2-2、§11 U1 | 反映済 (A 案確定) |
| B4 | 空文字と None の意味を統一、AC10 を AC10a/AC10b に分割 | §7-1、§10 | 反映済 |
| N1 | `createDefaultNodeData()` 内 `case 'dialogue':` 実装時確認注記 | §3-3 フロントエンド表 | 反映済 |
| N2 | `handleStartDialogue` 行特定方法の注記 | §4-2-5 | 反映済 |
| N3 | §5 英語推奨理由の項目 4 に References §17 のコミュニティリンク付与 | §5 | 反映済 |
| N4 | Phase 4 工数を `1.5 日` → `1.0-1.5 日` に変更 | §11 | 反映済 |
| N6 | §8-2 にテストファイル実在確認コマンドを明記 | §8-2 | 反映済 |
| N7 | DialogueNode テストに `<ReactFlowProvider>` ラップが必要な旨を追記 | §9-2 | 反映済 |

---

## 1. 背景・課題

### 1-1. ユーザーからのフィードバック

ユーザーが DialogueNode (`movie-maker/components/node-editor/nodes/DialogueNode.tsx`) で TTS 合成を試したが、以下のフィードバックを受領:

> AI 棒読み感がなくならない、もっと感情を乗せた感じにしたい。

### 1-2. 現状の実装と未活用ポテンシャル

実コード調査結果:

| パス | 行 | 役割 / 現状 |
|--|--|--|
| `movie-maker-api/app/external/openai_tts_provider.py` | L35-90 | `OpenAITTSProvider`: model=`gpt-4o-mini-tts` (即時切替済)、`instructions` 引数受け取り済 (コミット 843e6b7)。デフォルト「自然で聞き取りやすい日本語で読み上げてください…」(日本語、汎用的) |
| `movie-maker-api/app/external/tts_provider.py` | L46-72 | `TTSProviderInterface.generate_speech` のシグネチャに `instructions: Optional[str] = None` あり (843e6b7) |
| `movie-maker-api/app/external/elevenlabs_provider.py` | L67-93 | `instructions` 受け取るが**未使用** (`generate_speech` の docstring に「ElevenLabs では未サポートのため無視」と明記済) |
| `movie-maker-api/app/dialogue/schemas.py` | L12-24 | `DialogueCreateRequest`: `text` / `voice_id` / `language` / `speed` / `use_lip_sync` のみ。`instructions` フィールド**なし** |
| `movie-maker-api/app/dialogue/router.py` | L26-55 | `create_dialogue` ハンドラ: 上記 schema 5 フィールドを `create_dialogue_generation` に渡す |
| `movie-maker-api/app/dialogue/service.py` | L16-56 | `create_dialogue_generation`: 5 フィールドを `dialogue_generations` テーブルに INSERT |
| `movie-maker-api/app/tasks/dialogue_processor.py` | L338-400 | `_run_tts_and_get_audio_url`: `create_tts_generation` を呼ぶが `instructions` を**渡していない** |
| `movie-maker-api/app/tts/service.py` | L15-49 | `create_tts_generation` のシグネチャに `instructions` **なし** |
| `movie-maker-api/app/tasks/tts_processor.py` | L48-66 | `process_tts_generation`: `record` から `instructions` を読み取らず、`provider.generate_speech` 呼び出し時にも渡していない |
| `movie-maker/components/node-editor/nodes/DialogueNode.tsx` | L23-271 | 入力フォーム: テキスト / 声 / 速度 / リップシンク のみ。instructions 入力 UI **なし** |
| `movie-maker/lib/types/node-editor.ts` | L178-194 | `DialogueNodeData`: `ttsInstructions` フィールド**なし** |
| `movie-maker/lib/api/client.ts` | L2013-2051 | `dialogueApi.create`: `DialogueCreatePayload` に `instructions` フィールド**なし** |

### 1-3. なぜ今修正するか

`gpt-4o-mini-tts` (OpenAI 2025/3 リリース) の最大の差別化ポイントは**自然言語の `instructions` パラメータで感情・トーン・話し方を細かく指示できる**こと。例:

- "Speak with deep emotion and dramatic pauses, like a stage actor"
- "Whisper softly, sounding nervous and uncertain"
- "Speak excitedly with rising intonation, like sharing exciting news"

現状はこのポテンシャルを **UI から一切引き出せていない** (汎用的なデフォルト文 1 種類のみ送信)。
感情指定機能を追加することで、棒読み感の解消と表現力の向上を同時に実現できる。

---

## 2. 目標 (Goals / Non-Goals)

### 2-1. Goals

#### A. デフォルト instructions の強化
- ユーザーが何も操作しなくても、現在より感情豊かな読み上げを得られる。
- デフォルト instructions を**英語化**し、`gpt-4o-mini-tts` が高精度に解釈できる文面にする (OpenAI ドキュメント上、英語 instructions の方が解釈精度が高いことが知られている)。

#### B. 6 プリセット感情選択 UI
- DialogueNode に **6 個のプリセットボタン** (喜び/悲しみ/怒り/驚き/落ち着き/困惑) を配置。
- ボタン押下で対応する英語 instructions が `data.ttsInstructions` にセットされ、textarea にも反映される。
- 折りたたみ UI (デフォルト折りたたみ) でノードの高さを過剰に伸ばさない。

#### C. 自由記述 instructions
- 折りたたみ展開時に表示される textarea で、ユーザーが自由に英語 / 日本語 instructions を記述できる。
- プリセット選択後の微調整 / 完全カスタム入力の両方を許容。

#### D. ElevenLabs 非対応の明示
- 現在のプロバイダーが OpenAI TTS 以外 (例: ElevenLabs) の場合、UI に「instructions は OpenAI TTS のみで有効。現在のプロバイダーでは無視されます」と明記する。
- バックエンドは現状の挙動を維持: ElevenLabs プロバイダーは `instructions` を受け取って無視する (例外なし)。

### 2-2. Non-Goals (今回スコープ外)

- TTS 単独 API (`/api/v1/tts`) への `instructions` 追加 (DialogueNode 経由のみ対象)
- Storyboard 経由の TTS (`storyboard_processor`) への展開
- instructions のプリセット 7 種以上への拡張 (将来検討)
- 感情強度スライダー (mild / medium / strong)
- 音声プレビュー機能 (instructions を変えながら試聴)
- instructions のユーザー履歴保存 / DB 化
- SSML タグ入力 (`gpt-4o-mini-tts` は SSML 非対応のため不要)
- 多言語 TTS (現状 `language='ja'` 固定なので英語 / 中国語等の検証は別 doc)

---

## 3. 既存コードベース調査 (Existing Codebase Analysis)

### 3-1. 類似機能検索の結果

- **検索キーワード**: `instructions`, `tts_instructions`, `emotion`, `tone`, `preset`
- **検索範囲**: `movie-maker-api/app/` および `movie-maker/`
- **結果**:
  - `OpenAITTSProvider.generate_speech` の `instructions` 引数は既存 (843e6b7 で追加済)、**ただし呼び出し側 (dialogue_processor → tts_processor → tts_service) が値を渡していない** ため事実上未使用。
  - 感情プリセット / トーン指定の UI コンポーネントは存在しない。
  - 折りたたみ UI のパターンは `CameraControlNode` / `KlingCameraControlNode` などで既に使用 (`details/summary` または `useState<boolean>` + ボタンによる collapse)。本 doc では DialogueNode に統一感を持たせるため、`useState<boolean>` 方式を踏襲。

### 3-2. 採用判断

| 判断 | 理由 |
|------|------|
| **既存実装の使用 = 部分的** | Provider 層の `instructions` 引数は既存実装をそのまま使う。Schema / Service / Processor 層は新規にフィールド追加。 |
| **改善提案 ADR 不要** | 既存実装 (843e6b7) は健全。フィールド貫通の配線漏れがあるだけで、設計上の問題はない。 |
| **新規実装** | UI (6 プリセットボタン + textarea) はフロントエンド新規。 |

### 3-3. 実装パスマッピング

#### バックエンド

| ファイル | 状態 | 変更内容 |
|--|--|--|
| `app/dialogue/schemas.py` | 既存 | `DialogueCreateRequest` に `tts_instructions: Optional[str]` 追加 |
| `app/dialogue/router.py` | 既存 | `request.tts_instructions` を `create_dialogue_generation` に渡す |
| `app/dialogue/service.py` | 既存 | `create_dialogue_generation` シグネチャ拡張 + INSERT 列追加 |
| `app/tasks/dialogue_processor.py` | 既存 | `_process_core` / `_run_tts_and_get_audio_url` に `tts_instructions` 引数追加、`create_tts_generation` に渡す |
| `app/tts/service.py` | 既存 | `create_tts_generation` シグネチャに `instructions: Optional[str]` 追加 + INSERT 列追加 |
| `app/tasks/tts_processor.py` | 既存 | `record.get("instructions")` を取得し `provider.generate_speech` に渡す |
| `app/external/openai_tts_provider.py` | 既存 | デフォルト instructions 文を新しい英語版に差し替え |
| `app/external/tts_provider.py` | 既存 | 変更なし (`instructions` は既存シグネチャ) |
| `app/external/elevenlabs_provider.py` | 既存 | 変更なし (引数受け取って無視は既存挙動) |
| `docs/migrations/YYYYMMDD_add_tts_instructions.sql` | **新規** | `dialogue_generations.tts_instructions` + `tts_generations.instructions` を NULL 許容で追加 |

#### フロントエンド

| ファイル | 状態 | 変更内容 |
|--|--|--|
| `lib/types/node-editor.ts` | 既存 | `DialogueNodeData` に `ttsInstructions?: string` 追加 + `createDefaultNodeData('dialogue')` 更新。**実装時に `case 'dialogue':` 該当行を grep で特定して追記すること** |
| `components/node-editor/nodes/DialogueNode.tsx` | 既存 | 折りたたみ UI / 6 プリセットボタン / textarea / プロバイダー非対応注記 を追加 |
| `lib/api/client.ts` | 既存 | `DialogueCreatePayload` に `tts_instructions?: string` 追加 |
| `components/node-editor/NodeEditor.tsx` | 既存 | `handleStartDialogue` 内で `dialogueApi.create` に `tts_instructions: data.ttsInstructions` を含める |
| `lib/constants/tts-emotion-presets.ts` | **新規** | 6 プリセットの定数定義 (key / 絵文字 / ラベル / 英語 instructions) |

### 3-4. 統合ポイント (Integration Points)

`gpt-4o-mini-tts` の `instructions` パラメータは、API 末端 (`OpenAITTSProvider.generate_speech` 内 L91-92) で `payload["instructions"] = instructions` として送信される。
この値が `DialogueNode` UI → `dialogueApi.create` → `/api/v1/dialogue` → `dialogue_processor._run_tts_and_get_audio_url` → `tts.service.create_tts_generation` → `tts_generations` テーブル → `tts_processor.process_tts_generation` → `OpenAITTSProvider.generate_speech` まで**8 段を通り抜ける**ことが要件。
既存の `text` / `voice_id` / `speed` と同じ経路を辿るため、各段で同じパターンを追加するだけで貫通する。

---

## 4. 採用案 (設計詳細)

### 4-1. バックエンド

#### 4-1-1. Schema 拡張 (`app/dialogue/schemas.py`)

`DialogueCreateRequest` に新フィールドを追加:

```yaml
新フィールド: tts_instructions
  型: Optional[str]
  デフォルト: None
  バリデーション:
    - 文字数上限: 1000 (安全側として採用。OpenAI 公式仕様で instructions の max length が未確認のため、
      gpt-4o-mini-tts の input token 上限 2000 より保守的な 1000 文字を採用。
      実機検証後にドキュメント更新と同時に再評価する)
    - 空文字 ('') は None と同等に扱う (バックエンドで normalize)
  description: |
    感情/トーン指定 (gpt-4o-mini-tts のみで適用)。
    英語推奨。日本語も受理 (解釈精度は劣る可能性)。
    未指定の場合は OpenAI プロバイダーのデフォルト instructions が適用される。
    ElevenLabs プロバイダーでは無視される。
```

実装サンプル (構造のみ、最終実装は task で確定):

```python
class DialogueCreateRequest(BaseModel):
    video_url: str
    text: str = Field(..., min_length=1, max_length=5000)
    voice_id: str
    language: str = Field(default="ja")
    speed: float = Field(default=1.0, ge=0.25, le=4.0)
    use_lip_sync: bool = Field(default=False)
    tts_instructions: Optional[str] = Field(
        default=None,
        max_length=1000,
        description="感情/トーン指定 (gpt-4o-mini-tts のみ適用)",
    )
```

#### 4-1-2. Service / Processor 配線

**`app/dialogue/service.py`**:
- `create_dialogue_generation` に `tts_instructions: Optional[str] = None` 引数追加。
- `record_data["tts_instructions"]` を INSERT。

**`app/dialogue/router.py`**:
- `request.tts_instructions` を `create_dialogue_generation` に渡す。

**`app/tasks/dialogue_processor.py`**:
- `process_dialogue_generation` で `record.get("tts_instructions")` を読み取り、`_process_core` / `_run_tts_and_get_audio_url` に伝播。
- `_run_tts_and_get_audio_url` → `create_tts_generation(..., instructions=tts_instructions)` に渡す。

**`app/tts/service.py`**:
- `create_tts_generation` に `instructions: Optional[str] = None` 引数追加。
- `record_data["instructions"]` を INSERT。
- `_format_tts_response` には含めなくてよい (内部用 record のみ参照される)。

**`app/tasks/tts_processor.py`**:
- `tts_processor.py` L37 で `select("*")` を使用しているため、新カラム `instructions` は自動的にレコードに含まれる。追加の SELECT 変更は不要。
- L48-51 周辺で `instructions = record.get("instructions")` を取得。
- `generate_speech` 呼び出しは `tts_processor.py` L61-66 の **1 箇所のみ** (同期/非同期両プロバイダー共通)。ここで `instructions=instructions` を渡す。
- 注意: 将来 `select(...)` を明示列指定にリファクタする場合は `instructions` を明示列に追加する責務がある。

#### 4-1-3. OpenAITTSProvider デフォルト強化

`app/external/openai_tts_provider.py` L78-83:

```python
# BEFORE
if instructions is None and language == "ja":
    instructions = (
        "自然で聞き取りやすい日本語で読み上げてください。"
        "テキストの感情に合わせた抑揚と表現を心がけてください。"
    )

# AFTER
if (not instructions) and language == "ja":
    instructions = (
        "Speak natural Japanese with rich emotional expression. "
        "Vary pitch, pace, and emphasis to convey the underlying feelings in the text. "
        "Use human-like pauses and intonation, avoiding robotic delivery. "
        "Match the tone to the dialogue's mood (joy, sadness, anger, surprise, etc.) as appropriate."
    )
```

判定を `if instructions is None` から `if (not instructions)` に変更することで、None / 空文字 / whitespace-only を一括して「未指定」とみなし、デフォルトを適用する (§7-1 参照)。

**英語化の理由**: §5 参照。OpenAI ドキュメント / コミュニティ知見では `gpt-4o-mini-tts` の `instructions` は英語の方が高精度に解釈される。日本語のセリフ本体 (`input` パラメータ) は引き続き日本語で送信するため、出力音声は日本語のまま。

#### 4-1-4. DB マイグレーション

`docs/migrations/YYYYMMDD_add_tts_instructions.sql` を新規作成:

```sql
-- dialogue_generations: ユーザーが指定した instructions を保存
ALTER TABLE dialogue_generations
  ADD COLUMN tts_instructions TEXT;

-- tts_generations: dialogue_processor が伝播した instructions を保存
ALTER TABLE tts_generations
  ADD COLUMN instructions TEXT;

-- 後方互換: 両カラムとも NULL 許容、DEFAULT なし
-- 既存レコードは NULL のまま、新規挿入時に省略すれば NULL
```

**注意**: RLS ポリシーは既存テーブルポリシーをそのまま継承するため変更不要。

### 4-2. フロントエンド

#### 4-2-1. 型定義 (`lib/types/node-editor.ts`)

```typescript
export interface DialogueNodeData extends BaseNodeData {
  type: 'dialogue';
  text: string;
  voiceId: string | null;
  language: 'ja';
  speed: number;
  useLipSync: boolean;
  ttsInstructions?: string;  // 新規追加 (undefined = デフォルト適用)
  status: 'idle' | 'pending' | 'processing' | 'completed' | 'failed';
  progress: number;
  generationId: string | null;
  outputVideoUrl: string | null;
}
```

`createDefaultNodeData('dialogue')` の戻り値には `ttsInstructions: undefined` を明示的に含める (空文字ではなく undefined にする理由: §7-1)。

#### 4-2-2. UI 設計 (`DialogueNode.tsx`)

**配置位置**: 速度スライダー (L186-202) と リップシンクトグル (L204-220) の間に挿入。

**コンポーネント構造**:

```
[折りたたみヘッダ "感情・トーン (任意)" + ▼/▲ アイコン]
  └─ (展開時のみ表示)
      [6 プリセットボタン (絵文字 + ラベル)]
        [😊 喜び] [😢 悲しみ] [😠 怒り]
        [😲 驚き] [😌 落ち着き] [😕 困惑]
      [textarea (自由記述)]
        placeholder: "例: Whisper softly with nervous hesitation (英語推奨)"
        rows: 3
        maxLength: 1000
      [プロバイダー非対応注記 (常時表示 = A 案採用確定)]
        折りたたみ展開時に常時表示:
        "※ instructions は OpenAI TTS のみで有効です。現在のプロバイダーでは無視されます。"
```

**A 案採用確定**: プロバイダー非対応注記は折りたたみ展開時に**常時表示**する。動的判定 (`/api/v1/config/tts-provider` 新設) は不要。理由: 新 API 追加は最小スコープ原則に反し、ユーザーが instructions を入力した時点で「プロバイダー次第」と明示する方が安全。動的表示は将来ユーザーニーズが明確になった段階で別 task として検討する。

**インタラクション**:
- プリセットボタン押下 → 対応する英語 instructions が `data.ttsInstructions` にセット + textarea にも反映 (両方向同期)。
- textarea 編集 → `data.ttsInstructions` を直接更新。プリセットボタンのハイライト状態は厳密一致の場合のみ「選択中」表示。
- クリアボタン (× アイコン) で `data.ttsInstructions = undefined` に戻せる (デフォルト適用に戻る)。

#### 4-2-3. プリセット定義 (`lib/constants/tts-emotion-presets.ts`) — **新規ファイル**

```typescript
export interface TTSEmotionPreset {
  key: 'joy' | 'sadness' | 'anger' | 'surprise' | 'calm' | 'confusion';
  emoji: string;
  labelJa: string;
  instructions: string;  // 英語の instructions 全文
}

export const TTS_EMOTION_PRESETS: TTSEmotionPreset[] = [
  { key: 'joy', emoji: '😊', labelJa: '喜び', instructions: '...' },
  // 他 5 件 (§6 参照)
];
```

DialogueNode から import して `.map` でボタンレンダリング。

#### 4-2-4. API クライアント (`lib/api/client.ts`)

L2013-2020 の `DialogueCreatePayload` 型に追加:

```typescript
type DialogueCreatePayload = {
  video_url: string;
  text: string;
  voice_id: string;
  speed?: number;
  use_lip_sync?: boolean;
  tts_instructions?: string;  // 新規追加
};
```

#### 4-2-5. NodeEditor.tsx 配線

`handleStartDialogue` の具体的な行は実装時に `NodeEditor.tsx` を `grep -n "handleStartDialogue"` で特定すること。`dialogueApi.create` を呼ぶ箇所に追加:

```typescript
await dialogueApi.create({
  video_url: inputVideoUrl,
  text: data.text,
  voice_id: data.voiceId,
  speed: data.speed,
  use_lip_sync: data.useLipSync,
  tts_instructions: data.ttsInstructions || undefined,  // 空文字は送らない (AC10a)
});
```

`data.ttsInstructions || undefined` のパターン: 空文字をバックエンドに送ると `Field(max_length=1000)` を通過するが「指定されている」と解釈されデフォルトが適用されなくなる事故を防ぐ (AC10a / §7-1 参照)。

---

## 5. デフォルト instructions 強化 (新)

| | 旧 (日本語) | 新 (英語) |
|--|--|--|
| 文字数 | 53 文字 | 約 290 文字 (英語) |
| 言語 | 日本語 | 英語 |
| 指示の具体性 | 「抑揚と表現」のみ | pitch / pace / emphasis / pauses / intonation / tone の 6 軸を具体的に指示 |
| muted dialogue 対応 | なし | "Match the tone to the dialogue's mood" 一文で文脈追従を促す |

**新デフォルト文**:

```
Speak natural Japanese with rich emotional expression. Vary pitch, pace, and emphasis to convey the underlying feelings in the text. Use human-like pauses and intonation, avoiding robotic delivery. Match the tone to the dialogue's mood (joy, sadness, anger, surprise, etc.) as appropriate.
```

**英語で書く理由**:
1. OpenAI ドキュメント (developers.openai.com) のサンプルが全て英語 instructions。
2. `gpt-4o-mini-tts` の base モデルが GPT-4o mini であり、英語の指示理解が最も精密。
3. 出力音声の言語は `input` パラメータ (テキスト本体) で決まるため、instructions が英語でも日本語音声が出力される。
4. コミュニティ知見 (OpenAI Developer Community) で「instructions は英語推奨」が共通理解 (詳細は §17 の [Voice Instruction with gpt-4o-mini-tts](https://community.openai.com/t/voice-instruction-with-gpt-4o-mini-tts/1372075) を参照)。

---

## 6. 6 プリセット定義 (英語 instructions 全文)

| key | 絵文字 | 日本語ラベル | 英語 instructions |
|--|--|--|--|
| `joy` | 😊 | 喜び | `Speak with bright, cheerful enthusiasm. Use rising intonation and convey happiness and warmth.` |
| `sadness` | 😢 | 悲しみ | `Speak softly with a slower pace and downward intonation. Convey sadness and melancholy without being melodramatic.` |
| `anger` | 😠 | 怒り | `Speak with firm, sharp delivery and emphatic pauses. Convey controlled anger and frustration.` |
| `surprise` | 😲 | 驚き | `Speak with sudden rising intonation and emphatic stress. Convey genuine surprise and astonishment.` |
| `calm` | 😌 | 落ち着き | `Speak with calm, even tone and steady pace. Convey serene composure and gentle reassurance.` |
| `confusion` | 😕 | 困惑 | `Speak with hesitant pauses and uncertain intonation. Convey confusion and bewilderment, as if thinking aloud.` |

**プリセット選択の動作**:
- ボタン押下時、`data.ttsInstructions = preset.instructions` (英語文字列をそのまま代入)。
- textarea にも同じ文字列が表示される (双方向同期)。
- ユーザーが textarea を編集すると、プリセットボタンの「選択中」ハイライトは外れる (厳密一致時のみハイライト)。
- クリアボタンで `ttsInstructions = undefined` に戻る (デフォルト適用)。

---

## 7. エッジケース

### 7-1. instructions が空文字

- **発生条件**: ユーザーが textarea を開いて全て削除した状態。
- **`""` (空文字) も `None` と同等扱い**。デフォルト適用に倒す。理由: ユーザーが UI で textarea を空にした際の意図はデフォルト適用と解釈する方が自然であり、混乱を避けるため統一する。
- **二重防御 (AC10a + AC10b)**:
  - **AC10a (フロントエンド)**: `data.ttsInstructions === ''` の場合、API クライアントが `tts_instructions` を payload から省略する (`data.ttsInstructions || undefined` パターン)。
  - **AC10b (バックエンド)**: 万一空文字がバックエンドに到達しても、`OpenAITTSProvider` の判定 `if (not instructions)` により None と同等扱いとなり、デフォルト英語文が適用される。
- **実装箇所**: バックエンド (`OpenAITTSProvider.generate_speech`) の判定を `if instructions is None` から `if (not instructions)` に変更 (None / 空文字 / whitespace-only を一括して「未指定」とみなす)。

### 7-2. instructions が極端に長い
- **発生条件**: ユーザーが 1000 文字を超えて記述。
- **挙動**:
  - フロントエンド: textarea の `maxLength={1000}` で入力制限。
  - バックエンド: `Field(max_length=1000)` で 422 エラー (Pydantic バリデーション)。
- **対応**: フロントエンド側で 900 文字を超えたら警告表示 (赤字)。「あと N 文字」表示。

### 7-3. 日本語 instructions
- **発生条件**: ユーザーが日本語で「優しく囁くように」等を入力。
- **挙動**: バックエンドはそのまま gpt-4o-mini-tts に送信。OpenAI が日本語を解釈する (精度劣化の可能性)。
- **対応**:
  - 仕様としては「英語推奨だが日本語も受理」とする (拒絶しない)。
  - textarea の placeholder で「英語推奨」を明示。
  - プリセットは全て英語固定なので、プリセット経由なら英語が保証される。

### 7-4. ElevenLabs 使用時の挙動
- **発生条件**: `TTS_PROVIDER=elevenlabs` 環境で DialogueNode 経由で instructions を指定。
- **挙動**:
  - バックエンド: `ElevenLabsProvider.generate_speech` が `instructions` を受け取って無視 (既存挙動、コメント済)。
  - 例外なし、ログ WARN なし (静かに無視)。
- **対応**:
  - フロントエンド UI に注記を常時表示 (§4-2-2 参照 / A 案確定): 「※ instructions は OpenAI TTS のみで有効」
  - **改善余地** (§11): バックエンドで `instructions` が指定されかつプロバイダーが ElevenLabs の場合に WARN ログを出すと、運用時の気付きが上がる。

### 7-5. プリセット選択後に textarea 編集 → 再度同じプリセット選択
- **発生条件**: ユーザーがプリセットを選んだ後 textarea を編集、そして同じプリセットを再選択。
- **挙動**: `data.ttsInstructions` がプリセットの original 文字列に**上書き**される (編集内容は破棄)。
- **対応**: 仕様として OK (ユーザー意図はプリセット適用と解釈)。確認ダイアログは出さない (UX 重視)。

### 7-6. プロバイダー切替時に既存 instructions が残る
- **発生条件**: ユーザーが instructions を入力した状態で TTS プロバイダーが ElevenLabs に切り替わる (将来的なプロバイダー切替 UI が実装された場合)。
- **挙動**: `data.ttsInstructions` は残ったまま、送信されても無視される。
- **対応**: 今回スコープ外 (プロバイダー切替 UI 自体が未実装)。注記表示で気付きを誘発。

---

## 8. 後方互換性

### 8-1. 既存 dialogue 生成が壊れないこと
- 既存の `DialogueCreateRequest` は `tts_instructions` を含まない → 新フィールドは `Optional[str] = None`、未指定で動作。
- 既存の `dialogue_generations` レコードは `tts_instructions` カラムが NULL のまま → `record.get("tts_instructions")` は None → processor で `instructions=None` で TTS 生成 → デフォルト適用。
- 既存 `tts_generations` レコードも `instructions` カラムが NULL のまま → `record.get("instructions")` は None。

### 8-2. 既存テストへの影響
- 実装タスク開始前に `ls tests/dialogue/ tests/tasks/test_dialogue_processor.py tests/tasks/test_tts_processor.py` でテストファイルの実在を確認すること。実在する場合は当該ファイルを更新し、存在しない場合は新規追加する。
- `tests/dialogue/test_router.py` 等 (存在すれば): 新フィールドはオプショナルなので既存テスト無変更で通過。
- `tests/tasks/test_dialogue_processor.py` 等: 同様。
- **要追加**: `test_dialogue_with_instructions.py` (新規 instructions テストケース)。

### 8-3. DB スキーマ後方互換
- `ALTER TABLE ... ADD COLUMN tts_instructions TEXT` は NULL 許容 / DEFAULT なし → 既存行・既存 INSERT 文に影響しない。
- 同様に `tts_generations.instructions` も追加。
- **マイグレーションロールバック**: `ALTER TABLE ... DROP COLUMN ...` で復旧可能 (ただし運用上はやらない)。

### 8-4. 既存 ElevenLabs ユーザー
- `ElevenLabsProvider` は `instructions` を引数で受け取って無視する既存挙動 (843e6b7) → 何も変わらない。
- DB に値が保存されても ElevenLabs 利用時は単に未使用列となる (ストレージコストは無視できるレベル)。

---

## 9. テスト戦略

### 9-1. バックエンド

#### Unit テスト

| テスト対象 | テスト内容 |
|--|--|
| `DialogueCreateRequest` schema | `tts_instructions` が None / 通常文字列 / 1000 文字 / 1001 文字 (バリデーションエラー) で正しく扱われる |
| `create_dialogue_generation` | `tts_instructions` 引数が DB INSERT data に反映される |
| `_run_tts_and_get_audio_url` | `tts_instructions` 引数が `create_tts_generation(..., instructions=...)` に渡される (`AsyncMock` で検証) |
| `create_tts_generation` (tts/service.py) | `instructions` 引数が DB INSERT data に反映される |
| `process_tts_generation` | `record["instructions"]` が `provider.generate_speech(..., instructions=...)` に渡される (`AsyncMock` で検証) |
| `OpenAITTSProvider.generate_speech` | (1) `instructions=None` + `language='ja'` でデフォルト英語文が適用される / (2) `instructions=''` (空文字) でもデフォルトが適用される (§7-1 / AC10b 対応) / (3) `instructions='custom'` で `payload["instructions"] == 'custom'` |
| `ElevenLabsProvider.generate_speech` | `instructions='anything'` を渡しても例外なく完了し payload に含まれない |

#### 統合テスト

- `POST /api/v1/dialogue` に `tts_instructions: "Speak excitedly"` を含めて呼び、Supabase mock 経由で INSERT 内容を検証。
- 既存テスト (instructions なし) も継続パス確認 (後方互換)。

### 9-2. フロントエンド

#### Unit テスト (Vitest)

| テスト対象 | テスト内容 |
|--|--|
| `createDefaultNodeData('dialogue')` | `ttsInstructions` が `undefined` で初期化される |
| `DialogueNode` (RTL) | (1) 初期表示で折りたたみ状態 / (2) ヘッダクリックで展開 / (3) プリセット 6 個のボタンが描画される / (4) ボタン押下で textarea に英語文字列が反映される / (5) textarea 編集で `ttsInstructions` が更新される / (6) クリアボタンで `ttsInstructions = undefined` に戻る |
| 注記表示 | 折りたたみ展開時に「※ instructions は OpenAI TTS のみで有効」が常時表示される |
| `dialogueApi.create` 呼び出し | `data.ttsInstructions = ''` (空文字) のとき `tts_instructions` が undefined として送信される (AC10a / §4-2-5 / §7-1) |

**注意**: `DialogueNode` のテストは `@xyflow/react` の Context を要求するため、`<ReactFlowProvider>` でラップしてレンダリングすること。ラップなしの場合 "Could not find a ReactFlow context" エラーが発生する。

#### E2E テスト (Playwright)

| シナリオ | 検証 |
|--|--|
| プリセット選択 → 合成 | プリセット「喜び」ボタン → 合成ボタン → ステータスが completed になる |
| 自由記述 → 合成 | textarea に "Whisper softly" 入力 → 合成 → completed |
| 何も指定せず合成 | 既存挙動と同じ動作 (後方互換) |

### 9-3. テストカバレッジ目標

- バックエンド新規/改修箇所: 90% (instructions 関連の分岐を全網羅)
- フロントエンド新規/改修箇所: 85% (UI ステート遷移を網羅)

---

## 10. Acceptance Criteria (Given / When / Then)

### AC1: デフォルト instructions 強化 (目標 A)

**Given**: TTS_PROVIDER=openai_tts で動作している、`tts_instructions` を指定しない DialogueNode
**When**: ユーザーが「合成する」を押す
**Then**:
- バックエンドは新しい英語デフォルト文 (§5 の 4 文構成) を gpt-4o-mini-tts に送信する
- 合成は正常に完了し output_video_url が返る
- (定性確認、CI 自動化対象外) 出力音声が以前より感情豊かに聞こえる

### AC2: 6 プリセット選択 (目標 B)

**Given**: DialogueNode が表示され、感情パネルが折りたたまれている
**When**: ユーザーが感情パネルを展開し「😊 喜び」ボタンを押す
**Then**:
- `data.ttsInstructions` に `Speak with bright, cheerful enthusiasm. Use rising intonation and convey happiness and warmth.` がセットされる
- textarea に同じ文字列が表示される
- 「喜び」ボタンが「選択中」状態 (ハイライト) になる
- 「合成する」を押すと、その instructions がバックエンドに送信される

### AC3: 6 プリセット全部の動作 (目標 B)

**Given**: 上記 AC2 と同じ初期状態
**When**: ユーザーがプリセット 6 個 (joy/sadness/anger/surprise/calm/confusion) を順に押す
**Then**: 各プリセット押下で `data.ttsInstructions` が§6 の対応英語文字列に切り替わる

### AC4: 自由記述 instructions (目標 C)

**Given**: 感情パネルが展開され、textarea が空
**When**: ユーザーが textarea に "Whisper softly with nervous hesitation" と入力
**Then**:
- `data.ttsInstructions = 'Whisper softly with nervous hesitation'` になる
- プリセットボタンはどれも「選択中」にならない
- 「合成する」押下で、その文字列がそのままバックエンドに送信される

### AC5: プリセット選択後の自由編集 (目標 B+C 連携)

**Given**: ユーザーが「喜び」プリセットを選んだ状態 (textarea に英語文が入っている)
**When**: ユーザーが textarea を編集し末尾に " Be extra cheerful." を追記
**Then**:
- `data.ttsInstructions` の末尾に追記される
- 「喜び」ボタンの「選択中」ハイライトは外れる (厳密一致でなくなったため)

### AC6: instructions 未指定時の後方互換 (目標 A の後方互換)

**Given**: 感情パネルを一度も開かず `data.ttsInstructions = undefined` のまま
**When**: ユーザーが「合成する」を押す
**Then**:
- `dialogueApi.create` の payload に `tts_instructions` フィールドが含まれない (または `undefined`)
- バックエンドは `OpenAITTSProvider` のデフォルト英語文を適用する
- 合成は正常完了する

### AC7: ElevenLabs プロバイダーでの挙動 (目標 D)

**Given**: TTS_PROVIDER=elevenlabs 環境で DialogueNode に instructions を入力
**When**: ユーザーが「合成する」を押す
**Then**:
- バックエンドは `ElevenLabsProvider.generate_speech` に instructions を渡すが、payload には含まれない
- 例外なく合成が完了する (output_video_url が返る)
- (UI 検証) 感情パネル展開時に「※ instructions は OpenAI TTS のみで有効」の注記が表示されている

### AC8: 折りたたみ UI の初期状態 (目標 B / C の表示)

**Given**: DialogueNode が新規追加された直後
**When**: ユーザーが何も操作しない
**Then**:
- 感情パネルは**折りたたまれた状態**で表示される (ノードの高さが既存比で増えない)
- 「感情・トーン (任意)」ヘッダのみ可視

### AC9: 長文 instructions のバリデーション (目標 C のエッジケース)

**Given**: textarea に 1000 文字以下の instructions が入力された状態
**When**: ユーザーが「合成する」を押す
**Then**: 正常にリクエストが送信される

**Given (反例)**: 既存ユーザーが何らかの方法で 1001 文字を送信
**When**: バックエンドに到達
**Then**: Pydantic バリデーションで HTTP 422 が返る

### AC10a: 空文字 instructions のフロントエンド正規化 (§7-1)

**Given**: ユーザーが textarea を一度開いて全て削除した状態 (`data.ttsInstructions = ''`)
**When**: ユーザーが「合成する」を押す
**Then**:
- API クライアントが空文字を送信しない (`tts_instructions` フィールドが payload から省略される)

### AC10b: 空文字 instructions のバックエンド正規化 (§7-1 二重防御)

**Given**: 万一フロントエンドの正規化をすり抜けて空文字 `''` がバックエンドに到達した場合
**When**: `OpenAITTSProvider.generate_speech` で `instructions = ''` + `language == 'ja'` が評価される
**Then**:
- `(not instructions)` 判定により None と同等扱いとなり、デフォルト英語文が適用される
- 合成は正常完了する

---

## 11. 想定工数 (Phase 別)

| Phase | 内容 | 想定工数 |
|--|--|--|
| Phase 1: Backend Schema + DB | `dialogue/schemas.py` 拡張、マイグレーション SQL 作成・適用 | 0.5 日 |
| Phase 2: Backend 配線 | `service.py` / `router.py` / `dialogue_processor.py` / `tts/service.py` / `tts_processor.py` のフィールド貫通、Provider デフォルト差し替え | 1.0 日 |
| Phase 3: Frontend 型 + API | `lib/types/node-editor.ts` / `lib/api/client.ts` / `lib/constants/tts-emotion-presets.ts` 作成 | 0.5 日 |
| Phase 4: Frontend UI | `DialogueNode.tsx` 折りたたみ UI / 6 プリセットボタン / textarea / 注記 + `NodeEditor.tsx` の handleStartDialogue 配線 | 1.0-1.5 日 |
| Phase 5: テスト | Unit + 統合 + E2E (`AC1〜AC10b` をカバー) | 1.0 日 |
| Phase 6: 検証・QA | バックエンド/フロントエンド E2E、既存 DialogueNode E2E 退行確認 | 0.5 日 |
| **合計** | | **4.5-5.0 日** |

---

## 12. 未解決項目 / 要ユーザー確認事項

### U1. プロバイダー非対応注記の表示方式

**A 案採用確定** (常時表示): 折りたたみ展開時に「※ instructions は OpenAI TTS のみで有効です。現在のプロバイダーでは無視されます。」を常時表示する。`/api/v1/config/tts-provider` の新設は不要。動的表示 (B 案) は将来ユーザーニーズが明確になった段階で別 task として検討する。

### U2. instructions 言語の表記/誘導
- **論点**: 自由記述 textarea の placeholder を「英語推奨」と書くだけで足りるか、それとも「日本語を入力すると精度が落ちます」等の警告を別途出すか。
- **暫定方針**: placeholder のみで OK、警告は出さない (UX 過剰演出を避ける)。
- **要確認**: ユーザーが日本語で書く頻度が高いと予想される場合は、追加 UX (例: 日本語検出時に「英語に変換する?」プロンプト) を検討する余地あり。

### U3. プリセットの和訳ラベルだけで意味が伝わるか
- **論点**: 「困惑」「落ち着き」は人によって連想する声色が異なる。プリセットの英語文をホバー時に表示するか?
- **暫定方針**: 各プリセットボタンに `title` 属性で英語 instructions を表示 (ホバーで Tooltip 表示)。
- **要確認**: UX 担当者の確認。

### U4. instructions の DB 保存ポリシー
- **論点**: 現在の設計では `dialogue_generations` と `tts_generations` の両方に保存。`tts_generations` のみで十分か?
- **暫定方針**: 両方保存 (デバッグ・リトライ時の追跡性を確保、ストレージコストは無視可能)。
- **要確認**: DB スキーマレビュアの確認。

### U5. ElevenLabs 利用時のバックエンド WARN ログ追加
- **論点**: `ElevenLabsProvider.generate_speech` に `instructions != None` の場合 WARN ログを追加すべきか。
- **暫定方針**: 今回スコープ外。後続 task で追加可能。
- **要確認**: 運用観点からのフィードバック。

### U6. OpenAI instructions max_length の公式仕様確認
- **未解決**: OpenAI 公式ドキュメントで `instructions` パラメータの max length が明示されていない。安全側として 1000 文字を採用 (B1 対応)。実機検証を行い、OpenAI が公式にドキュメントを整備した段階で上限値を再評価し、本 doc および `Field(max_length=...)` を更新する。

---

## 13. 変更影響マップ (Change Impact Map)

```yaml
変更対象: DialogueNode TTS instructions パイプライン (8 段貫通)

直接影響:
  - app/dialogue/schemas.py: DialogueCreateRequest にフィールド追加
  - app/dialogue/router.py: フィールド転送
  - app/dialogue/service.py: create_dialogue_generation シグネチャ + INSERT
  - app/tasks/dialogue_processor.py: record 読み取り + 伝播
  - app/tts/service.py: create_tts_generation シグネチャ + INSERT
  - app/tasks/tts_processor.py: record 読み取り + provider 呼び出し
  - app/external/openai_tts_provider.py: デフォルト instructions 差し替え
  - movie-maker/lib/types/node-editor.ts: DialogueNodeData 型拡張
  - movie-maker/lib/api/client.ts: DialogueCreatePayload 型拡張
  - movie-maker/components/node-editor/nodes/DialogueNode.tsx: 折りたたみ UI + プリセット + textarea
  - movie-maker/components/node-editor/NodeEditor.tsx: handleStartDialogue 配線
  - movie-maker/lib/constants/tts-emotion-presets.ts: 新規ファイル
  - docs/migrations/YYYYMMDD_add_tts_instructions.sql: 新規ファイル

間接影響:
  - tts_generations / dialogue_generations テーブル: 新カラム追加 (NULL 許容)
  - OpenAI TTS API 課金: 1 リクエスト当たり instructions の token 数が加算 (約 +50-100 token、コスト無視可能)

波及なし (明示):
  - app/external/elevenlabs_provider.py: 変更なし (既存の「受け取って無視」挙動を継続)
  - app/external/tts_provider.py: 変更なし (シグネチャは 843e6b7 で既に instructions 対応済)
  - app/tts/router.py: 変更なし (TTS 単独 API は対象外)
  - app/storyboard/* 等: 変更なし (Storyboard 経由 TTS は対象外)
  - Hedra リップシンク経路: 変更なし (TTS 完了後の処理は不変)
  - Polar / Webhook / 認証: 変更なし
  - 既存 DialogueNode のテキスト / 声 / 速度 / リップシンク UI: 変更なし
```

---

## 14. インターフェース変更マトリックス (Interface Change Matrix)

| 既存操作 | 新操作 | 変換要否 | アダプター要否 | 互換性方式 |
|--|--|--|--|--|
| `DialogueCreateRequest(text, voice_id, speed, use_lip_sync)` | `DialogueCreateRequest(text, voice_id, speed, use_lip_sync, tts_instructions?)` | なし | 不要 | 新フィールドは Optional (省略可) |
| `create_dialogue_generation(user_id, video_url, text, voice_id, language, speed, use_lip_sync)` | `create_dialogue_generation(..., tts_instructions=None)` | なし | 不要 | デフォルト引数 None |
| `create_tts_generation(user_id, text, voice_id, language, speed)` | `create_tts_generation(..., instructions=None)` | なし | 不要 | デフォルト引数 None |
| `TTSProviderInterface.generate_speech(text, voice_id, language, speed, instructions=None)` | 既存と同一 | - | - | 843e6b7 で既に追加済 |
| `OpenAITTSProvider` デフォルト instructions 文 | 新英語デフォルト文 | あり (文面置換) | 不要 | 単純差し替え (互換性影響なし、出力品質のみ変化) |
| `DialogueNodeData { text, voiceId, speed, useLipSync, ... }` | `{ ..., ttsInstructions? }` | なし | 不要 | 新フィールドは Optional |
| `dialogueApi.create({ video_url, text, voice_id, speed, use_lip_sync })` | `{ ..., tts_instructions? }` | なし | 不要 | 新フィールドは Optional |

すべて Optional 拡張のため**アダプター不要**。既存 caller は無変更で動作。

---

## 15. 統合境界契約 (Integration Boundary Contracts)

### B1: フロントエンド DialogueNode → バックエンド `/api/v1/dialogue`

```yaml
境界名: POST /api/v1/dialogue (DialogueCreateRequest)
  入力:
    video_url: str
    text: str (1-5000 文字)
    voice_id: str
    speed: float (0.25-4.0)
    use_lip_sync: bool
    tts_instructions: Optional[str] (0-1000 文字、新規)
    language: str (固定 'ja')
  出力 (sync): DialogueCreateResponse { id, status: 'pending', created_at }
  非同期処理: バックグラウンド processor 起動
  エラー時:
    - 422 (Pydantic バリデーション失敗、tts_instructions が 1000 文字超過等)
    - 401 (認証失敗)
    - 500 (Supabase INSERT 失敗等)
```

### B2: dialogue_processor → tts.service.create_tts_generation

```yaml
境界名: create_tts_generation (in-process 関数呼び出し)
  入力:
    user_id: str
    text: str
    voice_id: str
    language: str
    speed: float
    instructions: Optional[str] (新規)
  出力 (sync): dict (tts_generations row)
  エラー時: Supabase エラーをそのまま例外伝播
```

### B3: tts_processor → OpenAITTSProvider.generate_speech

```yaml
境界名: OpenAITTSProvider.generate_speech (in-process 関数呼び出し)
  入力:
    text: str
    voice_id: str
    language: str
    speed: float
    instructions: Optional[str] (既存、本 doc で値が貫通する)
  挙動:
    instructions None or 空文字 or whitespace-only + language=='ja' → デフォルト英語文を適用
    instructions 非空 → そのまま payload に含める
  出力 (sync): str (R2 audio URL)
  エラー時: ValueError / httpx.HTTPStatusError
```

### B4: tts_processor → ElevenLabsProvider.generate_speech

```yaml
境界名: ElevenLabsProvider.generate_speech (in-process 関数呼び出し)
  入力: 同上 (instructions 含む)
  挙動: instructions を受け取って無視 (payload に含めない)
  出力 (sync): str (R2 audio URL)
  エラー時: ValueError / httpx.HTTPStatusError
```

---

## 16. E2E 検証手順 (Phase 別)

### Phase 1-2 完了後 (Backend 完成)

1. `pytest tests/dialogue/ tests/tasks/test_dialogue_processor.py tests/tasks/test_tts_processor.py -v` がすべて pass
2. ローカル `uvicorn` 起動 + `curl -X POST /api/v1/dialogue -d '{...tts_instructions: "Speak excitedly"...}'` で 200 + record 作成
3. Supabase で `tts_generations.instructions` カラムに値が保存されていることを確認

### Phase 3-4 完了後 (Frontend 完成)

1. `npm run test` (Vitest) がすべて pass
2. `npm run dev` + ブラウザで DialogueNode 配置 → 感情パネル展開 → プリセット選択 → 合成 → 完了
3. ネットワークタブで `tts_instructions` が POST 本体に含まれていることを確認

### Phase 5-6 完了後 (Full)

1. `npm run test:e2e` (Playwright) で `AC1`〜`AC10b` を網羅する E2E が pass
2. 既存 DialogueNode E2E (instructions 未指定パス) が依然 pass (退行なし)
3. TTS_PROVIDER 環境変数を `elevenlabs` に切り替えた状態でも合成が成功 (instructions は無視)

---

## 17. References

- [GPT-4o mini TTS Model | OpenAI API](https://developers.openai.com/api/docs/models/gpt-4o-mini-tts) — gpt-4o-mini-tts の公式モデルドキュメント (instructions パラメータの仕様)
- [Text to speech | OpenAI API](https://developers.openai.com/api/docs/guides/text-to-speech) — instructions パラメータの使用例 ("Speak in a cheerful and positive tone" 等)
- [Voice Instruction with gpt-4o-mini-tts - OpenAI Developer Community](https://community.openai.com/t/voice-instruction-with-gpt-4o-mini-tts/1372075) — instructions の英語推奨に関するコミュニティ知見 (§5 英語推奨理由 項目 4 の根拠)
- [GPT-4o-Mini-TTS: Steerable, Low-Cost Speech via Simple APIs - PromptLayer Blog](https://blog.promptlayer.com/gpt-4o-mini-tts-steerable-low-cost-speech-via-simple-apis/) — instructions による steerable 音声生成の解説 (2025/3 リリース時)
- [gpt-4o-mini-tts: Cheapest TTS API in 2026 - TokenMix Blog](https://tokenmix.ai/blog/gpt-4o-mini-tts-cheapest-tts-api-2026) — 入力上限、日本語含む 50+ 言語対応
- [Complete Guide to GPT-4o Mini TTS Features - minitts.dev](https://minitts.dev/blog/complete-gpt4o-features/) — 13+ 音声、context-aware prosody の説明
- [`2026-05-14_dialogue-node.md`](./2026-05-14_dialogue-node.md) — 既存 DialogueNode Design Doc (Pipeline 型 TTS ミックス + Hedra リップシンク)
- [`2026-05-17_prompt-translation-improvements.md`](./2026-05-17_prompt-translation-improvements.md) — DialogueNode への入力 (セリフ) を生成する翻訳側の設計
- コミット `843e6b7` — `TTSProviderInterface.generate_speech` に `instructions: Optional[str]` を追加 (本 doc の前提)

---

## 18. 変更履歴

| 日付 | 内容 |
|------|------|
| 2026-05-18 | 初版 |
| 2026-05-18 | レビュー指摘事項反映 (B1/B2/B4/N1/N2/N3/N4/N6/N7、B3 = A 案確定) |
