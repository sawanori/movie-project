'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import {
  storyboardApi,
  DraftMetadata,
  DraftCameraWorkSelection,
  TrimSettings,
  StoryboardStep,
  EditFormState,
} from '@/lib/api/client';

/** 自動保存のデフォルト間隔（ミリ秒） */
const AUTO_SAVE_INTERVAL = 10000;

/** 保存状態 */
export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

/** useAutoSaveDraft フックの戻り値 */
export interface UseAutoSaveDraftResult {
  /** 現在の保存状態 */
  saveStatus: SaveStatus;
  /** 最終保存時刻（ISO 8601） */
  lastSavedAt: string | null;
  /** ドラフトが復元されたかどうか */
  draftRestored: boolean;
  /** 手動保存をトリガー */
  saveDraft: () => Promise<void>;
  /** ドラフトをクリア */
  clearDraft: () => Promise<void>;
  /** ドラフト復元完了をマーク（再復元防止用） */
  markDraftRestored: () => void;
}

/** useAutoSaveDraft フックの引数 */
export interface UseAutoSaveDraftOptions {
  /** ストーリーボードID */
  storyboardId: string | null;
  /** 自動保存を有効にするかどうか */
  enabled?: boolean;
  /** 自動保存間隔（ミリ秒、デフォルト: 10000） */
  interval?: number;

  // UI状態の取得関数群
  getCurrentStep: () => StoryboardStep | null;
  getEditingScene: () => number | null;
  getEditForm: () => EditFormState | null;
  getCameraSelections: () => Record<number, DraftCameraWorkSelection>;
  getTrimSettings: () => Record<number, TrimSettings>;
  getVideoModes: () => Record<number, 'i2v' | 'v2v'>;
  getCustomImageScenes: () => Set<number>;
  getFilmGrain: () => 'none' | 'light' | 'medium' | 'heavy';
  getUseLut: () => boolean;
  getLutIntensity: () => number;
  getApplyTrim: () => boolean;
  getVideoProvider: () => 'runway' | 'veo' | 'domoai' | 'piapi_kling' | 'hailuo';
  getAspectRatio: () => '9:16' | '16:9';
  getSelectedMood: () => string | null;
  getCustomMoodText: () => string | null;
  getSceneEndFrameImages: () => Record<number, string>;  // シーンごとの終了フレーム画像URL（Kling専用）
}

/**
 * Record<number, T> を Record<string, T> に変換（JSON互換性のため）
 */
function convertNumberKeysToString<T>(obj: Record<number, T>): Record<string, T> {
  const result: Record<string, T> = {};
  for (const [key, value] of Object.entries(obj)) {
    result[String(key)] = value;
  }
  return result;
}

/**
 * ストーリーボード編集のドラフト自動保存フック
 *
 * 10秒間隔で自動保存を行い、ページ離脱時に警告を表示します。
 */
export function useAutoSaveDraft(options: UseAutoSaveDraftOptions): UseAutoSaveDraftResult {
  const {
    storyboardId,
    enabled = true,
    interval = AUTO_SAVE_INTERVAL,
    getCurrentStep,
    getEditingScene,
    getEditForm,
    getCameraSelections,
    getTrimSettings,
    getVideoModes,
    getCustomImageScenes,
    getFilmGrain,
    getUseLut,
    getLutIntensity,
    getApplyTrim,
    getVideoProvider,
    getAspectRatio,
    getSelectedMood,
    getCustomMoodText,
    getSceneEndFrameImages,
  } = options;

  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [draftRestored, setDraftRestored] = useState(false);

  // 保存処理中フラグ（重複保存防止）
  const isSavingRef = useRef(false);
  // 前回保存したドラフトのJSON（変更検知用）
  const lastSavedDraftRef = useRef<string | null>(null);

  /**
   * 現在のUI状態からドラフトメタデータを構築
   */
  const buildDraftMetadata = useCallback((): DraftMetadata => {
    return {
      schema_version: 1,
      current_step: getCurrentStep(),
      editing_scene: getEditingScene(),
      edit_form: getEditForm(),
      camera_selections: convertNumberKeysToString(getCameraSelections()),
      trim_settings: convertNumberKeysToString(getTrimSettings()),
      video_modes: convertNumberKeysToString(getVideoModes()),
      custom_image_scenes: Array.from(getCustomImageScenes()),
      film_grain: getFilmGrain(),
      use_lut: getUseLut(),
      lut_intensity: getLutIntensity(),
      apply_trim: getApplyTrim(),
      video_provider: getVideoProvider(),
      aspect_ratio: getAspectRatio(),
      selected_mood: getSelectedMood(),
      custom_mood_text: getCustomMoodText(),
      last_saved_at: null, // サーバー側で設定
      auto_saved: true,
      scene_end_frame_images: convertNumberKeysToString(getSceneEndFrameImages()),
    };
  }, [
    getCurrentStep, getEditingScene, getEditForm, getCameraSelections,
    getTrimSettings, getVideoModes, getCustomImageScenes, getFilmGrain,
    getUseLut, getLutIntensity, getApplyTrim, getVideoProvider,
    getAspectRatio, getSelectedMood, getCustomMoodText, getSceneEndFrameImages,
  ]);

  /**
   * ドラフトを保存
   */
  const saveDraft = useCallback(async () => {
    if (!storyboardId || !enabled || isSavingRef.current) {
      return;
    }

    const draft = buildDraftMetadata();
    const draftJson = JSON.stringify(draft);

    // 変更がない場合はスキップ
    if (draftJson === lastSavedDraftRef.current) {
      return;
    }

    isSavingRef.current = true;
    setSaveStatus('saving');

    try {
      const response = await storyboardApi.saveDraft(storyboardId, draft);
      setLastSavedAt(response.last_saved_at);
      lastSavedDraftRef.current = draftJson;
      setSaveStatus('saved');

      // 3秒後にidleに戻す
      setTimeout(() => setSaveStatus('idle'), 3000);
    } catch (error) {
      console.error('Failed to save draft:', error);
      setSaveStatus('error');
    } finally {
      isSavingRef.current = false;
    }
  }, [storyboardId, enabled, buildDraftMetadata]);

  /**
   * ドラフトをクリア
   */
  const clearDraft = useCallback(async () => {
    if (!storyboardId) {
      return;
    }

    try {
      await storyboardApi.clearDraft(storyboardId);
      lastSavedDraftRef.current = null;
      setLastSavedAt(null);
      setSaveStatus('idle');
    } catch (error) {
      console.error('Failed to clear draft:', error);
    }
  }, [storyboardId]);

  /**
   * ドラフト復元完了をマーク（再復元防止用）
   */
  const markDraftRestored = useCallback(() => {
    setDraftRestored(true);
  }, []);

  // 自動保存タイマー
  useEffect(() => {
    if (!enabled || !storyboardId) {
      return;
    }

    const timer = setInterval(() => {
      saveDraft();
    }, interval);

    return () => clearInterval(timer);
  }, [enabled, storyboardId, interval, saveDraft]);

  // ページ離脱時の警告（beforeunload）
  useEffect(() => {
    if (!enabled || !storyboardId) {
      return;
    }

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      // 変更がある場合のみ警告を表示
      const draft = buildDraftMetadata();
      const draftJson = JSON.stringify(draft);

      if (draftJson !== lastSavedDraftRef.current) {
        // 標準の確認ダイアログを表示
        e.preventDefault();
        // Chrome対応: returnValueを設定
        e.returnValue = '';
        return '';
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [enabled, storyboardId, buildDraftMetadata]);

  return {
    saveStatus,
    lastSavedAt,
    draftRestored,
    saveDraft,
    clearDraft,
    markDraftRestored,
  };
}

/**
 * ドラフトメタデータが古いかどうかを判定
 * @param draft ドラフトメタデータ
 * @param thresholdHours 閾値（時間、デフォルト: 24）
 * @returns 古い場合はtrue
 */
export function isDraftStale(draft: DraftMetadata | null | undefined, thresholdHours = 24): boolean {
  if (!draft?.last_saved_at) {
    return false;
  }

  const savedAt = new Date(draft.last_saved_at);
  const now = new Date();
  const diffHours = (now.getTime() - savedAt.getTime()) / (1000 * 60 * 60);

  return diffHours > thresholdHours;
}

/**
 * ドラフトの経過日数を計算
 * @param draft ドラフトメタデータ
 * @returns 経過日数（小数点以下切り捨て）
 */
export function getDraftAgeDays(draft: DraftMetadata | null | undefined): number {
  if (!draft?.last_saved_at) {
    return 0;
  }

  const savedAt = new Date(draft.last_saved_at);
  const now = new Date();
  const diffDays = (now.getTime() - savedAt.getTime()) / (1000 * 60 * 60 * 24);

  return Math.floor(diffDays);
}

/**
 * Record<string, T> を Record<number, T> に変換（復元時用）
 */
export function convertStringKeysToNumber<T>(obj: Record<string, T>): Record<number, T> {
  const result: Record<number, T> = {};
  for (const [key, value] of Object.entries(obj)) {
    const numKey = parseInt(key, 10);
    if (!isNaN(numKey)) {
      result[numKey] = value;
    }
  }
  return result;
}
