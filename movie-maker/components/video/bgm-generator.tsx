"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { bgmApi, videosApi, BGMStatusResponse, BGMGenerationStatus } from "@/lib/api/client";
import { cn } from "@/lib/utils";
import {
  Music,
  Wand2,
  Loader2,
  Play,
  Pause,
  Volume2,
  Check,
  AlertCircle,
  RefreshCw,
  Sparkles,
  FileAudio,
} from "lucide-react";

interface BGMGeneratorProps {
  concatId: string;
  concatVideoUrl?: string;
  onBgmApplied?: (videoWithBgmUrl: string) => void;
}

const STATUS_MESSAGES: Record<BGMGenerationStatus, string> = {
  pending: "処理待機中...",
  analyzing: "動画を分析中...",
  generating: "AIでBGMを生成中...",
  syncing: "ビートを同期中...",
  completed: "BGM生成完了",
  failed: "生成に失敗しました",
};

const MOOD_LABELS: Record<string, string> = {
  upbeat: "アップビート",
  calm: "穏やか",
  dramatic: "ドラマチック",
  energetic: "エネルギッシュ",
  melancholic: "メランコリック",
  cinematic: "シネマティック",
};

const GENRE_LABELS: Record<string, string> = {
  electronic: "エレクトロニック",
  acoustic: "アコースティック",
  orchestral: "オーケストラ",
  pop: "ポップ",
  rock: "ロック",
  ambient: "アンビエント",
};

export function BGMGenerator({ concatId, concatVideoUrl, onBgmApplied }: BGMGeneratorProps) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [status, setStatus] = useState<BGMStatusResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  // 生成オプション
  const [autoAnalyze, setAutoAnalyze] = useState(true);
  const [syncToBeats, setSyncToBeats] = useState(true);
  const [customPrompt, setCustomPrompt] = useState("");

  // BGM適用オプション
  const [bgmVolume, setBgmVolume] = useState(0.6);
  const [originalVolume, setOriginalVolume] = useState(0.3);
  const [fadeIn, setFadeIn] = useState(0.5);
  const [fadeOut, setFadeOut] = useState(1.0);
  const [isApplying, setIsApplying] = useState(false);

  // BGMプレビュー
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioDuration, setAudioDuration] = useState(0);
  const [audioCurrentTime, setAudioCurrentTime] = useState(0);

  // ポーリング
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ステータスポーリング
  const startPolling = useCallback(() => {
    if (pollingRef.current) clearInterval(pollingRef.current);

    const poll = async () => {
      try {
        const res = await bgmApi.getStatus(concatId);
        setStatus(res);

        if (res.status === "completed" || res.status === "failed") {
          setIsGenerating(false);
          if (pollingRef.current) {
            clearInterval(pollingRef.current);
            pollingRef.current = null;
          }
          if (res.status === "failed") {
            setError(res.error_message || "BGM生成に失敗しました");
          }
        }
      } catch (err) {
        console.error("Failed to poll BGM status:", err);
      }
    };

    pollingRef.current = setInterval(poll, 3000);
    poll(); // 即時実行
  }, [concatId]);

  useEffect(() => {
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, []);

  // BGM生成開始
  const handleGenerate = async () => {
    setIsGenerating(true);
    setError(null);
    setStatus(null);

    try {
      const res = await bgmApi.generate(concatId, {
        auto_analyze: autoAnalyze,
        sync_to_beats: syncToBeats,
        custom_prompt: customPrompt || undefined,
      });
      setStatus({
        id: res.id,
        status: res.status,
        progress: res.progress,
        message: res.message,
        bgm_url: null,
        bgm_duration_seconds: null,
        auto_generated_prompt: null,
        detected_mood: null,
        detected_genre: null,
        detected_tempo_bpm: null,
        sync_quality_score: null,
        error_message: null,
      });
      startPolling();
    } catch (err) {
      setIsGenerating(false);
      setError(err instanceof Error ? err.message : "BGM生成の開始に失敗しました");
    }
  };

  // BGMを動画に適用
  const handleApply = async () => {
    if (!status?.id || !status.bgm_url) return;

    setIsApplying(true);
    setError(null);

    try {
      // BGM適用リクエスト送信
      await bgmApi.apply(concatId, {
        bgm_generation_id: status.id,
        volume: bgmVolume,
        original_audio_volume: originalVolume,
        fade_in_seconds: fadeIn,
        fade_out_seconds: fadeOut,
      });

      // ポーリングでBGM付き動画URLを待機
      const maxAttempts = 60; // 最大3分待機
      for (let i = 0; i < maxAttempts; i++) {
        await new Promise(resolve => setTimeout(resolve, 3000));

        try {
          const concatStatus = await videosApi.getConcatStatus(concatId) as { video_with_bgm_url?: string };

          if (concatStatus.video_with_bgm_url) {
            onBgmApplied?.(concatStatus.video_with_bgm_url);
            return;
          }
        } catch {
          // ポーリング中のエラーは無視
        }
      }

      setError("BGM適用がタイムアウトしました");
    } catch (err) {
      setError(err instanceof Error ? err.message : "BGM適用に失敗しました");
    } finally {
      setIsApplying(false);
    }
  };

  // オーディオプレビュー
  const togglePlay = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
    setIsPlaying(!isPlaying);
  };

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      setAudioCurrentTime(audioRef.current.currentTime);
    }
  };

  const handleLoadedMetadata = () => {
    if (audioRef.current) {
      setAudioDuration(audioRef.current.duration);
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  // プログレスバーの色
  const getProgressColor = (status: BGMGenerationStatus) => {
    switch (status) {
      case "completed":
        return "bg-emerald-500";
      case "failed":
        return "bg-red-500";
      case "generating":
        return "bg-[#fce300]";
      default:
        return "bg-[#00bdb6]";
    }
  };

  return (
    <div className="bg-zinc-900 rounded-xl border border-zinc-800 p-4">
      <div className="flex items-center gap-2 mb-4">
        <Music className="h-5 w-5 text-[#fce300]" />
        <h3 className="font-semibold text-white">AI BGM生成</h3>
      </div>

      {/* 生成オプション */}
      {!status?.bgm_url && !isGenerating && (
        <div className="space-y-4">
          {/* 自動分析トグル */}
          <label className="flex items-center gap-3 cursor-pointer group">
            <div
              className={cn(
                "w-10 h-6 rounded-full transition-colors relative",
                autoAnalyze ? "bg-[#00bdb6]" : "bg-zinc-700"
              )}
              onClick={() => setAutoAnalyze(!autoAnalyze)}
            >
              <div
                className={cn(
                  "absolute top-1 w-4 h-4 rounded-full bg-white transition-transform",
                  autoAnalyze ? "translate-x-5" : "translate-x-1"
                )}
              />
            </div>
            <div>
              <span className="text-sm text-white group-hover:text-zinc-200">動画を自動分析</span>
              <p className="text-xs text-zinc-500">映像の雰囲気からBGMを自動生成</p>
            </div>
          </label>

          {/* ビート同期トグル */}
          <label className="flex items-center gap-3 cursor-pointer group">
            <div
              className={cn(
                "w-10 h-6 rounded-full transition-colors relative",
                syncToBeats ? "bg-[#00bdb6]" : "bg-zinc-700"
              )}
              onClick={() => setSyncToBeats(!syncToBeats)}
            >
              <div
                className={cn(
                  "absolute top-1 w-4 h-4 rounded-full bg-white transition-transform",
                  syncToBeats ? "translate-x-5" : "translate-x-1"
                )}
              />
            </div>
            <div>
              <span className="text-sm text-white group-hover:text-zinc-200">ビート同期</span>
              <p className="text-xs text-zinc-500">カット切り替えをBGMのビートに合わせる</p>
            </div>
          </label>

          {/* カスタムプロンプト */}
          <div>
            <label className="block text-sm text-zinc-400 mb-1.5">
              カスタムプロンプト（任意）
            </label>
            <textarea
              value={customPrompt}
              onChange={(e) => setCustomPrompt(e.target.value)}
              placeholder="例: upbeat electronic music with synth, 120 BPM"
              className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white text-sm placeholder:text-zinc-500 focus:outline-none focus:border-[#00bdb6] resize-none"
              rows={2}
              disabled={autoAnalyze}
            />
            {autoAnalyze && (
              <p className="text-xs text-zinc-500 mt-1">
                自動分析がONの場合、プロンプトは自動生成されます
              </p>
            )}
          </div>

          {/* 生成ボタン */}
          <Button
            onClick={handleGenerate}
            disabled={isGenerating}
            className="w-full bg-gradient-to-r from-[#fce300] to-[#00bdb6] text-zinc-900 font-medium hover:opacity-90"
          >
            <Wand2 className="h-4 w-4 mr-2" />
            AIでBGMを生成
          </Button>
        </div>
      )}

      {/* 生成中の進捗表示 */}
      {isGenerating && status && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <Loader2 className="h-5 w-5 text-[#fce300] animate-spin" />
            <div className="flex-1">
              <p className="text-sm text-white">{STATUS_MESSAGES[status.status]}</p>
              <p className="text-xs text-zinc-500">{status.progress}% 完了</p>
            </div>
          </div>

          {/* プログレスバー */}
          <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
            <div
              className={cn("h-full transition-all duration-500", getProgressColor(status.status))}
              style={{ width: `${status.progress}%` }}
            />
          </div>

          {/* 自動生成されたプロンプト表示 */}
          {status.auto_generated_prompt && (
            <div className="bg-zinc-800/50 rounded-lg p-3">
              <p className="text-xs text-zinc-400 mb-1">生成されたプロンプト:</p>
              <p className="text-sm text-zinc-300">{status.auto_generated_prompt}</p>
            </div>
          )}
        </div>
      )}

      {/* 生成完了 */}
      {status?.status === "completed" && status.bgm_url && (
        <div className="space-y-4">
          {/* 成功メッセージ */}
          <div className="flex items-center gap-2 text-emerald-400">
            <Check className="h-5 w-5" />
            <span className="text-sm font-medium">BGM生成完了</span>
          </div>

          {/* 分析結果 */}
          <div className="grid grid-cols-2 gap-2">
            {status.detected_mood && (
              <div className="bg-zinc-800 rounded-lg p-2">
                <p className="text-xs text-zinc-500">ムード</p>
                <p className="text-sm text-white">{MOOD_LABELS[status.detected_mood] || status.detected_mood}</p>
              </div>
            )}
            {status.detected_genre && (
              <div className="bg-zinc-800 rounded-lg p-2">
                <p className="text-xs text-zinc-500">ジャンル</p>
                <p className="text-sm text-white">{GENRE_LABELS[status.detected_genre] || status.detected_genre}</p>
              </div>
            )}
            {status.detected_tempo_bpm && (
              <div className="bg-zinc-800 rounded-lg p-2">
                <p className="text-xs text-zinc-500">テンポ</p>
                <p className="text-sm text-white">{status.detected_tempo_bpm} BPM</p>
              </div>
            )}
            {status.sync_quality_score !== null && (
              <div className="bg-zinc-800 rounded-lg p-2">
                <p className="text-xs text-zinc-500">同期品質</p>
                <p className="text-sm text-white">{Math.round(status.sync_quality_score * 100)}%</p>
              </div>
            )}
          </div>

          {/* BGMプレビュー */}
          <div className="bg-zinc-800 rounded-lg p-3">
            <div className="flex items-center gap-3">
              <button
                onClick={togglePlay}
                className="w-10 h-10 rounded-full bg-[#fce300] flex items-center justify-center text-zinc-900 hover:opacity-90 transition-opacity"
              >
                {isPlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5 ml-0.5" />}
              </button>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <FileAudio className="h-4 w-4 text-zinc-400" />
                  <span className="text-sm text-white">生成されたBGM</span>
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-xs text-zinc-500">{formatTime(audioCurrentTime)}</span>
                  <div className="flex-1 h-1 bg-zinc-700 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[#00bdb6]"
                      style={{ width: audioDuration ? `${(audioCurrentTime / audioDuration) * 100}%` : "0%" }}
                    />
                  </div>
                  <span className="text-xs text-zinc-500">
                    {formatTime(status.bgm_duration_seconds || audioDuration)}
                  </span>
                </div>
              </div>
            </div>
            <audio
              ref={audioRef}
              src={status.bgm_url}
              onTimeUpdate={handleTimeUpdate}
              onLoadedMetadata={handleLoadedMetadata}
              onEnded={() => setIsPlaying(false)}
            />
          </div>

          {/* 音量調整 */}
          <div className="space-y-3">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs text-zinc-400">BGM音量</label>
                <span className="text-xs text-zinc-500">{Math.round(bgmVolume * 100)}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={bgmVolume}
                onChange={(e) => setBgmVolume(parseFloat(e.target.value))}
                className="w-full h-1.5 bg-zinc-700 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-[#fce300] [&::-webkit-slider-thumb]:rounded-full"
              />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs text-zinc-400">元音声音量</label>
                <span className="text-xs text-zinc-500">{Math.round(originalVolume * 100)}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={originalVolume}
                onChange={(e) => setOriginalVolume(parseFloat(e.target.value))}
                className="w-full h-1.5 bg-zinc-700 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-[#00bdb6] [&::-webkit-slider-thumb]:rounded-full"
              />
            </div>
          </div>

          {/* フェード設定 */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-zinc-400 block mb-1">フェードイン</label>
              <select
                value={fadeIn}
                onChange={(e) => setFadeIn(parseFloat(e.target.value))}
                className="w-full px-2 py-1.5 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-white focus:outline-none focus:border-[#00bdb6]"
              >
                <option value="0">なし</option>
                <option value="0.5">0.5秒</option>
                <option value="1">1秒</option>
                <option value="2">2秒</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-zinc-400 block mb-1">フェードアウト</label>
              <select
                value={fadeOut}
                onChange={(e) => setFadeOut(parseFloat(e.target.value))}
                className="w-full px-2 py-1.5 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-white focus:outline-none focus:border-[#00bdb6]"
              >
                <option value="0">なし</option>
                <option value="0.5">0.5秒</option>
                <option value="1">1秒</option>
                <option value="2">2秒</option>
              </select>
            </div>
          </div>

          {/* 適用ボタン */}
          <Button
            onClick={handleApply}
            disabled={isApplying}
            className="w-full bg-[#fce300] text-zinc-900 font-medium hover:bg-[#fce300]/90"
          >
            {isApplying ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                BGMを適用中...
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4 mr-2" />
                BGMを動画に適用
              </>
            )}
          </Button>

          {/* 再生成ボタン */}
          <Button
            onClick={() => {
              setStatus(null);
              setError(null);
            }}
            variant="outline"
            className="w-full border-zinc-700 text-zinc-400 hover:text-white hover:border-zinc-600"
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            別のBGMを生成
          </Button>
        </div>
      )}

      {/* エラー表示 */}
      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-lg mt-4">
          <AlertCircle className="h-4 w-4 text-red-400 flex-shrink-0" />
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}
    </div>
  );
}
