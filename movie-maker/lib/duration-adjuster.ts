/**
 * CM尺の自動調整ユーティリティ
 *
 * カットの秒数を均等に分配し、1カット変更時に他のカットを自動調整する
 */

import { EditableCut } from "@/components/video/ad-cut-card";

/**
 * 秒数を均等に分配する（整数秒のみ）
 * 端数は先頭カットから1秒ずつ追加
 *
 * @example
 * // 15秒を4カットで分配
 * // 15 ÷ 4 = 3 余り 3
 * // 結果: [4, 4, 4, 3]
 */
export function distributeDurations(
  cuts: EditableCut[],
  targetTotal: number
): EditableCut[] {
  if (cuts.length === 0) return cuts;

  const cutCount = cuts.length;

  // カット数が目標秒数より多い場合はエラー（各カット最低1秒必要）
  if (cutCount > targetTotal) {
    console.warn(`カット数(${cutCount})が目標秒数(${targetTotal})を超えています`);
    // 全カット1秒で返す
    return cuts.map((cut) => ({
      ...cut,
      duration: 1,
      video: adjustVideoTrim(cut.video, 1),
    }));
  }

  const baseDuration = Math.floor(targetTotal / cutCount);
  const remainder = targetTotal % cutCount;

  return cuts.map((cut, index) => {
    // 余りを先頭から1秒ずつ追加
    const newDuration = baseDuration + (index < remainder ? 1 : 0);
    return {
      ...cut,
      duration: newDuration,
      video: adjustVideoTrim(cut.video, newDuration),
    };
  });
}

/**
 * 1カットの秒数変更時に他のカットを均等に調整
 *
 * @param cuts 全カット
 * @param changedCutId 変更されたカットのID
 * @param newDuration 新しい秒数
 * @param targetTotal CM全体の目標尺（秒）
 */
export function adjustDurationsOnChange(
  cuts: EditableCut[],
  changedCutId: string,
  newDuration: number,
  targetTotal: number
): EditableCut[] {
  if (cuts.length === 0) return cuts;

  // カットが1つしかない場合は目標尺に設定
  if (cuts.length === 1) {
    return cuts.map((cut) => ({
      ...cut,
      duration: targetTotal,
      video: adjustVideoTrim(cut.video, targetTotal),
    }));
  }

  // 変更カット以外の合計（最後のカットを除く）
  const lastCut = cuts[cuts.length - 1];
  const isChangingLastCut = lastCut.id === changedCutId;

  // 変更したカットの秒数を適用し、最後のカットで帳尻を合わせる
  const updatedCuts = cuts.map((cut) =>
    cut.id === changedCutId ? { ...cut, duration: newDuration } : cut
  );

  if (isChangingLastCut) {
    // 最後のカット自体を変更した場合は、最後から2番目で帳尻合わせ
    const adjustIndex = cuts.length - 2;
    const othersTotal = updatedCuts.reduce((sum, cut, i) =>
      i !== adjustIndex ? sum + cut.duration : sum, 0);
    const adjustedDuration = targetTotal - othersTotal;

    if (adjustedDuration < 1) {
      // 収まらない場合は変更カットの秒数をクランプ
      const maxForLast = targetTotal - (cuts.length - 1); // 他カット各1秒
      return cuts.map((cut, i) => {
        if (cut.id === changedCutId) {
          const d = Math.min(newDuration, maxForLast);
          return { ...cut, duration: d, video: adjustVideoTrim(cut.video, d) };
        }
        if (i === adjustIndex) {
          const d = Math.max(1, targetTotal - Math.min(newDuration, maxForLast) -
            cuts.reduce((s, c, j) => j !== adjustIndex && c.id !== changedCutId ? s + c.duration : s, 0));
          return { ...cut, duration: d, video: adjustVideoTrim(cut.video, d) };
        }
        return cut;
      });
    }

    return updatedCuts.map((cut, i) => {
      if (i === adjustIndex) {
        return { ...cut, duration: adjustedDuration, video: adjustVideoTrim(cut.video, adjustedDuration) };
      }
      return cut;
    });
  } else {
    // 最後のカット以外を変更した場合 → 最後のカットで帳尻合わせ
    const othersTotal = updatedCuts.reduce((sum, cut, i) =>
      i !== cuts.length - 1 ? sum + cut.duration : sum, 0);
    const lastDuration = targetTotal - othersTotal;

    if (lastDuration < 1) {
      // 最後のカットが1秒未満になる場合、変更カットの秒数をクランプ
      const maxAllowed = targetTotal - (cuts.length - 1); // 他カット各1秒として
      const clampedDuration = Math.min(newDuration, maxAllowed);
      const recalcOthers = cuts.reduce((sum, cut, i) => {
        if (cut.id === changedCutId || i === cuts.length - 1) return sum;
        return sum + cut.duration;
      }, 0);
      const finalLastDuration = targetTotal - clampedDuration - recalcOthers;

      return cuts.map((cut, i) => {
        if (cut.id === changedCutId) {
          return { ...cut, duration: clampedDuration, video: adjustVideoTrim(cut.video, clampedDuration) };
        }
        if (i === cuts.length - 1) {
          const d = Math.max(1, finalLastDuration);
          return { ...cut, duration: d, video: adjustVideoTrim(cut.video, d) };
        }
        return cut;
      });
    }

    return updatedCuts.map((cut, i) => {
      if (i === cuts.length - 1) {
        return { ...cut, duration: lastDuration, video: adjustVideoTrim(cut.video, lastDuration) };
      }
      return cut;
    });
  }
}

/**
 * カット追加時に秒数を再分配
 */
export function redistributeOnAdd(
  cuts: EditableCut[],
  targetTotal: number
): EditableCut[] {
  return distributeDurations(cuts, targetTotal);
}

/**
 * カット削除時に秒数を再分配
 */
export function redistributeOnDelete(
  cuts: EditableCut[],
  targetTotal: number
): EditableCut[] {
  return distributeDurations(cuts, targetTotal);
}

/**
 * 累積時間（startTime）を計算
 *
 * @returns 各カットの開始時間（秒）の配列
 */
export function calculateStartTimes(cuts: EditableCut[]): number[] {
  const startTimes: number[] = [];
  let cumulative = 0;

  for (const cut of cuts) {
    startTimes.push(cumulative);
    cumulative += cut.duration;
  }

  return startTimes;
}

/**
 * 秒数をMM:SS形式にフォーマット
 */
export function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
}

/**
 * 動画のトリム範囲を新しい秒数に合わせて調整
 */
function adjustVideoTrim(
  video: EditableCut["video"],
  newDuration: number
): EditableCut["video"] {
  if (!video) return null;

  const currentTrimDuration = video.trimEnd - video.trimStart;

  // 現在のトリム範囲が新しい秒数より長い場合、調整
  if (currentTrimDuration > newDuration) {
    return {
      ...video,
      trimEnd: video.trimStart + newDuration,
    };
  }

  return video;
}

/**
 * 目標秒数を変更する際の検証
 */
export function validateTargetDuration(
  cutCount: number,
  targetDuration: number
): { valid: boolean; message?: string } {
  if (targetDuration < cutCount) {
    return {
      valid: false,
      message: `目標秒数(${targetDuration}秒)がカット数(${cutCount})より小さいです。各カット最低1秒必要です。`,
    };
  }
  return { valid: true };
}

/**
 * カット秒数変更の検証
 */
export function validateDurationChange(
  cuts: EditableCut[],
  changedCutId: string,
  newDuration: number,
  targetTotal: number
): { valid: boolean; message?: string; adjustedDuration?: number } {
  const otherCutCount = cuts.filter((cut) => cut.id !== changedCutId).length;
  const maxAllowedDuration = targetTotal - otherCutCount; // 他のカット各1秒として

  if (newDuration < 1) {
    return {
      valid: false,
      message: "秒数は1秒以上必要です",
    };
  }

  if (newDuration > maxAllowedDuration) {
    return {
      valid: false,
      message: `最大${maxAllowedDuration}秒まで設定可能です`,
      adjustedDuration: maxAllowedDuration,
    };
  }

  return { valid: true };
}
