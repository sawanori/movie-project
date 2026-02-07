'use client';

import { useCallback, useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Handle, Position, NodeProps } from '@xyflow/react';
import { Image as ImageIcon, Upload, Link, X, Loader2, FolderOpen } from 'lucide-react';
import { useDropzone } from 'react-dropzone';
import {
  BaseNode,
  outputHandleClassName,
  nodeInputClassName,
  nodeButtonClassName,
} from './BaseNode';
import { cn } from '@/lib/utils';
import type { ImageInputNodeData } from '@/lib/types/node-editor';
import { videosApi, libraryApi, type LibraryImage, type Screenshot } from '@/lib/api/client';

type ImageInputMode = 'upload' | 'url';

interface ImageInputNodeProps extends NodeProps {
  data: ImageInputNodeData;
  selected: boolean;
}

export function ImageInputNode({ data, selected, id }: ImageInputNodeProps) {
  const [mode, setMode] = useState<ImageInputMode>('upload');
  const [urlInput, setUrlInput] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [showLibraryModal, setShowLibraryModal] = useState(false);

  // Library modal state
  const [libraryImages, setLibraryImages] = useState<LibraryImage[]>([]);
  const [screenshots, setScreenshots] = useState<Screenshot[]>([]);
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [libraryError, setLibraryError] = useState<string | null>(null);
  const [libraryPage, setLibraryPage] = useState(1);
  const [totalLibrary, setTotalLibrary] = useState(0);
  const [totalScreenshots, setTotalScreenshots] = useState(0);

  const updateNodeData = useCallback(
    (updates: Partial<ImageInputNodeData>) => {
      // React Flow のノードデータ更新は親コンポーネントで処理
      const event = new CustomEvent('nodeDataUpdate', {
        detail: { nodeId: id, updates },
      });
      window.dispatchEvent(event);
    },
    [id]
  );

  const PER_PAGE = 20;

  const loadLibraryImages = useCallback(async (page = 1) => {
    setLibraryLoading(true);
    setLibraryError(null);

    try {
      const response = await libraryApi.listAll({
        page,
        per_page: PER_PAGE,
        source_filter: 'all',
      });

      if (page === 1) {
        setLibraryImages(response.library_images || []);
        setScreenshots(response.screenshots || []);
      } else {
        setLibraryImages(prev => [...prev, ...(response.library_images || [])]);
        setScreenshots(prev => [...prev, ...(response.screenshots || [])]);
      }

      setLibraryPage(page);
      setTotalLibrary(response.total_library);
      setTotalScreenshots(response.total_screenshots);
    } catch (error) {
      console.error('Failed to load library images:', error);

      // 認証エラーの判定
      if (error instanceof Error && error.message.includes('401')) {
        setLibraryError('ログインが必要です');
      } else {
        setLibraryError('画像の読み込みに失敗しました');
      }
    } finally {
      setLibraryLoading(false);
    }
  }, []);

  // ページネーション判定（totalsから計算）
  const hasMoreLibrary = useMemo(() => {
    const currentCount = libraryImages.length + screenshots.length;
    const totalCount = totalLibrary + totalScreenshots;
    return currentCount < totalCount;
  }, [libraryImages.length, screenshots.length, totalLibrary, totalScreenshots]);

  // ライブラリ画像選択
  const handleSelectLibraryImage = useCallback((image: LibraryImage) => {
    updateNodeData({
      imageUrl: image.image_url,
      imagePreview: image.thumbnail_url || image.image_url,
      isValid: true,
      errorMessage: undefined,
    });
    setShowLibraryModal(false);
  }, [updateNodeData]);

  // スクリーンショット選択
  const handleSelectScreenshot = useCallback((screenshot: Screenshot) => {
    updateNodeData({
      imageUrl: screenshot.image_url,
      imagePreview: screenshot.image_url,
      isValid: true,
      errorMessage: undefined,
    });
    setShowLibraryModal(false);
  }, [updateNodeData]);

  // モーダルを開いた時にライブラリ画像を読み込む
  useEffect(() => {
    if (showLibraryModal && libraryImages.length === 0 && !libraryError) {
      loadLibraryImages(1);
    }
  }, [showLibraryModal, libraryImages.length, libraryError, loadLibraryImages]);

  const handleUpload = useCallback(
    async (file: File) => {
      setIsUploading(true);
      try {
        const result = await videosApi.uploadImage(file);
        updateNodeData({
          imageUrl: result.image_url,
          imagePreview: result.image_url,
          isValid: true,
          errorMessage: undefined,
        });
      } catch (error) {
        updateNodeData({
          isValid: false,
          errorMessage:
            error instanceof Error ? error.message : '画像のアップロードに失敗しました',
        });
      } finally {
        setIsUploading(false);
      }
    },
    [updateNodeData]
  );

  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      const file = acceptedFiles[0];
      if (file) {
        handleUpload(file);
      }
    },
    [handleUpload]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'image/*': ['.png', '.jpg', '.jpeg', '.webp'] },
    maxFiles: 1,
    disabled: isUploading,
  });

  const handleUrlSubmit = useCallback(() => {
    if (urlInput.trim()) {
      updateNodeData({
        imageUrl: urlInput.trim(),
        imagePreview: urlInput.trim(),
        isValid: true,
        errorMessage: undefined,
      });
    }
  }, [urlInput, updateNodeData]);

  const handleClear = useCallback(() => {
    setUrlInput('');
    updateNodeData({
      imageUrl: null,
      imagePreview: null,
      isValid: false,
      errorMessage: undefined,
    });
  }, [updateNodeData]);

  return (
    <BaseNode
      title="画像入力"
      icon={<ImageIcon className="w-4 h-4" />}
      isSelected={selected}
      isValid={data.isValid}
      errorMessage={data.errorMessage}
    >
      {/* モード切替 */}
      <div className="flex gap-1 mb-3">
        <button
          onClick={() => setMode('upload')}
          className={cn(
            'flex-1 px-2 py-1 text-xs rounded transition-colors',
            mode === 'upload'
              ? 'bg-[#fce300] text-black'
              : 'bg-[#404040] text-white hover:bg-[#505050]'
          )}
        >
          <Upload className="w-3 h-3 inline mr-1" />
          アップロード
        </button>
        <button
          onClick={() => setMode('url')}
          className={cn(
            'flex-1 px-2 py-1 text-xs rounded transition-colors',
            mode === 'url'
              ? 'bg-[#fce300] text-black'
              : 'bg-[#404040] text-white hover:bg-[#505050]'
          )}
        >
          <Link className="w-3 h-3 inline mr-1" />
          URL
        </button>
      </div>

      {/* 保管庫から選択ボタン */}
      <button
        onClick={() => setShowLibraryModal(true)}
        className="w-full mb-3 px-2 py-1.5 text-xs rounded bg-[#404040] text-white hover:bg-[#505050] transition-colors flex items-center justify-center gap-1"
      >
        <FolderOpen className="w-3 h-3" />
        保管庫から選択
      </button>

      {/* プレビュー */}
      {data.imagePreview ? (
        <div className="relative mb-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={data.imagePreview}
            alt="アップロードされた画像のプレビュー"
            className="w-full h-32 object-cover rounded-lg"
          />
          <button
            onClick={handleClear}
            className="absolute top-1 right-1 p-1 bg-black/50 rounded-full hover:bg-black/70 transition-colors"
          >
            <X className="w-3 h-3 text-white" />
          </button>
        </div>
      ) : mode === 'upload' ? (
        <div
          {...getRootProps()}
          className={cn(
            'border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors mb-3',
            isDragActive
              ? 'border-[#fce300] bg-[#fce300]/10'
              : 'border-[#404040] hover:border-[#606060]',
            isUploading && 'pointer-events-none opacity-50'
          )}
        >
          {(() => {
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const { value, ...inputProps } = getInputProps() as { value?: string; [key: string]: unknown };
            return <input {...inputProps} />;
          })()}
          {isUploading ? (
            <Loader2 className="w-6 h-6 mx-auto text-[#fce300] animate-spin" />
          ) : (
            <>
              <Upload className="w-6 h-6 mx-auto text-gray-500 mb-2" />
              <p className="text-xs text-gray-500">
                {isDragActive ? 'ドロップして追加' : 'クリックまたはドラッグ'}
              </p>
            </>
          )}
        </div>
      ) : (
        <div className="space-y-2 mb-3">
          <input
            type="text"
            placeholder="画像URLを入力"
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            className={nodeInputClassName}
          />
          <button onClick={handleUrlSubmit} className={nodeButtonClassName}>
            適用
          </button>
        </div>
      )}

      {/* 出力ハンドル */}
      <Handle
        type="source"
        position={Position.Right}
        id="image_url"
        className={outputHandleClassName}
      />

      {/* 保管庫モーダル（Portalでbodyに描画） */}
      {showLibraryModal && typeof document !== 'undefined' && createPortal(
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60"
          onClick={() => setShowLibraryModal(false)}
        >
          <div
            className="bg-zinc-900 rounded-xl border border-zinc-700 p-6 w-full max-w-4xl mx-4 max-h-[85vh] overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* ヘッダー */}
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-semibold text-white">保管庫から選択</h3>
              <button
                onClick={() => setShowLibraryModal(false)}
                className="p-1 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            {/* エラー表示 */}
            {libraryError && (
              <div className="text-center py-6">
                <p className="text-sm text-red-400 mb-3">{libraryError}</p>
                <button
                  onClick={() => loadLibraryImages(1)}
                  className="text-sm text-[#fce300] hover:underline"
                >
                  再試行
                </button>
              </div>
            )}

            {/* ローディング（初回） */}
            {libraryLoading && libraryImages.length === 0 && !libraryError && (
              <div className="flex justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-[#fce300]" />
              </div>
            )}

            {/* コンテンツ */}
            {!libraryError && (libraryImages.length > 0 || screenshots.length > 0) && (
              <div className="flex-1 overflow-y-auto space-y-4">
                {/* ライブラリ画像セクション */}
                {libraryImages.length > 0 && (
                  <div>
                    <p className="text-sm text-zinc-400 mb-3 font-medium">ライブラリ ({libraryImages.length})</p>
                    <div className="grid grid-cols-5 sm:grid-cols-6 md:grid-cols-8 gap-3">
                      {libraryImages.map((img) => (
                        <button
                          key={img.id}
                          onClick={() => handleSelectLibraryImage(img)}
                          className="relative aspect-square rounded-lg overflow-hidden hover:ring-2 hover:ring-[#fce300] transition-all bg-zinc-800"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={img.thumbnail_url || img.image_url}
                            alt={img.name || 'ライブラリ画像'}
                            className="w-full h-full object-cover"
                            loading="lazy"
                          />
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* スクリーンショットセクション */}
                {screenshots.length > 0 && (
                  <div>
                    <p className="text-sm text-zinc-400 mb-3 font-medium">スクリーンショット ({screenshots.length})</p>
                    <div className="grid grid-cols-5 sm:grid-cols-6 md:grid-cols-8 gap-3">
                      {screenshots.map((ss) => (
                        <button
                          key={ss.id}
                          onClick={() => handleSelectScreenshot(ss)}
                          className="relative aspect-square rounded-lg overflow-hidden hover:ring-2 hover:ring-[#fce300] transition-all bg-zinc-800"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={ss.image_url}
                            alt="スクリーンショット"
                            className="w-full h-full object-cover"
                            loading="lazy"
                          />
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* もっと読み込む */}
                {hasMoreLibrary && (
                  <button
                    onClick={() => loadLibraryImages(libraryPage + 1)}
                    disabled={libraryLoading}
                    className="w-full py-3 mt-4 text-sm bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white rounded-lg disabled:opacity-50 transition-colors"
                  >
                    {libraryLoading ? (
                      <Loader2 className="w-5 h-5 animate-spin mx-auto" />
                    ) : (
                      'もっと読み込む'
                    )}
                  </button>
                )}
              </div>
            )}

            {/* 空状態 */}
            {!libraryLoading && !libraryError &&
             libraryImages.length === 0 && screenshots.length === 0 && (
              <div className="text-center py-12">
                <FolderOpen className="w-12 h-12 mx-auto text-zinc-600 mb-3" />
                <p className="text-sm text-zinc-500">保管庫に画像がありません</p>
              </div>
            )}
          </div>
        </div>,
        document.body
      )}
    </BaseNode>
  );
}
