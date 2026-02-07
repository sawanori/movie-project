import {
  Document,
  Page,
  Text,
  View,
  Image,
  StyleSheet,
} from "@react-pdf/renderer";

// EditableCut互換の型定義（video.thumbnailUrl, generatedImageUrlを含む）
export interface PDFCutData {
  id: string;
  cut_number: number;
  scene_type_label: string;
  description_ja: string;
  duration: number;
  dialogue?: string;
  sound_effect?: string;
  // 画像URL（EditableCutから取得）
  video?: {
    thumbnailUrl?: string;
  } | null;
  generatedImageUrl?: string;
  // Base64変換済み画像データ（CORS回避用）
  imageBase64?: string;
}

export interface StoryboardPDFDocumentProps {
  /** CM構成理論ラベル（例: "AIDA法"） */
  theoryLabel: string;
  /** 合計秒数 */
  totalDuration: number;
  /** カット一覧 */
  cuts: PDFCutData[];
  /** プロジェクト名（オプション） */
  projectTitle?: string;
}

const styles = StyleSheet.create({
  page: {
    fontFamily: "NotoSansJP",
    fontSize: 9,
    padding: 30,
  },
  header: {
    marginBottom: 15,
  },
  title: {
    fontSize: 16,
    marginBottom: 6,
  },
  meta: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  metaItem: {
    fontSize: 9,
  },
  table: {
    display: "flex",
    flexDirection: "column",
    border: "1pt solid #333",
  },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: "#e8e8e8",
    borderBottom: "1pt solid #333",
  },
  tableRow: {
    flexDirection: "row",
    borderBottom: "0.5pt solid #ccc",
    minHeight: 100,
  },
  tableRowLast: {
    flexDirection: "row",
    minHeight: 100,
  },
  cell: {
    padding: 4,
    borderRight: "0.5pt solid #ccc",
    justifyContent: "center",
  },
  cellHeader: {
    padding: 4,
    borderRight: "0.5pt solid #ccc",
    justifyContent: "center",
    fontSize: 8,
  },
  // カラム幅調整（縦長A4用 + TIMEカラム）
  cellTime: { width: "10%", textAlign: "center", alignItems: "center" },
  cellNumber: { width: "4%" },
  cellImage: { width: "16%", padding: 2 },
  cellType: { width: "9%" },
  cellDescription: { width: "24%" },
  cellDialogue: { width: "18%" },
  cellSE: { width: "19%", borderRight: "none" },
  // TIME表示用スタイル
  timeText: {
    fontSize: 8,
    textAlign: "center",
  },
  timeArrow: {
    fontSize: 8,
    textAlign: "center",
    marginVertical: 2,
  },
  timeDuration: {
    fontSize: 7,
    textAlign: "center",
    color: "#666",
    marginTop: 2,
  },
  // 画像スタイル
  thumbnail: {
    width: "100%",
    height: 80,
    objectFit: "contain",
    backgroundColor: "#f5f5f5",
  },
  noImage: {
    width: "100%",
    height: 80,
    backgroundColor: "#f0f0f0",
    justifyContent: "center",
    alignItems: "center",
  },
  noImageText: {
    fontSize: 7,
    color: "#999",
  },
  footer: {
    position: "absolute",
    bottom: 20,
    left: 30,
    right: 30,
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: 7,
    color: "#666",
  },
  emptyMessage: {
    padding: 20,
    textAlign: "center",
    color: "#666",
  },
});

/**
 * 秒数をMM:SS形式に変換
 */
function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
}

/**
 * カットの画像データを取得
 * 優先順位: imageBase64 > video.thumbnailUrl > generatedImageUrl
 */
function getCutImageData(cut: PDFCutData): string | null {
  // Base64が事前に設定されていればそれを使用（CORS回避）
  if (cut.imageBase64) {
    return cut.imageBase64;
  }
  // フォールバック: 元のURL（CORS許可されている場合のみ動作）
  if (cut.video?.thumbnailUrl) {
    return cut.video.thumbnailUrl;
  }
  if (cut.generatedImageUrl) {
    return cut.generatedImageUrl;
  }
  return null;
}

export function StoryboardPDFDocument({
  theoryLabel,
  totalDuration,
  cuts,
  projectTitle,
}: StoryboardPDFDocumentProps) {
  const today = new Date().toLocaleDateString("ja-JP");

  // 各カットの開始時間を計算
  const startTimes: number[] = [];
  let cumulative = 0;
  for (const cut of cuts) {
    startTimes.push(cumulative);
    cumulative += cut.duration;
  }

  return (
    <Document>
      <Page size="A4" orientation="portrait" style={styles.page}>
        {/* ヘッダー */}
        <View style={styles.header}>
          <Text style={styles.title}>{projectTitle || "CM絵コンテ"}</Text>
          <View style={styles.meta}>
            <Text style={styles.metaItem}>構成理論: {theoryLabel}</Text>
            <Text style={styles.metaItem}>合計尺: {totalDuration}秒</Text>
            <Text style={styles.metaItem}>{today}</Text>
          </View>
        </View>

        {/* テーブル */}
        <View style={styles.table}>
          {/* ヘッダー行 */}
          <View style={styles.tableHeader}>
            <Text style={[styles.cellHeader, styles.cellTime]}>TIME</Text>
            <Text style={[styles.cellHeader, styles.cellNumber]}>#</Text>
            <Text style={[styles.cellHeader, styles.cellImage]}>絵</Text>
            <Text style={[styles.cellHeader, styles.cellType]}>シーン</Text>
            <Text style={[styles.cellHeader, styles.cellDescription]}>
              内容説明
            </Text>
            <Text style={[styles.cellHeader, styles.cellDialogue]}>セリフ</Text>
            <Text style={[styles.cellHeader, styles.cellSE]}>効果音/SE</Text>
          </View>

          {/* データ行 */}
          {cuts.length === 0 ? (
            <View style={styles.emptyMessage}>
              <Text>カットがありません</Text>
            </View>
          ) : (
            cuts.map((cut, index) => {
              const imageData = getCutImageData(cut);
              const startTime = startTimes[index];
              const endTime = startTime + cut.duration;
              return (
                <View
                  key={cut.id}
                  style={
                    index === cuts.length - 1
                      ? styles.tableRowLast
                      : styles.tableRow
                  }
                >
                  {/* TIMEカラム */}
                  <View style={[styles.cell, styles.cellTime]}>
                    <Text style={styles.timeText}>{formatTime(startTime)}</Text>
                    <Text style={styles.timeArrow}>↓</Text>
                    <Text style={styles.timeText}>{formatTime(endTime)}</Text>
                    <Text style={styles.timeDuration}>({cut.duration}秒)</Text>
                  </View>
                  <Text style={[styles.cell, styles.cellNumber]}>
                    {cut.cut_number}
                  </Text>
                  <View style={[styles.cell, styles.cellImage]}>
                    {imageData ? (
                      <Image src={imageData} style={styles.thumbnail} />
                    ) : (
                      <View style={styles.noImage}>
                        <Text style={styles.noImageText}>No Image</Text>
                      </View>
                    )}
                  </View>
                  <Text style={[styles.cell, styles.cellType]}>
                    {cut.scene_type_label}
                  </Text>
                  <Text style={[styles.cell, styles.cellDescription]}>
                    {cut.description_ja || "-"}
                  </Text>
                  <Text style={[styles.cell, styles.cellDialogue]}>
                    {cut.dialogue || "-"}
                  </Text>
                  <Text style={[styles.cell, styles.cellSE]}>
                    {cut.sound_effect || "-"}
                  </Text>
                </View>
              );
            })
          )}
        </View>

        {/* フッター */}
        <View style={styles.footer} fixed>
          <Text>Generated by NonTurn.LLC</Text>
          <Text
            render={({ pageNumber, totalPages }) =>
              `Page ${pageNumber} of ${totalPages}`
            }
          />
        </View>
      </Page>
    </Document>
  );
}
