# FLUX.2 参照画像機能 実装計画

## 概要

movie-makerアプリにFLUX.2の参照画像機能を追加し、以下の3つのモードを実装する：

1. **手動参照画像指定** - ユーザーが任意の参照画像を指定
2. **自動キャラクター一貫性** - 最初のシーン画像を自動的に後続シーンで使用
3. **ハイブリッド** - 自動モード + 手動オーバーライド

---

## Phase 1: バックエンドAPI拡張

### 1.1 BFLプロバイダーに参照画像対応追加

**ファイル**: `app/external/bfl_flux2_provider.py`

```python
async def generate_image(
    self,
    prompt: str,
    width: int = 768,
    height: int = 1344,
    seed: Optional[int] = None,
    # 新規追加
    input_images: Optional[list[str]] = None,  # 参照画像URL（最大8枚）
    ...
) -> str:
```

**BFL APIリクエストボディ**:
```json
{
  "prompt": "...",
  "width": 768,
  "height": 1344,
  "input_image": "base64 or URL",      // 1枚目
  "input_image_2": "base64 or URL",    // 2枚目（オプション）
  ...
  "input_image_8": "base64 or URL"     // 8枚目（オプション）
}
```

### 1.2 スキーマ拡張

**ファイル**: `app/videos/schemas.py`

```python
class ReferenceImagePurpose(str, Enum):
    """参照画像の用途"""
    CHARACTER = "character"    # キャラクター一貫性
    STYLE = "style"           # スタイル転写
    PRODUCT = "product"       # 商品配置
    GENERAL = "general"       # 汎用

class ReferenceImage(BaseModel):
    """参照画像"""
    url: str
    purpose: ReferenceImagePurpose = ReferenceImagePurpose.GENERAL

class GenerateSceneImageRequest(BaseModel):
    # 既存フィールド
    dialogue: Optional[str] = None
    description_ja: Optional[str] = None
    aspect_ratio: AspectRatio = AspectRatio.PORTRAIT
    image_provider: ImageProvider = ImageProvider.NANOBANANA
    # 新規追加
    reference_images: Optional[list[ReferenceImage]] = Field(
        default=None,
        max_length=8,
        description="参照画像（最大8枚、BFL FLUX.2のみ対応）"
    )
```

### 1.3 サービス層更新

**ファイル**: `app/videos/service.py`

```python
async def generate_scene_image(
    description_ja: str | None = None,
    dialogue: str | None = None,
    aspect_ratio: str = "9:16",
    image_provider: str = "nanobanana",
    reference_images: list[dict] | None = None,  # 新規追加
) -> dict:
    ...
    if image_provider == "bfl_flux2_pro":
        # 参照画像URLリストを抽出
        input_images = None
        if reference_images:
            input_images = [img["url"] for img in reference_images]

        bfl_image_url = await provider.generate_image(
            prompt=prompt_en,
            width=width,
            height=height,
            input_images=input_images,  # 参照画像を渡す
        )
```

---

## Phase 2: 自動キャラクター一貫性

### 2.1 ストーリーボードにキャラクター一貫性設定を追加

**データベース/スキーマ拡張**:

```python
class StoryboardSettings(BaseModel):
    """ストーリーボード設定"""
    character_consistency_enabled: bool = False
    character_reference_image_url: Optional[str] = None  # 基準画像URL
    character_reference_cut_number: Optional[int] = None  # 基準カット番号
```

### 2.2 自動参照画像適用ロジック

**処理フロー**:
```
1. ユーザーが「キャラクター一貫性モード」をON
2. シーン1の画像生成 → 成功 → この画像を「基準画像」として保存
3. シーン2以降の画像生成時:
   - 自動的に基準画像を参照画像として追加
   - プロンプトに「この人物を維持」的な指示を追加
```

### 2.3 API拡張

```python
class GenerateSceneImageRequest(BaseModel):
    ...
    # 自動キャラクター一貫性用
    auto_character_consistency: bool = Field(
        default=False,
        description="自動キャラクター一貫性モード"
    )
    character_reference_url: Optional[str] = Field(
        default=None,
        description="キャラクター基準画像URL（自動モード用）"
    )
```

---

## Phase 3: フロントエンドUI

### 3.1 ストーリーボード設定パネル

```tsx
// components/storyboard/settings-panel.tsx
<Card>
  <CardHeader>
    <CardTitle>画像生成設定</CardTitle>
  </CardHeader>
  <CardContent>
    {/* キャラクター一貫性トグル */}
    <div className="flex items-center justify-between">
      <Label>キャラクター一貫性</Label>
      <Switch
        checked={characterConsistencyEnabled}
        onCheckedChange={setCharacterConsistencyEnabled}
      />
    </div>

    {characterConsistencyEnabled && (
      <div className="mt-4">
        <Label>基準カット</Label>
        <Select value={referencecut} onValueChange={setReferenceCut}>
          <SelectItem value="1">カット1（自動）</SelectItem>
          <SelectItem value="manual">手動で画像を選択</SelectItem>
        </Select>
      </div>
    )}
  </CardContent>
</Card>
```

### 3.2 シーン画像生成フォーム拡張

```tsx
// 参照画像セクション
<div className="space-y-2">
  <Label>参照画像（オプション）</Label>
  <div className="flex gap-2 flex-wrap">
    {referenceImages.map((img, i) => (
      <div key={i} className="relative w-20 h-20">
        <img src={img.url} className="w-full h-full object-cover rounded" />
        <Button
          size="icon"
          variant="destructive"
          className="absolute -top-2 -right-2 w-5 h-5"
          onClick={() => removeReferenceImage(i)}
        >
          <X className="w-3 h-3" />
        </Button>
      </div>
    ))}
    {referenceImages.length < 8 && (
      <Button variant="outline" onClick={addReferenceImage}>
        <Plus className="w-4 h-4 mr-1" />
        追加
      </Button>
    )}
  </div>

  {/* 参照画像の用途 */}
  <Select value={referencePurpose} onValueChange={setReferencePurpose}>
    <SelectItem value="character">キャラクター維持</SelectItem>
    <SelectItem value="style">スタイル転写</SelectItem>
    <SelectItem value="product">商品配置</SelectItem>
  </Select>
</div>
```

### 3.3 参照画像ソース選択

参照画像の追加方法:
1. **既存カットから選択** - 生成済みのシーン画像から選択
2. **アップロード** - 新規画像をアップロード
3. **URLから追加** - 外部URL指定

---

## Phase 4: プロンプト最適化

### 4.1 参照画像用途別プロンプト強化

```python
def _enhance_prompt_for_reference(
    prompt: str,
    reference_purpose: str
) -> str:
    """参照画像の用途に応じてプロンプトを強化"""

    if reference_purpose == "character":
        return f"Maintain the exact same person's face, features, and appearance from the reference image. {prompt}"
    elif reference_purpose == "style":
        return f"Apply the artistic style, color palette, and visual treatment from the reference image. {prompt}"
    elif reference_purpose == "product":
        return f"Include the exact product from the reference image, maintaining its appearance and details. {prompt}"
    else:
        return prompt
```

---

## 実装順序

### Step 1: 基本的な参照画像対応（今回実装）
- [x] BFLプロバイダーに`input_images`パラメータ追加
- [ ] スキーマに`reference_images`追加
- [ ] サービス層で参照画像をBFLに渡す
- [ ] 簡単なAPI動作確認

### Step 2: フロントエンドUI
- [ ] 参照画像追加UI
- [ ] 既存カットからの選択機能
- [ ] 画像アップロード連携

### Step 3: 自動キャラクター一貫性
- [ ] ストーリーボード設定パネル
- [ ] 基準画像の自動保存
- [ ] 後続シーンへの自動適用

### Step 4: 高度な機能
- [ ] 複数参照画像の用途別管理
- [ ] プロンプト自動最適化
- [ ] 参照画像プレビュー

---

## 制約事項

| 項目 | 制約 |
|------|------|
| 参照画像数 | 最大8枚（API制限） |
| 対応プロバイダー | BFL FLUX.2のみ（Nano Bananaは1枚のみ別実装） |
| 画像形式 | URL or Base64 |
| 最大解像度 | 20MP / 20MB |

---

## 見積もり工数

| Phase | 内容 | 工数 |
|-------|------|------|
| Phase 1 | バックエンドAPI | 2-3時間 |
| Phase 2 | 自動キャラクター一貫性 | 2-3時間 |
| Phase 3 | フロントエンドUI | 3-4時間 |
| Phase 4 | プロンプト最適化 | 1-2時間 |
| **合計** | | **8-12時間** |
