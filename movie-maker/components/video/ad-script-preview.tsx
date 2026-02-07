"use client";

import { useMemo, useState, useCallback } from "react";
import { cn } from "@/lib/utils";
import { ArrowLeft, ArrowRight, RefreshCw, Clock, Film, Sparkles, Edit2, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AdScriptResponse, AdCut } from "@/lib/api/client";

interface AdScriptPreviewProps {
  script: AdScriptResponse;
  /** 選択されたCM尺（秒）- 前のページで確定済み */
  targetDuration: number;
  onBack: () => void;
  onConfirm: (editedCuts: AdCut[]) => void;
  onRegenerate: () => void;
  isRegenerating?: boolean;
}

export function AdScriptPreview({
  script,
  targetDuration,
  onBack,
  onConfirm,
  onRegenerate,
  isRegenerating = false,
}: AdScriptPreviewProps) {
  // 編集中のカットを管理
  const [editedCuts, setEditedCuts] = useState<AdCut[]>(script.cuts);
  const [editingCutId, setEditingCutId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");

  // カットの編集を開始
  const handleStartEdit = useCallback((cut: AdCut) => {
    setEditingCutId(cut.id);
    setEditingText(cut.description_ja);
  }, []);

  // カットの編集をキャンセル
  const handleCancelEdit = useCallback(() => {
    setEditingCutId(null);
    setEditingText("");
  }, []);

  // カットの編集を保存
  const handleSaveEdit = useCallback((cutId: string) => {
    setEditedCuts((prev) =>
      prev.map((cut) =>
        cut.id === cutId ? { ...cut, description_ja: editingText } : cut
      )
    );
    setEditingCutId(null);
    setEditingText("");
  }, [editingText]);

  // 確定時に編集済みカットを渡す
  const handleConfirm = useCallback(() => {
    onConfirm(editedCuts);
  }, [editedCuts, onConfirm]);

  // 理論の詳細情報
  const theoryInfo = useMemo(() => {
    switch (script.theory) {
      case "aida":
        return {
          name: "AIDA法",
          description: "注目 → 興味 → 欲求 → 行動",
          detail: "シンプルで効果的な広告構造。商品の魅力を段階的に伝え、購買行動へ導きます。",
          color: "bg-blue-500/10 border-blue-500/30 text-blue-600 dark:text-blue-400",
          iconBg: "bg-blue-500",
        };
      case "pasona":
        return {
          name: "PASONA法",
          description: "問題 → 共感 → 解決 → 提案 → 絞込 → 行動",
          detail: "課題解決型の広告構造。視聴者の悩みに寄り添い、解決策として商品を提示します。",
          color: "bg-purple-500/10 border-purple-500/30 text-purple-600 dark:text-purple-400",
          iconBg: "bg-purple-500",
        };
      case "kishoutenketsu":
        return {
          name: "起承転結",
          description: "導入 → 展開 → 転換 → 結末",
          detail: "ストーリー重視の広告構造。物語性で視聴者を引き込み、印象に残る広告を作ります。",
          color: "bg-green-500/10 border-green-500/30 text-green-600 dark:text-green-400",
          iconBg: "bg-green-500",
        };
      case "storytelling":
        return {
          name: "ストーリーテリング",
          description: "フック → 課題 → 旅 → 発見 → 変化 → CTA",
          detail: "感情訴求型の広告構造。主人公の変化を通じて、商品の価値を感動的に伝えます。",
          color: "bg-orange-500/10 border-orange-500/30 text-orange-600 dark:text-orange-400",
          iconBg: "bg-orange-500",
        };
      default:
        return {
          name: "カスタム",
          description: "",
          detail: "",
          color: "bg-gray-500/10 border-gray-500/30 text-gray-600 dark:text-gray-400",
          iconBg: "bg-gray-500",
        };
    }
  }, [script.theory]);

  return (
    <div className="flex flex-col items-center px-4 py-8 max-w-3xl mx-auto">
      {/* タイトル */}
      <div className="flex items-center gap-2 mb-2">
        <Sparkles className="w-5 h-5 text-primary" />
        <h2 className="text-xl font-semibold">AIが脚本を作成しました</h2>
      </div>
      <p className="text-sm text-muted-foreground mb-8 text-center">
        内容を確認して、よければカット編集に進んでください
      </p>

      {/* 採用された広告理論 */}
      <div className={cn(
        "w-full p-4 rounded-xl border-2 mb-6",
        theoryInfo.color
      )}>
        <div className="flex items-start gap-4">
          <div className={cn(
            "w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0",
            theoryInfo.iconBg
          )}>
            <Film className="w-6 h-6 text-white" />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <h3 className="font-semibold text-lg">{theoryInfo.name}</h3>
              <span className="text-xs px-2 py-0.5 rounded-full bg-background/50">
                採用された理論
              </span>
            </div>
            <p className="text-sm font-medium mb-1">{theoryInfo.description}</p>
            <p className="text-sm opacity-80">{theoryInfo.detail}</p>
          </div>
        </div>
      </div>

      {/* CM尺表示（前のページで確定済み） */}
      <div className="w-full p-4 rounded-lg border bg-card mb-6">
        <div className="flex items-center gap-2 text-muted-foreground mb-2">
          <Clock className="w-4 h-4" />
          <span className="text-sm font-medium">選択されたCM尺</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="px-4 py-2 rounded-lg text-sm font-medium bg-primary text-primary-foreground">
            {targetDuration}秒
          </span>
          <span className="text-xs text-muted-foreground">
            ※ CM尺を変更するには「戻る」を押してください
          </span>
        </div>
      </div>

      {/* サマリー情報 */}
      <div className="w-full grid grid-cols-2 gap-4 mb-6">
        <div className="p-4 rounded-lg border bg-card">
          <div className="flex items-center gap-2 text-muted-foreground mb-1">
            <Clock className="w-4 h-4" />
            <span className="text-sm">AI提案尺</span>
          </div>
          <p className="text-2xl font-bold">{script.total_duration}秒</p>
        </div>
        <div className="p-4 rounded-lg border bg-card">
          <div className="flex items-center gap-2 text-muted-foreground mb-1">
            <Film className="w-4 h-4" />
            <span className="text-sm">カット数</span>
          </div>
          <p className="text-2xl font-bold">{script.cuts.length}カット</p>
        </div>
      </div>

      {/* カット一覧プレビュー */}
      <div className="w-full mb-8">
        <h3 className="text-sm font-medium text-muted-foreground mb-3">
          カット構成
          <span className="ml-2 text-xs font-normal">（クリックで編集可能）</span>
        </h3>
        <div className="space-y-2">
          {editedCuts.map((cut, index) => (
            <div
              key={cut.id}
              className="flex items-start gap-3 p-3 rounded-lg border bg-card"
            >
              {/* カット番号 */}
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                <span className="text-sm font-semibold text-primary">
                  {index + 1}
                </span>
              </div>

              {/* カット情報 */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-xs px-2 py-0.5 rounded bg-muted font-medium">
                    {cut.scene_type_label}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {cut.duration}秒
                  </span>
                </div>

                {/* 編集モード */}
                {editingCutId === cut.id ? (
                  <div className="mt-2">
                    <textarea
                      value={editingText}
                      onChange={(e) => setEditingText(e.target.value)}
                      className={cn(
                        "w-full px-3 py-2 rounded border bg-background text-sm resize-none min-h-[80px]",
                        "focus:outline-none focus:ring-2 focus:ring-primary"
                      )}
                      autoFocus
                    />
                    <div className="flex justify-end gap-2 mt-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleCancelEdit}
                        className="h-7 px-2 text-xs"
                      >
                        <X className="w-3.5 h-3.5 mr-1" />
                        キャンセル
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => handleSaveEdit(cut.id)}
                        className="h-7 px-2 text-xs"
                      >
                        <Check className="w-3.5 h-3.5 mr-1" />
                        保存
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div
                    onClick={() => handleStartEdit(cut)}
                    className={cn(
                      "cursor-pointer group p-2 -m-2 rounded hover:bg-muted/50 transition-colors"
                    )}
                  >
                    <div className="flex items-start justify-between">
                      <p className="text-sm flex-1">{cut.description_ja}</p>
                      <Edit2 className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity ml-2 flex-shrink-0" />
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* アクションボタン */}
      <div className="w-full flex flex-col sm:flex-row gap-3">
        <Button
          variant="ghost"
          onClick={onBack}
          disabled={isRegenerating}
          className="gap-2"
        >
          <ArrowLeft className="w-4 h-4" />
          戻る
        </Button>
        <Button
          variant="outline"
          onClick={onRegenerate}
          disabled={isRegenerating}
          className="gap-2"
        >
          <RefreshCw className={cn("w-4 h-4", isRegenerating && "animate-spin")} />
          {isRegenerating ? "再生成中..." : "別の構成で再生成"}
        </Button>
        <Button
          onClick={handleConfirm}
          disabled={isRegenerating || editingCutId !== null}
          className="flex-1 gap-2"
        >
          {targetDuration}秒CMでカット編集へ
          <ArrowRight className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}
