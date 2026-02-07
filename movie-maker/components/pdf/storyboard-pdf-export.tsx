"use client";

import { useState, useCallback } from "react";
import { pdf } from "@react-pdf/renderer";
import { saveAs } from "file-saver";
import { Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  StoryboardPDFDocument,
  type StoryboardPDFDocumentProps,
  type PDFCutData,
} from "./storyboard-pdf-document";
import { registerFonts } from "@/lib/pdf/fonts";
import { imageUrlToBase64 } from "@/lib/pdf/image-utils";

// モジュール読み込み時にフォントを登録（重要）
registerFonts();

export interface StoryboardPDFExportProps {
  /** CM構成理論ラベル */
  theoryLabel: string;
  /** 合計秒数 */
  totalDuration: number;
  /** カット一覧（EditableCut互換、画像URL含む） */
  cuts: PDFCutData[];
  /** スクリプトID（ファイル名に使用） */
  scriptId: string;
  /** プロジェクト名（オプション） */
  projectTitle?: string;
  /** ボタン無効化 */
  disabled?: boolean;
}

export function StoryboardPDFExportInternal({
  theoryLabel,
  totalDuration,
  cuts,
  scriptId,
  projectTitle,
  disabled,
}: StoryboardPDFExportProps) {
  const [isGenerating, setIsGenerating] = useState(false);

  const handleExport = useCallback(async () => {
    // カット数チェック
    if (cuts.length === 0) {
      alert("カットがありません。PDF出力できません。");
      return;
    }

    setIsGenerating(true);
    try {
      // デバッグ: 渡されたcutsデータを確認
      console.log("=== PDF Export Debug ===");
      cuts.forEach((cut, i) => {
        console.log(`Cut ${i + 1}:`, {
          id: cut.id,
          hasVideo: !!cut.video,
          thumbnailUrl: cut.video?.thumbnailUrl || "なし",
          generatedImageUrl: cut.generatedImageUrl || "なし",
        });
      });

      // 画像をBase64に変換（CORS回避）
      const cutsWithBase64: PDFCutData[] = await Promise.all(
        cuts.map(async (cut) => {
          // 画像URLを取得（優先順位: thumbnailUrl > generatedImageUrl）
          const imageUrl = cut.video?.thumbnailUrl || cut.generatedImageUrl;
          if (!imageUrl) {
            return cut;
          }

          // Base64に変換
          const imageBase64 = await imageUrlToBase64(imageUrl);
          return {
            ...cut,
            imageBase64: imageBase64 || undefined,
          };
        })
      );

      const docProps: StoryboardPDFDocumentProps = {
        theoryLabel,
        totalDuration,
        cuts: cutsWithBase64,
        projectTitle,
      };

      const doc = <StoryboardPDFDocument {...docProps} />;
      const blob = await pdf(doc).toBlob();

      const filename = `storyboard_${scriptId}_${new Date().toISOString().slice(0, 10)}.pdf`;
      saveAs(blob, filename);
    } catch (error) {
      console.error("PDF generation failed:", error);
      alert("PDF生成に失敗しました。もう一度お試しください。");
    } finally {
      setIsGenerating(false);
    }
  }, [theoryLabel, totalDuration, cuts, scriptId, projectTitle]);

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={handleExport}
      disabled={disabled || isGenerating}
      className="gap-1"
    >
      {isGenerating ? (
        <Loader2 className="w-4 h-4 animate-spin" />
      ) : (
        <Download className="w-4 h-4" />
      )}
      PDF出力
    </Button>
  );
}
