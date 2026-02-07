# アドクリエイター コンテ（脚本）モード実装計画書

## 概要

アドクリエイターに「AIで構成を考える」モードを追加し、CM脚本（コンテ）をベースに動画広告を作成できるようにする。

### 主な機能
- AIが広告理論（AIDA/PASONA/起承転結）に基づいてカット構成を自動生成
- カット数はAIが最適な数を算出
- ユーザーは後からカットを追加/削除/並び替え可能
- 各カットに既存動画または新規生成動画を割り当て
- カットごとの秒数指定（トリミングに自動連携）

---

## ユーザーフロー

```
[Phase 1] アスペクト比選択（既存）
    ↓
[Phase 2] モード選択（新規）
    ├── 🎬「AIで構成を考える」
    │       ↓
    │   [Phase 3] 広告情報入力
    │       - 広告の内容（自由記述）
    │       - 希望の尺（15秒/30秒/60秒/おまかせ）
    │       ↓
    │   [Phase 4] AIコンテ生成（ローディング）
    │       - 広告理論に基づいてカット数を自動算出
    │       - 各カットの説明 + 推奨秒数を生成
    │       ↓
    │   [Phase 5] コンテボード編集
    │       - カットの追加/削除/並び替え
    │       - 説明・秒数の編集
    │       - 動画の割り当て（既存 or 新規生成）
    │       - プレビュー再生
    │       ↓
    └── 📹「自分で動画を選ぶ」
            ↓
        [既存の動画選択画面]
            ↓
[Phase 6] トランジション選択（既存）
    ↓
[Phase 7] 広告を作成（既存）
```

---

## 画面設計

### Phase 2: モード選択画面

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│     アスペクト比: 9:16（縦長）              [変更]           │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│              広告の作成方法を選んでください                    │
│                                                             │
│   ┌───────────────────────┐  ┌───────────────────────┐     │
│   │                       │  │                       │     │
│   │     🎬                │  │     📹                │     │
│   │                       │  │                       │     │
│   │  AIで構成を考える      │  │  自分で動画を選ぶ      │     │
│   │                       │  │                       │     │
│   │  広告の内容を入力する   │  │  既存の動画から       │     │
│   │  だけでAIが最適な      │  │  自由に選んで         │     │
│   │  カット構成を提案      │  │  組み合わせる         │     │
│   │                       │  │                       │     │
│   └───────────────────────┘  └───────────────────────┘     │
│                                                             │
│                       [← 戻る]                              │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Phase 3: 広告情報入力画面

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│                   広告の情報を入力                           │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  どんな広告を作りたいですか？                                 │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                                                     │   │
│  │  例: 新発売のプロテインバーの広告。20代の働く女性     │   │
│  │  向け。忙しい朝でも手軽に栄養補給できることを         │   │
│  │  アピールしたい。おしゃれなカフェで食べるイメージ。   │   │
│  │                                                     │   │
│  │                                                     │   │
│  │                                                     │   │
│  └─────────────────────────────────────────────────────┘   │
│                                                             │
│  希望の尺                                                   │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐         │
│  │  15秒   │ │  30秒   │ │  60秒   │ │おまかせ │         │
│  │         │ │    ✓    │ │         │ │         │         │
│  └─────────┘ └─────────┘ └─────────┘ └─────────┘         │
│                                                             │
│                                                             │
│           [← 戻る]              [AIで構成を生成 →]          │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Phase 4: AIコンテ生成（ローディング）

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│                         🎬                                  │
│                                                             │
│                 AIが構成を考えています...                     │
│                                                             │
│              ┌──────────────────────────┐                  │
│              │ ████████████░░░░░░░░░░░░ │                  │
│              └──────────────────────────┘                  │
│                                                             │
│              広告理論に基づいて最適な                         │
│              カット構成を生成中                              │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Phase 5: コンテボード編集画面

```
┌─────────────────────────────────────────────────────────────────────┐
│                                                                     │
│  📋 CM構成（全5カット / 合計28秒）                    [🔄 再生成]    │
│                                                                     │
│  使用理論: PASONA法（問題→共感→解決→提案→行動）                      │
│                                                                     │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌─ カット 1 ────────────────────────────────────────────────────┐ │
│  │                                                                │ │
│  │  [↑][↓][🗑️]                                   秒数: [ 3 ▼] 秒 │ │
│  │                                                                │ │
│  │  シーンタイプ: 問題提起                                         │ │
│  │  ┌──────────────────────────────────────────────────────────┐ │ │
│  │  │ 忙しい朝、時間がなくて朝食を抜いてしまう女性              │ │ │
│  │  └──────────────────────────────────────────────────────────┘ │ │
│  │                                                                │ │
│  │  動画:                                                         │ │
│  │  ┌────────────┐                                               │ │
│  │  │            │                                               │ │
│  │  │   未選択    │  [📁 既存から選択]  [✨ 新規シーン生成]        │ │
│  │  │            │                                               │ │
│  │  └────────────┘                                               │ │
│  │                                                                │ │
│  └────────────────────────────────────────────────────────────────┘ │
│                                                                     │
│  ┌─ カット 2 ────────────────────────────────────────────────────┐ │
│  │                                                                │ │
│  │  [↑][↓][🗑️]                                   秒数: [ 4 ▼] 秒 │ │
│  │                                                                │ │
│  │  シーンタイプ: 共感                                             │ │
│  │  ┌──────────────────────────────────────────────────────────┐ │ │
│  │  │ 「栄養は取りたいけど...」と悩む表情のクローズアップ       │ │ │
│  │  └──────────────────────────────────────────────────────────┘ │ │
│  │                                                                │ │
│  │  動画:                                                         │ │
│  │  ┌────────────┐                                               │ │
│  │  │  🎬        │                                               │ │
│  │  │  動画選択済 │  [変更]  [削除]                               │ │
│  │  │  (4.2秒)   │                                               │ │
│  │  └────────────┘                                               │ │
│  │                                                                │ │
│  └────────────────────────────────────────────────────────────────┘ │
│                                                                     │
│  ┌─ カット 3 ────────────────────────────────────────────────────┐ │
│  │  ... (以下同様)                                                │ │
│  └────────────────────────────────────────────────────────────────┘ │
│                                                                     │
│                        [＋ カットを追加]                            │
│                                                                     │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  プレビュー                                      合計: 28秒         │
│  ┌─────────────────────────────────┐                               │
│  │                                 │  カット1 ██░░░░░░░░░░░░ 3秒   │
│  │                                 │  カット2 ████░░░░░░░░░░ 4秒   │
│  │     [▶ プレビュー再生]           │  カット3 ██████████░░░░ 10秒  │
│  │                                 │  カット4 ██████░░░░░░░░ 6秒   │
│  │                                 │  カット5 █████░░░░░░░░░ 5秒   │
│  └─────────────────────────────────┘                               │
│                                                                     │
│  ⚠️ 未選択のカットが2つあります                                     │
│                                                                     │
│       [← 戻る]                          [次へ: トランジション →]    │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### 動画選択モーダル（既存から選択）

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│  カット2に動画を選択                              [×]        │
│                                                             │
│  「栄養は取りたいけど...」と悩む表情のクローズアップ          │
│  推奨秒数: 4秒                                              │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  [シーン動画] [ストーリー動画]                               │
│                                                             │
│  ┌────────┐ ┌────────┐ ┌────────┐ ┌────────┐              │
│  │        │ │        │ │        │ │        │              │
│  │ 動画1  │ │ 動画2  │ │ 動画3  │ │ 動画4  │              │
│  │        │ │        │ │        │ │        │              │
│  │  5.2秒 │ │  4.8秒 │ │  5.0秒 │ │  6.1秒 │              │
│  └────────┘ └────────┘ └────────┘ └────────┘              │
│                                                             │
│  ┌────────┐ ┌────────┐                                     │
│  │        │ │        │                                     │
│  │ 動画5  │ │ 動画6  │                                     │
│  │        │ │        │                                     │
│  └────────┘ └────────┘                                     │
│                                                             │
│                                                             │
│            [キャンセル]        [選択]                        │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 広告理論テンプレート

AIが広告内容に応じて最適な理論を選択し、カット構成を生成する。

### AIDA法
```
A (Attention) - 注目: 視聴者の注意を引く
I (Interest)  - 興味: 興味を持たせる
D (Desire)    - 欲求: 欲しいと思わせる
A (Action)    - 行動: 行動を促す
```

### PASONA法
```
P (Problem)   - 問題: 問題提起
A (Affinity)  - 共感: 共感を得る
S (Solution)  - 解決: 解決策を提示
O (Offer)     - 提案: 具体的な提案
N (Narrow)    - 絞込: 限定感・緊急性
A (Action)    - 行動: 行動を促す
```

### 起承転結
```
起 - 導入: 状況設定
承 - 展開: 話を進める
転 - 転換: 意外性・解決
結 - 結末: まとめ・CTA
```

### ストーリーテリング型
```
1. フック    - 冒頭で引き込む
2. 課題      - 問題・悩み
3. 旅        - 解決への道のり
4. 発見      - 商品との出会い
5. 変化      - ビフォーアフター
6. CTA       - 行動喚起
```

---

## データ構造

### コンテボードの状態管理

```typescript
interface AdScript {
  id: string;
  description: string;        // ユーザー入力の広告説明
  targetDuration: number | null;  // 希望の尺（null = おまかせ）
  theory: AdTheory;           // 使用した広告理論
  cuts: Cut[];
  createdAt: string;
}

type AdTheory = 'aida' | 'pasona' | 'kishoutenketsu' | 'storytelling';

interface Cut {
  id: string;
  cutNumber: number;
  sceneType: string;          // 問題提起、共感、解決 など
  descriptionJa: string;      // 日本語の説明
  descriptionEn: string;      // 英語の説明（新規生成用）
  duration: number;           // 秒数
  video: SelectedVideo | null;
}

interface SelectedVideo {
  id: string;
  type: 'scene' | 'storyboard';
  videoUrl: string;
  thumbnailUrl: string;
  originalDuration: number;
  trimStart: number;          // トリミング開始位置
  trimEnd: number;            // トリミング終了位置
}
```

---

## API設計

### 新規エンドポイント

#### POST `/api/v1/videos/ad-script/generate`

AIでCM構成を生成する。

**Request:**
```json
{
  "description": "新発売のプロテインバーの広告。20代の働く女性向け...",
  "target_duration": 30,
  "aspect_ratio": "9:16"
}
```

**Response:**
```json
{
  "id": "script_abc123",
  "theory": "pasona",
  "theory_label": "PASONA法（問題→共感→解決→提案→行動）",
  "total_duration": 28,
  "cuts": [
    {
      "id": "cut_1",
      "cut_number": 1,
      "scene_type": "problem",
      "scene_type_label": "問題提起",
      "description_ja": "忙しい朝、時間がなくて朝食を抜いてしまう女性",
      "description_en": "A busy woman rushing in the morning, skipping breakfast",
      "duration": 3
    },
    {
      "id": "cut_2",
      "cut_number": 2,
      "scene_type": "affinity",
      "scene_type_label": "共感",
      "description_ja": "「栄養は取りたいけど...」と悩む表情",
      "description_en": "Close-up of her worried expression thinking about nutrition",
      "duration": 4
    },
    {
      "id": "cut_3",
      "cut_number": 3,
      "scene_type": "solution",
      "scene_type_label": "解決策",
      "description_ja": "新発売プロテインバーが登場、手に取る",
      "description_en": "The new protein bar appears, she picks it up",
      "duration": 5
    },
    {
      "id": "cut_4",
      "cut_number": 4,
      "scene_type": "offer",
      "scene_type_label": "提案",
      "description_ja": "おしゃれなカフェで美味しそうに食べる",
      "description_en": "Enjoying the bar at a stylish cafe",
      "duration": 6
    },
    {
      "id": "cut_5",
      "cut_number": 5,
      "scene_type": "action",
      "scene_type_label": "行動喚起",
      "description_ja": "商品パッケージと「今すぐチェック」のCTA",
      "description_en": "Product package with 'Check it now' CTA",
      "duration": 4
    }
  ]
}
```

**target_duration が null（おまかせ）の場合:**
- AIが広告内容に基づいて最適な尺を決定
- 短い商品紹介 → 15秒程度
- ストーリー性のある広告 → 30〜60秒程度

---

## バックエンド実装

### AIプロンプト設計

```python
# movie-maker-api/app/services/ad_script_generator.py

SYSTEM_PROMPT = """
あなたは広告クリエイティブディレクターです。
与えられた広告の説明から、効果的なCM構成（カット割り）を提案してください。

以下の広告理論から最適なものを選択してください：
- AIDA法: 注目→興味→欲求→行動（シンプルな商品紹介向け）
- PASONA法: 問題→共感→解決→提案→絞込→行動（課題解決型商品向け）
- 起承転結: 導入→展開→転換→結末（ストーリー重視）
- ストーリーテリング: フック→課題→旅→発見→変化→CTA（感情訴求向け）

出力形式:
- 各カットには「シーンタイプ」「日本語説明」「英語説明」「推奨秒数」を含める
- 英語説明は動画生成AI（Runway/Veo）向けのプロンプトとして使える形式で
- 合計秒数が目標尺に近くなるように調整
- カット数は内容に応じて最適な数を決定（通常3〜8カット）
"""
```

---

## フロントエンド実装

### ファイル構成

```
movie-maker/
├── app/
│   └── concat/
│       └── page.tsx                    # 既存（モード選択を追加）
│
├── components/
│   └── video/
│       ├── scene-generator-modal.tsx   # 既存（今回実装済み）
│       ├── ad-mode-selector.tsx        # 新規: モード選択
│       ├── ad-script-input.tsx         # 新規: 広告情報入力
│       ├── ad-storyboard.tsx           # 新規: コンテボード編集
│       ├── ad-cut-card.tsx             # 新規: カットカード
│       └── ad-video-selector-modal.tsx # 新規: 動画選択モーダル
```

### 状態管理の流れ

```typescript
// concat/page.tsx

// Phase管理
type Phase =
  | 'aspect-ratio'      // アスペクト比選択
  | 'mode-select'       // モード選択（新規）
  | 'script-input'      // 広告情報入力（新規）
  | 'storyboard'        // コンテボード編集（新規）
  | 'video-select'      // 動画選択（既存、「自分で選ぶ」用）
  | 'transition'        // トランジション選択
  | 'processing'        // 処理中
  | 'completed';        // 完了

const [phase, setPhase] = useState<Phase>('aspect-ratio');
const [adMode, setAdMode] = useState<'ai' | 'manual' | null>(null);
const [adScript, setAdScript] = useState<AdScript | null>(null);
```

---

## 実装フェーズ

### Phase 1: バックエンドAPI（1日）
1. `POST /ad-script/generate` エンドポイント作成
2. Gemini/GPTプロンプト設計・テスト
3. レスポンススキーマ定義

### Phase 2: フロントエンド - 基本UI（1-2日）
1. モード選択画面 (`ad-mode-selector.tsx`)
2. 広告情報入力画面 (`ad-script-input.tsx`)
3. concat/page.tsx のフェーズ管理更新

### Phase 3: フロントエンド - コンテボード（2-3日）
1. コンテボードUI (`ad-storyboard.tsx`)
2. カットカード (`ad-cut-card.tsx`)
3. カット追加/削除/並び替え機能
4. 説明・秒数編集機能

### Phase 4: 動画割り当て機能（1-2日）
1. 動画選択モーダル (`ad-video-selector-modal.tsx`)
2. 新規シーン生成との連携（既存モーダル活用）
3. 秒数 → トリミング設定の自動連携

### Phase 5: 統合・テスト（1日）
1. コンテボード → トランジション選択への接続
2. E2Eテスト
3. エッジケース対応

---

## 将来の拡張（今回は実装しない）

### 動画マッチング提案機能
```typescript
// 各カットの説明に基づいて、合いそうな既存動画を提案
interface VideoSuggestion {
  videoId: string;
  matchScore: number;  // 0-100
  reason: string;
}
```

### テンプレート保存機能
- 作成したコンテ構成をテンプレートとして保存
- 次回以降、テンプレートから開始可能

### 複数バリエーション生成
- 同じ内容で複数の構成案を生成
- A/Bテスト用に異なるカット構成を比較

---

## 注意事項

### 1. 既存フローとの互換性
- 「自分で動画を選ぶ」を選択した場合は既存フローへ
- 既存の動画選択→トランジション→作成の流れは維持

### 2. コンテボードから既存フローへの接続
- コンテボード編集完了後、選択された動画リストを既存の`selectedItems`形式に変換
- トリミング設定も秒数から自動設定

### 3. 新規シーン生成との連携
- 今回実装した`SceneGeneratorModal`を再利用
- 生成完了後、該当カットに自動的に割り当て

### 4. エラーハンドリング
- AI生成失敗時のリトライ機能
- 全カットに動画が割り当てられていない場合の警告

### 5. カット追加時の挙動
- 新規カット追加時は空の状態で追加（説明・動画なし）
- ユーザーが手動で説明を入力、動画を選択

### 6. プレビュー再生の挙動
- 動画未選択のカットはスキップして再生
- 選択済みカットのみ連続再生
- 未選択カットがある場合は警告表示（「未選択のカットが○つあります」）

---

## ⚠️ 重要: 発見された潜在的問題点

### 問題1: 状態管理アプローチの競合（クリティカル）

**現状**:
計画書では `phase` という新しいstateを導入しようとしているが、既存のconcat/page.tsxは `selectedAspectRatio` の有無で画面を切り替えている。

```tsx
// 既存の条件分岐（concat/page.tsx）
{!selectedAspectRatio && <AspectRatioSelector />}
{selectedAspectRatio && <メインコンテンツ />}
```

**解決策**:
Phase管理を導入せず、既存のアプローチを維持。新しいstate `adMode` を追加。

```tsx
// 修正後の条件分岐
const [adMode, setAdMode] = useState<'ai' | 'manual' | null>(null);

{!selectedAspectRatio && <AspectRatioSelector />}
{selectedAspectRatio && !adMode && <AdModeSelector />}  // 新規
{selectedAspectRatio && adMode === 'ai' && <AIコンテモード />}  // 新規
{selectedAspectRatio && adMode === 'manual' && <既存の動画選択画面 />}
```

### 問題2: コンテボード → 既存フローへの接続

**課題**: コンテボードの `Cut[]` から既存の `SelectableItem[]` + `trimSettings` への変換が必要。

**解決策**:
```typescript
// コンテボードから次へ進む時の変換関数
const convertCutsToSelectedItems = (cuts: Cut[]): {
  items: SelectableItem[];
  trims: Record<string, TrimSetting>;
} => {
  const items: SelectableItem[] = [];
  const trims: Record<string, TrimSetting> = {};

  cuts.forEach((cut) => {
    if (cut.video) {
      const item: SelectableItem = {
        id: cut.video.id,
        type: cut.video.type,
        label: cut.descriptionJa,
        thumbnailUrl: cut.video.thumbnailUrl,
        videoUrl: cut.video.videoUrl,
      };
      items.push(item);

      trims[cut.video.id] = {
        startTime: cut.video.trimStart,
        endTime: cut.video.trimEnd,
        duration: cut.video.originalDuration,
      };
    }
  });

  return { items, trims };
};
```

### 問題3: 秒数 → トリミング設定の自動連携

**課題**: カットの希望秒数と動画の実際の長さが異なる場合の処理。

**解決策**:
```typescript
// 動画選択時の自動トリミング設定
const assignVideoToCut = (cut: Cut, video: VideoItem) => {
  const videoDuration = video.duration;
  const cutDuration = cut.duration;

  // 動画が希望秒数より長い場合 → 先頭からトリミング
  // 動画が希望秒数より短い場合 → 全体を使用（警告表示）
  const trimEnd = Math.min(cutDuration, videoDuration);

  return {
    ...cut,
    video: {
      id: video.id,
      type: 'scene' as const,
      videoUrl: video.final_video_url,
      thumbnailUrl: video.original_image_url,
      originalDuration: videoDuration,
      trimStart: 0,
      trimEnd: trimEnd,
    },
  };
};
```

**警告表示**:
- 動画が希望秒数より短い場合: 「⚠️ 動画が{cut.duration}秒より短いです（{video.duration}秒）」

### 問題4: 1:1 アスペクト比のサポート

**現状**:
- バックエンドの `AspectRatio` enum は `9:16` と `16:9` のみ
- 新規シーン生成は1:1をサポートしていない

**解決策**:
- AIコンテモードは `9:16` と `16:9` のみ対応
- 1:1選択時は「自分で動画を選ぶ」のみ表示

```tsx
// AdModeSelector で1:1の場合はAIモード非表示
{selectedAspectRatio !== "1:1" && (
  <button onClick={() => setAdMode('ai')}>
    AIで構成を考える
  </button>
)}
```

### 問題5: APIクライアントへの追加方法

**既存構造**:
```typescript
// lib/api/client.ts
export const videosApi = { ... };
export const storyboardApi = { ... };
```

**解決策**: `videosApi` に新しいメソッドを追加（一貫性を維持）

```typescript
export const videosApi = {
  // ... 既存メソッド ...

  // 新規: AI脚本生成
  generateAdScript: (data: {
    description: string;
    target_duration: number | null;
    aspect_ratio: '9:16' | '16:9';
  }) => fetchWithAuth("/api/v1/videos/ad-script/generate", {
    method: "POST",
    body: JSON.stringify(data),
  }),
};
```

### 問題6: 動画未選択カットのスキップ

**課題**: プレビュー再生時、動画未選択カットをスキップする実装。

**解決策**:
```typescript
// プレビュー用にフィルタリング
const previewVideos = cuts
  .filter((cut) => cut.video !== null)
  .map((cut) => ({
    id: cut.video!.id,
    videoUrl: cut.video!.videoUrl,
    label: cut.descriptionJa,
    startTime: cut.video!.trimStart,
    endTime: cut.video!.trimEnd,
  }));
```

### 問題7: アスペクト比変更時のリセット

**既存**: アスペクト比を変更すると `selectedItems` と `trimSettings` がリセットされる。

**追加必要**: `adMode` と `adScript`（コンテデータ）もリセットする。

```typescript
const handleChangeAspectRatio = useCallback(() => {
  setSelectedAspectRatio(null);
  setSelectedItems([]);
  setTrimSettings({});
  setAdMode(null);        // 追加
  setAdScript(null);      // 追加
}, []);
```

### 問題8: 既存Geminiクライアントとの整合性

**既存**: `app/external/gemini_client.py` に多数の生成関数が存在。

**解決策**: 同様のパターンで新関数を追加。

```python
# gemini_client.py に追加
async def generate_ad_script(
    description: str,
    target_duration: int | None = None,
    aspect_ratio: str = "9:16"
) -> dict:
    """
    広告の説明からCM構成（カット割り）を生成
    """
    # ... 実装
```

---

## チェックリスト（実装前確認）

- [ ] バックエンドのGemini APIキーが設定されていること（`GOOGLE_AI_API_KEY`）
- [ ] 既存の`SceneGeneratorModal`が正常動作すること
- [ ] concat/page.tsxの現在の条件分岐を理解すること
- [ ] 1:1アスペクト比選択時の挙動を確認すること

---

## 関連ファイル

### 変更対象
| ファイル | 変更内容 |
|---------|---------|
| `movie-maker/app/concat/page.tsx` | Phase管理の拡張、モード選択の追加 |
| `movie-maker-api/app/videos/router.py` | 新規APIエンドポイント追加 |
| `movie-maker-api/app/videos/schemas.py` | リクエスト/レスポンススキーマ追加 |

### 新規作成
| ファイル | 内容 |
|---------|------|
| `movie-maker/components/video/ad-mode-selector.tsx` | モード選択コンポーネント |
| `movie-maker/components/video/ad-script-input.tsx` | 広告情報入力フォーム |
| `movie-maker/components/video/ad-storyboard.tsx` | コンテボードメインUI |
| `movie-maker/components/video/ad-cut-card.tsx` | カットカードコンポーネント |
| `movie-maker/components/video/ad-video-selector-modal.tsx` | 動画選択モーダル |
| `movie-maker-api/app/services/ad_script_generator.py` | AI脚本生成サービス |

---

## Supabaseマイグレーション

**重要**: データベーススキーマの変更が必要な場合は、MCP経由でSupabaseマイグレーションを実行すること。

### 今回のマイグレーション要否

現時点では新しいDBテーブルは不要。以下の理由：
- AI生成した脚本（AdScript）はフロントエンドの状態管理のみで保持
- 動画の選択・トリミング情報は既存のフローで処理
- 広告作成の最終結果は既存の動画結合処理を使用

**将来的に必要になる可能性があるマイグレーション:**
- 脚本テンプレートの保存機能を追加する場合 → `ad_script_templates` テーブル
- 生成履歴を保存する場合 → `ad_scripts` テーブル

---

## 最終テスト計画

実装完了後、以下のテストを実施する。

### 1. 単体テスト（バックエンド）

```bash
# AI脚本生成APIのテスト
pytest tests/videos/test_ad_script.py -v
```

**テスト項目:**
- [ ] 正常系: 15秒/30秒/60秒の各尺で脚本生成
- [ ] 正常系: おまかせ（target_duration=null）で脚本生成
- [ ] 正常系: 9:16と16:9の各アスペクト比で生成
- [ ] 異常系: 空の説明文でエラー
- [ ] 異常系: 不正なアスペクト比でエラー

### 2. 統合テスト（フロントエンド）

**手動テスト項目:**

#### Phase 1: モード選択
- [ ] アスペクト比選択後にモード選択画面が表示される
- [ ] 1:1選択時はAIモードが非表示/無効になる
- [ ] 「自分で動画を選ぶ」選択で既存フローに遷移

#### Phase 2: 広告情報入力
- [ ] 説明文を入力できる
- [ ] 尺（15秒/30秒/60秒/おまかせ）を選択できる
- [ ] 「AIで構成を生成」ボタンでローディング表示

#### Phase 3: コンテボード
- [ ] AI生成されたカットが表示される
- [ ] カットの説明・秒数を編集できる
- [ ] カットの追加/削除/並び替えができる
- [ ] 「既存から選択」で動画選択モーダルが開く
- [ ] 「新規シーン生成」でSceneGeneratorModalが開く
- [ ] 動画割り当て後にサムネイルが表示される

#### Phase 4: プレビュー・次へ
- [ ] 動画割り当て済みカットのみプレビュー再生される
- [ ] 未割当カット数の警告が表示される
- [ ] 「次へ」でトランジション選択に進む
- [ ] トランジション選択後に広告が正常に作成される

### 3. E2Eテスト（オプション）

```typescript
// tests/e2e/ad-storyboard.spec.ts
test('AIコンテモードで広告を作成できる', async ({ page }) => {
  // 1. ログイン
  // 2. アドクリエイターに遷移
  // 3. アスペクト比選択
  // 4. AIモード選択
  // 5. 広告説明入力・尺選択
  // 6. 脚本生成完了を待機
  // 7. 各カットに動画を割り当て
  // 8. トランジション選択
  // 9. 広告作成完了確認
});
```

### 4. テスト実行コマンド

```bash
# バックエンドテスト
cd movie-maker-api
source venv/bin/activate
pytest tests/videos/test_ad_script.py -v

# フロントエンドビルド確認
cd movie-maker
npm run build

# 開発サーバー起動（手動テスト用）
npm run dev
```

---

## 実装ステップ（更新版）

### Step 1: バックエンドAPI
1. `app/videos/schemas.py` にリクエスト/レスポンススキーマ追加
2. `app/external/gemini_client.py` にAI脚本生成関数追加
3. `app/videos/router.py` にエンドポイント追加
4. テスト作成・実行

### Step 2: フロントエンド - モード選択
1. `ad-mode-selector.tsx` 作成
2. `concat/page.tsx` に組み込み

### Step 3: フロントエンド - 広告情報入力
1. `ad-script-input.tsx` 作成
2. APIクライアントに `generateAdScript` 追加
3. `concat/page.tsx` に組み込み

### Step 4: フロントエンド - コンテボード
1. `ad-cut-card.tsx` 作成
2. `ad-storyboard.tsx` 作成
3. カット編集機能（追加/削除/並び替え/秒数変更）

### Step 5: フロントエンド - 動画割り当て
1. `ad-video-selector-modal.tsx` 作成
2. 既存SceneGeneratorModalとの連携
3. 自動トリミング設定

### Step 6: 統合・接続
1. コンテボード → トランジション選択への接続
2. `convertCutsToSelectedItems` 関数実装
3. プレビュー再生機能

### Step 7: テスト
1. バックエンドテスト実行
2. フロントエンドビルド確認
3. 手動統合テスト実施
