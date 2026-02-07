"use client";

import { useCallback, useRef, useState, useEffect } from "react";

interface RangeSliderProps {
  min: number;
  max: number;
  step?: number;
  minRange?: number;
  value: [number, number];
  onChange: (value: [number, number]) => void;
  formatLabel?: (value: number) => string;
  disabled?: boolean;
  className?: string;
  /** スライダー上でホバー時に対応する時間値を通知 */
  onHoverTime?: (time: number) => void;
  /** スライダーからマウスが離れた時に通知 */
  onHoverEnd?: () => void;
}

export function RangeSlider({
  min,
  max,
  step = 0.1,
  minRange = 0.5,
  value,
  onChange,
  formatLabel = (v) => `${v.toFixed(1)}s`,
  disabled = false,
  className = "",
  onHoverTime,
  onHoverEnd,
}: RangeSliderProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState<"start" | "end" | null>(null);
  const [hoverTime, setHoverTime] = useState<number | null>(null);

  const getPercentage = (val: number) => ((val - min) / (max - min)) * 100;

  const getValueFromPosition = useCallback(
    (clientX: number) => {
      if (!trackRef.current) return min;
      const rect = trackRef.current.getBoundingClientRect();
      const percentage = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      const rawValue = min + percentage * (max - min);
      // step に丸める
      return Math.round(rawValue / step) * step;
    },
    [min, max, step]
  );

  const handleMouseDown = (e: React.MouseEvent, handle: "start" | "end") => {
    if (disabled) return;
    e.preventDefault();
    setDragging(handle);
  };

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!dragging || disabled) return;

      const newValue = getValueFromPosition(e.clientX);
      const [start, end] = value;

      if (dragging === "start") {
        // 開始ハンドル: 最小値と (end - minRange) の間
        const maxStart = end - minRange;
        const clampedStart = Math.max(min, Math.min(maxStart, newValue));
        if (clampedStart !== start) {
          onChange([clampedStart, end]);
        }
      } else {
        // 終了ハンドル: (start + minRange) と最大値の間
        const minEnd = start + minRange;
        const clampedEnd = Math.max(minEnd, Math.min(max, newValue));
        if (clampedEnd !== end) {
          onChange([start, clampedEnd]);
        }
      }
    },
    [dragging, disabled, getValueFromPosition, value, min, max, minRange, onChange]
  );

  const handleMouseUp = useCallback(() => {
    setDragging(null);
  }, []);

  useEffect(() => {
    if (dragging) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
      return () => {
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
      };
    }
  }, [dragging, handleMouseMove, handleMouseUp]);

  // タッチ対応
  const handleTouchStart = (e: React.TouchEvent, handle: "start" | "end") => {
    if (disabled) return;
    e.preventDefault();
    setDragging(handle);
  };

  const handleTouchMove = useCallback(
    (e: TouchEvent) => {
      if (!dragging || disabled) return;
      const touch = e.touches[0];
      if (!touch) return;

      const newValue = getValueFromPosition(touch.clientX);
      const [start, end] = value;

      if (dragging === "start") {
        const maxStart = end - minRange;
        const clampedStart = Math.max(min, Math.min(maxStart, newValue));
        if (clampedStart !== start) {
          onChange([clampedStart, end]);
        }
      } else {
        const minEnd = start + minRange;
        const clampedEnd = Math.max(minEnd, Math.min(max, newValue));
        if (clampedEnd !== end) {
          onChange([start, clampedEnd]);
        }
      }
    },
    [dragging, disabled, getValueFromPosition, value, min, max, minRange, onChange]
  );

  const handleTouchEnd = useCallback(() => {
    setDragging(null);
  }, []);

  useEffect(() => {
    if (dragging) {
      document.addEventListener("touchmove", handleTouchMove, { passive: false });
      document.addEventListener("touchend", handleTouchEnd);
      return () => {
        document.removeEventListener("touchmove", handleTouchMove);
        document.removeEventListener("touchend", handleTouchEnd);
      };
    }
  }, [dragging, handleTouchMove, handleTouchEnd]);

  const startPercent = getPercentage(value[0]);
  const endPercent = getPercentage(value[1]);

  // トラック上でのホバー処理
  const handleTrackMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (dragging || disabled) return;
      const time = getValueFromPosition(e.clientX);
      setHoverTime(time);
      onHoverTime?.(time);
    },
    [dragging, disabled, getValueFromPosition, onHoverTime]
  );

  const handleTrackMouseLeave = useCallback(() => {
    setHoverTime(null);
    onHoverEnd?.();
  }, [onHoverEnd]);

  return (
    <div className={`relative select-none ${className}`}>
      {/* ラベル */}
      <div className="flex justify-between text-xs text-zinc-500 mb-1">
        <span>{formatLabel(min)}</span>
        <span>{formatLabel(max)}</span>
      </div>

      {/* トラック */}
      <div
        ref={trackRef}
        className={`relative h-2 bg-zinc-700 rounded-full ${disabled ? "opacity-50" : "cursor-crosshair"}`}
        onMouseMove={handleTrackMouseMove}
        onMouseLeave={handleTrackMouseLeave}
      >
        {/* 選択範囲 */}
        <div
          className="absolute h-full bg-blue-500 rounded-full pointer-events-none"
          style={{
            left: `${startPercent}%`,
            width: `${endPercent - startPercent}%`,
          }}
        />

        {/* ホバー位置インジケーター + ツールチップ */}
        {hoverTime !== null && (
          <>
            <div
              className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-1 h-4 bg-yellow-400 rounded-full pointer-events-none opacity-80"
              style={{ left: `${getPercentage(hoverTime)}%` }}
            />
            <div
              className="absolute -top-7 -translate-x-1/2 bg-zinc-900 text-yellow-400 text-xs px-1.5 py-0.5 rounded pointer-events-none whitespace-nowrap"
              style={{ left: `${getPercentage(hoverTime)}%` }}
            >
              {formatLabel(hoverTime)}
            </div>
          </>
        )}

        {/* 開始ハンドル */}
        <div
          className={`absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-4 h-4 bg-white border-2 border-blue-500 rounded-full shadow-md ${
            disabled ? "cursor-not-allowed" : "cursor-grab active:cursor-grabbing"
          } ${dragging === "start" ? "ring-2 ring-blue-400 ring-opacity-50" : ""}`}
          style={{ left: `${startPercent}%` }}
          onMouseDown={(e) => handleMouseDown(e, "start")}
          onTouchStart={(e) => handleTouchStart(e, "start")}
        />

        {/* 終了ハンドル */}
        <div
          className={`absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-4 h-4 bg-white border-2 border-blue-500 rounded-full shadow-md ${
            disabled ? "cursor-not-allowed" : "cursor-grab active:cursor-grabbing"
          } ${dragging === "end" ? "ring-2 ring-blue-400 ring-opacity-50" : ""}`}
          style={{ left: `${endPercent}%` }}
          onMouseDown={(e) => handleMouseDown(e, "end")}
          onTouchStart={(e) => handleTouchStart(e, "end")}
        />
      </div>

      {/* 現在の選択範囲表示 */}
      <div className="flex justify-center mt-2 text-sm text-zinc-300">
        <span className="bg-zinc-800 px-2 py-0.5 rounded">
          {formatLabel(value[0])} ~ {formatLabel(value[1])}
        </span>
      </div>
    </div>
  );
}
