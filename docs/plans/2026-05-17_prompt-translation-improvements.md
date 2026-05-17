# Design Doc: プロンプト翻訳テンプレートの 3 つの改善 (typo / 主体情報 / セリフ分離)

- **作成日**: 2026-05-17
- **最終更新**: 2026-05-17 (再レビュー軽微 3 件 E1/E2/E3 反映)
- **ステータス**: Draft (レビュー反映済)
- **対象バージョン**: movie-maker-api (FastAPI, Python 3.11+), movie-maker (Next.js 16 / React 19)
- **関連 Design Doc**:
  - [`2026-05-14_dialogue-node.md`](./2026-05-14_dialogue-node.md) — DialogueNode (Pipeline 型 TTS ミックス ノード) の既存仕様
  - [`2026-05-15_kling-edge-scoping.md`](./2026-05-15_kling-edge-scoping.md) — ProviderNode / 設定ノードのエッジスコープ化スタイル参考
- **複雑度評価**: `complexity_level: medium`
  - **complexity_rationale**:
    1. 要件/AC: バックエンド翻訳テンプレートの全面書き換え (主体情報の確実な英訳化、人物前提フレーズの条件化) と、API レスポンス schema 拡張 (`extracted_dialogue` 追加)、フロントエンド PromptNode の翻訳結果ハンドリング変更 (セリフ抽出後の UX 分岐) の 3 ドメイン横断。
    2. 制約/リスク: 既存ユーザーのワークフローが API レスポンス schema 変更で壊れないこと、Kling の 2500 文字制限 (`piapi_kling_provider.py:432-435`) で truncate されない長さに収めること、セリフ抽出の正規表現が誤検出しないこと、DialogueNode との連携 UX (新規配置 / 既存通知) でユーザー混乱を起こさないこと。

---

## 1. 背景・課題

### 1-1. ユーザーが遭遇した問題

ユーザーが PromptNode に以下の日本語を入力した:

```
ベージュのニットセーターのキャラクター（手足はなく、ハンガーで吊られた
状態、ふっくらと立体感のあるニット質感）は、眉を上げて目を見開いた
困惑の表情で、戸惑った声で喋る：
「ちょっと まって…」
体が軽く前に傾く動き。ニットの肩のあたりが少しよれる。
```

翻訳結果として以下が出力された (`videosApi.translateStoryPrompt` → `/api/v1/videos/story/translate` → `translate_story_prompt` 相当 + テンプレ整形):

```
Reserve exact appearance from reference image. Same face, same hair, same clothing.
Use the source image as the foundation for the video. Preserve the subject's identity,
facial features, outfit, and pose. Focus on natural, subtle movements that enhance
the portrait quality. CLIP SPECIFIC: Scene: Inherit from reference image (do not
describe - use image as-is) Action: Slight forward tilt of the sweater body, subtle
bunching of the knit material around the shoulders. Micro-expression: Bewilderment;
raised eyebrows, widened eyes, subtle lip movement as if speaking. Camera: Static
shot, medium framing. Must include: NATURAL MOTION: subtle knit fiber movement,
slight sway as if suspended, simulate...
```

### 1-2. 4 つの問題点

| # | 問題 | 深刻度 | 影響範囲 |
|---|------|--------|---------|
| 1 | typo "Reserve" → "Preserve" (意味が真逆: 予約 vs 保つ) | 高 | 全プロバイダー (Gemini 翻訳出力に混入) |
| 2 | キャラクター視覚情報の脱落 (「ベージュ」「ニット」「手足なし」「ハンガー吊り」が英訳に未反映) | 高 | 非人型キャラ全般 |
| 3 | セリフ「ちょっと まって…」が完全消失 (リップシンク用情報の喪失) | 高 | セリフ含む全プロンプト |
| 4 | テンプレートの過度な構造化 (`CLIP SPECIFIC: Scene/Action/Camera/...`) で Kling 2500 文字制限到達・truncate 発生 | 中 | Kling プロバイダー全般 |

### 1-3. 原因分析 (実コード確認結果)

調査ファイル:

| パス | 行 | 役割 / 関連箇所 |
|--|--|--|
| `movie-maker-api/app/external/gemini_client.py` | L18-130 | `load_prompt_template()`: プロバイダー別 .md テンプレ読込 |
| `movie-maker-api/app/external/gemini_client.py` | L1242-1432 | `translate_scene_to_runway_prompt()`: 通常モード/アニメモード分岐、`REFERENCE RULE` + `CLIP SPECIFIC` 構造を Gemini に強制 |
| `docs/prompt/scene/person/runway_api_template.md` | L33-49 | **テンプレ本文** (`SINGLE IMAGE RULE` ブロックに `Same face, same hair, same clothing` あり、人物前提) |
| `docs/prompt/scene/person/kling_api_template.md` | L35-48 | 同上の Kling 版 (より簡潔だがやはり人物前提) |
| `movie-maker-api/app/external/piapi_kling_provider.py` | L432-435 | Kling 送信前の 2500 文字制限 + truncate ロジック |
| `movie-maker-api/app/videos/router.py` | L1391-1451 | 既存の `translate_scene_description` エンドポイント (`POST /storyboard/translate-scene`) |
| `movie-maker-api/app/videos/schemas.py` | L432-434 | `TranslateStoryPromptResponse` (現状: `english_prompt: str` のみ) |
| `movie-maker/components/node-editor/nodes/PromptNode.tsx` | L41-73 | 翻訳トリガ (デバウンス 500ms) → `videosApi.translateStoryPrompt` |
| `movie-maker/lib/api/client.ts` | L202-219 | `translateStoryPrompt` の型: `Promise<{ english_prompt: string }>` |
| `movie-maker/components/node-editor/nodes/PromptNode.tsx` | L143-156 | 出力 Handle (`story_text` / `subject_type`)。DialogueNode への直接 Handle なし |

#### 各問題の原因

1. **typo "Reserve"**: `docs/prompt/scene/person/*_api_template.md` には正しく "Preserve" と書かれている (L36, L39 等)。**Gemini AI が翻訳プロンプト出力時に "Reserve" と誤生成している**。テンプレ本文に typo はない (本 doc 作成時、`runway_api_template.md` / `kling_api_template.md` を直接確認済)。
2. **視覚情報の脱落**: テンプレに `Inherit from reference image (do not describe - use image as-is)` という強い指示があり、Gemini はそれを尊重して**ユーザー入力にあった視覚的特徴 (「ベージュ」「ニット」「ハンガー吊り」) を意図的に省略している**。これは「画像から継承する」前提だが、PromptNode 経由の翻訳には**参照画像が渡されていない**ため、視覚情報が完全に失われる。
3. **セリフ消失**: テンプレに「セリフ」を扱うフィールドがない (`Scene/Subject/Micro-expression/Camera/Lighting/Must include/Final note` の 7 軸)。Gemini はセリフを `Micro-expression: ... subtle lip movement as if speaking` のように暗黙化するだけで、**本文はどこにも出力されない**。
4. **truncate**: テンプレが 7 軸固定で、各フィールドに長い説明が入ると簡単に 2000 文字超過。Kling 送信時に `prompt[:2497] + "..."` で末尾切り捨て (`piapi_kling_provider.py:434`)。

### 1-4. なぜ今修正するか

- 非人型キャラ (オブジェクト・抽象キャラクター) を扱うユースケースが増加 (ニットセーター・ぬいぐるみ・商品・ロゴ等の擬人化)。現状の人物前提テンプレでは正しく動画化できない。
- リップシンク機能 (DialogueNode + Hedra) を実装したが、PromptNode にセリフを入れると消失するため、ユーザーが DialogueNode に手動転記する必要がある (UX 劣化)。
- typo "Reserve" は意味が真逆のため、Kling/Runway 内部での解釈が変わりうる (Gemini 系モデルにとっては微弱な影響、Diffusion 系には潜在影響)。優先順位は高い。

---

## 2. 目標 (Goals / Non-Goals)

### 2-1. Goals (3 改善 A/B/C それぞれの達成条件)

#### A. typo 修正
- 翻訳結果の英文に "Reserve" が混入しない (Gemini 出力ガード + テンプレ側の明示指示)。

#### B. テンプレート軽量化 + 主体情報保持
- **「Same face, same hair, same clothing」のような人物前提フレーズは `subject_type === 'person'` の場合のみ含める**。`subject_type === 'object'` / `'animation'` の場合は別フレーズ ("Same subject design, same materials, same configuration" 等) に置換、または条件付き除外。
- **主体 (キャラクター) の視覚特性 (色、素材、形状、特徴) を確実に英訳に含める**。Gemini に「ユーザー入力の視覚情報は必ず Subject 欄に転記すること」を明示。
- **過度な構造化を見直し**: `CLIP SPECIFIC` は維持するが、必須フィールドを 4 つに削減 (`Subject` / `Action` / `Camera` / `Must include`)。`Lighting` / `Micro-expression` / `Final note` はオプション (ユーザー入力に該当する記述があれば含める、なければ省略)。
- **結果として 1200 文字以内に収まる** (Kling 2500 文字制限の半分以下、画像参照ヘッダ追加分の余裕を確保)。

#### C. セリフ「」自動分離
- 日本語入力内の `「」` または `『』` で囲まれた部分を **セリフとして自動抽出** (複数セリフは結合)。
- 翻訳プロンプト本文には**「キャラクターが喋っている」というメタ情報だけを含める** (例: `Subtle lip sync motion as if speaking`)。セリフ本文は除外。
- 抽出したセリフは API レスポンス `extracted_dialogue` フィールドで返す。
- フロントエンドは検出時にユーザーに通知し、DialogueNode を新規配置 / 既存 DialogueNode へ転記 / 何もしない を選択可能にする (採用案は §3-3 で決定)。

### 2-2. Non-Goals (今回スコープ外)

- 中国語・韓国語など他言語の同様セリフ抽出 (日本語の `「」` / `『』` のみ対応)
- セリフ複数行の同時処理 (1 回の翻訳で**複数キャラクター**のセリフを区別)。**複数セリフは結合**して 1 つの DialogueNode に渡す。
- 翻訳モデル変更 (Gemini → OpenAI 等)
- DialogueNode の音声合成・リップシンクロジック変更 (今 doc では「テキストを DialogueNode の `text` フィールドに渡す」までを担保)
- 既存 `translate_scene_to_runway_prompt` (storyboard 経由の翻訳) の改修。**本 doc は PromptNode 起点の翻訳 (`videosApi.translateStoryPrompt`) のみ対象**。storyboard 経由は別 Design Doc で扱う。
- PromptNode 自体の UI 大改修 (セリフ抽出 UX の追加表示は最小限のみ)
- **Act-Two モード完全対応 (Phase 1 では引数受け取り + 警告ログのみ、Phase 2 で `_build_act_two_instruction()` 専用テンプレ追加予定)** ※ §4-1-4 で詳述

---

## 3. 採用案

### 3-1. A 案 (typo 修正): 単純修正

**実装方針**: 2 層防御。

1. **Gemini 翻訳プロンプト内で明示禁止**: `translate_story_prompt` のシステムプロンプトに以下を追加:
   ```
   CRITICAL: Always use "Preserve" (with P), never "Reserve". The word "Reserve" is a forbidden typo.
   ```
2. **出力後ガード** (バックエンド): 翻訳結果文字列に対し `result.replace("Reserve exact appearance", "Preserve exact appearance").replace("Reserve the subject", "Preserve the subject")` を実行。安全網として AI の不安定さを補完する。

**理由**: AI 出力の不安定さに対し単一防御は脆弱。テンプレ指示 + 後段サニタイズの二重で典型的フレーズの誤りを撲滅する。

### 3-2. B 案 (テンプレート軽量化 + 主体情報保持): 採用方針

#### B-1. 新テンプレ構造 (4 必須 + 3 オプション)

```
[REFERENCE INSTRUCTION (1 行に圧縮)]
Use source image as foundation. Preserve identity, design, and visual characteristics.

CLIP SPECIFIC (必須 4 軸):
Subject: {キャラクターの視覚特性 (色/素材/形状/特徴) を英訳して必ず明記}
Action: {動き・モーション}
Camera: {カメラワーク (ユーザー指定があれば優先)}
Must include: {natural motion, subtle physics, etc.}

(オプション、ユーザー入力に該当する記述があれば含める)
Micro-expression: {表情の機微}
Lighting: {照明指定}
Final note: {その他の補足}
```

#### B-2. 主体情報抽出ロジック

**バックエンド (gemini_client.py)**: 翻訳前にユーザー入力を Gemini で 2 段階処理:

1. **抽出フェーズ** (system_instruction 1):
   ```
   Extract the following from Japanese user input:
   - subject_visual: All visual attributes of the main subject (color, material, shape, distinctive features)
   - action: What the subject does (motion)
   - camera: Camera work if specified
   - dialogue: Any text in 「」 or 『』 brackets (EXCLUDE from other fields)
   - other: Lighting, mood, expression hints
   Return JSON: {"subject_visual": "...", "action": "...", "camera": "...", "dialogue": "...", "other": "..."}
   ```
2. **翻訳フェーズ** (system_instruction 2): 抽出結果を新テンプレに当てはめて英訳。

**フォールバック**: 抽出失敗時は従来の単一プロンプト翻訳にフォールバック (既存テンプレ使用)。

#### B-3. subject_type 条件分岐

| subject_type | Reference Instruction (1 行) |
|--------------|----------------------------|
| `person` | `Preserve subject's identity, facial features, outfit, and pose from source image.` |
| `object` | `Preserve subject design, materials, configuration, and proportions from source image.` |
| `animation` | `Preserve character design, art style, color palette, and visual features from source image.` |

人物前提フレーズ `Same face, same hair, same clothing` は**完全削除** (条件分岐の Reference Instruction で代替)。

### 3-3. C 案 (セリフ抽出 + DialogueNode 連携): UX 選択肢の比較

#### 3-3-1. 比較表

| 観点 | 案 A: 確認モーダル | 案 B: 自動配置 / 上書き | 案 C: Toast 通知のみ |
|------|------------------|----------------------|--------------------|
| ユーザー操作量 | 中 (モーダル承認 1 クリック) | 低 (自動でグラフ変更) | 中 (Toast から手動配置) |
| 意図しない変更リスク | 低 (ユーザー承認必要) | 高 (グラフが勝手に変わる, 既存 DialogueNode 上書きで設定消失) | 低 (グラフ不変) |
| 既存 DialogueNode 有 | モーダルに「既存ノードに転記しますか?」選択肢 | 既存ノードの `text` を**上書き** (設定消失リスク) | Toast に「既存ノードあり: 手動で確認」リンク |
| 既存 DialogueNode 無 | モーダルに「新規 DialogueNode を作成」選択肢 | **新規 DialogueNode を自動配置** + エッジ自動接続 | Toast に「セリフ検出: DialogueNode を手動配置」リンク |
| UI 一貫性 | xyflow グラフ操作と整合 (モーダル経由) | 自動グラフ変更は xyflow の操作モデルに反する | 通知のみで明示的アクションをユーザーに委ねる |
| 実装複雑度 | 中 (モーダル + 状態管理) | 高 (xyflow への自動 add node + auto-edge + 位置計算) | 低 (Toast のみ) |
| デバウンス親和性 | 高 (確定後に表示) | 低 (デバウンス中に何度も配置/上書きされうる) | 高 (Toast 多発 → 抑制ロジック必要) |

#### 3-3-2. 推奨: **案 A (確認モーダル)**

**理由**:
- 案 B はデバウンス翻訳と相性が悪い (タイプ中に何度も DialogueNode が配置/上書きされる)。
- 案 C は通知のみで実行手間がユーザー側に残り、`「」` を入れた直後の自然な期待 (「DialogueNode が生えるかな?」) を満たせない。
- 案 A は「翻訳結果が確定したタイミングで 1 回だけモーダル」とすればデバウンスとも整合し、ユーザー意思決定の場を 1 箇所に集約できる。

#### 3-3-3. 案 A の詳細仕様

- **モーダル表示タイミング**: 翻訳完了 (`isTranslating: false`) かつ `extracted_dialogue !== null` のとき、PromptNode 内に小さな確認カードを表示 (新規ノード生成は伴わない、画面遷移なし)。
- **モーダル内容**:
  ```
  セリフが検出されました
  「{extracted_dialogue}」

  [新規 DialogueNode を作成] [既存 DialogueNode に転記] [無視]
  ```
- **既存 DialogueNode が無い場合**: 「既存 DialogueNode に転記」ボタンを `disabled`。
- **「既存 DialogueNode に転記」選択時**: 複数存在する場合は最初の 1 つに転記 (ユーザーが手動で他に渡したい場合は無視 → 手動コピー)。複数存在は警告 Toast。
- **「無視」選択時**: 当該翻訳セッション中は再表示しない (同一の正規化セリフハッシュは抑制、§4-2-2 の N3 対応参照)。
- **再表示**: ユーザーが日本語プロンプトを編集して新しいセリフが抽出された場合は再表示。

---

## 4. 設計詳細

### 4-1. バックエンド

#### 4-1-1. 翻訳プロンプトテンプレート (新版、全文掲載)

**ファイル**: `movie-maker-api/app/external/gemini_client.py` に新規関数 `translate_story_prompt` を追加 (既存 `translate_scene_to_runway_prompt` とは別物、PromptNode 専用)。

**引数の dataclass 化** (推奨 3 / coding-principles: 3+ params は object 化):

```python
from dataclasses import dataclass, field
from typing import Optional, Literal

SubjectType = Literal["person", "object", "animation"]
AnimationCategory = Literal["2d", "3d"]


@dataclass
class TranslateStoryPromptInput:
    """translate_story_prompt の引数集約 dataclass。

    引数増加に伴うシグネチャ複雑化を防ぐ。フロント (TypeScript)
    からの JSON request body をそのまま展開して構築できる構造。
    """
    description_ja: str
    video_provider: str = "runway"
    subject_type: SubjectType = "person"
    camera_work: Optional[str] = None
    animation_category: Optional[AnimationCategory] = None
    animation_template: Optional[str] = None
    # Act-Two 関連 (Phase 1 では未使用、Phase 2 で利用)
    use_act_two: bool = False
    motion_type: Optional[str] = None
    expression_intensity: int = 3
    body_control: bool = True


@dataclass
class ExtractedComponents:
    """_extract_prompt_components の戻り値 contract (B3 対応)。

    型を統一して TypeError / AttributeError リスクを排除:
    - 文字列フィールドは常に str (空なら "")。None は許容しない。
    - dialogue のみ Optional[str]。null は「セリフなし」を表現。
    """
    subject_visual: str   # 必ず str (空なら "")
    action: str           # 必ず str (空なら "")
    camera: str           # 必ず str (空なら "")
    micro_expression: str  # 必ず str (空なら "")
    lighting: str         # 必ず str (空なら "")
    other: str            # 必ず str (空なら "")
    must_include: str     # 必ず str (空なら "")
    dialogue: Optional[str] = None  # 唯一 None 許容
```

**メイン関数:**

```python
async def translate_story_prompt(
    params: TranslateStoryPromptInput,
) -> tuple[str, Optional[str]]:
    """
    PromptNode 用: 日本語プロンプトを英語に翻訳し、セリフを分離抽出する。

    Args:
        params: 翻訳パラメータ (dataclass で集約)

    Returns:
        tuple[english_prompt: str, extracted_dialogue: Optional[str]]
        - english_prompt: 常に str (失敗時は例外送出、空文字は返さない)
        - extracted_dialogue: 「」/『』検出時のみ str、未検出時 None
    """
    # B4 対応: Phase 1 では Act-Two 引数を未使用、警告ログのみ
    if params.use_act_two:
        logger.warning(
            "Act-Two mode is not supported in translate_story_prompt yet. "
            "Phase 2 will add _build_act_two_instruction(). "
            "Falling back to standard translation for now. "
            "use_act_two=%s motion_type=%s expression_intensity=%s body_control=%s",
            params.use_act_two,
            params.motion_type,
            params.expression_intensity,
            params.body_control,
        )

    # --- Phase 1: 構造化抽出 ---
    extracted: ExtractedComponents = await _extract_prompt_components(
        params.description_ja
    )

    # --- Phase 2: 翻訳 + テンプレ整形 ---
    reference_instruction = _build_reference_instruction(params.subject_type)
    system_prompt = _build_translate_system_prompt(
        extracted=extracted,
        reference_instruction=reference_instruction,
        params=params,
    )

    english_prompt = await _run_gemini_translation(system_prompt, params.description_ja)

    # --- Phase 3: typo サニタイズ (A 案安全網) ---
    english_prompt = _sanitize_reserve_typo(english_prompt)

    return english_prompt, extracted.dialogue


def _sanitize_reserve_typo(text: str) -> str:
    """A 案安全網: Reserve → Preserve に置換 (固定フレーズのみ)。"""
    return (
        text
        .replace("Reserve exact appearance", "Preserve exact appearance")
        .replace("Reserve the subject", "Preserve the subject")
        .replace("Reserve the source", "Preserve the source")
    )
```

**`_build_reference_instruction` (subject_type 分岐):**

```python
def _build_reference_instruction(subject_type: str) -> str:
    if subject_type == "person":
        return (
            "Preserve subject's identity, facial features, outfit, and pose "
            "from source image. Maintain the exact character appearance."
        )
    if subject_type == "object":
        return (
            "Preserve subject design, materials, configuration, and proportions "
            "from source image. Maintain the exact object appearance."
        )
    if subject_type == "animation":
        return (
            "Preserve character design, art style, color palette, and visual "
            "features from source image. Maintain the exact stylistic identity."
        )
    return (
        "Preserve the visual identity and characteristics from source image."
    )
```

**`_build_translate_system_prompt` (新テンプレ、型統一に沿ったガード):**

```python
def _build_translate_system_prompt(
    extracted: ExtractedComponents,
    reference_instruction: str,
    params: TranslateStoryPromptInput,
) -> str:
    """システムプロンプト構築。ExtractedComponents の str 統一に依存。

    B3 対応: extracted.* は常に str。.strip() 直接呼び出し可能で None ガード不要。
    """
    # 既に ExtractedComponents は str 統一なので .strip() で空判定のみ
    subject_visual_hint = extracted.subject_visual.strip()
    action_hint = extracted.action.strip()
    camera_hint = (params.camera_work or extracted.camera).strip()
    expression_hint = extracted.micro_expression.strip()
    lighting_hint = extracted.lighting.strip()
    # other_hint = extracted.other.strip()  # Phase 1 未使用
    has_dialogue = extracted.dialogue is not None  # 唯一 Optional[str]

    # オプション軸の構築 (該当する記述があるときのみ含める)
    optional_lines = []
    if expression_hint:
        optional_lines.append(f"Micro-expression: {{translate: {expression_hint}}}")
    if lighting_hint:
        optional_lines.append(f"Lighting: {{translate: {lighting_hint}}}")
    if has_dialogue:
        optional_lines.append(
            "Must include (in addition): subtle lip-sync motion as if "
            "the subject is speaking. Do NOT include the dialogue text itself."
        )

    optional_block = "\n".join(optional_lines) if optional_lines else ""

    return f"""\
You are a prompt engineer for video generation AI ({params.video_provider}).

GOAL: Convert the Japanese description into a compact English prompt
that the model can execute reliably. Follow the structure below EXACTLY.

CRITICAL RULES:
1. Use "Preserve" (with P), NEVER use "Reserve" (forbidden typo).
2. The Subject field MUST include ALL visual attributes the user provided
   (colors, materials, shape, distinctive features). DO NOT omit them as
   "inheritable from image" — they are required for the model to anchor.
3. Keep total length under 1200 characters. Be concise but specific.
4. Subject type is "{params.subject_type}". Do NOT use human-specific phrases
   (e.g. "Same face, same hair, same clothing") unless subject_type is "person".
5. Dialogue lines (extracted separately) MUST NOT appear in the prompt body.
   Only the meta-instruction "subtle lip-sync motion" is allowed.

OUTPUT TEMPLATE (use this EXACT structure):

{reference_instruction}

CLIP SPECIFIC:
Subject: {{translate to English, include ALL visual attributes from: {subject_visual_hint}}}
Action: {{translate to English: {action_hint}}}
Camera: {{translate to English or use as-is: {camera_hint or "natural framing"}}}
Must include: {{natural motion, subtle physics appropriate to the subject}}
{optional_block}

OUTPUT: Return ONLY the prompt text following the template above.
No explanations, no quotes, no markdown code fences.
"""
```

**`_extract_prompt_components` (B1 / B3 / N5 対応の構造化抽出):**

```python
import asyncio
import json
import re
from typing import Optional

# B1 対応: モジュールスコープでパターン定数化 (採用案 a: 1 階層厳密)
# ネストカッコは別々に抽出して結合する。
KAGI_BRACKET_PATTERN = re.compile(r"「([^「」]*?)」")   # 「...」内に「」がネストしない
DOUBLE_KAGI_BRACKET_PATTERN = re.compile(r"『([^『』]*?)』")  # 『...』内に『』がネストしない


def _extract_dialogues_via_regex(text: str) -> Optional[str]:
    """B1 対応: ネスト許容しつつ正確に抽出する正規表現実装。

    挙動 (B1 訂正版):
        非 greedy `*?` + 否定文字クラス `[^「」]` を組み合わせて
        「同種のカッコ内に同種カッコがネストしない」前提で 1 階層を抽出。

    異種ネストの例 (採用案 a: 別々抽出後に結合):
        入力: 「彼は『やめて』と叫んだ」
        - KAGI_BRACKET_PATTERN.findall  → ["彼は『やめて』と叫んだ"]
        - DOUBLE_KAGI_BRACKET_PATTERN.findall → ["やめて"]
        - 結合結果: "彼は『やめて』と叫んだ\nやめて"
        重複は致命的ではない (TTS は両方読む)。AC-C8 でこの挙動を固定する。

    同種ネスト (例: 「「内側」外側」) は ANSI 仕様外 (日本語句読法でも非標準)
    として明示的にスコープ外。最初に閉じた `」` までを 1 件として扱う。
    """
    inner_kagi = KAGI_BRACKET_PATTERN.findall(text)
    inner_double_kagi = DOUBLE_KAGI_BRACKET_PATTERN.findall(text)

    # 空文字フィルタ (10-5 対応)
    all_dialogues = [d for d in (inner_kagi + inner_double_kagi) if d.strip()]

    return "\n".join(all_dialogues) if all_dialogues else None


async def _extract_prompt_components(description_ja: str) -> ExtractedComponents:
    """
    日本語プロンプトから視覚情報・動き・セリフを構造化抽出する。
    AI による抽出 + 正規表現でのダブルチェック (セリフのみ)。

    Returns:
        ExtractedComponents (B3 対応: 戻り値 contract 統一済)
        - 文字列フィールドは常に str (失敗時も空文字)。
        - dialogue のみ Optional[str]。
    """
    # 1. 正規表現で一次抽出 (AI を待たずに使える)
    regex_dialogue = _extract_dialogues_via_regex(description_ja)

    # 2. AI による構造化抽出 (gemini-2.0-flash, temperature=0.3)
    client = get_gemini_client()
    extraction_prompt = f"""\
Extract structured information from this Japanese video prompt.

Input:
{description_ja}

Return ONLY valid JSON with these keys (all values are strings, empty "" if absent):
- subject_visual: Visual attributes of the main subject
  (colors, materials, shape, distinctive features). Include ALL visual
  descriptors mentioned, including non-human characteristics
  (e.g. "no limbs", "hung on hanger", "beige knit sweater texture").
- action: What the subject does (motion, posture changes).
- camera: Camera work if explicitly mentioned, else "".
- dialogue: Text inside 「」 or 『』 brackets, joined by newlines if multiple.
  Empty "" if no brackets present.
- micro_expression: Facial / emotional expression if mentioned, else "".
- lighting: Lighting conditions if mentioned, else "".
- other: Any other contextual hints, else "".
- must_include: Specific keywords user marked as required, else "".

Example output:
{{"subject_visual": "...", "action": "...", "camera": "", "dialogue": "...", "micro_expression": "...", "lighting": "", "other": "", "must_include": ""}}
"""
    try:
        # N5 対応: Gemini SDK の非同期化 (asyncio.to_thread で event loop ブロック回避)
        response = await asyncio.to_thread(
            client.models.generate_content,
            model="gemini-2.0-flash",
            contents=extraction_prompt,
            config=types.GenerateContentConfig(
                temperature=0.3,
                response_mime_type="application/json",
            ),
        )
        raw = json.loads(response.text.strip())
    except Exception as e:
        logger.warning(
            "Component extraction failed, using regex fallback: %s", e
        )
        # フォールバック: description_ja をそのまま subject_visual に
        return ExtractedComponents(
            subject_visual=description_ja,
            action="",
            camera="",
            micro_expression="",
            lighting="",
            other="",
            must_include="",
            dialogue=regex_dialogue,  # 正規表現抽出結果は活かす
        )

    # 3. AI 結果を ExtractedComponents に変換 (型統一: None / 欠落は "" に変換)
    def _str(v) -> str:
        if v is None:
            return ""
        return str(v).strip()

    ai_dialogue = _str(raw.get("dialogue"))
    # セリフのみ正規表現結果を信頼ソースに優先 (10-8)
    final_dialogue: Optional[str]
    if regex_dialogue:
        final_dialogue = regex_dialogue
    elif ai_dialogue:
        final_dialogue = ai_dialogue
    else:
        final_dialogue = None

    return ExtractedComponents(
        subject_visual=_str(raw.get("subject_visual")) or description_ja,
        action=_str(raw.get("action")),
        camera=_str(raw.get("camera")),
        micro_expression=_str(raw.get("micro_expression")),
        lighting=_str(raw.get("lighting")),
        other=_str(raw.get("other")),
        must_include=_str(raw.get("must_include")),
        dialogue=final_dialogue,
    )


async def _run_gemini_translation(system_prompt: str, user_input: str) -> str:
    """N5 / N6 対応: 翻訳実行を分離関数化 (テストで monkeypatch しやすい)。"""
    client = get_gemini_client()
    response = await asyncio.to_thread(
        client.models.generate_content,
        model="gemini-2.0-flash",
        contents=user_input,
        config=types.GenerateContentConfig(
            system_instruction=system_prompt,
            temperature=0.6,
        ),
    )
    return response.text.strip()
```

#### 4-1-2. レスポンス schema 変更

**ファイル**: `movie-maker-api/app/videos/schemas.py:432-434`

```python
class TranslateStoryPromptResponse(BaseModel):
    """シーン動画プロンプト翻訳レスポンス"""
    english_prompt: str = Field(
        ..., description="英語プロンプト (テンプレート適用済み)"
    )
    extracted_dialogue: str | None = Field(
        default=None,
        description=(
            "日本語入力から自動抽出されたセリフ (「」/『』内のテキスト)。"
            "複数セリフは改行で結合。検出なしの場合は null。"
        ),
    )
```

**B2 対応: リクエスト側 schema 既存定義の確認 (変更不要)**

既存 `TranslateStoryPromptRequest` (`schemas.py:363-429`) は既に必要なフィールド (`subject_type`, `camera_work`, `animation_category`, `animation_template`, `use_act_two`, `motion_type`, `expression_intensity`, `body_control`) を全て持っているため、Phase 1 では schema 変更は不要。新規 `translate_story_prompt()` 関数はこれらフィールドを受け取って利用する。

以下は実コード (`schemas.py`) の実際の定義 (参照用・変更なし):

```python
class TranslateStoryPromptRequest(BaseModel):
    """PromptNode → POST /api/v1/videos/story/translate リクエスト"""
    description_ja: str = Field(..., max_length=500)
    video_provider: VideoProvider = Field(default=VideoProvider.RUNWAY)
    subject_type: SubjectType = Field(default=SubjectType.PERSON)
    camera_work: Optional[str] = None
    animation_category: Optional[AnimationCategory] = None
    animation_template: Optional[str] = None
    # Act-Two 関連 (Phase 1 未使用、Phase 2 で活用)
    use_act_two: bool = False
    motion_type: Optional[str] = None
    expression_intensity: int = 3
    body_control: bool = True
```

> **注意**: `video_provider` / `subject_type` は実コードでは Non-Optional + デフォルト値あり (`Field(default=...)`)。`from typing import Optional` は `camera_work` / `motion_type` 等の他フィールドで引き続き必要。

#### 4-1-3. エンドポイント変更

**ファイル**: `movie-maker-api/app/videos/router.py` の `POST /api/v1/videos/story/translate`

```python
@router.post("/story/translate", response_model=TranslateStoryPromptResponse)
async def translate_story_prompt_endpoint(
    request: TranslateStoryPromptRequest,
    current_user: dict = Depends(get_current_user),
):
    from app.external.gemini_client import (
        translate_story_prompt,
        TranslateStoryPromptInput,
    )

    try:
        # B2 対応: フロント側で渡された subject_type 等を確実に流し込む
        params = TranslateStoryPromptInput(
            description_ja=request.description_ja,
            video_provider=request.video_provider.value,
            subject_type=request.subject_type.value,
            camera_work=request.camera_work,
            animation_category=(
                request.animation_category.value
                if request.animation_category else None
            ),
            animation_template=(
                request.animation_template.value
                if request.animation_template else None
            ),
            use_act_two=request.use_act_two,
            motion_type=request.motion_type,
            expression_intensity=request.expression_intensity,
            body_control=request.body_control,
        )
        english_prompt, extracted_dialogue = await translate_story_prompt(params)
        return TranslateStoryPromptResponse(
            english_prompt=english_prompt,
            extracted_dialogue=extracted_dialogue,
        )
    except Exception as e:
        logger.exception(f"Story prompt translation failed: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"翻訳に失敗しました: {str(e)}",
        )
```

#### 4-1-4. Act-Two モード引数の Phase 1 / Phase 2 処理 (B4 対応)

**問題**: `use_act_two`, `motion_type`, `expression_intensity`, `body_control` は引数で受け取るが、Phase 1 翻訳ロジック本文では未使用。

**採用方針: 選択 1 (保持して将来拡張余地)**

| Phase | 挙動 |
|-------|------|
| Phase 1 (本 doc 対象) | 引数を `TranslateStoryPromptInput` に保持し、`use_act_two=True` 時のみ `logger.warning` で「未サポート」を明示。翻訳本体は標準モードで実行。 |
| Phase 2 (別 doc) | `_build_act_two_instruction(motion_type, expression_intensity, body_control)` を追加し、`use_act_two=True` 時に `_build_translate_system_prompt` の prompt に Act-Two 専用ブロックを差し込む。 |

**理由**:
- Phase 1 でフロント側型・API schema を完成させておけば、Phase 2 で追加するのはバックエンド内部実装のみ。フロント変更不要で段階的にロールアウト可能。
- 削除すると Phase 2 で再度フロント側型変更が発生し、後方互換性が二度壊れる。
- ロギング (warning) により誤って `use_act_two=True` を渡したケースを検出可能。

AC-B4 (新規) で「Act-Two 引数が渡されてもエンドポイントが 500 にならず、標準翻訳結果と警告ログが返ること」を検証。

### 4-2. フロントエンド

#### 4-2-1. API クライアント型定義変更

**ファイル**: `movie-maker/lib/api/client.ts:202-219`

```ts
// B2 対応: TranslateStoryPromptRequest 型を明示 (再利用可能)
export interface TranslateStoryPromptRequest {
  description_ja: string;
  video_provider?: 'runway' | 'veo' | 'domoai' | 'piapi_kling' | 'hailuo' | 'seedance';
  subject_type?: 'person' | 'object' | 'animation';
  camera_work?: string;
  animation_category?: '2d' | '3d' | null;
  animation_template?: string | null;
  use_act_two?: boolean;
  motion_type?: string | null;
  expression_intensity?: number;
  body_control?: boolean;
}

export interface TranslateStoryPromptResponse {
  english_prompt: string;
  extracted_dialogue: string | null;  // 追加
}

translateStoryPrompt: (
  data: TranslateStoryPromptRequest,
): Promise<TranslateStoryPromptResponse> =>
  fetchWithAuth("/api/v1/videos/story/translate", {
    method: "POST",
    body: JSON.stringify(data),
  }),
```

#### 4-2-2. PromptNode の翻訳結果ハンドリング (案 A: 確認カード)

**ファイル**: `movie-maker/components/node-editor/nodes/PromptNode.tsx:41-73` を以下に置換:

```tsx
// 追加: セリフ検出状態 (UI 表示用)
const [pendingDialogue, setPendingDialogue] = useState<string | null>(null);
// N1 対応: dismissed ハッシュは useRef 管理 (依存配列に含めず useEffect 再走を防ぐ)
const dismissedDialogueHashRef = useRef<string | null>(null);

// N3 対応: セリフ正規化 (空白/改行を統一して同一性判定)
const normalizeDialogue = (raw: string): string =>
  raw.trim().replace(/\s+/g, ' ');

// デバウンス翻訳 (改修版)
useEffect(() => {
  if (!localPrompt.trim()) {
    updateNodeData({
      japanesePrompt: '',
      englishPrompt: '',
      isValid: false,
    });
    setPendingDialogue(null);
    return;
  }

  const timer = setTimeout(async () => {
    updateNodeData({ isTranslating: true, japanesePrompt: localPrompt });

    try {
      // B2 対応: subject_type を含む全オプションを翻訳 API に渡す
      const result = await videosApi.translateStoryPrompt({
        description_ja: localPrompt,
        subject_type: (data.subjectType ?? 'person') as 'person' | 'object' | 'animation',
        // 他オプション (camera_work / animation_* / use_act_two 等) もノードデータから引き継ぐ
        camera_work: data.cameraWork,
        animation_category: data.animationCategory,
        animation_template: data.animationTemplate,
        use_act_two: data.useActTwo ?? false,
        motion_type: data.motionType,
        expression_intensity: data.expressionIntensity ?? 3,
        body_control: data.bodyControl ?? true,
      });

      updateNodeData({
        englishPrompt: result.english_prompt,
        isTranslating: false,
        isValid: true,
        errorMessage: undefined,
      });

      // セリフ検出時の表示制御 (N3: 正規化ハッシュで同一性判定)
      if (result.extracted_dialogue) {
        const normalizedHash = normalizeDialogue(result.extracted_dialogue);
        if (normalizedHash !== dismissedDialogueHashRef.current) {
          setPendingDialogue(result.extracted_dialogue);
        }
      } else {
        setPendingDialogue(null);
      }
    } catch (error) {
      updateNodeData({
        isTranslating: false,
        isValid: false,
        errorMessage:
          error instanceof Error ? error.message : '翻訳に失敗しました',
      });
    }
  }, 500);

  return () => clearTimeout(timer);
  // N1 対応: dismissedDialogueHashRef は ref のため依存配列から除外。
  // data.subjectType 等の翻訳パラメータ変更時は再翻訳トリガ
}, [
  localPrompt,
  updateNodeData,
  data.subjectType,
  data.cameraWork,
  data.animationCategory,
  data.animationTemplate,
  data.useActTwo,
  data.motionType,
  data.expressionIntensity,
  data.bodyControl,
]);
```

**新規 UI ブロック (翻訳結果表示の直下):**

```tsx
{pendingDialogue && !data.isTranslating && (
  <div className="mt-2 p-2 bg-amber-900/30 border border-amber-700/50 rounded-lg">
    <div className="flex items-center gap-1 text-xs text-amber-300 mb-1">
      <MessageSquare className="w-3 h-3" />
      <span>セリフを検出しました</span>
    </div>
    <p className="text-xs text-gray-200 mb-2 italic">「{pendingDialogue}」</p>
    <div className="flex gap-1">
      <button
        onClick={() => handleCreateDialogueNode(pendingDialogue)}
        className="px-2 py-1 text-xs bg-blue-600 hover:bg-blue-500 text-white rounded"
      >
        新規 DialogueNode を作成
      </button>
      <button
        onClick={() => handleSendToExistingDialogue(pendingDialogue)}
        disabled={!hasExistingDialogueNode}
        className="px-2 py-1 text-xs bg-gray-700 hover:bg-gray-600 disabled:opacity-40 text-white rounded"
      >
        既存ノードに転記
      </button>
      <button
        onClick={() => {
          // N3 対応: 正規化ハッシュで dismiss 記録
          dismissedDialogueHashRef.current = normalizeDialogue(pendingDialogue);
          setPendingDialogue(null);
        }}
        className="px-2 py-1 text-xs bg-transparent hover:bg-gray-700 text-gray-400 rounded"
      >
        無視
      </button>
    </div>
  </div>
)}
```

#### 4-2-3. DialogueNode との連携実装

DialogueNode の `text` フィールドへの外部書き込みは、既存の `nodeDataUpdate` CustomEvent パターンを利用 (PromptNode が `subjectTypeChange` で Act-Twoノードに通知しているのと同じ仕組み)。

**N4 対応**: 本 doc で新規追加する CustomEvent 命名は以下に統一:
- `nodeDataUpdate` (既存パターン再利用) — `text` フィールド書き込み
- `createDialogueNodeFromPrompt` (本 doc 新規) — 新規 DialogueNode 配置リクエスト

```tsx
// PromptNode 内ヘルパー (N2 対応: useCallback で安定化)
const handleSendToExistingDialogue = useCallback((dialogueText: string) => {
  // 既存 DialogueNode を探す (NodeEditor から useStore で取得 or props 経由)
  const dialogueNodeId = findFirstDialogueNodeId();
  if (!dialogueNodeId) return;

  const event = new CustomEvent('nodeDataUpdate', {
    detail: { nodeId: dialogueNodeId, updates: { text: dialogueText } },
  });
  window.dispatchEvent(event);

  dismissedDialogueHashRef.current = normalizeDialogue(dialogueText);
  setPendingDialogue(null);
  // Toast: 「DialogueNode (ID: xxx) に転記しました」
}, []);

const handleCreateDialogueNode = useCallback((dialogueText: string) => {
  // 新規 DialogueNode 配置リクエストを NodeEditor に伝達
  const event = new CustomEvent('createDialogueNodeFromPrompt', {
    detail: {
      sourcePromptNodeId: id,
      initialText: dialogueText,
    },
  });
  window.dispatchEvent(event);

  dismissedDialogueHashRef.current = normalizeDialogue(dialogueText);
  setPendingDialogue(null);
}, [id]);
```

**NodeEditor 側 (新規 listener, N2 対応):**

```tsx
// NodeEditor.tsx (既存 nodeDataUpdate listener と並列で追加)
// N2 対応: setNodes は React Flow のセッターで stable → 依存配列を [setNodes] のみに
useEffect(() => {
  const handler = (e: Event) => {
    const event = e as CustomEvent<{ sourcePromptNodeId: string; initialText: string }>;
    // setNodes の関数形式 setter 経由で最新の nodes にアクセス (closure 問題回避)
    setNodes((prevNodes) => {
      const sourceNode = prevNodes.find(n => n.id === event.detail.sourcePromptNodeId);
      if (!sourceNode) return prevNodes;

      const newNode = {
        id: `dialogue-${Date.now()}`,
        type: 'dialogue',
        position: {
          x: sourceNode.position.x + 320,
          y: sourceNode.position.y + 200,
        },
        data: createDefaultNodeData('dialogue', { text: event.detail.initialText }),
      };
      return [...prevNodes, newNode];
      // 注: PromptNode → DialogueNode のエッジは自動接続しない
      // (DialogueNode は GenerateNode 出力 → 入力のため、§15-1 表 4 番参照)
    });
  };

  window.addEventListener('createDialogueNodeFromPrompt', handler);
  return () => window.removeEventListener('createDialogueNodeFromPrompt', handler);
  // N2 対応: 依存配列は setNodes のみ (関数形式 setter で nodes 依存を排除)
}, [setNodes]);
```

#### 4-2-4. セリフ抽出ロジック (バックエンド AI 任せ + 正規表現フォールバック ハイブリッド)

**採用方針**: §4-1-1 に記載の通り、バックエンドで:

1. **正規表現で一次抽出** (`「」` / `『』` を別々に抽出して結合 — B1 採用案 a)
2. **AI で構造化抽出** (subject_visual / action / camera 等と同時に dialogue も抽出)
3. **正規表現結果を信頼ソースに優先** (AI が「」を見落とすケースに備える)

**フロントエンドでは正規表現を実行しない**。理由: 「セリフ抽出は翻訳と一体の処理」であり、API レスポンス到着前に独自検出して UI を変化させると、API 結果との不整合 (例: 句読点処理の差) が発生しうる。

---

## 5. 既存コードベース分析

| カテゴリ | パス | 行 | 役割 |
|--|--|--|--|
| 中核ロジック (バックエンド) | `movie-maker-api/app/external/gemini_client.py` | L1242-1432 | 既存 `translate_scene_to_runway_prompt` (storyboard 経由)。**本 doc で新規追加する `translate_story_prompt` は別関数として実装** (既存呼び出し元保護のため) |
| プロンプトテンプレ | `docs/prompt/scene/person/runway_api_template.md` | L33-49 | 人物前提テンプレ (`Same face, same hair, same clothing` を含む) |
| | `docs/prompt/scene/person/kling_api_template.md` | L35-48 | Kling 用人物前提テンプレ |
| | `docs/prompt/scene/object/*` | - | **要事前確認 (推奨 1 対応)**: 物体専用テンプレ存在有無を Phase 1 着手前にディレクトリ確認。不在ならハードコード文字列 (`_build_reference_instruction`) を真実とし、テンプレファイル化は別 PR で実施。 |
| Schema | `movie-maker-api/app/videos/schemas.py` | L432-434 | `TranslateStoryPromptResponse` (改修対象) |
| ルーター | `movie-maker-api/app/videos/router.py` | (新規追加先) | `POST /api/v1/videos/story/translate` |
| Kling 長さ制限 | `movie-maker-api/app/external/piapi_kling_provider.py` | L432-435 | 2500 文字 truncate (本 doc は 1200 文字以内を目標とする) |
| PromptNode | `movie-maker/components/node-editor/nodes/PromptNode.tsx` | L41-73 | デバウンス翻訳ロジック (改修対象) |
| API クライアント | `movie-maker/lib/api/client.ts` | L202-219 | `translateStoryPrompt` 型 (改修対象) |
| DialogueNode 構造 | `docs/plans/2026-05-14_dialogue-node.md` | §4 handle 定義 | DialogueNode は Pipeline 型 (入力: video URL, 出力: 合成 video URL)。**`text` フィールドは `nodeDataUpdate` CustomEvent で外部から書き込み可能 (§15-1 表 4 番で参照)** |
| 類似実装 (CustomEvent 連携) | `movie-maker/components/node-editor/nodes/PromptNode.tsx` | L80-85 | `subjectTypeChange` イベントで Act-Two ノードに通知。同じパターンを `createDialogueNodeFromPrompt` / `nodeDataUpdate` で再利用 |

### 5-1. 類似機能検索 (Pattern 5 防止)

検索キーワード: `extract dialogue`, `「」`, `bracket pattern`, `translate_story_prompt`, `extracted_dialogue`

- **発見済の類似実装**:
  - `gemini_client.py:1242-1432` (`translate_scene_to_runway_prompt`) は storyboard 経由 (シーン番号・act 付き、`SINGLE IMAGE RULE` フル整形) で、PromptNode 用途とは責務が異なる
  - DialogueNode 既存実装 ([`2026-05-14_dialogue-node.md`](./2026-05-14_dialogue-node.md)) は `text` フィールドへの**外部からの書き込み手段**を `nodeDataUpdate` CustomEvent でサポート済
  - `generate_image_prompt_from_scene` (`gemini_client.py:1944`) で `dialogue` を別引数として受け取るパターンは既存 (本 doc の方向性と整合)
- **判断**:
  - `translate_story_prompt` は新規関数として追加 (既存 `translate_scene_to_runway_prompt` の改修ではなく分離) — storyboard 経由とのテンプレ要件差を尊重
  - DialogueNode `text` 書き込みは既存 CustomEvent パターン再利用 (新 API 追加なし)
  - セリフ正規表現抽出は標準ライブラリ `re` のみで完結 (新規依存なし)

---

## 6. Change Impact Map

```yaml
Change Target: prompt translation pipeline (gemini_client.translate_story_prompt 新規追加)

Direct Impact:
  - movie-maker-api/app/external/gemini_client.py
      (translate_story_prompt / _extract_prompt_components / _run_gemini_translation /
       _build_reference_instruction / _build_translate_system_prompt / _sanitize_reserve_typo /
       _extract_dialogues_via_regex の新規追加,
       TranslateStoryPromptInput / ExtractedComponents dataclass 追加)
  - movie-maker-api/app/videos/schemas.py:432-434
      (TranslateStoryPromptResponse に extracted_dialogue 追加,
       TranslateStoryPromptRequest に subject_type 等の optional フィールド明示追加 — B2 対応)
  - movie-maker-api/app/videos/router.py
      (POST /api/v1/videos/story/translate handler を TranslateStoryPromptInput 経由に改修)
  - movie-maker/lib/api/client.ts:202-219
      (TranslateStoryPromptRequest / TranslateStoryPromptResponse 型 export 追加,
       translateStoryPrompt 戻り値型に extracted_dialogue 追加)
  - movie-maker/components/node-editor/nodes/PromptNode.tsx:41-73
      (useEffect 改修, 確認カード UI 追加, ヘルパー関数追加,
       dismissedDialogueHashRef による useRef 管理 — N1 対応)
  - movie-maker/components/node-editor/NodeEditor.tsx
      (createDialogueNodeFromPrompt listener 追加 — N4 対応 命名統一,
       setNodes 関数形式 setter で closure 問題回避 — N2 対応)

Indirect Impact:
  - DialogueNode (text フィールドが外部から書き込まれる頻度が増える: 既存の手動入力からの変化)
  - graph-to-api.ts
      (PromptNode の englishPrompt がより短く / 主体情報リッチになる →
       Kling 等のリクエストペイロードが変化、サイズ縮小)
  - tests/videos/test_text_to_image.py
      (既存失敗中の 2 件は無関係、新規テストは別追加)

No Ripple Effect:
  - translate_scene_to_runway_prompt (storyboard 経由) — 別関数のため改修対象外
  - 既存 translate_scene_description エンドポイント (POST /storyboard/translate-scene) — 改修対象外
  - ProviderNode / KlingElementsNode 等の設定ノード — エッジスコープ化 (別 doc) とは独立
  - Hedra リップシンク / TTS プロバイダー (DialogueNode 内部処理は不変)
```

---

## 7. Interface Change Matrix

| 既存操作 | 新操作 | 変換要否 | アダプタ要否 | 互換性確保方法 |
|---------|--------|---------|------------|---------------|
| `POST /api/v1/videos/story/translate` returns `{ english_prompt: string }` | `POST /api/v1/videos/story/translate` returns `{ english_prompt: string, extracted_dialogue: string \| null }` | 否 (追加フィールドのみ) | 不要 | フロント既存呼び出しは `extracted_dialogue` を**読まなければ無影響** (TypeScript 型は optional `\| null` で受ける) |
| `translateStoryPrompt(data) => Promise<{ english_prompt: string }>` | `translateStoryPrompt(data) => Promise<{ english_prompt: string; extracted_dialogue: string \| null }>` | 否 | 不要 | 同上 (TypeScript は構造的型付けで後方互換) |
| `translate_story_prompt(description_ja: str, ...12 個別引数)` | `translate_story_prompt(params: TranslateStoryPromptInput)` | 是 | 不要 (内部関数のため呼び出し元は router.py のみ、同時改修) | 公開関数 1 箇所のみのため一括変換、外部影響なし |
| `_extract_prompt_components(...)→ dict` | `_extract_prompt_components(...)→ ExtractedComponents` | 是 | 不要 (内部関数) | B3 対応: 戻り値 contract 統一で TypeError 排除 |
| PromptNode useEffect (翻訳結果を `englishPrompt` にセット) | PromptNode useEffect (翻訳結果 + extracted_dialogue で確認カード表示) | 是 | 不要 (内部実装変更) | UI 追加のみ、既存挙動を破壊しない |
| `translate_story_prompt` (新規バックエンド関数) | 新規実装 | - | - | 既存 `translate_scene_to_runway_prompt` とは完全分離 |

---

## 8. Integration Point Map

```yaml
Integration Point 1: PromptNode → Backend Translate API
  Existing Component: videosApi.translateStoryPrompt() in lib/api/client.ts:202-219
  Integration Method: API レスポンス schema 拡張 (フィールド追加のみ)
  Impact Level: Low (追加フィールド読み取りは optional, 既存呼び出し無影響)
  Required Test Coverage:
    - 旧呼び出し元 (storyboard 等で同 API を使う箇所があれば) の動作継続検証
    - PromptNode が extracted_dialogue を正しく受け取り表示する単体テスト
    - B2: subject_type を含むリクエストが正しく BE に届くテスト

Integration Point 2: PromptNode → DialogueNode (text 書き込み)
  Existing Component: DialogueNode (data.text), nodeDataUpdate CustomEvent
  Integration Method: 既存 CustomEvent パターンの再利用 (新 API 追加なし)
  Impact Level: Medium (DialogueNode の text が外部から書き換えられるユースケースが増える)
  Required Test Coverage:
    - PromptNode のセリフ転記ボタンで DialogueNode.text が更新される統合テスト
    - DialogueNode が既存 text を上書きされてもエラーにならない単体テスト

Integration Point 3: PromptNode → NodeEditor (DialogueNode 新規配置)
  Existing Component: NodeEditor.tsx (setNodes), createDefaultNodeData()
  Integration Method: 新規 CustomEvent createDialogueNodeFromPrompt (N4: §6 で命名統一済み)
  Impact Level: Medium (グラフへの自動ノード追加)
  Required Test Coverage:
    - 「新規 DialogueNode を作成」ボタンクリックで xyflow ノードが 1 個増える統合テスト
    - 位置オフセット (sourcePromptNode.position + {x:320, y:200}) が画面内に収まる検証

Integration Point 4: translate_story_prompt → Gemini API (2 段階呼び出し)
  Existing Component: get_gemini_client() in gemini_client.py
  Integration Method: 2 回の generate_content (抽出 + 翻訳)。N5 対応: 各呼び出しは asyncio.to_thread で event loop 非ブロック化。レイテンシ ~3-5 秒
  Impact Level: Low (内部実装、外部 API 仕様変更なし)
  Required Test Coverage:
    - 抽出フェーズ失敗時に正規表現 + 単一プロンプト翻訳にフォールバックする単体テスト
    - 翻訳結果に "Reserve" が含まれていた場合のサニタイズ動作テスト
    - N6 対応: _run_gemini_translation を直接 monkeypatch するテスト形態
```

---

## 9. Integration Boundary Contracts

```yaml
Boundary Name: PromptNode → translate_story_prompt API
  Input:
    description_ja: string (max 500 chars)
    video_provider: enum ("runway" | "veo" | "domoai" | "piapi_kling" | "hailuo" | "seedance")
    subject_type: enum ("person" | "object" | "animation")
    (他、camera_work / animation_* / use_act_two 等のオプション - B2: すべてリクエストボディに含まれる)
  Output (同期 HTTP レスポンス):
    english_prompt: string (target: < 1200 chars, hard limit なし — B5 対応 案 a)
    extracted_dialogue: string | null (改行区切りで複数セリフ、未検出時 null)
  On Error:
    - HTTP 500 + detail メッセージ
    - フロントは isValid=false, errorMessage 表示
    - extracted_dialogue は null として扱う

Boundary Name: PromptNode (UI) → DialogueNode (text 書き込み)
  Input:
    event: CustomEvent<{ nodeId: string, updates: { text: string } }>
    (CustomEvent 名: "nodeDataUpdate" — 既存パターン)
  Output:
    DialogueNode の data.text 更新 (副作用)
  On Error:
    - DialogueNode が存在しない場合 → 何もしない (no-op)
    - 複数 DialogueNode 存在 → 最初の 1 個に転記 + 警告 Toast

Boundary Name: PromptNode (UI) → NodeEditor (DialogueNode 新規配置)
  Input:
    event: CustomEvent<{ sourcePromptNodeId: string, initialText: string }>
    (CustomEvent 名: "createDialogueNodeFromPrompt" — N4 対応 命名統一)
  Output:
    新規 DialogueNode が NodeEditor.nodes に追加される (非同期 setNodes)
  On Error:
    - sourcePromptNode が見つからない → no-op
    - DialogueNode 配置位置が画面外 → そのまま配置 (ユーザーが手動で移動)
```

---

## 10. エッジケース

### 10-1. セリフ複数の場合
- 入力: `「あ…」「やめて…」`
- 抽出結果: `dialogue = "あ…\nやめて…"` (改行区切り)
- DialogueNode 転記: そのまま改行付きで `text` に設定 (DialogueNode の TTS が改行をどう扱うかは既存仕様準拠 — 多くの TTS は改行をポーズとして解釈)
- 確認カード表示: 改行を `<br />` で表示

### 10-2. セリフがない場合
- 抽出結果: `dialogue = null`
- 確認カードは表示されない
- DialogueNode 関連 UI は完全に非表示

### 10-3. 既存 DialogueNode がある場合 (上書き or マージ)
- **上書き方針**: 「既存ノードに転記」ボタンで `text` を**完全置換** (マージしない)。理由: マージ仕様 (改行で連結? 置換?) はユーザーごとの意図が異なり一意決定困難。
- 上書き前に確認 Toast: 「既存のセリフ '{現在のtext}' を上書きします」
- 複数 DialogueNode の場合: 最初の 1 個のみ転記 + Toast「複数の DialogueNode が見つかりました。最初の 1 個に転記しました。」

### 10-4. PromptNode に英語直接入力時 (翻訳スキップの誤検出)
- 現状 PromptNode は日本語前提だが、ユーザーが英語を直接入力するケース:
  - 例: `A beige knit sweater character "wait please"...`
  - 抽出フェーズの正規表現は `「」` / `『』` のみ対象 → 英語の `"..."` は抽出されない
  - AI 抽出フェーズも JSON 出力で `dialogue: ""` を返す確率高
  - **判断**: 英語入力時はセリフ抽出機能を**意図的に動作させない** (誤検出回避)。英語ダブルクォート対応は将来課題。

### 10-5. 「」内が空文字列の場合
- 入力: `キャラクターが「」と言う`
- 正規表現マッチ: `[""]` (空文字を含む) → `_extract_dialogues_via_regex` 内で `d.strip()` フィルタにより除外 → `None`
- 結果: `dialogue = None` (確認カード非表示)

### 10-6. ネストしたカッコ (B1 訂正版)
- 入力: `「彼は『やめて』と叫んだ」`
- **採用案 a: 1 階層厳密対応** を採用 (§4-1-1 `_extract_dialogues_via_regex` 実装)
- **挙動 (断言形)**:
  - `KAGI_BRACKET_PATTERN = re.compile(r"「([^「」]*?)」")` は否定文字クラス `[^「」]` を使うため、`「` または `」` 自体を内部に含まない。
  - したがって `「彼は『やめて』と叫んだ」` は **そのまま 1 件**として `"彼は『やめて』と叫んだ"` がマッチ (`』` は否定文字クラスに含まれないため通過)。
  - `DOUBLE_KAGI_BRACKET_PATTERN = re.compile(r"『([^『』]*?)』")` で別途 `"やめて"` を抽出。
  - 結合結果: `"彼は『やめて』と叫んだ\nやめて"` (改行で結合)
- **判断理由 (案 b 不採用)**:
  - 案 b (スタックベース、完全ネスト対応) は標準 `re` で実現不可で別実装が必要、保守コスト増
  - 重複抽出は DialogueNode TTS 側で「両方読む」だけで致命的でなく、ユーザーが手動編集で削除可能
- **AC-C8 (新規)** で本挙動を固定。

### 10-7. 翻訳結果が 1200 文字を超えた場合 (B5 対応 案 a 採用)
- システムプロンプトで 1200 文字以内を要求しているが、AI 出力が遵守しない可能性
- **採用方針 (案 a)**: ソフト目標 1200 文字。**ハード上限なし**、超過時は `logger.warning` のみ。
- **最終安全網**: Kling 2500 文字 truncate (`piapi_kling_provider.py:432-435`)
- **理由**: ハード上限 + 短縮再翻訳ループ (案 b) は実装複雑、レイテンシ増、AI コスト 2 倍。Kling の 2500 が事実上の安全網として機能しており、Runway/Veo 等は文字数制限が緩い。
- 将来改善: テンプレート再生成 (短縮再翻訳ループ) を別 Phase で検討
- AC-B2 を「ソフト目標 1200, ハード上限なし」に修正済

### 10-8. extracted_dialogue が正規表現と AI 抽出で食い違う場合
- §4-1-1 の `_extract_prompt_components` で**正規表現結果を信頼ソースに優先**する設計
- AI 抽出が `"dialogue": "想像で補ったテキスト"` を返しても、正規表現が空 (None) なら AI 結果を採用
- 正規表現が抽出できた場合は AI 結果を無視 (regex_dialogue を優先)

### 10-9. 既存ワークフロー (旧テンプレートで翻訳済み) の動作
- DB 等に保存された旧 `englishPrompt` (旧テンプレ準拠) はそのまま動画生成可能 (動画プロバイダー API は文字列を受け取るだけで形式制約なし)
- 新規翻訳のみ新テンプレ適用、再翻訳しない限り旧プロンプトは保持

---

## 11. 前提事項 / 後方互換性

### 11-1. Phase 1 着手前の確認事項 (推奨 1 / 推奨 2 対応)

| # | 項目 | 期限 | 判断者 |
|---|------|------|--------|
| 1 | `docs/prompt/scene/object/` ディレクトリの存在確認。不在ならハードコード文字列 (`_build_reference_instruction`) を真実として運用、テンプレファイル化は別 PR で実施。 | Phase 1 着手前 | 実装者 |
| 2 | Gemini "Reserve" 誤生成の再現性測定。本 doc 改修前の旧テンプレで 5-10 回 prompt 翻訳 → "Reserve" 出現率を計測。再現率が極端に低い (10% 未満) ならシステムプロンプト強化 (A 案ステップ 1) のみで `_sanitize_reserve_typo` を省略可能。 | Phase 1 着手前 | 実装者 + レビュアー |
| 3 | `tests/external/test_gemini_translate_story.py` のモック設計確認。`_run_gemini_translation` を直接 monkeypatch する形態とする (N6 対応)。 | Phase 1 開始時 | 実装者 |

### 11-2. 後方互換性

| 観点 | 評価 | 詳細 |
|------|------|------|
| API レスポンス schema 拡張 | 互換 | `extracted_dialogue` は追加フィールドのみ。既存呼び出し元は読まなければ無影響。 |
| 既存ワークフロー (旧テンプレで翻訳済み) | 互換 | 保存済 `englishPrompt` は動画生成 API でそのまま使える (英文字列としての制約なし) |
| `videosApi.translateStoryPrompt` 戻り値型変更 | 互換 | TypeScript の構造的型付けで、追加プロパティのみは既存コード破壊しない |
| `translate_scene_to_runway_prompt` (別関数) | 影響なし | 本 doc は新規 `translate_story_prompt` の追加であり、既存 storyboard 経由翻訳は不変 |
| 既存テスト | 影響軽微 | `tests/videos/test_text_to_image.py` の既存 2 件失敗は別問題 (`GenerateSceneImageResponse` モック不足)。本 doc 改修は別関数追加のため既存テストには無影響 |
| DialogueNode の text 書き込み | 動作変化 | 既存ユーザーの DialogueNode は手動入力のみだったが、PromptNode から自動転記される頻度が増える (破壊的ではないが UX 変化) |
| `translate_story_prompt` のシグネチャ (dataclass 化) | 影響限定 | 内部関数。呼び出し元は `router.py` のみ。同時改修で影響を吸収。 |

---

## 12. テスト戦略

### 12-1. バックエンド単体テスト (`tests/external/test_gemini_translate_story.py` 新規)

```python
import pytest
from unittest.mock import AsyncMock, patch

from app.external.gemini_client import (
    translate_story_prompt,
    TranslateStoryPromptInput,
    ExtractedComponents,
    _extract_prompt_components,
    _extract_dialogues_via_regex,
    _sanitize_reserve_typo,
)

# 1. 正常系: 視覚情報を含む人物入力
@pytest.mark.asyncio
async def test_translate_story_prompt_person_with_visual():
    params = TranslateStoryPromptInput(
        description_ja="赤いセーターを着た女性が手を振る",
        subject_type="person",
    )
    result_en, dialogue = await translate_story_prompt(params)
    assert "red sweater" in result_en.lower() or "red knit" in result_en.lower()
    assert "Preserve" in result_en
    assert "Reserve exact appearance" not in result_en  # typo ガード
    assert dialogue is None

# 2. 正常系: object サブジェクト + 視覚情報 (B2 対応 AC-B3)
@pytest.mark.asyncio
async def test_translate_story_prompt_object_no_human_phrases():
    params = TranslateStoryPromptInput(
        description_ja="ベージュのニットセーター (手足なし、ハンガー吊り)",
        subject_type="object",
    )
    result_en, dialogue = await translate_story_prompt(params)
    assert "beige" in result_en.lower()
    assert "knit" in result_en.lower()
    assert "Same face, same hair, same clothing" not in result_en  # 人物前提フレーズ除外
    assert dialogue is None

# 3. 正常系: セリフ含む入力
@pytest.mark.asyncio
async def test_translate_story_prompt_with_dialogue():
    params = TranslateStoryPromptInput(
        description_ja="キャラクターが「ちょっとまって…」と言う",
    )
    result_en, dialogue = await translate_story_prompt(params)
    assert dialogue == "ちょっとまって…"
    assert "ちょっとまって" not in result_en  # 本文に混入しない
    assert "lip-sync" in result_en.lower() or "speaking" in result_en.lower()

# 4. エッジケース: 複数セリフ
@pytest.mark.asyncio
async def test_translate_story_prompt_multiple_dialogues():
    params = TranslateStoryPromptInput(
        description_ja="「あ…」と言ってから「やめて…」と続ける",
    )
    result_en, dialogue = await translate_story_prompt(params)
    assert "あ…" in dialogue
    assert "やめて…" in dialogue
    assert "\n" in dialogue  # 改行区切り

# 5. エッジケース: 正規表現フォールバック (N6 対応, _run_gemini_translation を直接 mock)
@pytest.mark.asyncio
async def test_extract_components_regex_fallback(monkeypatch):
    """AI 抽出を意図的に失敗させ、regex 単独でセリフが取れることを検証。"""
    async def mock_fail(*args, **kwargs):
        raise Exception("Gemini timeout")
    # N6 対応: _extract_prompt_components 内部の Gemini 呼び出しを mock
    monkeypatch.setattr(
        "app.external.gemini_client.asyncio.to_thread",
        AsyncMock(side_effect=Exception("Gemini timeout")),
    )

    extracted = await _extract_prompt_components("キャラが「セリフ」と言う")
    assert extracted.dialogue == "セリフ"  # 正規表現で拾える
    assert isinstance(extracted, ExtractedComponents)
    assert extracted.subject_visual != ""  # フォールバックで description_ja を格納

# 6. typo サニタイズ (純関数テスト)
def test_reserve_to_preserve_sanitization():
    text = "Reserve exact appearance from reference. Reserve the subject identity."
    cleaned = _sanitize_reserve_typo(text)
    assert "Reserve" not in cleaned
    assert "Preserve exact appearance" in cleaned
    assert "Preserve the subject" in cleaned

# 7. 文字数制約 (B5 対応 ソフト目標、ハード上限なし)
@pytest.mark.asyncio
async def test_translate_story_prompt_length_soft_target():
    long_input = "ベージュのニットセーター..." * 50
    params = TranslateStoryPromptInput(description_ja=long_input)
    result_en, _ = await translate_story_prompt(params)
    # ソフト目標: 1200 文字超過は warning ログのみ、test では assert しない
    # 実機検証では length が target 範囲かを log で確認

# 8. AC-C8 対応: 異種ネストカッコの抽出挙動 (B1)
def test_extract_dialogues_nested_brackets():
    text = "「彼は『やめて』と叫んだ」"
    result = _extract_dialogues_via_regex(text)
    # 採用案 a: 別々抽出して結合 (重複あり)
    assert "彼は『やめて』と叫んだ" in result
    assert "やめて" in result
    assert "\n" in result

# 9. AC-C9 対応: PromptNode subjectType='object' で人物フレーズが混入しない (B2)
@pytest.mark.asyncio
async def test_translate_story_prompt_subject_type_object_excludes_person_phrases():
    """B2 対応: subject_type='object' で 'Same face' 系フレーズが混入しないこと。"""
    params = TranslateStoryPromptInput(
        description_ja="ベージュのニットセーターのキャラクター",
        subject_type="object",
    )
    result_en, _ = await translate_story_prompt(params)
    assert "Same face" not in result_en
    assert "Same hair" not in result_en
    assert "Same clothing" not in result_en

# 10. AC-B4 対応: Act-Two 引数が渡されても 500 にならず警告ログのみ (B4)
@pytest.mark.asyncio
async def test_translate_story_prompt_act_two_phase1_warning_only(caplog):
    """B4 対応: Phase 1 では use_act_two=True を受け取っても標準翻訳 + 警告ログ。"""
    params = TranslateStoryPromptInput(
        description_ja="女性が振り向く",
        subject_type="person",
        use_act_two=True,
        motion_type="natural",
        expression_intensity=4,
        body_control=True,
    )
    result_en, _ = await translate_story_prompt(params)
    assert isinstance(result_en, str)
    assert len(result_en) > 0
    # 警告ログ確認
    assert any("Act-Two mode is not supported" in r.message for r in caplog.records)
```

### 12-2. フロントエンド単体テスト (`PromptNode.test.tsx` 新規 or 既存追加)

```tsx
// 1. extracted_dialogue が null の場合、確認カードを表示しない
test('does not show dialogue card when extracted_dialogue is null', async () => {
  mockTranslateApi.mockResolvedValue({
    english_prompt: '...',
    extracted_dialogue: null,
  });
  render(<PromptNode ... />);
  await userEvent.type(textarea, '日本語入力');
  await waitFor(() => {
    expect(screen.queryByText('セリフを検出しました')).not.toBeInTheDocument();
  });
});

// 2. extracted_dialogue がある場合、確認カードを表示する
test('shows dialogue card when extracted_dialogue is detected', async () => {
  mockTranslateApi.mockResolvedValue({
    english_prompt: '...',
    extracted_dialogue: 'ちょっとまって…',
  });
  // ... 同上
  await waitFor(() => {
    expect(screen.getByText('セリフを検出しました')).toBeInTheDocument();
    expect(screen.getByText('「ちょっとまって…」')).toBeInTheDocument();
  });
});

// 3. 「無視」ボタンクリックで再表示されない (N3: 正規化ハッシュ確認)
test('does not re-show dialogue card after dismiss with same normalized hash', async () => {
  // 「ちょっと  まって…」 (空白 2 つ) と「ちょっと まって…」が同一視されること
});

// 4. 「新規 DialogueNode を作成」ボタンで CustomEvent が発火 (N4 命名確認)
test('dispatches createDialogueNodeFromPrompt event', async () => {
  const spy = vi.spyOn(window, 'dispatchEvent');
  await userEvent.click(screen.getByText('新規 DialogueNode を作成'));
  expect(spy).toHaveBeenCalledWith(
    expect.objectContaining({
      type: 'createDialogueNodeFromPrompt',
      detail: expect.objectContaining({ initialText: 'ちょっとまって…' }),
    })
  );
});

// 5. B2 対応: subject_type='object' のとき API リクエストに正しく渡されること
test('passes subject_type from node data to translation API', async () => {
  const mockData = { subjectType: 'object' as const, ... };
  render(<PromptNode data={mockData} ... />);
  await userEvent.type(textarea, '日本語');
  await waitFor(() => {
    expect(mockTranslateApi).toHaveBeenCalledWith(
      expect.objectContaining({ subject_type: 'object' })
    );
  });
});
```

### 12-3. 統合テスト (`NodeEditor.test.tsx` 追加)

```tsx
// 1. PromptNode → DialogueNode 新規配置で xyflow ノードが 1 個増える
test('creates DialogueNode when triggered from PromptNode', async () => {
  render(<NodeEditor initialNodes={[promptNode]} />);
  // ... PromptNode で日本語+セリフ入力 → 確認カードの「新規作成」クリック
  await waitFor(() => {
    const dialogueNodes = screen.getAllByTestId('dialogue-node');
    expect(dialogueNodes).toHaveLength(1);
  });
});

// 2. 既存 DialogueNode に転記
test('writes text to existing DialogueNode when chosen', async () => {
  render(<NodeEditor initialNodes={[promptNode, dialogueNode]} />);
  // ... 「既存ノードに転記」クリック
  await waitFor(() => {
    expect(screen.getByDisplayValue('ちょっとまって…')).toBeInTheDocument();
  });
});
```

### 12-4. E2E テスト (Playwright, `prompt-translation-improvements.spec.ts` 新規)

```ts
// シナリオ: 非人型キャラ + セリフ入力 → DialogueNode 自動生成 → 動画生成
test('non-human character with dialogue creates DialogueNode and generates video', async ({ page }) => {
  await page.goto('/generate');
  // ... PromptNode を配置 + subjectType='object' に設定
  await page.fill('[data-testid="prompt-textarea"]',
    'ベージュのニットセーターのキャラ。「ちょっとまって…」と言う');
  await page.waitForSelector('text=セリフを検出しました');
  await page.click('text=新規 DialogueNode を作成');
  // DialogueNode が追加されていることを確認
  await expect(page.locator('[data-testid="dialogue-node"]')).toHaveCount(1);
  // 動画生成 → セリフが PromptNode 側英訳に混入していないことを確認
  // (UI で英訳プレビューを確認)
});
```

### 12-5. 既存テストへの影響

- 既存失敗中 `tests/videos/test_text_to_image.py` × 2 件、`tests/library/test_service.py` × 1 件 → 本 doc 改修と**無関係**。修正対象外。

---

## 13. 想定工数 (Phase 別)

### Phase 1: バックエンド実装 (2 日)
- `TranslateStoryPromptInput` / `ExtractedComponents` dataclass 定義: 0.25 日
- `translate_story_prompt` 新規関数 (Gemini 2 段階呼び出し): 0.5 日
- `_extract_prompt_components` + `_extract_dialogues_via_regex` (正規表現 + AI 抽出): 0.5 日
- `_build_reference_instruction` + `_build_translate_system_prompt`: 0.25 日
- `_sanitize_reserve_typo` + フォールバック + Act-Two 引数警告ログ: 0.25 日
- ルーター改修 (`POST /api/v1/videos/story/translate`): 0.25 日
- schemas.py 更新 (extracted_dialogue 追加, リクエスト schema の subject_type 等明示): 0.25 日
- 単体テスト 10 件 (AC-C8, AC-C9, AC-B4 含む): 0.75 日 (gemini モック作成含む)
- **検証 (L1)**: 開発環境で日本語 + セリフ入力 → API レスポンスに extracted_dialogue が返ることを curl で確認

### Phase 2: フロントエンド実装 (1.5 日)
- API クライアント型定義 (`client.ts:202-219`, `TranslateStoryPromptRequest`/`Response` export): 0.25 日
- PromptNode 改修 (useEffect 拡張, 確認カード UI, dismissedDialogueHashRef N1 対応, useCallback N2 対応): 0.5 日
- ヘルパー関数 (`handleCreateDialogueNode`, `handleSendToExistingDialogue`, normalizeDialogue N3): 0.25 日
- NodeEditor 改修 (createDialogueNodeFromPrompt listener, setNodes 関数形式 setter): 0.25 日
- 単体テスト 5 件: 0.25 日

### Phase 3: 統合 + E2E (1 日)
- 統合テスト (NodeEditor with PromptNode + DialogueNode): 0.5 日
- Playwright E2E (非人型キャラシナリオ): 0.5 日
- **検証 (L2)**: 全テスト緑

### Phase 4: 品質保証 (0.5 日, 推奨 5 対応で具体化)
- Acceptance Criteria 全項目検証 (AC-A1, AC-B1〜B4, AC-C1〜C9, AC-D1〜D2, AC-E1)
- Kling 実機での 1200 文字以下確認 (ソフト目標、超過時 warning 出力確認)
- 既存 storyboard 経由翻訳が壊れていないことの回帰確認
  - 実行コマンド: `cd movie-maker-api && pytest tests/external/test_gemini_client.py -v`
  - PromptNode/storyboard 両画面で実機翻訳して旧テンプレ呼び出しが破壊されていないこと
- ドキュメント更新 (推奨 1: `docs/prompt/scene/object/*` テンプレ存在に応じて整備指示)

**合計**: 5 日 (1 人開発、レビュー時間別)

---

## 14. Acceptance Criteria (Given/When/Then 形式)

### AC-A1: typo 修正 (Reserve → Preserve)
- **Given**: PromptNode に「赤いセーターを着た女性が手を振る」を入力
- **When**: 翻訳完了 (`english_prompt` 取得)
- **Then**:
  - `english_prompt.includes("Reserve exact appearance") === false`
  - `english_prompt.includes("Reserve the subject") === false`
  - `english_prompt.includes("Preserve")` (少なくとも 1 箇所)

### AC-B1: 主体情報保持 (object サブジェクト)
- **Given**: PromptNode の `subject_type = "object"`、日本語入力「ベージュのニットセーター。手足なし、ハンガー吊り、ふっくらした立体感」
- **When**: 翻訳完了
- **Then**:
  - `english_prompt` に "beige" 相当の語が含まれる (`beige` / `cream` / `tan` のいずれか)
  - `english_prompt` に "knit" 相当の語が含まれる (`knit` / `knitted` / `knitwear`)
  - `english_prompt` に "hanger" 相当の語が含まれる (`hanger` / `hung` / `suspended`)
  - `english_prompt.includes("Same face")` === false (人物前提フレーズ不在)
  - `english_prompt.includes("Same hair")` === false

### AC-B2: テンプレ軽量化 (文字数 — B5 対応 修正)
- **Given**: 上記 AC-B1 と同じ入力
- **When**: 翻訳完了
- **Then**:
  - **ソフト目標**: `english_prompt.length <= 1200`
  - **ハード上限なし**: 1200 文字超過時はバックエンドが `logger.warning` を出力するが、HTTP レスポンスは正常に返る (Kling 2500 文字 truncate が最終安全網)
  - **回帰防止**: 旧テンプレ平均 (約 1800 文字) を確実に下回ること

### AC-B3: subject_type='object' で人物前提フレーズ不在 (B2 / 新規)
- **Given**: PromptNode で `subject_type = 'object'` を選択し、リクエストボディに `subject_type: 'object'` を含めて API 呼び出し
- **When**: 翻訳完了
- **Then**:
  - `english_prompt` に "Same face, same hair, same clothing" 系のフレーズが**含まれない**
  - `english_prompt` に "facial features" / "outfit" 系の人物専用語句が**含まれない**
  - `english_prompt` に "subject design" / "materials" / "configuration" の少なくとも 1 つが含まれる (object 専用 Reference Instruction)

### AC-B4: Act-Two 引数の Phase 1 処理 (B4 / 新規)
- **Given**: PromptNode が `use_act_two = true`, `motion_type = "natural"`, `expression_intensity = 4`, `body_control = true` をリクエストに含めて翻訳 API 呼び出し
- **When**: 翻訳実行
- **Then**:
  - HTTP レスポンスが 200 で正常返却 (500 にならない)
  - `english_prompt` が標準モード翻訳結果として返る (Act-Two 専用テンプレは Phase 1 では未適用)
  - サーバーログに `"Act-Two mode is not supported in translate_story_prompt yet"` が含まれる (warning レベル)
- **Phase 2 で達成すべき AC** (本 doc では未対象): use_act_two=True 時に Act-Two 専用 prompt が適用され、`expression_intensity` 値が出力に反映される

### AC-C1: セリフ抽出 (単一)
- **Given**: PromptNode に「キャラクターが『ちょっと まって…』と言う」を入力
- **When**: 翻訳完了
- **Then**:
  - `extracted_dialogue === "ちょっと まって…"`
  - `english_prompt.includes("ちょっと")` === false (本文に混入しない)
  - `english_prompt` に "lip" / "speak" / "mouth" のいずれかの単語を含む (口の動きを示唆)

### AC-C2: セリフ抽出 (複数)
- **Given**: 日本語入力「「あ…」と言ってから「やめて…」と続ける」
- **When**: 翻訳完了
- **Then**:
  - `extracted_dialogue` が `"あ…"` と `"やめて…"` の両方を含む (改行区切り)

### AC-C3: セリフなし入力で extracted_dialogue が null
- **Given**: PromptNode に「女性が振り向く」を入力 (セリフカッコなし)
- **When**: 翻訳完了
- **Then**: `extracted_dialogue === null`

### AC-C4: 確認カード UI 表示
- **Given**: PromptNode で日本語+セリフを入力し翻訳完了
- **When**: `extracted_dialogue !== null` かつ `isTranslating === false`
- **Then**: 画面に「セリフを検出しました」テキスト・対象セリフ・「新規 DialogueNode を作成」「既存ノードに転記」「無視」の 3 ボタンが表示される

### AC-C5: 新規 DialogueNode 自動配置
- **Given**: PromptNode で確認カードが表示されている
- **When**: 「新規 DialogueNode を作成」ボタンをクリック
- **Then**:
  - グラフに DialogueNode が 1 個追加される (CustomEvent: `createDialogueNodeFromPrompt`)
  - 新 DialogueNode の `text` フィールドに `extracted_dialogue` が設定されている
  - 新 DialogueNode の位置が PromptNode の右下 (x + 320, y + 200)

### AC-C6: 既存 DialogueNode への転記
- **Given**: グラフに既存 DialogueNode が 1 つ存在し、PromptNode で確認カード表示中
- **When**: 「既存ノードに転記」ボタンをクリック
- **Then**:
  - 既存 DialogueNode の `text` が `extracted_dialogue` で**上書き**される (CustomEvent: `nodeDataUpdate`)
  - 新規 DialogueNode は作成されない
  - 確認 Toast が表示される (例: 「既存セリフを上書きしました」)

### AC-C7: 「無視」ボタンで再表示抑制 (N3 正規化対応)
- **Given**: PromptNode で確認カード表示中
- **When**: 「無視」ボタンをクリック
- **Then**:
  - 確認カードが消える
  - **同じ正規化セリフ** (`.trim().replace(/\s+/g, ' ')` 後一致) で再翻訳しても (デバウンス再発火) 確認カードは再表示されない
  - 例: 初回「ちょっと まって…」を無視 → ユーザー編集で「ちょっと  まって…」(空白 2 つ) になっても再表示されない

### AC-C8: ネストカッコ抽出の挙動 (B1 / 新規)
- **Given**: PromptNode に「キャラが「彼は『やめて』と叫んだ」と話す」を入力
- **When**: 翻訳完了
- **Then**:
  - `extracted_dialogue` に `"彼は『やめて』と叫んだ"` が含まれる (外側「」)
  - `extracted_dialogue` に `"やめて"` が含まれる (内側『』)
  - 両者は改行区切り (`\n`) で結合される
  - 仕様としての重複抽出は受容 (ユーザーが手動編集で削除可能)

### AC-C9: subjectType='object' 時の人物前提フレーズ不在 (B2 / 新規 — AC-B3 と重複しないフロント観点)
- **Given**: PromptNode の subjectType セレクトを 'object' に設定し、日本語「ベージュのニットセーター」を入力
- **When**: 翻訳完了 (フロントが API に subject_type='object' を渡す)
- **Then**:
  - 翻訳 API リクエストボディに `subject_type: 'object'` が含まれる (Network タブで検証)
  - レスポンスの `english_prompt` に "Same face, same hair, same clothing" が含まれない
  - レスポンスの `english_prompt` に "subject design" もしくは "materials" の語句が含まれる

### AC-D1: 後方互換 (API レスポンス)
- **Given**: 既存の `videosApi.translateStoryPrompt` 呼び出し元 (`extracted_dialogue` を読まないコード)
- **When**: 新 API が呼び出される
- **Then**: 既存コードは TypeScript エラー / ランタイムエラーなく動作する

### AC-D2: 既存ワークフロー保護
- **Given**: 旧テンプレで翻訳済の `englishPrompt` を持つ既存ワークフロー
- **When**: ユーザーが PromptNode を再編集せずに「生成」ボタンを押す
- **Then**: 動画生成は従来通り成功する (Kling/Runway/Veo すべて)

### AC-E1: テスト緑
- **Given**: Phase 1-3 の全テストを実装
- **When**: `cd movie-maker-api && make test` および `cd movie-maker && npm run test && npm run test:e2e`
- **Then**: 新規テスト全件 pass、既存テスト無回帰 (既存 3 件失敗は事前合意済 = 別問題のため除外可)

---

## 15. 未解決項目 / 要ユーザー確認事項

### 15-1. 確認が必要な仕様判断

| # | 項目 | 推奨 | 確認の必要性 |
|---|------|------|------------|
| 1 | UX 案 A/B/C のどれを採用するか | **案 A (確認カード)** | ユーザー承認必要 |
| 2 | 既存 DialogueNode 複数存在時の扱い | 最初の 1 個に転記 + 警告 Toast | 確認推奨 (「全 DialogueNode に転記」を希望する場合は仕様変更) |
| 3 | 「既存ノードに転記」時の text の上書き方針 | **完全置換** | 確認推奨 (マージを希望する場合は仕様変更) |
| 4 | DialogueNode 新規配置時のエッジ自動接続 | **接続しない** (DialogueNode は GenerateNode 出力経由のため、PromptNode と直接接続するエッジは存在しない。N7 対応: [`2026-05-14_dialogue-node.md` §4 handle 定義](./2026-05-14_dialogue-node.md) を参照 — DialogueNode の入力 Handle は video URL 用のみ) | 確認推奨 |
| 5 | 1200 文字目標を超過した場合の挙動 (B5 案 a 採用) | ソフト目標のみ。log warning のみ、再翻訳しない (Kling 2500 文字 truncate が安全網) | 確認推奨 |
| 6 | 英語直接入力時のセリフ抽出 | 機能オフ (誤検出回避) | 確認推奨 |
| 7 | Act-Two モード対応の Phase 分割 (B4) | Phase 1 引数受領 + 警告ログ / Phase 2 で `_build_act_two_instruction()` 専用テンプレ追加 | 確認推奨 |

### 15-2. 設計上の検討事項

- **`docs/prompt/scene/object/*` のテンプレ整備 (推奨 1)**: 物体専用 .md テンプレが存在しない場合、`_build_reference_instruction` でハードコードした文字列を真実とする (今回はこの方針)。**Phase 1 着手前に実装者がディレクトリ存在確認し、不在ならテンプレファイル化を別 PR で実施するか方針確定** (§11-1 参照)。
- **アニメーション template_id (`A-1`〜`B-4`) の扱い**: アニメ被写体タイプかつテンプレ ID 指定時は、現状 `translate_scene_to_runway_prompt` で特別処理 (style_keywords / quality_boosters 注入) している。新 `translate_story_prompt` でも同様の対応を維持する (§4-1-1 の `_build_translate_system_prompt` 内で `animation_template` 引数を活用)。
- **Kling 2500 文字制限の安全率**: 1200 文字目標は元々 50% 程度の余裕を持たせる設計。プロバイダー固有 prefix (例: Kling の `@image_i` 自動付加, 約 30 文字) を考慮しても十分な余裕がある。
- **Gemini "Reserve" 誤生成の再現性 (推奨 2)**: 実装前に旧テンプレで 5-10 回 prompt 翻訳して "Reserve" 出現率を測定。再現率が極端に低ければ `_sanitize_reserve_typo` を省略してシステムプロンプト強化 (A 案ステップ 1) のみで対応可能。§11-1 で実装者が判断する。

### 15-3. 観測・モニタリング (N8 対応)

- **Phase 1 では `logger.info` / `logger.warning` のみ**: 既存ロガー (`logging.getLogger(__name__)`) で文字数・typo 発生件数を記録。送信先は標準 stdout (Railway デプロイ環境の log stream 経由で確認可能)。
- **将来観測整備時の検討事項** (本 doc スコープ外):
  - 翻訳結果の文字数 (`len(english_prompt)`) を Vercel Analytics 等に送信し、平均/最大値を計測
  - typo "Reserve" 発生回数を counter 化 (Gemini モデル更新でゼロになるかを追跡)
  - セリフ検出率 (`extracted_dialogue !== null` の割合) を計測 (DialogueNode 連携 UX の利用度評価)

---

## 16. References

- [Kling 3.0 Prompt Guide for Better AI Videos: The 2026 Formula](https://www.glbgpt.com/hub/kling-3-0-prompt-guide-for-better-ai-videos/) — 5 軸構造 (Camera + Scene + Subject Action + Vibe + Time/Audio) と Subject の視覚特性アンカリングの重要性
- [Kling 2.6 Pro Prompt Guide | fal.ai](https://fal.ai/learn/devs/kling-2-6-pro-prompt-guide) — Subject / Action / Context / Style の 4 要素プロンプト構造と Elements 機能の活用パターン
- [Ultimate prompting guide for Nano Banana | Google Cloud Blog](https://cloud.google.com/blog/products/ai-machine-learning/ultimate-prompting-guide-for-nano-banana) — 参照画像と一緒に使う際の "Preserve" 系フレーズの推奨表現
- [Nano Banana Prompt Guide | Leonardo.Ai](https://leonardo.ai/news/nano-banana-prompt-guide/) — Image-to-Video / Image-to-Image での主体情報保持パターン
- [Regex for Japanese · GitHub Gist](https://gist.github.com/terrancesnyder/1345094) — 日本語文字種の正規表現パターン (ひらがな / カタカナ / 漢字 / 括弧)
- [Python re モジュール 公式ドキュメント — Greedy vs Non-Greedy Matching](https://docs.python.org/3/library/re.html#regular-expression-syntax) — 否定文字クラスと `*?` の挙動 (B1 訂正の根拠)
- [xyflow / React Flow](https://reactflow.dev/) — ノード間の CustomEvent 連携と動的 setNodes のベストプラクティス
- [React useRef vs useState for non-rendering state](https://react.dev/reference/react/useRef) — N1 対応 (依存配列に含めずに永続状態を保持) の公式ガイド
- 関連内部 Design Doc:
  - [`2026-05-14_dialogue-node.md`](./2026-05-14_dialogue-node.md) — DialogueNode の Pipeline 型仕様と `text` フィールド書き込みの既存パターン (§15-1 表 4 番から参照)
  - [`2026-05-15_kling-edge-scoping.md`](./2026-05-15_kling-edge-scoping.md) — ProviderNode / 設定ノード設計と本 doc のスタイル参考

---

## 17. 合意チェックリスト

### 17-1. 重大事項 (Blocker) 対応状況

| # | 指摘内容 | 反映箇所 | 状態 |
|---|---------|---------|------|
| B1 | 正規表現挙動の技術的説明訂正 (採用案 a: 1 階層厳密対応) + AC-C8 追加 | §10-6 (訂正), §4-1-1 `_extract_dialogues_via_regex` (採用案 a 実装), §14 AC-C8 | 反映済 |
| B2 | PromptNode → 翻訳 API の subject_type 受け渡しルート定義 + AC-C9 追加 | §4-2-2 (videosApi 呼び出し改修), §4-1-2 (TranslateStoryPromptRequest schema 拡張), §4-2-1 (API client 型 export), §14 AC-B3 / AC-C9 | 反映済 |
| B3 | `_extract_prompt_components` 戻り値 contract 統一 (ExtractedComponents dataclass) | §4-1-1 (ExtractedComponents 定義), `_extract_prompt_components` の戻り値型変更 | 反映済 |
| B4 | 未使用引数 (`use_act_two` 等) の処理を Phase 1: 警告ログ + Phase 2: 専用テンプレに分離 + AC-B4 追加 | §2-2 (Non-Goals), §4-1-1 (warning ログ), §4-1-4 (Phase 分割明記), §14 AC-B4, §15-1 #7 | 反映済 |
| B5 | AC-B2 文字数制限の矛盾解消 (案 a 採用: ソフト目標、ハード上限なし) | §10-7 (修正), §14 AC-B2 (修正), §15-1 #5 (修正) | 反映済 |

### 17-2. 軽微事項 (Nit) 対応状況

| # | 指摘内容 | 反映箇所 | 状態 |
|---|---------|---------|------|
| N1 | `dismissedDialogueHash` の useRef 化 | §4-2-2 (`dismissedDialogueHashRef`), 依存配列から除外 | 反映済 |
| N2 | NodeEditor `setNodes` の closure 問題 (関数形式 setter / useCallback) | §4-2-3 (NodeEditor listener), §4-2-3 PromptNode ヘルパー (useCallback) | 反映済 |
| N3 | `dismissedDialogueHash` 正規化 (`.trim().replace(/\s+/g, ' ')`) | §4-2-2 (`normalizeDialogue` 関数), §14 AC-C7 で挙動明文化 | 反映済 |
| N4 | CustomEvent 命名規則を §6 / §8 に明示 | §6 Change Impact Map (createDialogueNodeFromPrompt 明記), §8 Integration Point 3 (CustomEvent 名明記), §9 Integration Boundary Contracts (event 名明記) | 反映済 |
| N5 | Gemini SDK の非同期化 (`asyncio.to_thread`) | §4-1-1 `_run_gemini_translation` / `_extract_prompt_components` 内の asyncio.to_thread 化 | 反映済 |
| N6 | テスト関数名整合 (`_run_gemini_translation` を内部関数として定義) | §4-1-1 (`_run_gemini_translation` 関数化), §12-1 テスト 5 / 6 (mock 設計反映) | 反映済 |
| N7 | DialogueNode handle 仕様参照 (`2026-05-14_dialogue-node.md` §4) | §15-1 表 4 番に明示参照, §5 既存コードベース分析 表 (行数+§4) 記載 | 反映済 |
| N8 | ロギング送信先記述 (Phase 1 は logger.info / warning のみ) | §15-3 (Phase 1 は logger.info / warning のみ、将来 Vercel Analytics 検討と明示) | 反映済 |
| E1 | `description_ja` の `max_length` を doc (5000) → 実コード (`schemas.py:365`) に合わせ 500 に修正 | §4-1-2 `TranslateStoryPromptRequest` サンプル | 反映済 |
| E2 | `video_provider` / `subject_type` を `Optional` から Non-Optional (`Field(default=...)`) に修正し、router の三項演算子を簡素化 (`request.video_provider.value` 等に変更)。`Optional` import は他フィールドで引き続き必要と注記 | §4-1-2 `TranslateStoryPromptRequest` サンプル, §4-1-3 router サンプル | 反映済 |
| E3 | §4-1-2 見出しを「リクエスト schema **拡張**」→「リクエスト schema 既存定義の確認 (変更不要)」に変更し、既存定義が全フィールドを持つため Phase 1 での schema 変更は不要と明記 | §4-1-2 見出し + 本文 | 反映済 |

### 17-3. 推奨追加検討事項 対応状況

| # | 指摘内容 | 反映箇所 | 状態 |
|---|---------|---------|------|
| 推奨 1 | `docs/prompt/scene/object/` テンプレ存在確認を §11 (前提事項) に追記 | §5 (要事前確認と注記), §11-1 (Phase 1 着手前確認事項 #1), §15-2 (設計上の検討事項) | 反映済 |
| 推奨 2 | Gemini "Reserve" 誤生成の再現性確認を §11 (前提事項) に追記 | §11-1 (Phase 1 着手前確認事項 #2), §15-2 (設計上の検討事項) | 反映済 |
| 推奨 3 | `translate_story_prompt` 引数を dataclass / Pydantic Model に集約 | §4-1-1 (`TranslateStoryPromptInput` dataclass 定義), §4-1-3 (router で利用), §7 Interface Change Matrix (シグネチャ変更行追加) | 反映済 |
| 推奨 5 | Phase 4 回帰確認の具体化 (テストファイルパス + 実行コマンド) | §13 Phase 4 (具体的なテストコマンド明記: `pytest tests/external/test_gemini_client.py -v`) | 反映済 |

### 17-4. その他注記

- 推奨 4 (本 doc 元指摘になし) は対象外。
- 既存の良い部分 (採用案 A/B/C のトレードオフ表、エッジケース 9 件、後方互換性、テスト戦略) は**そのまま維持**。

---

## 18. 変更履歴

| 日付 | 版 | 内容 |
|------|---|------|
| 2026-05-17 | 初版 | document-reviewer レビュー前の初版作成 |
| 2026-05-17 | レビュー反映版 | document-reviewer 指摘事項反映 (重大 5 件: B1-B5、軽微 8 件: N1-N8、推奨 4 件: 推奨 1/2/3/5)。AC を 12 → 14 件に拡張 (AC-B3, AC-B4, AC-C8, AC-C9 追加。AC-B2 修正)。§4-1-4 (Act-Two Phase 分割), §11-1 (Phase 1 着手前確認事項) を新設。`TranslateStoryPromptInput` / `ExtractedComponents` dataclass 導入。 |
| 2026-05-17 | 再レビュー反映版 | 再レビューで指摘された軽微 3 件 (E1/E2/E3) 反映。E1: `description_ja` の `max_length` を 5000 → 500 (実コードに整合)。E2: `video_provider` / `subject_type` を Non-Optional `Field(default=...)` に修正し router 三項演算子を簡素化。E3: §4-1-2 見出しを「リクエスト schema 既存定義の確認 (変更不要)」に変更し schema 変更不要の旨を明記。 |
