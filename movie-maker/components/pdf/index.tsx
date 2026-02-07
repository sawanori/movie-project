"use client";

import dynamic from "next/dynamic";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

// SSRを無効化してPDFコンポーネントを読み込み
// v2: 画像対応版
const StoryboardPDFExportInternal = dynamic(
  () =>
    import("./storyboard-pdf-export").then(
      (mod) => mod.StoryboardPDFExportInternal
    ),
  {
    ssr: false,
    loading: () => (
      <Button variant="outline" size="sm" disabled className="gap-1">
        <Loader2 className="w-4 h-4 animate-spin" />
        読込中...
      </Button>
    ),
  }
);

// 公開用コンポーネント（型を再エクスポート）
export type { StoryboardPDFExportProps } from "./storyboard-pdf-export";
export type { PDFCutData } from "./storyboard-pdf-document";
export { StoryboardPDFExportInternal as StoryboardPDFExport };
