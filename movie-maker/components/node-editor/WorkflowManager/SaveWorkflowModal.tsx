'use client';

import { useState } from 'react';
import { X, Save, Cloud, HardDrive } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SaveWorkflowModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentName: string;
  onSaveLocal: (name: string) => boolean;
  onSaveCloud?: (name: string, isPublic: boolean) => Promise<boolean>;
  isLoggedIn: boolean;
  isSaving: boolean;
}

export function SaveWorkflowModal({
  isOpen,
  onClose,
  currentName,
  onSaveLocal,
  onSaveCloud,
  isLoggedIn,
  isSaving,
}: SaveWorkflowModalProps) {
  const [name, setName] = useState(currentName);
  const [saveLocation, setSaveLocation] = useState<'local' | 'cloud'>('local');
  const [isPublic, setIsPublic] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSave = async () => {
    if (!name.trim()) {
      setError('ワークフロー名を入力してください');
      return;
    }

    setError(null);

    if (saveLocation === 'local') {
      const success = onSaveLocal(name);
      if (success) {
        onClose();
      } else {
        setError('保存に失敗しました');
      }
    } else if (onSaveCloud) {
      const success = await onSaveCloud(name, isPublic);
      if (success) {
        onClose();
      } else {
        setError('クラウド保存に失敗しました');
      }
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-[#2a2a2a] rounded-xl border border-[#404040] p-6 w-full max-w-md mx-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-white">ワークフローを保存</h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white"
            disabled={isSaving}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* ワークフロー名 */}
        <div className="mb-4">
          <label className="block text-sm text-gray-400 mb-1">ワークフロー名</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="ワークフロー名を入力"
            maxLength={100}
            disabled={isSaving}
            className="w-full px-3 py-2 bg-[#1a1a1a] border border-[#404040] rounded-lg text-white focus:border-[#fce300] focus:outline-none disabled:opacity-50"
          />
        </div>

        {/* 保存先選択 */}
        <div className="mb-4">
          <label className="block text-sm text-gray-400 mb-2">保存先</label>
          <div className="flex gap-2">
            <button
              onClick={() => setSaveLocation('local')}
              disabled={isSaving}
              className={cn(
                'flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg border transition-colors',
                saveLocation === 'local'
                  ? 'border-[#fce300] bg-[#fce300]/10 text-[#fce300]'
                  : 'border-[#404040] text-gray-400 hover:border-[#505050]',
                isSaving && 'opacity-50 cursor-not-allowed'
              )}
            >
              <HardDrive className="w-4 h-4" />
              <span>ローカル</span>
            </button>
            <button
              onClick={() => setSaveLocation('cloud')}
              disabled={!isLoggedIn || isSaving || !onSaveCloud}
              className={cn(
                'flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg border transition-colors',
                saveLocation === 'cloud'
                  ? 'border-[#fce300] bg-[#fce300]/10 text-[#fce300]'
                  : 'border-[#404040] text-gray-400 hover:border-[#505050]',
                (!isLoggedIn || isSaving || !onSaveCloud) && 'opacity-50 cursor-not-allowed'
              )}
            >
              <Cloud className="w-4 h-4" />
              <span>クラウド</span>
            </button>
          </div>
          {!isLoggedIn && (
            <p className="mt-2 text-xs text-gray-500">
              クラウド保存にはログインが必要です
            </p>
          )}
        </div>

        {/* 公開設定（クラウド保存時のみ） */}
        {saveLocation === 'cloud' && isLoggedIn && onSaveCloud && (
          <div className="mb-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={isPublic}
                onChange={(e) => setIsPublic(e.target.checked)}
                disabled={isSaving}
                className="w-4 h-4 rounded border-[#404040] bg-[#1a1a1a] text-[#fce300] focus:ring-[#fce300]"
              />
              <span className="text-sm text-gray-300">公開ワークフローとして共有</span>
            </label>
            <p className="mt-1 text-xs text-gray-500">
              公開すると他のユーザーがこのワークフローを使用できます
            </p>
          </div>
        )}

        {/* エラー表示 */}
        {error && (
          <div className="mb-4 p-3 bg-red-500/20 border border-red-500/30 rounded-lg">
            <p className="text-sm text-red-400">{error}</p>
          </div>
        )}

        {/* ボタン */}
        <div className="flex gap-3">
          <button
            onClick={onClose}
            disabled={isSaving}
            className="flex-1 px-4 py-2 border border-[#404040] rounded-lg text-gray-300 hover:bg-[#333333] transition-colors disabled:opacity-50"
          >
            キャンセル
          </button>
          <button
            onClick={handleSave}
            disabled={!name.trim() || isSaving}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-[#fce300] text-[#212121] font-medium rounded-lg hover:bg-[#e5cf00] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Save className="w-4 h-4" />
            {isSaving ? '保存中...' : '保存'}
          </button>
        </div>
      </div>
    </div>
  );
}
