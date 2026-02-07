# アドクリエイター一時保存機能 実装計画書

## 概要

アドクリエイター（ストーリーボードモード）で、カット割・脚本編集中の状態を一時保存し、後から再開できる機能を実装する。

### 目的
- ユーザーが編集途中で離脱しても、次回アクセス時に続きから再開できる
- 誤ってブラウザを閉じた場合のデータ損失を防ぐ

### 採用方式
**方式A: 既存テーブル拡張**
- `storyboards`テーブルに`draft_metadata`カラム（JSONB）を追加
- シンプルで実装工数が少ない

---

## 1. データベース設計

### 1.1 マイグレーション

```sql
-- storyboardsテーブルにdraft_metadataカラムを追加
ALTER TABLE storyboards
ADD COLUMN IF NOT EXISTS draft_metadata JSONB DEFAULT NULL;

-- コメント追加
COMMENT ON COLUMN storyboards.draft_metadata IS '編集中のUI状態を保存（カメラ選択、トリム設定等）';

-- インデックス（draft_metadataがNULLでないものを効率的に検索）
CREATE INDEX IF NOT EXISTS idx_storyboards_has_draft
ON storyboards ((draft_metadata IS NOT NULL))
WHERE draft_metadata IS NOT NULL;
```

### 1.2 draft_metadata スキーマ

```typescript
// 実際のCameraWorkSelection型に合わせた定義
interface CameraWorkSelectionForDraft {
  preset: string;  // CameraPreset ID
  customCameraWork?: {
    id: string;
    name: string;
    promptTemplate: string;
    description: string;
  };
  promptText: string;
}

interface DraftMetadata {
  // スキーマバージョン（将来の互換性のため）
  schema_version: number;  // 現在: 1

  // 現在のステップ（全ステップを網羅）
  current_step: 'upload' | 'mood' | 'edit' | 'generating' | 'review' | 'concatenating' | 'completed';

  // 編集中のシーン番号
  editing_scene: number | null;

  // 編集フォームの内容
  edit_form: {
    description_ja: string;
    runway_prompt: string;
  } | null;

  // カメラワーク選択状態（シーン番号文字列 → カメラ選択オブジェクト）
  // ※JSONのキーは常に文字列になるため、Record<string, ...>を使用
  camera_selections: Record<string, CameraWorkSelectionForDraft>;

  // トリム設定（シーンID → トリム情報）
  trim_settings: Record<string, {
    startTime: number;
    endTime: number;
    duration: number;
  }>;

  // 動画生成モード（シーン番号文字列 → モード）
  video_modes: Record<string, 'i2v' | 'v2v'>;

  // カスタム画像がアップロードされたシーン番号（配列）
  custom_image_scenes: number[];

  // 映像設定
  film_grain: 'none' | 'light' | 'medium' | 'heavy';
  use_lut: boolean;
  lut_intensity: number;
  apply_trim: boolean;

  // プロバイダー・アスペクト比（ストーリーボード作成後に変更される可能性があるため保存）
  video_provider: 'runway' | 'veo';
  aspect_ratio: '9:16' | '16:9';

  // 選択中のムード
  selected_mood: string | null;
  custom_mood_text: string | null;

  // メタ情報
  last_saved_at: string;  // ISO 8601形式
  auto_saved: boolean;    // 自動保存かどうか
}
```

### 1.3 デフォルト値

```json
null
```
※ ドラフトがない場合は`null`。空オブジェクト`{}`ではなく`null`を使用することで、「ドラフトなし」を明示的に表現。

---

## 2. バックエンドAPI設計

### 2.1 エンドポイント

既存のストーリーボード取得・更新APIを拡張する。

#### GET `/api/v1/videos/storyboard/{id}`

**変更点:** レスポンスに`draft_metadata`を含める（既存レスポンスに追加）

```json
{
  "id": "uuid",
  "user_id": "uuid",
  "source_image_url": "https://...",
  "status": "draft",
  "aspect_ratio": "9:16",
  "scenes": [...],
  "draft_metadata": {
    "schema_version": 1,
    "current_step": "edit",
    "camera_selections": { "1": { "preset": "slow_zoom", "promptText": "..." } },
    ...
  }
}
```

#### PUT `/api/v1/videos/storyboard/{id}/draft`

**新規追加:** 一時保存専用エンドポイント

```
Request:
{
  "draft_metadata": {
    "schema_version": 1,
    "current_step": "edit",
    "editing_scene": 2,
    ...
  }
}

Response:
{
  "success": true,
  "last_saved_at": "2025-01-06T12:00:00Z"
}
```

#### DELETE `/api/v1/videos/storyboard/{id}/draft`

**新規追加:** 一時保存データをクリア（動画生成開始時に呼び出し）

```
Response:
{
  "success": true
}
```

### 2.2 バックエンド実装

#### router.py への追加

**重要: ルート順序に注意**
`/storyboard/{storyboard_id}/draft` は `/storyboard/{storyboard_id}` より**前**に定義する必要がある。

```python
# ファイル: movie-maker-api/app/videos/router.py
# 注意: 既存の /storyboard/{storyboard_id} ルートより前に配置すること

from datetime import datetime, timezone


@router.put("/storyboard/{storyboard_id}/draft")
async def save_storyboard_draft(
    storyboard_id: str,
    request: SaveDraftRequest,
    user: dict = Depends(get_current_user),
):
    """ストーリーボードの一時保存"""
    # 所有者確認
    storyboard = supabase.table("storyboards").select("id").eq(
        "id", storyboard_id
    ).eq("user_id", user["id"]).single().execute()

    if not storyboard.data:
        raise HTTPException(status_code=404, detail="Storyboard not found")

    # draft_metadataを更新（last_saved_atを自動設定）
    draft_metadata = request.draft_metadata.model_dump(exclude_none=True)
    draft_metadata["last_saved_at"] = datetime.now(timezone.utc).isoformat()

    supabase.table("storyboards").update({
        "draft_metadata": draft_metadata,
        "updated_at": datetime.now(timezone.utc).isoformat()
    }).eq("id", storyboard_id).execute()

    return SaveDraftResponse(
        success=True,
        last_saved_at=draft_metadata["last_saved_at"]
    )


@router.delete("/storyboard/{storyboard_id}/draft")
async def clear_storyboard_draft(
    storyboard_id: str,
    user: dict = Depends(get_current_user),
):
    """一時保存データをクリア"""
    # 所有者確認
    storyboard = supabase.table("storyboards").select("id").eq(
        "id", storyboard_id
    ).eq("user_id", user["id"]).single().execute()

    if not storyboard.data:
        raise HTTPException(status_code=404, detail="Storyboard not found")

    supabase.table("storyboards").update({
        "draft_metadata": None,  # NULLに設定
        "updated_at": datetime.now(timezone.utc).isoformat()
    }).eq("id", storyboard_id).execute()

    return {"success": True}
```

#### schemas.py への追加

```python
# ファイル: movie-maker-api/app/videos/schemas.py

from typing import Optional, Dict, Any, List
from pydantic import BaseModel, Field


class CameraWorkSelectionForDraft(BaseModel):
    preset: str
    customCameraWork: Optional[Dict[str, str]] = None
    promptText: str


class DraftMetadata(BaseModel):
    schema_version: int = 1
    current_step: Optional[str] = None
    editing_scene: Optional[int] = None
    edit_form: Optional[Dict[str, str]] = None
    # Pydanticでは Field(default_factory=dict) を使用してミュータブルデフォルトを避ける
    camera_selections: Dict[str, Any] = Field(default_factory=dict)
    trim_settings: Dict[str, Any] = Field(default_factory=dict)
    video_modes: Dict[str, str] = Field(default_factory=dict)
    custom_image_scenes: List[int] = Field(default_factory=list)
    film_grain: Optional[str] = "light"
    use_lut: Optional[bool] = False
    lut_intensity: Optional[float] = 0.3
    apply_trim: Optional[bool] = True
    video_provider: Optional[str] = "runway"
    aspect_ratio: Optional[str] = "9:16"
    selected_mood: Optional[str] = None
    custom_mood_text: Optional[str] = None
    last_saved_at: Optional[str] = None
    auto_saved: Optional[bool] = False


class SaveDraftRequest(BaseModel):
    draft_metadata: DraftMetadata


class SaveDraftResponse(BaseModel):
    success: bool
    last_saved_at: str
```

---

## 3. フロントエンド実装

### 3.1 型定義の追加

```typescript
// ファイル: movie-maker/lib/api/client.ts
// 既存のStoryboardインターフェースに追加

// CameraWorkSelection型をインポート（または再定義）
import { CameraWorkSelection } from '@/lib/camera/types';

export interface DraftMetadata {
  schema_version: number;
  current_step?: 'upload' | 'mood' | 'edit' | 'generating' | 'review' | 'concatenating' | 'completed';
  editing_scene?: number | null;
  edit_form?: {
    description_ja: string;
    runway_prompt: string;
  } | null;
  // JSONシリアライズ時にキーが文字列になるため、stringキーで定義
  camera_selections?: Record<string, CameraWorkSelection>;
  trim_settings?: Record<string, {
    startTime: number;
    endTime: number;
    duration: number;
  }>;
  video_modes?: Record<string, 'i2v' | 'v2v'>;
  custom_image_scenes?: number[];
  film_grain?: 'none' | 'light' | 'medium' | 'heavy';
  use_lut?: boolean;
  lut_intensity?: number;
  apply_trim?: boolean;
  video_provider?: 'runway' | 'veo';
  aspect_ratio?: '9:16' | '16:9';
  selected_mood?: string | null;
  custom_mood_text?: string | null;
  last_saved_at?: string | null;
  auto_saved?: boolean;
}

export interface Storyboard {
  id: string;
  user_id: string;
  source_image_url: string;
  title: string | null;
  status: string;
  scenes: StoryboardScene[];
  bgm_track_id: string | null;
  custom_bgm_url: string | null;
  final_video_url: string | null;
  total_duration: number | null;
  error_message: string | null;
  created_at: string;
  video_provider?: 'runway' | 'veo' | null;
  aspect_ratio?: '9:16' | '16:9';  // ← 追加
  draft_metadata?: DraftMetadata | null;  // ← 追加
}
```

### 3.2 API クライアント拡張

```typescript
// ファイル: movie-maker/lib/api/client.ts
// storyboardApiオブジェクトに追加

export const storyboardApi = {
  // 既存メソッド...

  // 一時保存
  saveDraft: async (
    storyboardId: string,
    draftMetadata: DraftMetadata
  ): Promise<{ success: boolean; last_saved_at: string }> => {
    const response = await fetchWithAuth(
      `/api/v1/videos/storyboard/${storyboardId}/draft`,
      {
        method: 'PUT',
        body: JSON.stringify({ draft_metadata: draftMetadata }),
      }
    );
    return response;
  },

  // 一時保存クリア
  clearDraft: async (storyboardId: string): Promise<{ success: boolean }> => {
    const response = await fetchWithAuth(
      `/api/v1/videos/storyboard/${storyboardId}/draft`,
      {
        method: 'DELETE',
      }
    );
    return response;
  },
};
```

### 3.3 自動保存フック

```typescript
// ファイル: movie-maker/hooks/use-auto-save-draft.ts

import { useEffect, useRef, useCallback, useState } from 'react';
import { storyboardApi, DraftMetadata } from '@/lib/api/client';
import { toast } from 'sonner';

interface UseAutoSaveDraftOptions {
  storyboardId: string | null;
  enabled: boolean;
  interval?: number;  // ミリ秒（デフォルト: 10000 = 10秒）
  onSaved?: (lastSavedAt: string) => void;
  onError?: (error: Error) => void;
}

interface UseAutoSaveDraftReturn {
  saveDraftManual: () => Promise<void>;
  isSaving: boolean;
  lastSavedAt: string | null;
  hasUnsavedChanges: boolean;
}

export function useAutoSaveDraft(
  getDraftData: () => DraftMetadata,
  options: UseAutoSaveDraftOptions
): UseAutoSaveDraftReturn {
  const { storyboardId, enabled, interval = 10000, onSaved, onError } = options;

  const [isSaving, setIsSaving] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  const lastSavedDataRef = useRef<string | null>(null);
  const isMountedRef = useRef(true);

  // 一時保存実行
  const saveDraft = useCallback(async (isAuto: boolean = true): Promise<boolean> => {
    if (!storyboardId || isSaving) return false;

    const draftData = getDraftData();
    const draftJson = JSON.stringify(draftData);

    // 変更がなければスキップ（自動保存時のみ）
    if (isAuto && draftJson === lastSavedDataRef.current) {
      return false;
    }

    setIsSaving(true);
    setHasUnsavedChanges(false);

    try {
      const result = await storyboardApi.saveDraft(storyboardId, {
        ...draftData,
        schema_version: 1,
        auto_saved: isAuto,
      });

      if (!isMountedRef.current) return false;

      lastSavedDataRef.current = draftJson;
      setLastSavedAt(result.last_saved_at);

      if (!isAuto) {
        toast.success('一時保存しました');
      }

      onSaved?.(result.last_saved_at);
      return true;
    } catch (error) {
      if (!isMountedRef.current) return false;

      console.error('Failed to save draft:', error);
      setHasUnsavedChanges(true);

      if (!isAuto) {
        toast.error('一時保存に失敗しました');
      }

      onError?.(error as Error);
      return false;
    } finally {
      if (isMountedRef.current) {
        setIsSaving(false);
      }
    }
  }, [storyboardId, isSaving, getDraftData, onSaved, onError]);

  // 手動保存
  const saveDraftManual = useCallback(async () => {
    await saveDraft(false);
  }, [saveDraft]);

  // 自動保存インターバル
  useEffect(() => {
    if (!enabled || !storyboardId) return;

    const intervalId = setInterval(() => {
      saveDraft(true);
    }, interval);

    return () => clearInterval(intervalId);
  }, [enabled, storyboardId, interval, saveDraft]);

  // 変更検知
  useEffect(() => {
    if (!enabled || !storyboardId) return;

    const checkChanges = () => {
      const currentData = JSON.stringify(getDraftData());
      setHasUnsavedChanges(currentData !== lastSavedDataRef.current);
    };

    // 100msごとにチェック（軽量な比較）
    const checkInterval = setInterval(checkChanges, 100);

    return () => clearInterval(checkInterval);
  }, [enabled, storyboardId, getDraftData]);

  // beforeunload警告（同期的に処理）
  useEffect(() => {
    if (!enabled || !storyboardId) return;

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      const currentData = JSON.stringify(getDraftData());
      if (currentData !== lastSavedDataRef.current) {
        e.preventDefault();
        // 注意: 最新ブラウザではカスタムメッセージは表示されない
        e.returnValue = '保存されていない変更があります。ページを離れますか？';
        return e.returnValue;
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [enabled, storyboardId, getDraftData]);

  // visibilitychange時に保存を試みる（タブ切り替え、最小化時）
  useEffect(() => {
    if (!enabled || !storyboardId) return;

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        // sendBeaconを使用して確実に送信（ただしPUTは使えないので別途検討）
        // 現状は通常のfetchを使用（完了は保証されない）
        saveDraft(true);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [enabled, storyboardId, saveDraft]);

  // アンマウント時のクリーンアップ
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  return {
    saveDraftManual,
    isSaving,
    lastSavedAt,
    hasUnsavedChanges,
  };
}
```

### 3.4 ストーリーボードページへの統合

```typescript
// ファイル: movie-maker/app/generate/storyboard/page.tsx

import { useAutoSaveDraft } from '@/hooks/use-auto-save-draft';
import { DraftMetadata } from '@/lib/api/client';

export default function StoryboardPage() {
  // 既存のstate...

  // ドラフト復元済みフラグ（再復元防止）
  const [draftRestored, setDraftRestored] = useState(false);

  // キー変換ユーティリティ（number <-> string）
  const numberKeysToString = <T,>(obj: Record<number, T>): Record<string, T> => {
    return Object.fromEntries(
      Object.entries(obj).map(([k, v]) => [String(k), v])
    );
  };

  const stringKeysToNumber = <T,>(obj: Record<string, T>): Record<number, T> => {
    return Object.fromEntries(
      Object.entries(obj).map(([k, v]) => [Number(k), v])
    );
  };

  // ドラフトデータを収集する関数
  const getDraftData = useCallback((): DraftMetadata => {
    return {
      schema_version: 1,
      current_step: step,
      editing_scene: editingScene,
      edit_form: editForm.description_ja || editForm.runway_prompt ? editForm : null,
      camera_selections: numberKeysToString(cameraWorkSelections),
      trim_settings: sceneTrimSettings,
      video_modes: numberKeysToString(sceneVideoModes),
      custom_image_scenes: Array.from(customImageScenes),
      film_grain: filmGrain,
      use_lut: useLut,
      lut_intensity: lutIntensity,
      apply_trim: applyTrim,
      video_provider: videoProvider,
      aspect_ratio: aspectRatio,
      selected_mood: selectedMood,
      custom_mood_text: customMoodText || null,
    };
  }, [
    step, editingScene, editForm, cameraWorkSelections, sceneTrimSettings,
    sceneVideoModes, customImageScenes, filmGrain, useLut, lutIntensity,
    applyTrim, videoProvider, aspectRatio, selectedMood, customMoodText
  ]);

  // 自動保存フック
  const { saveDraftManual, isSaving, lastSavedAt, hasUnsavedChanges } = useAutoSaveDraft(
    getDraftData,
    {
      storyboardId: storyboard?.id ?? null,
      enabled: step === 'edit' && !!storyboard && !generatingStoryboard,
      interval: 10000,  // 10秒
    }
  );

  // ストーリーボード読み込み時にドラフトを復元
  useEffect(() => {
    // 復元済み、またはドラフトがない場合はスキップ
    if (draftRestored || !storyboard?.draft_metadata) return;

    const draft = storyboard.draft_metadata;

    // スキーマバージョンチェック（将来の互換性のため）
    if (draft.schema_version && draft.schema_version > 1) {
      console.warn('Draft schema version is newer than supported');
      // 新しいバージョンでも可能な限り復元を試みる
    }

    // 古いドラフト警告（24時間以上前）
    if (draft.last_saved_at) {
      const savedTime = new Date(draft.last_saved_at);
      const hoursSinceSave = (Date.now() - savedTime.getTime()) / (1000 * 60 * 60);
      if (hoursSinceSave > 24) {
        toast.info(
          `前回の編集内容を復元しました（${Math.floor(hoursSinceSave / 24)}日前に保存）`,
          { duration: 5000 }
        );
      } else {
        toast.info('前回の編集内容を復元しました');
      }
    }

    // UI状態を復元
    if (draft.current_step && ['edit', 'review'].includes(draft.current_step)) {
      setStep(draft.current_step);
    }
    if (draft.editing_scene !== undefined) setEditingScene(draft.editing_scene);
    if (draft.edit_form) setEditForm(draft.edit_form);
    if (draft.camera_selections) {
      setCameraWorkSelections(stringKeysToNumber(draft.camera_selections));
    }
    if (draft.trim_settings) setSceneTrimSettings(draft.trim_settings);
    if (draft.video_modes) {
      setSceneVideoModes(stringKeysToNumber(draft.video_modes));
    }
    if (draft.custom_image_scenes) {
      setCustomImageScenes(new Set(draft.custom_image_scenes));
    }
    if (draft.film_grain) setFilmGrain(draft.film_grain);
    if (draft.use_lut !== undefined) setUseLut(draft.use_lut);
    if (draft.lut_intensity !== undefined) setLutIntensity(draft.lut_intensity);
    if (draft.apply_trim !== undefined) setApplyTrim(draft.apply_trim);
    if (draft.video_provider) setVideoProvider(draft.video_provider);
    if (draft.aspect_ratio) setAspectRatio(draft.aspect_ratio);
    if (draft.selected_mood) setSelectedMood(draft.selected_mood);
    if (draft.custom_mood_text) setCustomMoodText(draft.custom_mood_text);

    // 復元済みフラグを立てる
    setDraftRestored(true);
  }, [storyboard?.id, storyboard?.draft_metadata, draftRestored]);

  // 動画生成開始時にドラフトをクリア
  const handleStartGeneration = async () => {
    if (!storyboard) return;

    try {
      // ドラフトをクリア（失敗しても生成は続行）
      await storyboardApi.clearDraft(storyboard.id).catch(console.error);

      // 生成開始処理...
    } catch (error) {
      // エラーハンドリング
    }
  };

  return (
    <div>
      {/* 一時保存インジケーター */}
      {step === 'edit' && storyboard && (
        <div className="flex items-center gap-2">
          {isSaving ? (
            <span className="text-sm text-gray-500">保存中...</span>
          ) : hasUnsavedChanges ? (
            <span className="text-sm text-yellow-600">未保存の変更あり</span>
          ) : lastSavedAt ? (
            <span className="text-sm text-gray-500">
              保存済み {new Date(lastSavedAt).toLocaleTimeString()}
            </span>
          ) : null}

          <Button
            variant="outline"
            size="sm"
            onClick={saveDraftManual}
            disabled={isSaving}
          >
            一時保存
          </Button>
        </div>
      )}

      {/* 既存のUI... */}
    </div>
  );
}
```

---

## 4. UI/UX設計

### 4.1 保存インジケーター

```
┌─────────────────────────────────────────────────────────┐
│  [← 戻る]              シーン編集                        │
│                                                         │
│  ┌─────────────────────────────────────────────────┐   │
│  │ ⏳ 保存中... │ ✓ 保存済み 12:34:56 │ [一時保存]  │   │
│  │      or                                          │   │
│  │ ⚠️ 未保存の変更あり                              │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
│  シーン1  シーン2  シーン3  シーン4                       │
│    ...                                                  │
└─────────────────────────────────────────────────────────┘
```

### 4.2 復元通知

ページ読み込み時に前回の編集内容がある場合:

```
┌─────────────────────────────────────────────┐
│  ℹ️ 前回の編集内容を復元しました            │
│     （24時間以上前の場合は日数も表示）       │
└─────────────────────────────────────────────┘
```

### 4.3 未保存警告（beforeunload）

ブラウザ標準のダイアログを使用:

```
┌─────────────────────────────────────────────┐
│  このサイトを離れますか？                     │
│  行った変更が保存されない可能性があります。   │
│                                             │
│            [キャンセル]  [離れる]             │
└─────────────────────────────────────────────┘
```

---

## 5. 実装スケジュール

### Phase 1: バックエンド（1-2時間）
1. [ ] マイグレーション実行（draft_metadataカラム追加）
2. [ ] schemas.py にDraftMetadata型追加（Field(default_factory=...)使用）
3. [ ] router.py に PUT/DELETE エンドポイント追加（ルート順序に注意）
4. [ ] 既存GET /storyboard/{id} の取得クエリを確認（draft_metadataが含まれるか）

### Phase 2: フロントエンド（2-3時間）
1. [ ] lib/api/client.ts に型定義・APIメソッド追加
2. [ ] hooks/use-auto-save-draft.ts 作成
3. [ ] storyboard/page.tsx への統合
4. [ ] キー変換ユーティリティ（number <-> string）実装

### Phase 3: UI/UX（1時間）
1. [ ] 保存インジケーター追加
2. [ ] 復元通知トースト（古いドラフト警告含む）

### Phase 4: テスト（1時間）
1. [ ] 自動保存の動作確認
2. [ ] 復元の動作確認
3. [ ] beforeunload警告確認
4. [ ] エッジケース確認（ネットワークエラー、古いドラフト等）

**合計見積もり: 5-7時間**

---

## 6. レビューで発見した問題と対策

### 6.1 修正済みの問題

| 問題 | 対策 |
|------|------|
| Step型が不完全（concatenating, completed欠落） | 全7ステップを網羅 |
| CameraWorkSelectionが複雑な型だった | 適切な型定義に修正 |
| JSONキーがstringになる問題 | `Record<string, ...>`に統一 + 変換ユーティリティ |
| Pydanticのミュータブルデフォルト | `Field(default_factory=...)`使用 |
| beforeunloadでasync関数が動かない | 同期的な警告表示のみに変更 |
| ドラフト再復元の無限ループリスク | `draftRestored`フラグで防止 |
| 型定義ファイルの場所が間違い | `lib/api/client.ts`に統一 |
| aspectRatio, videoProvider, applyTrim等の欠落 | スキーマに追加 |
| customImageScenes（Set型）の保存 | 配列に変換して保存 |
| スキーマバージョン管理なし | `schema_version`フィールド追加 |
| 古いドラフトの警告なし | 24時間以上前は日数表示 |

### 6.2 残存リスクと対策

| リスク | 対策 |
|------|------|
| visibilitychange時の保存が完了しない可能性 | 許容（次回アクセス時に自動保存データがある） |
| 複数タブで同時編集時の競合 | 許容（最後の保存が優先、将来的にはロック機能検討） |
| ネットワーク断続時の保存失敗 | 10秒間隔でリトライ、UI上で未保存状態を表示 |

---

## 7. ファイル変更一覧

| ファイル | 変更内容 |
|---------|---------|
| `movie-maker-api/app/videos/router.py` | PUT/DELETE /draft エンドポイント追加（ルート順序注意） |
| `movie-maker-api/app/videos/schemas.py` | DraftMetadata, SaveDraftRequest/Response追加 |
| `movie-maker/lib/api/client.ts` | DraftMetadata型、saveDraft/clearDraftメソッド追加、Storyboard型にdraft_metadata追加 |
| `movie-maker/hooks/use-auto-save-draft.ts` | 新規作成 |
| `movie-maker/app/generate/storyboard/page.tsx` | 自動保存・復元ロジック統合 |

---

## 8. 承認事項

- [ ] DB設計承認
- [ ] API設計承認
- [ ] UI/UX設計承認
- [ ] 実装開始承認

---

**作成日:** 2025-01-06
**更新日:** 2025-01-06
**作成者:** Claude Code
**ステータス:** レビュー完了・承認待ち

### 変更履歴
- v1.0: 初版作成
- v1.1: レビュー指摘事項を反映（12件の問題を修正）
