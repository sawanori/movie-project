import { useState, useCallback, useEffect, useRef } from 'react';
import type { Edge } from '@xyflow/react';
import type { WorkflowNode, SavedWorkflow, WorkflowListItem } from '@/lib/types/node-editor';
import {
  listLocalWorkflows,
  getLocalWorkflow,
  saveLocalWorkflow,
  deleteLocalWorkflow,
  getCurrentWorkflowId,
  setCurrentWorkflowId,
  migrateFromLegacyStorage,
} from '../utils/workflow-storage';
import { createDefaultWorkflow } from '../utils/default-workflow';
import {
  workflowsApi,
  type CloudWorkflowListItem,
} from '@/lib/api/client';

interface UseWorkflowManagerReturn {
  // 状態
  workflowList: WorkflowListItem[];
  cloudWorkflowList: CloudWorkflowListItem[];
  currentWorkflowId: string | null;
  currentWorkflowName: string;
  isUnsaved: boolean;
  isCloudSynced: boolean;
  isLoadingCloud: boolean;
  saveError: string | null;

  // ローカルアクション
  loadWorkflow: (id: string) => boolean;
  saveWorkflow: (name?: string) => boolean;
  saveAsNewWorkflow: (name: string) => boolean;
  deleteWorkflow: (id: string) => boolean;
  createNewWorkflow: () => void;
  refreshList: () => void;
  clearSaveError: () => void;

  // クラウドアクション
  loadCloudWorkflow: (id: string) => Promise<boolean>;
  saveToCloud: (name: string, isPublic?: boolean) => Promise<boolean>;
  updateCloud: () => Promise<boolean>;
  deleteCloudWorkflow: (id: string) => Promise<boolean>;
  duplicateCloudWorkflow: (id: string) => Promise<boolean>;
  refreshCloudList: () => Promise<void>;

  // ノード変更通知
  markAsUnsaved: () => void;
}

interface UseWorkflowManagerOptions {
  isLoggedIn?: boolean;
}

export function useWorkflowManager(
  nodes: WorkflowNode[],
  edges: Edge[],
  setNodes: (nodes: WorkflowNode[]) => void,
  setEdges: (edges: Edge[]) => void,
  options: UseWorkflowManagerOptions = {}
): UseWorkflowManagerReturn {
  const { isLoggedIn = false } = options;

  const [workflowList, setWorkflowList] = useState<WorkflowListItem[]>([]);
  const [cloudWorkflowList, setCloudWorkflowList] = useState<CloudWorkflowListItem[]>([]);
  const [currentWorkflowId, setCurrentId] = useState<string | null>(null);
  const [currentWorkflowName, setCurrentWorkflowName] = useState('無題のワークフロー');
  const [isUnsaved, setIsUnsaved] = useState(false);
  const [isCloudSynced, setIsCloudSynced] = useState(false);
  const [isLoadingCloud, setIsLoadingCloud] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // クラウドワークフローIDを追跡（ローカルIDとは別）
  const [cloudWorkflowId, setCloudWorkflowId] = useState<string | null>(null);

  // 初回マウント時のみ実行するためのref
  const isInitialized = useRef(false);

  // 初期化（マイグレーション + 読み込み）
  useEffect(() => {
    if (isInitialized.current) return;
    isInitialized.current = true;

    // レガシーデータのマイグレーション
    migrateFromLegacyStorage();

    // リスト更新
    setWorkflowList(listLocalWorkflows());

    // 保存されていた現在のワークフローを読み込み
    const savedId = getCurrentWorkflowId();
    if (savedId) {
      const workflow = getLocalWorkflow(savedId);
      if (workflow) {
        setNodes(workflow.nodes);
        setEdges(workflow.edges);
        setCurrentId(savedId);
        setCurrentWorkflowName(workflow.name);
        setIsUnsaved(false);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // 初回のみ実行

  // ログイン状態が変わったらクラウドリストを取得
  useEffect(() => {
    if (isLoggedIn) {
      refreshCloudList();
    } else {
      setCloudWorkflowList([]);
      setIsCloudSynced(false);
      setCloudWorkflowId(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoggedIn]);

  const refreshList = useCallback(() => {
    setWorkflowList(listLocalWorkflows());
  }, []);

  const refreshCloudList = useCallback(async () => {
    if (!isLoggedIn) return;

    setIsLoadingCloud(true);
    try {
      const response = await workflowsApi.list();
      setCloudWorkflowList(response.workflows);
    } catch (error) {
      console.error('Failed to fetch cloud workflows:', error);
      setCloudWorkflowList([]);
    } finally {
      setIsLoadingCloud(false);
    }
  }, [isLoggedIn]);

  const loadWorkflow = useCallback(
    (id: string): boolean => {
      const workflow = getLocalWorkflow(id);
      if (!workflow) return false;

      setNodes(workflow.nodes);
      setEdges(workflow.edges);
      setCurrentId(id);
      setCurrentWorkflowId(id);
      setCurrentWorkflowName(workflow.name);
      setIsUnsaved(false);
      setIsCloudSynced(false);
      setCloudWorkflowId(null);
      setSaveError(null);
      return true;
    },
    [setNodes, setEdges]
  );

  const loadCloudWorkflow = useCallback(
    async (id: string): Promise<boolean> => {
      if (!isLoggedIn) {
        setSaveError('ログインが必要です');
        return false;
      }

      setIsLoadingCloud(true);
      try {
        const workflow = await workflowsApi.get(id);

        // ノードとエッジを設定
        setNodes(workflow.nodes as WorkflowNode[]);
        setEdges(workflow.edges as Edge[]);

        // 状態を更新
        setCurrentId(null); // ローカルIDはクリア
        setCurrentWorkflowId(null);
        setCloudWorkflowId(id);
        setCurrentWorkflowName(workflow.name);
        setIsUnsaved(false);
        setIsCloudSynced(true);
        setSaveError(null);

        return true;
      } catch (error) {
        console.error('Failed to load cloud workflow:', error);
        setSaveError('クラウドからの読み込みに失敗しました');
        return false;
      } finally {
        setIsLoadingCloud(false);
      }
    },
    [isLoggedIn, setNodes, setEdges]
  );

  const saveWorkflow = useCallback(
    (name?: string): boolean => {
      const workflowName = name || currentWorkflowName;
      const result = saveLocalWorkflow(
        workflowName,
        nodes,
        edges,
        currentWorkflowId || undefined
      );

      if (result.success) {
        setCurrentId(result.workflow.id);
        setCurrentWorkflowId(result.workflow.id);
        setCurrentWorkflowName(result.workflow.name);
        setIsUnsaved(false);
        setSaveError(null);
        refreshList();
        return true;
      } else {
        setSaveError(result.error);
        return false;
      }
    },
    [nodes, edges, currentWorkflowId, currentWorkflowName, refreshList]
  );

  const saveToCloud = useCallback(
    async (name: string, isPublic: boolean = false): Promise<boolean> => {
      if (!isLoggedIn) {
        setSaveError('ログインが必要です');
        return false;
      }

      setIsLoadingCloud(true);
      try {
        const workflow = await workflowsApi.create({
          name,
          nodes: nodes as object[],
          edges: edges as object[],
          is_public: isPublic,
        });

        setCloudWorkflowId(workflow.id);
        setCurrentWorkflowName(workflow.name);
        setIsUnsaved(false);
        setIsCloudSynced(true);
        setSaveError(null);

        // クラウドリストを更新
        await refreshCloudList();

        return true;
      } catch (error) {
        console.error('Failed to save to cloud:', error);
        setSaveError('クラウドへの保存に失敗しました');
        return false;
      } finally {
        setIsLoadingCloud(false);
      }
    },
    [isLoggedIn, nodes, edges, refreshCloudList]
  );

  const updateCloud = useCallback(async (): Promise<boolean> => {
    if (!isLoggedIn || !cloudWorkflowId) {
      setSaveError('クラウドワークフローが選択されていません');
      return false;
    }

    setIsLoadingCloud(true);
    try {
      await workflowsApi.update(cloudWorkflowId, {
        name: currentWorkflowName,
        nodes: nodes as object[],
        edges: edges as object[],
      });

      setIsUnsaved(false);
      setIsCloudSynced(true);
      setSaveError(null);

      // クラウドリストを更新
      await refreshCloudList();

      return true;
    } catch (error) {
      console.error('Failed to update cloud workflow:', error);
      setSaveError('クラウドの更新に失敗しました');
      return false;
    } finally {
      setIsLoadingCloud(false);
    }
  }, [isLoggedIn, cloudWorkflowId, currentWorkflowName, nodes, edges, refreshCloudList]);

  const saveAsNewWorkflow = useCallback(
    (name: string): boolean => {
      const result = saveLocalWorkflow(name, nodes, edges);

      if (result.success) {
        setCurrentId(result.workflow.id);
        setCurrentWorkflowId(result.workflow.id);
        setCurrentWorkflowName(result.workflow.name);
        setIsUnsaved(false);
        setIsCloudSynced(false);
        setCloudWorkflowId(null);
        setSaveError(null);
        refreshList();
        return true;
      } else {
        setSaveError(result.error);
        return false;
      }
    },
    [nodes, edges, refreshList]
  );

  const deleteWorkflowById = useCallback(
    (id: string): boolean => {
      const success = deleteLocalWorkflow(id);
      if (success) {
        refreshList();
        if (id === currentWorkflowId) {
          setCurrentId(null);
          setCurrentWorkflowId(null);
          setCurrentWorkflowName('無題のワークフロー');
        }
      }
      return success;
    },
    [currentWorkflowId, refreshList]
  );

  const deleteCloudWorkflow = useCallback(
    async (id: string): Promise<boolean> => {
      if (!isLoggedIn) {
        setSaveError('ログインが必要です');
        return false;
      }

      setIsLoadingCloud(true);
      try {
        await workflowsApi.delete(id);

        // 現在のワークフローが削除されたらリセット
        if (id === cloudWorkflowId) {
          setCloudWorkflowId(null);
          setIsCloudSynced(false);
          setCurrentWorkflowName('無題のワークフロー');
        }

        // クラウドリストを更新
        await refreshCloudList();

        return true;
      } catch (error) {
        console.error('Failed to delete cloud workflow:', error);
        setSaveError('クラウドワークフローの削除に失敗しました');
        return false;
      } finally {
        setIsLoadingCloud(false);
      }
    },
    [isLoggedIn, cloudWorkflowId, refreshCloudList]
  );

  const duplicateCloudWorkflow = useCallback(
    async (id: string): Promise<boolean> => {
      if (!isLoggedIn) {
        setSaveError('ログインが必要です');
        return false;
      }

      setIsLoadingCloud(true);
      try {
        await workflowsApi.duplicate(id);

        // クラウドリストを更新
        await refreshCloudList();

        return true;
      } catch (error) {
        console.error('Failed to duplicate cloud workflow:', error);
        setSaveError('ワークフローの複製に失敗しました');
        return false;
      } finally {
        setIsLoadingCloud(false);
      }
    },
    [isLoggedIn, refreshCloudList]
  );

  const createNewWorkflow = useCallback(() => {
    const { nodes: defaultNodes, edges: defaultEdges } = createDefaultWorkflow();
    setNodes(defaultNodes);
    setEdges(defaultEdges);
    setCurrentId(null);
    setCurrentWorkflowId(null);
    setCloudWorkflowId(null);
    setCurrentWorkflowName('無題のワークフロー');
    setIsUnsaved(true);
    setIsCloudSynced(false);
    setSaveError(null);
  }, [setNodes, setEdges]);

  const markAsUnsaved = useCallback(() => {
    setIsUnsaved(true);
  }, []);

  const clearSaveError = useCallback(() => {
    setSaveError(null);
  }, []);

  return {
    // 状態
    workflowList,
    cloudWorkflowList,
    currentWorkflowId,
    currentWorkflowName,
    isUnsaved,
    isCloudSynced,
    isLoadingCloud,
    saveError,

    // ローカルアクション
    loadWorkflow,
    saveWorkflow,
    saveAsNewWorkflow,
    deleteWorkflow: deleteWorkflowById,
    createNewWorkflow,
    refreshList,
    clearSaveError,

    // クラウドアクション
    loadCloudWorkflow,
    saveToCloud,
    updateCloud,
    deleteCloudWorkflow,
    duplicateCloudWorkflow,
    refreshCloudList,

    // ノード変更通知
    markAsUnsaved,
  };
}
