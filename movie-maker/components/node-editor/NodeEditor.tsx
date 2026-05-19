'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ReactFlow,
  useNodesState,
  useEdgesState,
  addEdge,
  Connection,
  Edge,
  Controls,
  Background,
  MiniMap,
  Panel,
  BackgroundVariant,
  useReactFlow,
  ReactFlowProvider,
  SelectionMode,
  type NodeChange,
  type EdgeChange,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { RotateCcw, AlertCircle, Copy, Clipboard } from 'lucide-react';

import { NodePalette } from './NodePalette';
import { nodeTypes, defaultEdgeOptions, fitViewOptions, connectionLineStyle } from './utils/node-types';
import { createDefaultWorkflow } from './utils/default-workflow';
import { graphToStoryVideoCreate, validateGraphForGeneration } from './utils/graph-to-api';
import { isConnectionAllowed } from './utils/connection-guards';
import { emitNodeDataUpdate } from './utils/emit-node-data';
import { useWorkflowValidation } from './hooks/useWorkflowValidation';
import { useWorkflowManager } from './hooks/useWorkflowManager';
import { WorkflowToolbar, SaveWorkflowModal, WorkflowList } from './WorkflowManager';
import { useAuth } from '@/components/providers/auth-provider';
import type {
  WorkflowNode,
  WorkflowNodeData,
  NodeType,
  VideoProvider,
  ProviderNodeData,
  GenerateNodeData,
  DialogueNodeData,
  GetVideoFrameNodeData,
  TrimVideoNodeData,
  StitchVideosNodeData,
} from '@/lib/types/node-editor';
import { createDefaultNodeData as createData, getNodeVideoOutput, HANDLE_IDS } from '@/lib/types/node-editor';
import { videosApi, dialogueApi, utilityApi } from '@/lib/api/client';

interface NodeEditorProps {
  onVideoGenerated?: (videoUrl: string) => void;
}

// クリップボード用のグローバル変数（コンポーネント外）
let clipboard: { nodes: WorkflowNode[]; edges: Edge[] } | null = null;

// Dialogue ポーリング設定 (5 秒 × 180 回 = 最大 15 分)
const DIALOGUE_MAX_POLLING_ATTEMPTS = 180;
const DIALOGUE_POLLING_INTERVAL_MS = 5000;

// Stitch ポーリング設定 (5 秒 × 120 回 = 最大 10 分)
const STITCH_MAX_POLLING_ATTEMPTS = 120;
const STITCH_POLLING_INTERVAL_MS = 5000;

function NodeEditorInner({ onVideoGenerated }: NodeEditorProps) {
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const [nodes, setNodes, onNodesChangeBase] = useNodesState<WorkflowNode>([]);
  const [edges, setEdges, onEdgesChangeBase] = useEdgesState<Edge>([]);
  const [selectedProvider, setSelectedProvider] = useState<VideoProvider | null>(null);
  const { getNodes, getEdges } = useReactFlow();

  // 認証状態
  const { user } = useAuth();
  const isLoggedIn = !!user;

  // モーダル状態
  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
  const [isOpenModalOpen, setIsOpenModalOpen] = useState(false);

  // コピー＆ペースト機能
  const handleCopy = useCallback(() => {
    const selectedNodes = getNodes().filter((node) => node.selected);
    if (selectedNodes.length === 0) return;

    const selectedNodeIds = new Set(selectedNodes.map((n) => n.id));
    const selectedEdges = getEdges().filter(
      (edge) => selectedNodeIds.has(edge.source) && selectedNodeIds.has(edge.target)
    );

    clipboard = {
      nodes: selectedNodes as WorkflowNode[],
      edges: selectedEdges,
    };
  }, [getNodes, getEdges]);

  const handlePaste = useCallback(() => {
    if (!clipboard || clipboard.nodes.length === 0) return;

    const now = Date.now();
    const idMap = new Map<string, string>();

    // 新しいノードを作成（位置をずらす）
    const newNodes = clipboard.nodes.map((node, index) => {
      const newId = `${node.type}-${now}-${index}`;
      idMap.set(node.id, newId);
      return {
        ...node,
        id: newId,
        position: {
          x: node.position.x + 50,
          y: node.position.y + 50,
        },
        selected: true,
        data: { ...node.data },
      };
    });

    // 新しいエッジを作成（IDをマッピング）
    const newEdges = clipboard.edges.map((edge, index) => ({
      ...edge,
      id: `e-${now}-${index}`,
      source: idMap.get(edge.source) || edge.source,
      target: idMap.get(edge.target) || edge.target,
    }));

    // 既存のノードの選択を解除
    setNodes((nds) => [
      ...nds.map((n) => ({ ...n, selected: false })),
      ...newNodes,
    ]);
    setEdges((eds) => [...eds, ...newEdges]);
  }, [setNodes, setEdges]);

  // 一発複製（clipboard を汚染しない）
  const handleDuplicate = useCallback(() => {
    const selectedNodes = getNodes().filter((n) => n.selected);
    if (selectedNodes.length === 0) return;

    const selectedNodeIds = new Set(selectedNodes.map((n) => n.id));
    const selectedEdges = getEdges().filter(
      (edge) => selectedNodeIds.has(edge.source) && selectedNodeIds.has(edge.target)
    );

    const now = Date.now();
    const idMap = new Map<string, string>();
    const newNodes: WorkflowNode[] = selectedNodes.map((node, index) => {
      const newId = `${node.type}-${now}-${index}`;
      idMap.set(node.id, newId);
      return {
        ...node,
        id: newId,
        position: { x: node.position.x + 50, y: node.position.y + 50 },
        selected: true,
        data: { ...node.data } as WorkflowNodeData,
      };
    });
    const newEdges = selectedEdges.map((edge, index) => ({
      ...edge,
      id: `e-${now}-${index}`,
      source: idMap.get(edge.source) ?? edge.source,
      target: idMap.get(edge.target) ?? edge.target,
      selected: true,
    }));

    setNodes((nds) => [
      ...nds.map((n) => ({ ...n, selected: false })),
      ...newNodes,
    ]);
    setEdges((eds) => [
      ...eds.map((e) => ({ ...e, selected: false })),
      ...newEdges,
    ]);
  }, [getNodes, getEdges, setNodes, setEdges]);

  // キーボードショートカット
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+C / Cmd+C でコピー
      if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
        const activeElement = document.activeElement;
        if (activeElement?.tagName === 'INPUT' || activeElement?.tagName === 'TEXTAREA') return;
        handleCopy();
      }
      // Ctrl+V / Cmd+V でペースト
      if ((e.ctrlKey || e.metaKey) && e.key === 'v') {
        const activeElement = document.activeElement;
        if (activeElement?.tagName === 'INPUT' || activeElement?.tagName === 'TEXTAREA') return;
        e.preventDefault();
        handlePaste();
      }
      // Ctrl+X / Cmd+X で選択中のノード・エッジを削除
      if ((e.ctrlKey || e.metaKey) && e.key === 'x') {
        const activeElement = document.activeElement;
        if (activeElement?.tagName === 'INPUT' || activeElement?.tagName === 'TEXTAREA') return;
        e.preventDefault();
        const selectedNodeIds = new Set(getNodes().filter((n) => n.selected).map((n) => n.id));
        const selectedEdgeIds = new Set(getEdges().filter((e) => e.selected).map((e) => e.id));
        if (selectedNodeIds.size > 0 || selectedEdgeIds.size > 0) {
          setNodes((nds) => nds.filter((n) => !selectedNodeIds.has(n.id)));
          setEdges((eds) => eds.filter((e) => !selectedEdgeIds.has(e.id) && !selectedNodeIds.has(e.source) && !selectedNodeIds.has(e.target)));
        }
      }
      // Ctrl+D / Cmd+D で一発複製
      if ((e.ctrlKey || e.metaKey) && e.key === 'd') {
        const activeElement = document.activeElement;
        if (activeElement?.tagName === 'INPUT' || activeElement?.tagName === 'TEXTAREA') return;
        e.preventDefault();
        handleDuplicate();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleCopy, handlePaste, handleDuplicate]);

  // ワークフローマネージャー（クラウド機能付き）
  const {
    workflowList,
    cloudWorkflowList,
    currentWorkflowId,
    currentWorkflowName,
    isUnsaved,
    isCloudSynced,
    isLoadingCloud,
    saveError,
    loadWorkflow,
    saveWorkflow,
    saveAsNewWorkflow,
    deleteWorkflow,
    createNewWorkflow,
    clearSaveError,
    markAsUnsaved,
    // クラウドアクション
    loadCloudWorkflow,
    saveToCloud,
    updateCloud,
    deleteCloudWorkflow,
    duplicateCloudWorkflow,
  } = useWorkflowManager(nodes, edges, setNodes, setEdges, { isLoggedIn });

  // バリデーション
  const { errors, warnings } = useWorkflowValidation(nodes, edges);

  /**
   * ProviderNode の各 target Handle に対し、互換性のある source ノードタイプのみ接続を許可する。
   * それ以外の既存 Handle (CONFIG_INPUT 等) はこのガードの対象外。
   *
   * 加えて OmniReference → ProviderNode 接続では、
   *  - provider != seedance の ProviderNode への接続を拒否
   *  - 同 ProviderNode に既存 OmniReference 接続がある場合は拒否 (1 対 1 制約)
   */
  const isValidConnection = useCallback(
    (connection: Edge | Connection): boolean => {
      return isConnectionAllowed(connection, nodes, edges);
    },
    [nodes, edges]
  );

  // ノード変更時に未保存フラグを立てる
  const onNodesChange = useCallback(
    (changes: NodeChange<WorkflowNode>[]) => {
      onNodesChangeBase(changes);
      markAsUnsaved();
    },
    [onNodesChangeBase, markAsUnsaved]
  );

  // エッジ変更時に未保存フラグを立てる
  const onEdgesChange = useCallback(
    (changes: EdgeChange<Edge>[]) => {
      onEdgesChangeBase(changes);
      markAsUnsaved();
    },
    [onEdgesChangeBase, markAsUnsaved]
  );

  // 自動保存（10秒間隔、保存済みワークフローがある場合のみ）
  useEffect(() => {
    const interval = setInterval(() => {
      if (nodes.length > 0 && currentWorkflowId && isUnsaved) {
        saveWorkflow();
      }
    }, 10000);

    return () => clearInterval(interval);
  }, [nodes.length, currentWorkflowId, isUnsaved, saveWorkflow]);

  // クラウド自動同期（30秒間隔、クラウド保存済みの場合のみ）
  useEffect(() => {
    if (!isLoggedIn || !isCloudSynced) return;

    const interval = setInterval(() => {
      if (nodes.length > 0 && isCloudSynced && isUnsaved) {
        updateCloud();
      }
    }, 30000);

    return () => clearInterval(interval);
  }, [nodes.length, isLoggedIn, isCloudSynced, isUnsaved, updateCloud]);

  // 初期化（ワークフロー読み込みまたはデフォルト作成）
  const isInitialized = useRef(false);
  useEffect(() => {
    if (isInitialized.current) return;
    isInitialized.current = true;

    // workflowManagerが初期化時にワークフローをロードしなかった場合はデフォルトを設定
    if (nodes.length === 0) {
      const defaultWorkflow = createDefaultWorkflow();
      setNodes(defaultWorkflow.nodes);
      setEdges(defaultWorkflow.edges);
    }

    // プロバイダーを復元
    const providerNode = nodes.find(
      (n) => (n.data as WorkflowNodeData).type === 'provider'
    );
    if (providerNode) {
      setSelectedProvider((providerNode.data as ProviderNodeData).provider);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ノードデータ更新イベントのリスナー
  useEffect(() => {
    const handleNodeDataUpdate = (e: Event) => {
      const customEvent = e as CustomEvent<{
        nodeId: string;
        updates: Partial<WorkflowNodeData>;
      }>;
      const { nodeId, updates } = customEvent.detail;

      setNodes((nds) =>
        nds.map((node) => {
          if (node.id === nodeId) {
            return {
              ...node,
              data: { ...node.data, ...updates } as WorkflowNodeData,
            };
          }
          return node;
        })
      );
    };

    const handleProviderChange = (e: Event) => {
      const customEvent = e as CustomEvent<{ provider: VideoProvider }>;
      setSelectedProvider(customEvent.detail.provider);
    };

    const handleStartGeneration = async (e: Event) => {
      const customEvent = e as CustomEvent<{ nodeId: string }>;
      const { nodeId } = customEvent.detail;

      // バリデーション
      const validation = validateGraphForGeneration(nodes, edges, nodeId);
      if (!validation.isValid) {
        setNodes((nds) =>
          nds.map((node) => {
            if (node.id === nodeId) {
              return {
                ...node,
                data: {
                  ...node.data,
                  error: validation.errors.join('\n'),
                } as GenerateNodeData,
              };
            }
            return node;
          })
        );
        return;
      }

      // 生成開始
      setNodes((nds) =>
        nds.map((node) => {
          if (node.id === nodeId) {
            return {
              ...node,
              data: {
                ...node.data,
                isGenerating: true,
                progress: 0,
                error: null,
              } as GenerateNodeData,
            };
          }
          return node;
        })
      );

      try {
        // APIリクエスト構築
        const request = graphToStoryVideoCreate(nodes, edges, nodeId);

        // 進捗更新シミュレーション
        let progress = 0;
        const progressInterval = setInterval(() => {
          progress = Math.min(progress + 10, 90);
          setNodes((nds) =>
            nds.map((node) => {
              if (node.id === nodeId) {
                return {
                  ...node,
                  data: { ...node.data, progress } as GenerateNodeData,
                };
              }
              return node;
            })
          );
        }, 2000);

        // API呼び出し - 動画生成開始（非同期）
        const result = await videosApi.createStoryVideo(request);
        const videoId = result.id;

        // ステータスをポーリング
        const pollStatus = async (): Promise<string | null> => {
          // 最大15分（5秒×180回）。Seedance / Veo / Hailuo はピーク帯に
          // 5分以上かかることがあるため、Runway 時代の 5 分設定だと早期失敗していた。
          // バックエンドは 10 分で諦めるので、フロントは余裕を持って 15 分。
          const maxAttempts = 180;
          for (let i = 0; i < maxAttempts; i++) {
            const status = await videosApi.getStatus(videoId);
            const progress = Math.min(10 + Math.floor((i / maxAttempts) * 90), 95);

            setNodes((nds) =>
              nds.map((node) => {
                if (node.id === nodeId) {
                  return {
                    ...node,
                    data: { ...node.data, progress } as GenerateNodeData,
                  };
                }
                return node;
              })
            );

            if (status.status === 'completed') {
              return status.video_url || null;
            }
            if (status.status === 'failed') {
              throw new Error(status.error || '動画生成に失敗しました');
            }

            // 5秒待機
            await new Promise((resolve) => setTimeout(resolve, 5000));
          }
          throw new Error('タイムアウト: 動画生成に時間がかかりすぎています');
        };

        clearInterval(progressInterval);
        const videoUrl = await pollStatus();

        // 完了
        setNodes((nds) =>
          nds.map((node) => {
            if (node.id === nodeId) {
              return {
                ...node,
                data: {
                  ...node.data,
                  isGenerating: false,
                  progress: 100,
                  videoUrl: videoUrl,
                  isValid: true,
                } as GenerateNodeData,
              };
            }
            return node;
          })
        );

        if (onVideoGenerated && videoUrl) {
          onVideoGenerated(videoUrl);
        }
      } catch (error) {
        setNodes((nds) =>
          nds.map((node) => {
            if (node.id === nodeId) {
              return {
                ...node,
                data: {
                  ...node.data,
                  isGenerating: false,
                  error:
                    error instanceof Error ? error.message : '生成に失敗しました',
                } as GenerateNodeData,
              };
            }
            return node;
          })
        );
      }
    };

    // Dialogue ノード実行ハンドラ (B4: 既存 useEffect 内に追加して edges を stale にしない)
    const handleStartDialogue = async (e: Event) => {
      const { nodeId } = (e as CustomEvent<{ nodeId: string }>).detail;

      const dispatchUpdate = (updates: Partial<DialogueNodeData>) => {
        emitNodeDataUpdate<DialogueNodeData>(nodeId, updates);
      };

      // 1. upstream edge を検索 (dialogue_video_input handle に繋がるエッジ)
      const upstreamEdge = edges.find(
        (edge) =>
          edge.target === nodeId && edge.targetHandle === 'dialogue_video_input'
      );
      if (!upstreamEdge) {
        dispatchUpdate({
          errorMessage: '動画ノードを接続してください',
          status: 'failed',
        });
        return;
      }

      // 2. upstream ノードの動画 URL を取得 (B2: HasVideoOutput 共通インターフェース使用)
      const upstreamNode = nodes.find((n) => n.id === upstreamEdge.source);
      const videoUrl = getNodeVideoOutput(upstreamNode?.data);
      if (!videoUrl) {
        dispatchUpdate({
          errorMessage:
            '動画の生成が完了していません。先に動画を生成してください',
          status: 'failed',
        });
        return;
      }

      // 3. DialogueNode のデータを取得
      const dialogueNode = nodes.find((n) => n.id === nodeId);
      const dialogueData = dialogueNode?.data as DialogueNodeData | undefined;
      if (!dialogueData?.text || !dialogueData?.voiceId) {
        dispatchUpdate({
          errorMessage: 'セリフと声を入力してください',
          status: 'failed',
        });
        return;
      }

      // 4. pending 状態に更新
      dispatchUpdate({ status: 'pending', errorMessage: undefined });

      try {
        // 5. dialogueApi.create() を呼び出し
        const kanaTextValue = dialogueData.useKanaMode
          ? (dialogueData.kanaText?.trim() || undefined)
          : undefined;

        const result = await dialogueApi.create({
          video_url: videoUrl,
          text: dialogueData.text,
          voice_id: dialogueData.voiceId,
          speed: dialogueData.speed,
          use_lip_sync: dialogueData.useLipSync,
          tts_instructions: dialogueData.ttsInstructions?.trim() || undefined,
          kana_text: kanaTextValue,
        });
        const generationId = result.id;

        dispatchUpdate({ generationId, status: 'processing' });

        // 6. ポーリング (最大 DIALOGUE_MAX_POLLING_ATTEMPTS 回)
        for (
          let attempt = 0;
          attempt < DIALOGUE_MAX_POLLING_ATTEMPTS;
          attempt++
        ) {
          await new Promise((resolve) =>
            setTimeout(resolve, DIALOGUE_POLLING_INTERVAL_MS)
          );
          const status = await dialogueApi.getStatus(generationId);

          const progress = Math.min(
            Math.round((attempt / DIALOGUE_MAX_POLLING_ATTEMPTS) * 100),
            99
          );
          dispatchUpdate({ progress });

          if (status.status === 'completed') {
            dispatchUpdate({
              status: 'completed',
              outputVideoUrl: status.output_video_url,
              progress: 100,
            });
            return;
          }
          if (status.status === 'failed') {
            dispatchUpdate({
              status: 'failed',
              errorMessage: status.error_message ?? '処理に失敗しました',
            });
            return;
          }
        }

        // ポーリングタイムアウト
        dispatchUpdate({
          status: 'failed',
          errorMessage: 'タイムアウトしました (15 分)。再試行してください',
        });
      } catch (err) {
        dispatchUpdate({
          status: 'failed',
          errorMessage:
            err instanceof Error ? err.message : '予期しないエラーが発生しました',
        });
      }
    };

    // Get Video Frame ノード実行ハンドラ (B4: 既存 useEffect 内に追加して edges を stale にしない)
    const handleStartGetVideoFrame = async (e: Event) => {
      const { nodeId } = (e as CustomEvent<{ nodeId: string }>).detail;

      const dispatchUpdate = (updates: Partial<GetVideoFrameNodeData>) => {
        emitNodeDataUpdate<GetVideoFrameNodeData>(nodeId, updates);
      };

      // 1. upstream edge を検索 (get_video_frame_video_input handle に繋がるエッジ)
      const upstreamEdge = edges.find(
        (edge) =>
          edge.target === nodeId && edge.targetHandle === HANDLE_IDS.GET_VIDEO_FRAME_VIDEO_INPUT
      );
      if (!upstreamEdge) {
        dispatchUpdate({ status: 'failed', errorMessage: '動画ノードを接続してください' });
        return;
      }

      // 2. upstream ノードから getNodeVideoOutput で video URL を取得 (B2 パターン)
      const upstreamNode = nodes.find((n) => n.id === upstreamEdge.source);
      const videoUrl = getNodeVideoOutput(upstreamNode?.data);
      if (!videoUrl) {
        dispatchUpdate({ status: 'failed', errorMessage: '動画 URL が取得できませんでした' });
        return;
      }

      // 3. status = processing
      dispatchUpdate({ status: 'processing' });

      // 4. API 呼び出し (同期)
      try {
        const selfNode = nodes.find((n) => n.id === nodeId);
        const direction = (selfNode?.data as GetVideoFrameNodeData).direction;
        const res = await utilityApi.extractFrame({ video_url: videoUrl, direction });
        dispatchUpdate({ status: 'completed', outputImageUrl: res.image_url });
      } catch (err) {
        dispatchUpdate({
          status: 'failed',
          errorMessage: err instanceof Error ? err.message : 'フレームの抽出に失敗しました',
        });
      }
    };

    // Trim Video ノード実行ハンドラ (B4: 既存 useEffect 内に追加して edges を stale にしない)
    const handleStartTrimVideo = async (e: Event) => {
      const { nodeId } = (e as CustomEvent<{ nodeId: string }>).detail;

      const dispatchUpdate = (updates: Partial<TrimVideoNodeData>) => {
        emitNodeDataUpdate<TrimVideoNodeData>(nodeId, updates);
      };

      // 1. upstream edge を検索 (trim_video_input handle に繋がるエッジ)
      const upstreamEdge = edges.find(
        (edge) =>
          edge.target === nodeId && edge.targetHandle === HANDLE_IDS.TRIM_VIDEO_INPUT
      );
      if (!upstreamEdge) {
        dispatchUpdate({ status: 'failed', errorMessage: '動画ノードを接続してください' });
        return;
      }

      // 2. upstream ノードから getNodeVideoOutput で video URL を取得 (B2 パターン)
      const upstreamNode = nodes.find((n) => n.id === upstreamEdge.source);
      const videoUrl = getNodeVideoOutput(upstreamNode?.data);
      if (!videoUrl) {
        dispatchUpdate({ status: 'failed', errorMessage: '動画 URL が取得できませんでした' });
        return;
      }

      // 3. 自ノードのパラメータを取得
      const selfNode = nodes.find((n) => n.id === nodeId);
      const data = selfNode?.data as TrimVideoNodeData;

      // 4. status = processing
      dispatchUpdate({ status: 'processing' });

      // 5. API 呼び出し (同期)
      try {
        const res = await utilityApi.trimVideo({
          video_url: videoUrl,
          start_seconds: data.startSeconds,
          end_seconds: data.endSeconds,
        });
        dispatchUpdate({ status: 'completed', outputVideoUrl: res.output_video_url });
      } catch (err) {
        dispatchUpdate({
          status: 'failed',
          errorMessage: err instanceof Error ? err.message : '動画のトリムに失敗しました',
        });
      }
    };

    // Stitch Videos ノード実行ハンドラ (B4: 既存 useEffect 内に追加して edges を stale にしない)
    const STITCH_INPUT_HANDLE_IDS: readonly string[] = [
      HANDLE_IDS.STITCH_VIDEO_1,
      HANDLE_IDS.STITCH_VIDEO_2,
      HANDLE_IDS.STITCH_VIDEO_3,
      HANDLE_IDS.STITCH_VIDEO_4,
      HANDLE_IDS.STITCH_VIDEO_5,
    ];

    const handleStartStitchVideos = async (e: Event) => {
      const { nodeId } = (e as CustomEvent<{ nodeId: string }>).detail;

      const dispatchUpdate = (updates: Partial<StitchVideosNodeData>) => {
        emitNodeDataUpdate<StitchVideosNodeData>(nodeId, updates);
      };

      // 1. このノードへの incoming edges から video URL を収集 (handleID でソート)
      const incomingEdges = edges
        .filter(
          (edge) =>
            edge.target === nodeId &&
            STITCH_INPUT_HANDLE_IDS.includes(edge.targetHandle ?? '')
        )
        .sort((a, b) => {
          const idxA = STITCH_INPUT_HANDLE_IDS.indexOf(a.targetHandle ?? '');
          const idxB = STITCH_INPUT_HANDLE_IDS.indexOf(b.targetHandle ?? '');
          return idxA - idxB;
        });

      if (incomingEdges.length < 2) {
        dispatchUpdate({ status: 'failed', errorMessage: '2本以上の動画を接続してください' });
        return;
      }

      // 2. 各 upstream ノードから videoUrl を取得 (B2 パターン)
      const videoUrls: string[] = [];
      for (const [i, edge] of incomingEdges.entries()) {
        const upstreamNode = nodes.find((n) => n.id === edge.source);
        const url = getNodeVideoOutput(upstreamNode?.data);
        if (!url) {
          dispatchUpdate({
            status: 'failed',
            errorMessage: `動画${i + 1}の生成が完了していません`,
          });
          return;
        }
        videoUrls.push(url);
      }

      // 3. POST /stitch (非同期 202)
      dispatchUpdate({ status: 'pending', progress: 0 });
      let stitchId: string;
      try {
        const res = await utilityApi.stitchVideos({
          video_urls: videoUrls,
          transition: 'none',
        });
        stitchId = res.id;
        dispatchUpdate({ stitchId, status: 'processing' });
      } catch (err) {
        dispatchUpdate({
          status: 'failed',
          errorMessage: err instanceof Error ? err.message : 'スティッチの開始に失敗しました',
        });
        return;
      }

      // 4. ポーリングループ (5 秒 × STITCH_MAX_POLLING_ATTEMPTS 回)
      for (let attempt = 0; attempt < STITCH_MAX_POLLING_ATTEMPTS; attempt++) {
        await new Promise((resolve) => setTimeout(resolve, STITCH_POLLING_INTERVAL_MS));

        try {
          const status = await utilityApi.getStitchStatus(stitchId);

          if (status.status === 'completed' && status.output_video_url) {
            dispatchUpdate({
              status: 'completed',
              progress: 100,
              outputVideoUrl: status.output_video_url,
            });
            return;
          }

          if (status.status === 'failed') {
            dispatchUpdate({
              status: 'failed',
              errorMessage: status.error_message ?? 'スティッチに失敗しました',
            });
            return;
          }

          // pending or processing
          dispatchUpdate({ status: 'processing', progress: status.progress });
        } catch (err) {
          // ポーリング 1 回失敗は許容、次の試行へ (DialogueNode と同じパターン)
          console.warn('[stitch] polling error:', err);
        }
      }

      // 5. タイムアウト
      dispatchUpdate({
        status: 'failed',
        errorMessage: 'タイムアウトしました (10分)。再試行してください',
      });
    };

    window.addEventListener('nodeDataUpdate', handleNodeDataUpdate);
    window.addEventListener('providerChange', handleProviderChange);
    window.addEventListener('startGeneration', handleStartGeneration);
    window.addEventListener('startDialogue', handleStartDialogue);
    window.addEventListener('startGetVideoFrame', handleStartGetVideoFrame);
    window.addEventListener('startTrimVideo', handleStartTrimVideo);
    window.addEventListener('startStitchVideos', handleStartStitchVideos);

    return () => {
      window.removeEventListener('nodeDataUpdate', handleNodeDataUpdate);
      window.removeEventListener('providerChange', handleProviderChange);
      window.removeEventListener('startGeneration', handleStartGeneration);
      window.removeEventListener('startDialogue', handleStartDialogue);
      window.removeEventListener('startGetVideoFrame', handleStartGetVideoFrame);
      window.removeEventListener('startTrimVideo', handleStartTrimVideo);
      window.removeEventListener('startStitchVideos', handleStartStitchVideos);
    };
  }, [nodes, edges, setNodes, onVideoGenerated]);

  // createDialogueNodeFromPrompt listener (N2 対応: setNodes 関数形式 setter で closure 問題回避)
  useEffect(() => {
    const handler = (e: Event) => {
      const event = e as CustomEvent<{ sourcePromptNodeId: string; initialText: string }>;
      setNodes((prevNodes) => {
        const sourceNode = prevNodes.find((n) => n.id === event.detail.sourcePromptNodeId);
        if (!sourceNode) return prevNodes;

        const newNode: WorkflowNode = {
          id: `dialogue-${Date.now()}`,
          type: 'dialogue',
          position: {
            x: sourceNode.position.x + 320,
            y: sourceNode.position.y + 200,
          },
          data: {
            ...createData('dialogue'),
            text: event.detail.initialText,
          } as WorkflowNode['data'],
        };
        return [...prevNodes, newNode];
      });
    };

    window.addEventListener('createDialogueNodeFromPrompt', handler);
    return () => window.removeEventListener('createDialogueNodeFromPrompt', handler);
    // N2 対応: 依存配列は setNodes のみ (関数形式 setter で nodes 依存を排除)
  }, [setNodes]);

  // 接続処理 (isValidConnection を通った接続のみここに来るが、念のため guard)
  const onConnect = useCallback(
    (params: Connection) => {
      if (!isConnectionAllowed(params, nodes, edges)) {
        console.warn(
          '[NodeEditor] 接続が拒否されました (provider 不一致 or 1 対 1 制約違反):',
          params,
        );
        return;
      }
      setEdges((eds) => addEdge({ ...params, animated: true }, eds));
    },
    [setEdges, nodes, edges]
  );

  // ドラッグ&ドロップ
  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();

      const type = event.dataTransfer.getData('application/reactflow') as NodeType;
      if (!type) return;

      const reactFlowBounds = reactFlowWrapper.current?.getBoundingClientRect();
      if (!reactFlowBounds) return;

      const position = {
        x: event.clientX - reactFlowBounds.left - 100,
        y: event.clientY - reactFlowBounds.top - 50,
      };

      const newNode: WorkflowNode = {
        id: `${type}-${Date.now()}`,
        type,
        position,
        data: createData(type),
      };

      setNodes((nds) => [...nds, newNode]);
    },
    [setNodes]
  );

  const onDragStart = useCallback(
    (event: React.DragEvent, nodeType: NodeType) => {
      event.dataTransfer.setData('application/reactflow', nodeType);
      event.dataTransfer.effectAllowed = 'move';
    },
    []
  );

  // リセット（新規ワークフロー作成）
  const handleReset = useCallback(() => {
    if (confirm('新しいワークフローを作成しますか？現在の変更は失われます。')) {
      createNewWorkflow();
      setSelectedProvider(null);
    }
  }, [createNewWorkflow]);

  // 手動保存（既存ワークフローの場合は上書き、新規の場合はモーダル表示）
  const handleSave = useCallback(() => {
    // クラウド同期済みの場合はクラウドに保存
    if (isCloudSynced) {
      updateCloud();
    } else if (currentWorkflowId) {
      saveWorkflow();
    } else {
      setIsSaveModalOpen(true);
    }
  }, [currentWorkflowId, isCloudSynced, saveWorkflow, updateCloud]);

  // 名前を付けて保存
  const handleSaveAs = useCallback(() => {
    setIsSaveModalOpen(true);
  }, []);

  // ローカル保存
  const handleSaveLocal = useCallback(
    (name: string): boolean => {
      return saveAsNewWorkflow(name);
    },
    [saveAsNewWorkflow]
  );

  // クラウド保存
  const handleSaveCloud = useCallback(
    async (name: string, isPublic: boolean): Promise<boolean> => {
      return await saveToCloud(name, isPublic);
    },
    [saveToCloud]
  );

  // ワークフロー読み込み（ローカル）
  const handleLoadWorkflow = useCallback(
    (id: string) => {
      const success = loadWorkflow(id);
      if (success) {
        // プロバイダーを復元
        const providerNode = nodes.find(
          (n) => (n.data as WorkflowNodeData).type === 'provider'
        );
        if (providerNode) {
          setSelectedProvider((providerNode.data as ProviderNodeData).provider);
        }
      }
    },
    [loadWorkflow, nodes]
  );

  // ワークフロー読み込み（クラウド）
  const handleLoadCloudWorkflow = useCallback(
    async (id: string) => {
      const success = await loadCloudWorkflow(id);
      if (success) {
        // ノードが更新された後にプロバイダーを復元する必要があるため
        // 次のレンダリングサイクルで実行
        setTimeout(() => {
          const providerNode = nodes.find(
            (n) => (n.data as WorkflowNodeData).type === 'provider'
          );
          if (providerNode) {
            setSelectedProvider((providerNode.data as ProviderNodeData).provider);
          }
        }, 0);
      }
    },
    [loadCloudWorkflow, nodes]
  );

  return (
    <div className="flex flex-col h-[calc(100vh-80px)] bg-[#1a1a1a] rounded-xl overflow-hidden border border-[#404040]">
      {/* ツールバー */}
      <WorkflowToolbar
        workflowName={currentWorkflowName}
        isUnsaved={isUnsaved}
        isCloudSynced={isCloudSynced}
        saveError={saveError}
        selectedNodeCount={nodes.filter((n) => n.selected).length}
        onSave={handleSave}
        onSaveAs={handleSaveAs}
        onOpen={() => setIsOpenModalOpen(true)}
        onNew={handleReset}
        onClearError={clearSaveError}
        onDuplicate={handleDuplicate}
      />

      <div className="flex flex-1 overflow-hidden">
        {/* サイドパネル - ノードパレット */}
        <NodePalette
          selectedProvider={selectedProvider ?? undefined}
          onDragStart={onDragStart}
        />

      {/* メインキャンバス */}
      <div className="flex-1 relative" ref={reactFlowWrapper}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onDrop={onDrop}
          onDragOver={onDragOver}
          nodeTypes={nodeTypes}
          defaultEdgeOptions={defaultEdgeOptions}
          connectionLineStyle={connectionLineStyle}
          isValidConnection={isValidConnection}
          fitView
          fitViewOptions={fitViewOptions}
          className="bg-[#212121]"
          selectionOnDrag
          selectNodesOnDrag
          selectionMode={SelectionMode.Partial}
          multiSelectionKeyCode="Shift"
          deleteKeyCode={null}
        >
          <Background
            variant={BackgroundVariant.Dots}
            gap={20}
            size={1}
            color="#404040"
          />
          <Controls
            className="!bg-[#2a2a2a] !border-[#404040] !rounded-lg"
            showInteractive={false}
          />
          <MiniMap
            className="!bg-[#2a2a2a] !border-[#404040]"
            nodeColor="#fce300"
            maskColor="rgba(0, 0, 0, 0.5)"
          />

          {/* トップパネル */}
          <Panel position="top-right" className="flex items-center gap-2">
            {/* バリデーションエラー */}
            {errors.length > 0 && (
              <div className="flex items-center gap-1 px-2 py-1 bg-red-500/10 border border-red-500/30 rounded-lg">
                <AlertCircle className="w-3 h-3 text-red-400" />
                <span className="text-xs text-red-400">
                  {errors.length}件のエラー
                </span>
              </div>
            )}

            {/* バリデーション警告 */}
            {warnings.length > 0 && (
              <div className="flex items-center gap-1 px-2 py-1 bg-yellow-900/30 border border-yellow-600/40 rounded-lg">
                <AlertCircle className="w-3 h-3 text-yellow-400" />
                <span className="text-xs text-yellow-400">
                  {warnings.length}件の警告
                </span>
              </div>
            )}

            {/* リセットボタン */}
            <button
              onClick={handleReset}
              className="p-2 bg-[#2a2a2a] hover:bg-[#3a3a3a] rounded-lg transition-colors"
              title="新規ワークフロー"
            >
              <RotateCcw className="w-4 h-4 text-gray-400" />
            </button>
          </Panel>

          {/* ボトムパネル - ヘルプ */}
          <Panel position="bottom-left">
            <div className="px-3 py-2 bg-[#2a2a2a]/80 rounded-lg text-xs text-gray-400">
              <p>ドラッグ: 範囲選択 • Ctrl+C/V: コピペ • Ctrl+D: 複製 • Ctrl+X: 削除</p>
            </div>
          </Panel>
        </ReactFlow>
      </div>
      </div>

      {/* 保存モーダル */}
      <SaveWorkflowModal
        isOpen={isSaveModalOpen}
        onClose={() => setIsSaveModalOpen(false)}
        currentName={currentWorkflowName}
        onSaveLocal={handleSaveLocal}
        onSaveCloud={handleSaveCloud}
        isLoggedIn={isLoggedIn}
        isSaving={isLoadingCloud}
      />

      {/* ワークフロー一覧モーダル */}
      <WorkflowList
        isOpen={isOpenModalOpen}
        localWorkflows={workflowList}
        cloudWorkflows={cloudWorkflowList}
        isLoadingCloud={isLoadingCloud}
        onLoadLocal={handleLoadWorkflow}
        onLoadCloud={handleLoadCloudWorkflow}
        onDeleteLocal={deleteWorkflow}
        onDeleteCloud={deleteCloudWorkflow}
        onDuplicateCloud={duplicateCloudWorkflow}
        onClose={() => setIsOpenModalOpen(false)}
      />
    </div>
  );
}

// ReactFlowProviderでラップしたエクスポート用コンポーネント
export function NodeEditor({ onVideoGenerated }: NodeEditorProps) {
  return (
    <ReactFlowProvider>
      <NodeEditorInner onVideoGenerated={onVideoGenerated} />
    </ReactFlowProvider>
  );
}
