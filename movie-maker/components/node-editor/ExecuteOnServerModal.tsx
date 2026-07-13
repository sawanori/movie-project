'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { X, Server, Loader2, ImageIcon, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  authApi,
  libraryApi,
  workflowRunsApi,
  type LibraryImage,
  type ExecuteWorkflowRequest,
  type ExecuteWorkflowResponse,
} from '@/lib/api/client';

interface ExecuteOnServerModalProps {
  isOpen: boolean;
  /** サーバー側ワークフロー ID。 */
  workflowId: string;
  onClose: () => void;
  /** 実行成功時に batch_id / run_ids を返す。 */
  onExecuted: (result: ExecuteWorkflowResponse) => void;
  /**
   * バッチ画像選択を無効化する理由。ImageInput が 1 個でない等、
   * グラフがバッチ不可の場合に NodeEditor から渡す。undefined なら選択可。
   */
  batchDisabledReason?: string;
}

interface Usage {
  plan_type: string;
  videos_used: number;
  videos_limit: number;
  videos_remaining: number;
}

type SelectionMode = 'graph' | 'quality' | 'speed' | 'cost';

const MODE_OPTIONS: { value: SelectionMode; label: string }[] = [
  { value: 'graph', label: 'グラフの設定に従う' },
  { value: 'quality', label: '品質' },
  { value: 'speed', label: '速度' },
  { value: 'cost', label: 'コスト' },
];

const PER_PAGE = 20;

export function ExecuteOnServerModal({
  isOpen,
  workflowId,
  onClose,
  onExecuted,
  batchDisabledReason,
}: ExecuteOnServerModalProps) {
  const [usage, setUsage] = useState<Usage | null>(null);
  const [images, setImages] = useState<LibraryImage[]>([]);
  const [selectedUrls, setSelectedUrls] = useState<string[]>([]);
  const [mode, setMode] = useState<SelectionMode>('graph');
  const [isLoadingImages, setIsLoadingImages] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // モーダルを開いた時に残数・ライブラリ画像を読み込む
  useEffect(() => {
    if (!isOpen) return;

    let canceled = false;

    authApi
      .getUsage()
      .then((res: Usage) => {
        if (!canceled) setUsage(res);
      })
      .catch(() => {
        if (!canceled) setUsage(null);
      });

    if (!batchDisabledReason) {
      setIsLoadingImages(true);
      libraryApi
        .listAll({ page: 1, per_page: PER_PAGE, source_filter: 'all' })
        .then((res) => {
          if (!canceled) setImages(res.library_images ?? []);
        })
        .catch(() => {
          if (!canceled) setImages([]);
        })
        .finally(() => {
          if (!canceled) setIsLoadingImages(false);
        });
    }

    return () => {
      canceled = true;
    };
  }, [isOpen, batchDisabledReason]);

  // モーダルを閉じたら選択状態をリセット
  useEffect(() => {
    if (!isOpen) {
      setSelectedUrls([]);
      setMode('graph');
      setError(null);
    }
  }, [isOpen]);

  const toggleImage = useCallback((url: string) => {
    setSelectedUrls((prev) =>
      prev.includes(url) ? prev.filter((u) => u !== url) : [...prev, url],
    );
  }, []);

  // 予約本数 N = 選択画像数 (未選択なら 1)
  const reserveCount = selectedUrls.length > 0 ? selectedUrls.length : 1;
  const remaining = usage?.videos_remaining ?? null;
  const insufficient = remaining !== null && remaining < reserveCount;

  const executeBody = useMemo((): ExecuteWorkflowRequest => {
    const body: ExecuteWorkflowRequest = {};
    if (selectedUrls.length > 0) {
      body.input_image_urls = selectedUrls;
    }
    if (mode !== 'graph') {
      body.selection_priority = mode;
    }
    return body;
  }, [selectedUrls, mode]);

  const handleExecute = useCallback(async () => {
    setIsExecuting(true);
    setError(null);
    try {
      const res = await workflowRunsApi.execute(workflowId, executeBody);
      onExecuted(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : '実行に失敗しました');
    } finally {
      setIsExecuting(false);
    }
  }, [workflowId, executeBody, onExecuted]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="flex flex-col bg-[#2a2a2a] rounded-xl border border-[#404040] w-full max-w-lg max-h-[85vh]">
        {/* ヘッダー */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#404040] shrink-0">
          <h3 className="flex items-center gap-2 text-lg font-semibold text-white">
            <Server className="w-5 h-5 text-[#fce300]" />
            サーバーで実行
          </h3>
          <button
            onClick={onClose}
            disabled={isExecuting}
            className="text-gray-400 hover:text-white disabled:opacity-50"
            aria-label="閉じる"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 本文 */}
        <div className="flex flex-col gap-5 px-6 py-4 overflow-y-auto">
          {/* モデル選択 */}
          <div className="flex flex-col gap-2">
            <span className="text-sm text-gray-300">モデル選択</span>
            <div className="flex flex-wrap gap-1 p-1 bg-[#1a1a1a] rounded-lg border border-[#404040]">
              {MODE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setMode(opt.value)}
                  className={cn(
                    'flex-1 min-w-[80px] px-3 py-1.5 rounded-md text-xs transition-colors',
                    mode === opt.value
                      ? 'bg-[#fce300] text-[#212121] font-medium'
                      : 'text-gray-400 hover:text-white hover:bg-[#2a2a2a]',
                  )}
                >
                  {opt.value === 'graph' ? opt.label : `おまかせ: ${opt.label}`}
                </button>
              ))}
            </div>
          </div>

          {/* バッチ画像選択 */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-300">バッチ画像選択</span>
              {selectedUrls.length > 0 && (
                <span className="text-xs text-[#fce300]">
                  {selectedUrls.length}枚選択中
                </span>
              )}
            </div>

            {batchDisabledReason ? (
              <div className="flex items-center gap-2 px-3 py-3 bg-[#1a1a1a] border border-[#404040] rounded-lg text-xs text-gray-500">
                <ImageIcon className="w-4 h-4 shrink-0" />
                {batchDisabledReason}
              </div>
            ) : isLoadingImages ? (
              <div className="flex items-center justify-center gap-2 py-6 text-xs text-gray-400">
                <Loader2 className="w-4 h-4 animate-spin" />
                画像を読み込み中...
              </div>
            ) : images.length === 0 ? (
              <p className="py-4 text-center text-xs text-gray-500">
                ライブラリに画像がありません（未選択で実行すると1本予約されます）
              </p>
            ) : (
              <div className="flex flex-wrap gap-2 max-h-52 overflow-y-auto">
                {images.map((image) => {
                  const url = image.image_url;
                  const isSelected = selectedUrls.includes(url);
                  return (
                    <button
                      key={image.id}
                      onClick={() => toggleImage(url)}
                      className={cn(
                        'relative w-20 h-20 rounded-lg overflow-hidden border-2 transition-colors',
                        isSelected
                          ? 'border-[#fce300]'
                          : 'border-transparent hover:border-[#505050]',
                      )}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={image.thumbnail_url || url}
                        alt={image.name}
                        className="w-full h-full object-cover"
                      />
                      {isSelected && (
                        <span className="absolute top-1 right-1 flex items-center justify-center w-4 h-4 rounded-full bg-[#fce300]">
                          <Check className="w-3 h-3 text-[#212121]" />
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* 消費見込み + 残数 */}
          <div className="flex flex-col gap-1 p-3 bg-[#1a1a1a] border border-[#404040] rounded-lg">
            <p className="text-sm font-semibold text-[#fce300]">
              {`この実行で ${reserveCount} 本を予約します`}
            </p>
            {remaining !== null && (
              <p className="text-xs text-gray-400">{`残り ${remaining} 本`}</p>
            )}
            {insufficient && (
              <p className="text-xs text-red-400">
                {`残り本数が不足しています（${reserveCount} 本必要 / 残り ${remaining} 本）`}
              </p>
            )}
          </div>

          {/* 実行エラー */}
          {error && (
            <div className="p-3 bg-red-500/20 border border-red-500/30 rounded-lg">
              <p className="text-sm text-red-400 break-words">{error}</p>
            </div>
          )}
        </div>

        {/* フッター */}
        <div className="flex gap-3 px-6 py-4 border-t border-[#404040] shrink-0">
          <button
            onClick={onClose}
            disabled={isExecuting}
            className="flex-1 px-4 py-2 border border-[#404040] rounded-lg text-gray-300 hover:bg-[#333333] transition-colors disabled:opacity-50"
          >
            キャンセル
          </button>
          <button
            onClick={handleExecute}
            disabled={insufficient || isExecuting}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-[#fce300] text-[#212121] font-medium rounded-lg hover:bg-[#e5cf00] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isExecuting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Server className="w-4 h-4" />
            )}
            {isExecuting ? '実行中...' : 'サーバーで実行'}
          </button>
        </div>
      </div>
    </div>
  );
}
