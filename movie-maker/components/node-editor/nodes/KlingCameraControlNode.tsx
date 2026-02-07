"use client";

import { memo, useCallback } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Video, RotateCcw } from "lucide-react";
import { BaseNode, inputHandleClassName, outputHandleClassName } from "./BaseNode";
import type { KlingCameraControlNodeData } from "@/lib/types/node-editor";

// 軸の定義
const AXES = [
  { key: 'horizontal', label: '左右移動', labelEn: 'Horizontal' },
  { key: 'vertical', label: '前後移動', labelEn: 'Vertical' },
  { key: 'pan', label: '左右回転', labelEn: 'Pan' },
  { key: 'tilt', label: '上下回転', labelEn: 'Tilt' },
  { key: 'roll', label: '傾き', labelEn: 'Roll' },
  { key: 'zoom', label: 'ズーム', labelEn: 'Zoom' },
] as const;

interface KlingCameraControlNodeProps extends NodeProps {
  data: KlingCameraControlNodeData;
}

export const KlingCameraControlNode = memo(function KlingCameraControlNode({
  id,
  data,
  selected,
}: KlingCameraControlNodeProps) {

  const updateNodeData = useCallback(
    (updates: Partial<KlingCameraControlNodeData>) => {
      const event = new CustomEvent("nodeDataUpdate", {
        detail: { nodeId: id, updates },
      });
      window.dispatchEvent(event);
    },
    [id]
  );

  const handleAxisChange = useCallback(
    (axis: keyof typeof data.config, value: number) => {
      updateNodeData({
        config: {
          ...data.config,
          [axis]: value,
        },
      });
    },
    [data.config, updateNodeData]
  );

  const handleReset = useCallback(() => {
    updateNodeData({
      config: {
        horizontal: 0,
        vertical: 0,
        pan: 0,
        tilt: 0,
        roll: 0,
        zoom: 0,
      },
    });
  }, [updateNodeData]);

  return (
    <BaseNode
      title="カメラコントロール"
      icon={<Video className="w-4 h-4 text-[#fce300]" />}
      isSelected={selected}
      isValid={data.isValid}
      errorMessage={data.errorMessage}
    >
      {/* Provider入力ハンドル */}
      <Handle
        type="target"
        position={Position.Left}
        id="provider"
        className={inputHandleClassName}
      />

      <div className="space-y-3 min-w-[280px]">
        {/* Kling専用表示 */}
        <div className="flex items-center justify-between">
          <span className="text-xs text-[#fce300] font-medium">Kling専用</span>
          <button
            onClick={handleReset}
            className="flex items-center gap-1 text-xs text-gray-400 hover:text-white transition-colors"
          >
            <RotateCcw className="w-3 h-3" />
            リセット
          </button>
        </div>

        {/* 6軸スライダー */}
        {AXES.map(({ key, label, labelEn }) => (
          <div key={key} className="space-y-1">
            <div className="flex items-center justify-between">
              <label className="text-xs text-gray-300">
                {label}
                <span className="text-gray-500 ml-1">({labelEn})</span>
              </label>
              <span className="text-xs font-mono text-white w-8 text-right">
                {data.config[key as keyof typeof data.config] > 0 ? '+' : ''}
                {data.config[key as keyof typeof data.config]}
              </span>
            </div>
            <input
              type="range"
              min={-10}
              max={10}
              step={1}
              value={data.config[key as keyof typeof data.config]}
              onChange={(e) =>
                handleAxisChange(
                  key as keyof typeof data.config,
                  parseInt(e.target.value)
                )
              }
              className="w-full h-2 bg-[#404040] rounded-lg appearance-none cursor-pointer
                         [&::-webkit-slider-thumb]:appearance-none
                         [&::-webkit-slider-thumb]:w-4
                         [&::-webkit-slider-thumb]:h-4
                         [&::-webkit-slider-thumb]:rounded-full
                         [&::-webkit-slider-thumb]:bg-[#fce300]
                         [&::-webkit-slider-thumb]:cursor-pointer
                         [&::-webkit-slider-thumb]:shadow-md"
            />
            <div className="flex justify-between text-[10px] text-gray-500">
              <span>-10</span>
              <span>0</span>
              <span>+10</span>
            </div>
          </div>
        ))}

        {/* プレビュー表示（現在の設定値のサマリ） */}
        <div className="mt-3 pt-3 border-t border-[#404040]">
          <p className="text-[10px] text-gray-500">
            {Object.entries(data.config)
              .filter(([, v]) => v !== 0)
              .map(([k, v]) => `${k}: ${v > 0 ? '+' : ''}${v}`)
              .join(', ') || '静止（全て0）'}
          </p>
        </div>
      </div>

      {/* 出力ハンドル */}
      <Handle
        type="source"
        position={Position.Right}
        id="kling_camera_control"
        className={outputHandleClassName}
      />
    </BaseNode>
  );
});
