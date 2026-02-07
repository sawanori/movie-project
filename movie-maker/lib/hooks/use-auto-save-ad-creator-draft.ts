'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import {
  adCreatorApi,
  AdCreatorDraftMetadata,
  AdCreatorDraftResponse,
  AdCreatorDraftExistsResponse,
  AdCreatorSelectableItem,
  AdCreatorTrimSetting,
  AdCreatorEditableCut,
  AdScriptResponse,
} from '@/lib/api/client';
import { AspectRatio } from '@/lib/types/video';

/** 自動保存のデフォルト間隔（ミリ秒） */
const AUTO_SAVE_INTERVAL = 10000;

/** 保存状態 */
export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

/** useAutoSaveAdCreatorDraft フックの戻り値 */
export interface UseAutoSaveAdCreatorDraftResult {
  /** 現在の保存状態 */
  saveStatus: SaveStatus;
  /** 最終保存時刻（ISO 8601） */
  lastSavedAt: string | null;
  /** ドラフトが復元されたかどうか */
  draftRestored: boolean;
  /** 復元用のドラフトデータ */
  restoredDraft: AdCreatorDraftResponse | null;
  /** ドラフト存在情報（軽量チェック結果） */
  draftExistsInfo: AdCreatorDraftExistsResponse | null;
  /** 手動保存をトリガー */
  saveDraft: () => Promise<void>;
  /** ドラフトをクリア */
  clearDraft: () => Promise<void>;
  /** ドラフト復元完了をマーク（再復元防止用） */
  markDraftRestored: () => void;
  /** ドラフト存在確認（軽量） */
  checkDraftExists: () => Promise<AdCreatorDraftExistsResponse>;
  /** ドラフトを取得（フルデータ） - 成功時 true、失敗時 false */
  fetchDraft: () => Promise<boolean>;
}

/** useAutoSaveAdCreatorDraft フックの引数 */
export interface UseAutoSaveAdCreatorDraftOptions {
  /** 自動保存を有効にするかどうか */
  enabled?: boolean;
  /** 自動保存間隔（ミリ秒、デフォルト: 10000） */
  interval?: number;

  // UI状態の取得関数群
  getAspectRatio: () => AspectRatio | null;
  getAdMode: () => 'ai' | 'manual' | null;
  getAdScript: () => AdScriptResponse | null;
  getScriptConfirmed: () => boolean;
  getTargetDuration: () => number | null; // CM全体の目標尺（秒）
  getStoryboardCuts: () => AdCreatorEditableCut[];
  getSelectedItems: () => AdCreatorSelectableItem[];
  getTrimSettings: () => Record<string, AdCreatorTrimSetting>;
  getTransition: () => string;
  getTransitionDuration: () => number;
}

/**
 * Ad Creator編集のドラフト自動保存フック
 *
 * 10秒間隔で自動保存を行い、ページ離脱時に警告を表示します。
 */
export function useAutoSaveAdCreatorDraft(options: UseAutoSaveAdCreatorDraftOptions): UseAutoSaveAdCreatorDraftResult {
  const {
    enabled = true,
    interval = AUTO_SAVE_INTERVAL,
    getAspectRatio,
    getAdMode,
    getAdScript,
    getScriptConfirmed,
    getTargetDuration,
    getStoryboardCuts,
    getSelectedItems,
    getTrimSettings,
    getTransition,
    getTransitionDuration,
  } = options;

  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [draftRestored, setDraftRestored] = useState(false);
  const [restoredDraft, setRestoredDraft] = useState<AdCreatorDraftResponse | null>(null);
  const [draftExistsInfo, setDraftExistsInfo] = useState<AdCreatorDraftExistsResponse | null>(null);

  // 保存処理中フラグ（重複保存防止）
  const isSavingRef = useRef(false);
  // 前回保存したドラフトのJSON（変更検知用）
  const lastSavedDraftRef = useRef<string | null>(null);

  /**
   * 現在のUI状態からドラフトメタデータを構築
   */
  const buildDraftMetadata = useCallback((): AdCreatorDraftMetadata => {
    return {
      schema_version: 1,
      aspect_ratio: getAspectRatio() as '9:16' | '16:9' | '1:1' | null,
      ad_mode: getAdMode(),
      ad_script: getAdScript(),
      script_confirmed: getScriptConfirmed(),
      storyboard_cuts: getStoryboardCuts(),
      target_duration: getTargetDuration(),
      selected_items: getSelectedItems(),
      trim_settings: getTrimSettings(),
      transition: getTransition(),
      transition_duration: getTransitionDuration(),
      last_saved_at: null, // サーバー側で設定
      auto_saved: true,
    };
  }, [
    getAspectRatio, getAdMode, getAdScript, getScriptConfirmed, getTargetDuration,
    getStoryboardCuts, getSelectedItems, getTrimSettings,
    getTransition, getTransitionDuration,
  ]);

  /**
   * ドラフト存在確認（軽量API）
   */
  const checkDraftExists = useCallback(async (): Promise<AdCreatorDraftExistsResponse> => {
    try {
      const result = await adCreatorApi.checkDraftExists();
      setDraftExistsInfo(result);
      return result;
    } catch (error) {
      console.error('Failed to check Ad Creator draft:', error);
      const fallback: AdCreatorDraftExistsResponse = { exists: false, last_saved_at: null };
      setDraftExistsInfo(fallback);
      return fallback;
    }
  }, []);

  /**
   * ドラフトを取得（フルデータ）
   * @returns 取得成功時は true、失敗時は false
   */
  const fetchDraft = useCallback(async (): Promise<boolean> => {
    try {
      const draft = await adCreatorApi.getDraft();
      if (draft) {
        setRestoredDraft(draft);
        return true;
      }
      return false;
    } catch (error) {
      console.error('Failed to fetch Ad Creator draft:', error);
      return false;
    }
  }, []);

  /**
   * ドラフトを保存
   */
  const saveDraft = useCallback(async () => {
    if (!enabled || isSavingRef.current) {
      return;
    }

    const draft = buildDraftMetadata();

    // 何も選択されていない（空の状態）の場合は保存しない
    const hasContent = draft.aspect_ratio ||
      draft.ad_mode ||
      draft.ad_script ||
      draft.storyboard_cuts.length > 0 ||
      draft.selected_items.length > 0;

    if (!hasContent) {
      return;
    }

    const draftJson = JSON.stringify(draft);

    // 変更がない場合はスキップ
    if (draftJson === lastSavedDraftRef.current) {
      return;
    }

    isSavingRef.current = true;
    setSaveStatus('saving');

    try {
      const response = await adCreatorApi.saveDraft(draft);
      setLastSavedAt(response.last_saved_at);
      lastSavedDraftRef.current = draftJson;
      setSaveStatus('saved');

      // 3秒後にidleに戻す
      setTimeout(() => setSaveStatus('idle'), 3000);
    } catch (error) {
      console.error('Failed to save Ad Creator draft:', error);
      setSaveStatus('error');
    } finally {
      isSavingRef.current = false;
    }
  }, [enabled, buildDraftMetadata]);

  /**
   * ドラフトをクリア
   */
  const clearDraft = useCallback(async () => {
    try {
      await adCreatorApi.clearDraft();
      lastSavedDraftRef.current = null;
      setLastSavedAt(null);
      setSaveStatus('idle');
      setRestoredDraft(null);
    } catch (error) {
      console.error('Failed to clear Ad Creator draft:', error);
    }
  }, []);

  /**
   * ドラフト復元完了をマーク（再復元防止用）
   */
  const markDraftRestored = useCallback(() => {
    setDraftRestored(true);
    setRestoredDraft(null);
  }, []);

  // 自動保存タイマー
  useEffect(() => {
    if (!enabled) {
      return;
    }

    const timer = setInterval(() => {
      saveDraft();
    }, interval);

    return () => clearInterval(timer);
  }, [enabled, interval, saveDraft]);

  // ページ離脱時の警告（beforeunload）
  useEffect(() => {
    if (!enabled) {
      return;
    }

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      // 変更がある場合のみ警告を表示
      const draft = buildDraftMetadata();
      const draftJson = JSON.stringify(draft);

      // 空のドラフトの場合は警告しない
      const hasContent = draft.aspect_ratio ||
        draft.ad_mode ||
        draft.ad_script ||
        draft.storyboard_cuts.length > 0 ||
        draft.selected_items.length > 0;

      if (hasContent && draftJson !== lastSavedDraftRef.current) {
        // 標準の確認ダイアログを表示
        e.preventDefault();
        // Chrome対応: returnValueを設定
        e.returnValue = '';
        return '';
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [enabled, buildDraftMetadata]);

  return {
    saveStatus,
    lastSavedAt,
    draftRestored,
    restoredDraft,
    draftExistsInfo,
    saveDraft,
    clearDraft,
    markDraftRestored,
    checkDraftExists,
    fetchDraft,
  };
}

/**
 * ドラフトメタデータが古いかどうかを判定
 * @param draft ドラフトメタデータ
 * @param thresholdHours 閾値（時間、デフォルト: 24）
 * @returns 古い場合はtrue
 */
export function isAdCreatorDraftStale(draft: AdCreatorDraftResponse | null | undefined, thresholdHours = 24): boolean {
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
export function getAdCreatorDraftAgeDays(draft: AdCreatorDraftResponse | null | undefined): number {
  if (!draft?.last_saved_at) {
    return 0;
  }

  const savedAt = new Date(draft.last_saved_at);
  const now = new Date();
  const diffDays = (now.getTime() - savedAt.getTime()) / (1000 * 60 * 60 * 24);

  return Math.floor(diffDays);
}
