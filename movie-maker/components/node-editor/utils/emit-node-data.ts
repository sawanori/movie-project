/**
 * NodeEditor 全ノード共通の Node データ更新イベント発火 helper。
 *
 * `nodeDataUpdate` CustomEvent を `window` 経由で dispatch することで、
 * NodeEditor.tsx 側の useEffect listener が `setNodes` を呼んで React Flow の
 * node data を更新する。各ノードコンポーネント / NodeEditor 内部処理から
 * 重複する dispatch ロジックを排除するため共通化されている。
 *
 * @param nodeId 更新対象ノードの id
 * @param updates 適用する partial データ
 */
export function emitNodeDataUpdate<T>(nodeId: string, updates: Partial<T>): void {
  window.dispatchEvent(
    new CustomEvent('nodeDataUpdate', {
      detail: { nodeId, updates },
    })
  );
}
