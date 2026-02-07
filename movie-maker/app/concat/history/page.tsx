"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/components/providers/auth-provider";
import { Header } from "@/components/layout/header";
import { Button } from "@/components/ui/button";
import { videosApi } from "@/lib/api/client";
import {
  ArrowLeft,
  Video,
  Loader2,
  Download,
  Plus,
  X,
  Check,
} from "lucide-react";
import { ConcatVideoCard, type ConcatItem } from "./components/concat-video-card";

export default function ConcatHistoryPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  const [concatenations, setConcatenations] = useState<ConcatItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [showDownloadModal, setShowDownloadModal] = useState(false);
  const [selectedConcat, setSelectedConcat] = useState<ConcatItem | null>(null);
  const [selectedFormat, setSelectedFormat] = useState<'original' | 'prores' | 'prores_hd' | 'prores_4k'>('original');
  const [isConverting, setIsConverting] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [proResConversionPhase, setProResConversionPhase] = useState<'idle' | 'upscaling' | 'converting'>('idle');
  const [upscaleForProResProgress, setUpscaleForProResProgress] = useState(0);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/login");
    }
  }, [user, authLoading, router]);

  useEffect(() => {
    if (user) {
      loadConcatenations();
    }
  }, [user]);

  const loadConcatenations = async () => {
    try {
      const res = await videosApi.listConcat(1, 50);
      setConcatenations(res.concatenations || []);
    } catch (error) {
      console.error("Failed to load concatenations:", error);
    } finally {
      setLoading(false);
    }
  };

  const openDownloadModal = (concat: ConcatItem) => {
    setSelectedConcat(concat);
    setSelectedFormat('original');
    setDownloadError(null);
    setShowDownloadModal(true);
  };

  const handleDownload = async () => {
    if (!selectedConcat?.final_video_url) return;

    const videoUrl = selectedConcat.final_video_url;
    const concatId = selectedConcat.id;
    setDownloadError(null);

    if (selectedFormat === 'original') {
      setDownloading(concatId);
      try {
        const response = await fetch(videoUrl);
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        const timestamp = new Date().toISOString().slice(0, 19).replace(/[:-]/g, "");
        a.download = `concat_video_${timestamp}.mp4`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
        setShowDownloadModal(false);
      } catch (error) {
        console.error("Download failed:", error);
        setDownloadError("ダウンロードに失敗しました");
      } finally {
        setDownloading(null);
      }
      return;
    }

    // ProRes変換 (720p)
    if (selectedFormat === 'prores') {
      setIsConverting(true);
      try {
        const blob = await videosApi.downloadAsProRes(videoUrl);
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        const timestamp = new Date().toISOString().slice(0, 19).replace(/[:-]/g, "");
        a.download = `concat_video_prores_${timestamp}.mov`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
        setShowDownloadModal(false);
      } catch (error) {
        console.error("ProRes conversion failed:", error);
        setDownloadError(error instanceof Error ? error.message : "ProRes変換に失敗しました");
      } finally {
        setIsConverting(false);
      }
      return;
    }

    // ProRes + Upscale (HD or 4K)
    if (selectedFormat === 'prores_hd' || selectedFormat === 'prores_4k') {
      const targetResolution = selectedFormat === 'prores_hd' ? 'hd' : '4k';

      // Phase 1: Upscale
      setProResConversionPhase('upscaling');
      setUpscaleForProResProgress(0);

      try {
        // Start upscale
        await videosApi.upscaleConcat(concatId, targetResolution);

        // Poll for upscale completion
        let upscaledUrl: string | null = null;
        const maxAttempts = 100; // 5 minutes max
        let attempts = 0;

        while (!upscaledUrl && attempts < maxAttempts) {
          await new Promise(r => setTimeout(r, 3000));
          attempts++;

          const status = await videosApi.getConcatUpscaleStatus(concatId);
          setUpscaleForProResProgress(status.progress || Math.min(attempts * 3, 90));

          if (status.status === 'completed' && status.upscaled_video_url) {
            upscaledUrl = status.upscaled_video_url;
          } else if (status.status === 'failed') {
            throw new Error(status.message || 'アップスケールに失敗しました');
          }
        }

        if (!upscaledUrl) {
          throw new Error('アップスケールがタイムアウトしました');
        }

        // Phase 2: ProRes conversion
        setProResConversionPhase('converting');

        const blob = await videosApi.downloadAsProRes(upscaledUrl);
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        const timestamp = new Date().toISOString().slice(0, 19).replace(/[:-]/g, "");
        a.download = `concat_video_prores_${targetResolution}_${timestamp}.mov`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
        setShowDownloadModal(false);
      } catch (error) {
        console.error("ProRes + Upscale failed:", error);
        setDownloadError(error instanceof Error ? error.message : "処理に失敗しました");
      } finally {
        setProResConversionPhase('idle');
        setUpscaleForProResProgress(0);
      }
      return;
    }
  };

  const getTransitionLabel = (transition: string) => {
    const labels: Record<string, string> = {
      none: "なし",
      fade: "フェード",
      dissolve: "ディゾルブ",
      wipeleft: "ワイプ左",
      wiperight: "ワイプ右",
      slideup: "スライド上",
      slidedown: "スライド下",
      circleopen: "サークルオープン",
      circleclose: "サークルクローズ",
    };
    return labels[transition] || transition;
  };


  if (authLoading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-zinc-400" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950">
      <Header />
      <main className="container mx-auto px-4 py-8 max-w-6xl">
        {/* ヘッダー */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <Link href="/dashboard">
              <Button variant="ghost" size="icon">
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </Link>
            <div>
              <h1 className="text-2xl font-bold text-white">アドクリエイター履歴</h1>
              <p className="text-zinc-400 text-sm">
                過去に作成した広告動画の一覧
              </p>
            </div>
          </div>
          <Link href="/concat">
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              新しく作成
            </Button>
          </Link>
        </div>

        {/* コンテンツ */}
        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-zinc-400" />
          </div>
        ) : concatenations.length === 0 ? (
          <div className="text-center py-12 bg-zinc-900 rounded-xl">
            <Video className="h-12 w-12 text-zinc-600 mx-auto mb-4" />
            <p className="text-zinc-400">広告動画がありません</p>
            <Link href="/concat">
              <Button className="mt-4">
                <Plus className="h-4 w-4 mr-2" />
                広告を作成する
              </Button>
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {concatenations.map((concat) => (
              <ConcatVideoCard
                key={concat.id}
                concat={concat}
                onDownload={openDownloadModal}
                getTransitionLabel={getTransitionLabel}
              />
            ))}
          </div>
        )}

        {/* ダウンロードモーダル */}
        {showDownloadModal && selectedConcat && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80">
            <div className="bg-zinc-900 rounded-xl p-6 max-w-md w-full mx-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-white">ダウンロード形式を選択</h3>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setShowDownloadModal(false)}
                >
                  <X className="h-5 w-5" />
                </Button>
              </div>

              <div className="space-y-3">
                {/* Original */}
                <label
                  className={`flex cursor-pointer items-center gap-3 rounded-lg border-2 p-4 transition-colors ${
                    selectedFormat === 'original'
                      ? 'border-blue-500 bg-blue-500/10'
                      : 'border-zinc-700 hover:border-zinc-600'
                  }`}
                >
                  <input
                    type="radio"
                    name="format"
                    value="original"
                    checked={selectedFormat === 'original'}
                    onChange={() => setSelectedFormat('original')}
                    className="sr-only"
                  />
                  <div className="flex-1">
                    <div className="font-medium text-white">オリジナル (MP4)</div>
                    <div className="text-sm text-zinc-400">そのままダウンロード</div>
                  </div>
                  <div className={`h-5 w-5 rounded-full border-2 ${
                    selectedFormat === 'original'
                      ? 'border-blue-500 bg-blue-500'
                      : 'border-zinc-600'
                  }`}>
                    {selectedFormat === 'original' && (
                      <Check className="h-full w-full p-0.5 text-white" />
                    )}
                  </div>
                </label>

                {/* ProRes */}
                <label
                  className={`flex cursor-pointer items-center gap-3 rounded-lg border-2 p-4 transition-colors ${
                    selectedFormat === 'prores'
                      ? 'border-purple-500 bg-purple-500/10'
                      : 'border-zinc-700 hover:border-zinc-600'
                  }`}
                >
                  <input
                    type="radio"
                    name="format"
                    value="prores"
                    checked={selectedFormat === 'prores'}
                    onChange={() => setSelectedFormat('prores')}
                    className="sr-only"
                  />
                  <div className="flex-1">
                    <div className="flex items-center gap-2 font-medium text-white">
                      ProRes 422 HQ
                      <span className="rounded bg-gradient-to-r from-purple-500 to-pink-500 px-1.5 py-0.5 text-xs text-white">
                        編集用
                      </span>
                    </div>
                    <div className="text-sm text-zinc-400">
                      10bit・デバンド処理済み（約30秒〜1分）
                    </div>
                  </div>
                  <div className={`h-5 w-5 rounded-full border-2 ${
                    selectedFormat === 'prores'
                      ? 'border-purple-500 bg-purple-500'
                      : 'border-zinc-600'
                  }`}>
                    {selectedFormat === 'prores' && (
                      <Check className="h-full w-full p-0.5 text-white" />
                    )}
                  </div>
                </label>

                {/* ProRes (フルHD) */}
                <label
                  className={`flex cursor-pointer items-center gap-3 rounded-lg border-2 p-4 transition-colors ${
                    selectedFormat === 'prores_hd'
                      ? 'border-blue-500 bg-blue-500/10'
                      : 'border-zinc-700 hover:border-zinc-600'
                  }`}
                >
                  <input
                    type="radio"
                    name="format"
                    value="prores_hd"
                    checked={selectedFormat === 'prores_hd'}
                    onChange={() => setSelectedFormat('prores_hd')}
                    className="sr-only"
                  />
                  <div className="flex-1">
                    <div className="flex items-center gap-2 font-medium text-white">
                      ProRes 422 HQ (フルHD)
                      <span className="rounded bg-gradient-to-r from-blue-500 to-purple-500 px-1.5 py-0.5 text-xs text-white">
                        高解像度編集用
                      </span>
                    </div>
                    <div className="text-sm text-zinc-400">
                      1080p・10bit・デバンド処理（約2〜3分）
                    </div>
                  </div>
                  <div className={`h-5 w-5 rounded-full border-2 ${
                    selectedFormat === 'prores_hd'
                      ? 'border-blue-500 bg-blue-500'
                      : 'border-zinc-600'
                  }`}>
                    {selectedFormat === 'prores_hd' && (
                      <Check className="h-full w-full p-0.5 text-white" />
                    )}
                  </div>
                </label>

                {/* ProRes (4K) */}
                <label
                  className={`flex cursor-pointer items-center gap-3 rounded-lg border-2 p-4 transition-colors ${
                    selectedFormat === 'prores_4k'
                      ? 'border-amber-500 bg-amber-500/10'
                      : 'border-zinc-700 hover:border-zinc-600'
                  }`}
                >
                  <input
                    type="radio"
                    name="format"
                    value="prores_4k"
                    checked={selectedFormat === 'prores_4k'}
                    onChange={() => setSelectedFormat('prores_4k')}
                    className="sr-only"
                  />
                  <div className="flex-1">
                    <div className="flex items-center gap-2 font-medium text-white">
                      ProRes 422 HQ (4K)
                      <span className="rounded bg-gradient-to-r from-amber-500 to-red-500 px-1.5 py-0.5 text-xs text-white">
                        最高品質編集用
                      </span>
                    </div>
                    <div className="text-sm text-zinc-400">
                      2160p・10bit・デバンド処理（約3〜5分）
                    </div>
                  </div>
                  <div className={`h-5 w-5 rounded-full border-2 ${
                    selectedFormat === 'prores_4k'
                      ? 'border-amber-500 bg-amber-500'
                      : 'border-zinc-600'
                  }`}>
                    {selectedFormat === 'prores_4k' && (
                      <Check className="h-full w-full p-0.5 text-white" />
                    )}
                  </div>
                </label>
              </div>

              {downloadError && (
                <div className="mt-4 rounded-lg bg-red-500/10 border border-red-500/30 p-3 text-sm text-red-400">
                  {downloadError}
                </div>
              )}

              {proResConversionPhase !== 'idle' && (
                <div className="mt-4 text-center py-4">
                  <Loader2 className="mx-auto h-8 w-8 animate-spin text-blue-500" />
                  <p className="mt-3 text-white font-medium">
                    {proResConversionPhase === 'upscaling' ? 'アップスケール中...' : 'ProRes変換中...'}
                  </p>
                  <p className="mt-1 text-sm text-zinc-400">
                    {proResConversionPhase === 'upscaling'
                      ? `ステップ 1/2: 高解像度化 (${upscaleForProResProgress}%)`
                      : 'ステップ 2/2: ProRes変換中...'}
                  </p>
                  {proResConversionPhase === 'upscaling' && (
                    <div className="mt-3 mx-auto w-48">
                      <div className="h-2 overflow-hidden rounded-full bg-zinc-700">
                        <div
                          className="h-full bg-gradient-to-r from-blue-500 to-purple-500 transition-all duration-300"
                          style={{ width: `${upscaleForProResProgress}%` }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="mt-6 flex gap-3">
                <Button
                  variant="outline"
                  className="flex-1 border-zinc-600 text-white hover:bg-zinc-800"
                  onClick={() => setShowDownloadModal(false)}
                  disabled={proResConversionPhase !== 'idle'}
                >
                  キャンセル
                </Button>
                <Button
                  className="flex-1 bg-gradient-to-r from-blue-600 to-cyan-500"
                  onClick={handleDownload}
                  disabled={downloading !== null || isConverting || proResConversionPhase !== 'idle'}
                >
                  {downloading !== null || isConverting || proResConversionPhase !== 'idle' ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      {proResConversionPhase === 'upscaling' ? 'アップスケール中...' :
                       proResConversionPhase === 'converting' ? 'ProRes変換中...' :
                       isConverting ? 'ProRes変換中...' : 'ダウンロード中...'}
                    </>
                  ) : (
                    <>
                      <Download className="mr-2 h-4 w-4" />
                      ダウンロード
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
