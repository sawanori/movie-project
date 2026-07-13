"""Node-editor graph -> server-executable step list (pure validation + compilation).

This module is the SERVER-SIDE counterpart of the frontend
``movie-maker/components/node-editor/utils/graph-to-api.ts``. It takes the same
``nodes`` / ``edges`` graph the visual editor produces and turns it into an ordered
list of executable steps. It performs NO I/O (no DB, no network); execution of the
steps is a separate concern (task_005). Everything here is a pure function.

Scope (server-execution v1):
  * Exactly ONE ``generate`` node per graph.
  * Generate step first, then downstream chain steps (Dialogue / GetVideoFrame /
    TrimVideo / StitchVideos) in a stable, dependency-respecting order.
  * No DAG parallelism, no conditional branching, no multiple Generate, no v2v
    Generate->Generate chaining.

---------------------------------------------------------------------------
Node type -> StoryVideoCreate field mapping (Generate step params)
---------------------------------------------------------------------------
The Generate step ``params`` are a dict that validates against
``app.videos.schemas.StoryVideoCreate``. Mapping (traced from graph-to-api.ts):

  ImageInput.imageUrl                      -> image_url            (required)
      (fallback: KlingElements.elementImages[0] if no ImageInput image; see decision (c))
  Prompt.englishPrompt                     -> story_text           (required)
  Prompt.subjectType                       -> subject_type
  Provider.aspectRatio                     -> aspect_ratio         (default '9:16')
  Provider.provider                        -> video_provider       (default 'runway')
  Provider.duration + provider kind        -> kling_duration | seedance_duration | veo_duration
  Provider.seedanceMode                    -> seedance_mode        (seedance only)
  Provider.seedanceGenerateAudio           -> seedance_generate_audio (seedance only, always emitted)
  Provider.seedanceSeed                    -> seedance_seed        (seedance only, if set)
  Provider.seedanceResolution              -> seedance_resolution  (seedance only, if set)
  Provider.seedanceCameraFixed             -> seedance_camera_fixed(seedance only, if not None)
  CameraWork.promptText                    -> camera_work          (omitted if empty; see decision (b))
  BGM.bgmTrackId / BGM.customBgmUrl        -> bgm_track_id / custom_bgm_url
  FilmGrain.grain                          -> film_grain           (default 'medium')
  LUT.useLut                               -> use_lut              (default True)
  Overlay.{text,position,font,color}       -> overlay              (only if text set)
  KlingMode.mode                           -> kling_mode           (piapi_kling only)
  KlingElements.elementImages              -> element_images       (piapi_kling only)
  KlingEndFrame.endFrameImageUrl           -> end_frame_image_url  (piapi_kling only)
  KlingCameraControl.config                -> kling_camera_control (piapi_kling only; deletes camera_work, decision (b))
  ActTwo.{useActTwo,motionType,...}        -> use_act_two/motion_type/expression_intensity/body_control (runway + person/animation)
  HailuoEndFrame.lastFrameImageUrl         -> end_frame_image_url  (hailuo only)
  OmniReference image/video/audio slots    -> image/video/audio_reference_asset_ids (seedance only, consent required)

Downstream (chain) steps carry their own ``params`` (NOT StoryVideoCreate):
  Dialogue     -> {text, voice_id, speed, use_lip_sync, tts_instructions, kana_text, use_kana_mode, source_video_node_id}
  GetVideoFrame-> {direction, source_video_node_id}
  TrimVideo    -> {start_seconds, end_seconds, source_video_node_id}
  StitchVideos -> {transition, source_video_node_ids}   (ordered list, video_1..video_5)

---------------------------------------------------------------------------
Chain semantics (how one step's output feeds the next step's input)
---------------------------------------------------------------------------
Confirmed from the frontend NodeEditor execution handlers
(``movie-maker/components/node-editor/NodeEditor.tsx``) and node components:

  * Every downstream node reads its upstream node's VIDEO output via
    ``getNodeVideoOutput(upstream.data)`` which resolves ``outputVideoUrl ?? videoUrl``
    (lib/types/node-editor.ts). So Generate.videoUrl, Dialogue.outputVideoUrl,
    TrimVideo.outputVideoUrl and StitchVideos.outputVideoUrl are all valid video sources.
  * Handle wiring (target handle on the downstream node):
      Dialogue      target handle 'dialogue_video_input'        (NodeEditor.tsx:507-509)
      GetVideoFrame target handle 'get_video_frame_video_input' (NodeEditor.tsx:621-623)
      TrimVideo     target handle 'trim_video_input'            (NodeEditor.tsx:664-666)
      StitchVideos  target handles 'video_1'..'video_5', ordered by handle index
                                                                (NodeEditor.tsx:705-731)
  * Because execution (resolving the actual URL) is task_005's job, the compiler records
    the *source node id* (``source_video_node_id`` / ``source_video_node_ids``) for each
    downstream step instead of a URL. That is the pure, I/O-free representation of the
    same wiring.

---------------------------------------------------------------------------
Divergence decision table (graph-to-api.ts behaviour: reproduce vs reject)
---------------------------------------------------------------------------
(a) Global fallback for unconnected config nodes
    graph-to-api.ts:111-135 falls back to "first node of type X in the whole graph" when a
    config node (KlingMode/Elements/EndFrame/CameraControl/ActTwo/HailuoEndFrame) is not wired
    into the Provider input handle. It is marked ``TODO(Phase 2)`` for removal.
    DECISION: REJECT (do not reproduce). The server requires config nodes to be connected to the
    Provider via their *_input handle (edge-trace resolution only). Rationale: the fallback is
    explicitly deprecated, is ambiguous with multiple providers, and reproducing a scheduled-for-
    deletion behaviour would be new debt. Unconnected config nodes are simply ignored (their
    fields are absent), which is the safe subset of the frontend behaviour.

(b) Kling 6-axis camera control deletes camera_work
    graph-to-api.ts:412-420: when KlingCameraControl has any non-zero axis, it sets
    kling_camera_control and DELETES camera_work (custom control wins).
    DECISION: REPRODUCE. Identical precedence, so parity holds for Kling graphs that use both.

(c) KlingElements image substituting for ImageInput
    graph-to-api.ts:299-301: if there is no ImageInput image, the first KlingElements element image
    is used as image_url.
    DECISION: REPRODUCE for the Generate payload (so single-Generate parity holds). BUT this makes
    the graph ineligible for batch execution: the batch rule "exactly one ImageInput" is violated
    when the image comes from KlingElements instead. Such graphs are flagged batch-ineligible
    (BatchPreconditionError on the batch-validation path), matching task requirement (c).

(d) Provider guards (V2V=Runway, Kling/Hailuo/Seedance/Veo field ownership)
    graph-to-api.ts:228-229 forces V2V to Runway; StoryVideoCreate validators enforce
    provider ownership of seedance_*/veo_duration/element_images/kling_duration.
    DECISION: REPRODUCE. We keep provider->field mapping consistent with graph-to-api.ts and rely on
    StoryVideoCreate to reject mismatches. (Server-execution v1 does not compile V2V graphs anyway:
    a VideoInput source or Generate->Generate is rejected; see V2vChainNotSupportedError.)
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Optional

# ---------------------------------------------------------------------------
# Supported node types (the 22 currently-registered editor node types).
# Source of truth: movie-maker/components/node-editor/utils/node-types.ts:34-62.
# StickyNote is registered but cosmetic -> ignored (never becomes a step).
# ---------------------------------------------------------------------------
GENERATE_INPUT_NODE_TYPES = frozenset(
    {
        "imageInput",
        "videoInput",
        "prompt",
        "provider",
        "cameraWork",
        "klingMode",
        "klingElements",
        "klingEndFrame",
        "klingCameraControl",
        "actTwo",
        "hailuoEndFrame",
        "bgm",
        "filmGrain",
        "lut",
        "overlay",
        "omniReference",
    }
)
DOWNSTREAM_NODE_TYPES = frozenset({"dialogue", "getVideoFrame", "trimVideo", "stitchVideos"})
IGNORED_NODE_TYPES = frozenset({"stickyNote"})
SUPPORTED_NODE_TYPES = GENERATE_INPUT_NODE_TYPES | DOWNSTREAM_NODE_TYPES | IGNORED_NODE_TYPES | {"generate"}

# Handle ids mirrored from movie-maker/lib/types/node-editor.ts HANDLE_IDS.
H_CONFIG_INPUT = "config"
H_SOURCE_VIDEO_INPUT = "source_video_url"
H_KLING_MODE_INPUT = "kling_mode_input"
H_KLING_ELEMENTS_INPUT = "kling_elements_input"
H_KLING_END_FRAME_INPUT = "kling_end_frame_input"
H_KLING_CAMERA_CONTROL_INPUT = "kling_camera_control_input"
H_ACT_TWO_INPUT = "act_two_input"
H_HAILUO_END_FRAME_INPUT = "hailuo_end_frame_input"
H_OMNI_REFERENCE_INPUT = "omni_reference_input"
H_DIALOGUE_VIDEO_INPUT = "dialogue_video_input"
H_GET_VIDEO_FRAME_VIDEO_INPUT = "get_video_frame_video_input"
H_TRIM_VIDEO_INPUT = "trim_video_input"
H_STITCH_INPUT_HANDLES = ("video_1", "video_2", "video_3", "video_4", "video_5")

# Downstream node type -> its single video-input target handle.
_DOWNSTREAM_VIDEO_INPUT_HANDLE = {
    "dialogue": H_DIALOGUE_VIDEO_INPUT,
    "getVideoFrame": H_GET_VIDEO_FRAME_VIDEO_INPUT,
    "trimVideo": H_TRIM_VIDEO_INPUT,
}


# ---------------------------------------------------------------------------
# Errors (typed so callers can distinguish validation-failure categories).
# ---------------------------------------------------------------------------
class WorkflowGraphError(Exception):
    """Base class for structural graph errors that abort validation/compilation."""


class UnsupportedNodeError(WorkflowGraphError):
    """One or more node types are not supported (future/malformed nodes)."""

    def __init__(self, node_types: list[str]):
        self.node_types = node_types
        super().__init__(
            "未対応のノードタイプが含まれています: " + ", ".join(sorted(set(node_types)))
        )


class MultipleGenerateError(WorkflowGraphError):
    """More than one Generate node (server-execution v1 supports exactly one)."""

    def __init__(self, count: int):
        self.count = count
        super().__init__(
            f"生成ノードは1グラフに1個のみ対応しています (検出: {count} 個)"
        )


class V2vChainNotSupportedError(WorkflowGraphError):
    """A Generate->Generate v2v chain was detected; not supported server-side in v1."""

    def __init__(self) -> None:
        super().__init__(
            "動画から動画への連結生成 (v2v チェーン) はサーバー実行では未対応です。"
            "クライアント実行をご利用ください。"
        )


class BatchPreconditionError(WorkflowGraphError):
    """The graph violates a batch-execution precondition (e.g. not exactly one ImageInput)."""

    def __init__(self, message: str):
        super().__init__(message)


@dataclass(frozen=True)
class ValidationErrorItem:
    """A single non-fatal validation problem (collected, not raised)."""

    type: str  # 'missing_node' | 'missing_input' | 'disconnected' | 'invalid_value' | 'provider_mismatch'
    message: str
    node_id: Optional[str] = None


@dataclass(frozen=True)
class ValidationResult:
    is_valid: bool
    errors: list[ValidationErrorItem] = field(default_factory=list)


@dataclass(frozen=True)
class Step:
    """A single compiled step.

    Behaves like a dict for the documented keys (``step["node_id"]``) so callers/tests
    do not need to import this class. Keys: node_id, node_type, params.
    """

    node_id: str
    node_type: str
    params: dict[str, Any]

    def __getitem__(self, key: str) -> Any:
        return getattr(self, key)

    def to_dict(self) -> dict[str, Any]:
        return {"node_id": self.node_id, "node_type": self.node_type, "params": self.params}


# ---------------------------------------------------------------------------
# Graph access helpers (pure).
# ---------------------------------------------------------------------------
def _node_type(node: dict) -> str:
    data = node.get("data") or {}
    return data.get("type") or node.get("type") or ""


def _node_data(node: dict) -> dict:
    return node.get("data") or {}


def _index_nodes(nodes: list[dict]) -> dict[str, dict]:
    return {n["id"]: n for n in nodes}


def _find_first(nodes: list[dict], node_type: str) -> Optional[dict]:
    for n in nodes:
        if _node_type(n) == node_type:
            return n
    return None


def _incoming(edges: list[dict], target_id: str, target_handle: str) -> Optional[dict]:
    for e in edges:
        if e.get("target") == target_id and e.get("targetHandle") == target_handle:
            return e
    return None


def _source_data_via_handle(
    node_id: str,
    target_handle: str,
    node_index: dict[str, dict],
    edges: list[dict],
    expected_type: str,
) -> Optional[dict]:
    """Return the data of the node connected to ``node_id``'s ``target_handle`` if it is
    of ``expected_type``. Edge-trace resolution only (decision (a): no global fallback)."""
    edge = _incoming(edges, node_id, target_handle)
    if not edge:
        return None
    src = node_index.get(edge.get("source"))
    if not src:
        return None
    return _node_data(src) if _node_type(src) == expected_type else None


# ---------------------------------------------------------------------------
# validate_graph
# ---------------------------------------------------------------------------
def validate_graph(nodes: list[dict], edges: list[dict]) -> ValidationResult:
    """Validate a node-editor graph for server-side single-Generate execution.

    Raises (fatal, distinct categories):
      * ``UnsupportedNodeError``     -- unknown node type present.
      * ``MultipleGenerateError``    -- more than one generate node.
      * ``V2vChainNotSupportedError``-- generate->generate v2v chain edge.

    Returns ``ValidationResult(is_valid, errors)`` for recoverable issues
    (missing generate node / missing required Generate input / disconnected downstream node).
    """
    # (1) Unsupported node types (defensive requirement for future/malformed nodes).
    unknown = [_node_type(n) for n in nodes if _node_type(n) not in SUPPORTED_NODE_TYPES]
    if unknown:
        raise UnsupportedNodeError(unknown)

    generate_nodes = [n for n in nodes if _node_type(n) == "generate"]

    # (5a) Multiple Generate.
    if len(generate_nodes) > 1:
        raise MultipleGenerateError(len(generate_nodes))

    # (5b) v2v Generate->Generate chain edge (even with a single generate as source).
    generate_ids = {n["id"] for n in generate_nodes}
    for e in edges:
        if (
            e.get("targetHandle") == H_SOURCE_VIDEO_INPUT
            and e.get("source") in generate_ids
        ):
            raise V2vChainNotSupportedError()

    errors: list[ValidationErrorItem] = []
    node_index = _index_nodes(nodes)

    # Missing generate node.
    if not generate_nodes:
        errors.append(
            ValidationErrorItem(type="missing_node", message="生成ノードが必要です")
        )
        # Still run downstream checks so callers see everything at once.
        _validate_downstream(nodes, edges, node_index, errors)
        return ValidationResult(is_valid=False, errors=errors)

    gen = generate_nodes[0]
    gen_id = gen["id"]

    # A VideoInput feeding the Generate source is a v2v graph -> unsupported server-side.
    v2v_edge = _incoming(edges, gen_id, H_SOURCE_VIDEO_INPUT)
    if v2v_edge is not None:
        raise V2vChainNotSupportedError()

    # Required Generate inputs: image source + prompt.
    image_url = _resolve_generate_image_url(nodes, edges, node_index, gen_id)
    if not image_url:
        errors.append(
            ValidationErrorItem(
                type="missing_input",
                node_id=gen_id,
                message="画像が選択されていません (ImageInput または KlingElements が必要)",
            )
        )

    prompt_data = _resolve_generate_prompt(nodes, edges, node_index, gen_id)
    if not (prompt_data and prompt_data.get("englishPrompt")):
        errors.append(
            ValidationErrorItem(
                type="missing_input",
                node_id=gen_id,
                message="プロンプトが入力されていません",
            )
        )

    # No incoming edges at all -> also flag disconnected (distinct signal).
    if not any(e.get("target") == gen_id for e in edges):
        errors.append(
            ValidationErrorItem(
                type="disconnected", node_id=gen_id, message="生成ノードに接続がありません"
            )
        )

    _validate_downstream(nodes, edges, node_index, errors)

    return ValidationResult(is_valid=not errors, errors=errors)


def _validate_downstream(
    nodes: list[dict],
    edges: list[dict],
    node_index: dict[str, dict],
    errors: list[ValidationErrorItem],
) -> None:
    """Every downstream node must have its video input(s) connected to a video-producing node."""
    for n in nodes:
        nt = _node_type(n)
        if nt in _DOWNSTREAM_VIDEO_INPUT_HANDLE:
            handle = _DOWNSTREAM_VIDEO_INPUT_HANDLE[nt]
            if _incoming(edges, n["id"], handle) is None:
                errors.append(
                    ValidationErrorItem(
                        type="disconnected",
                        node_id=n["id"],
                        message="動画ノードを接続してください",
                    )
                )
        elif nt == "stitchVideos":
            connected = [
                h for h in H_STITCH_INPUT_HANDLES if _incoming(edges, n["id"], h) is not None
            ]
            if len(connected) < 2:
                errors.append(
                    ValidationErrorItem(
                        type="disconnected",
                        node_id=n["id"],
                        message="2本以上の動画を接続してください",
                    )
                )


# ---------------------------------------------------------------------------
# Generate input resolution (edge-trace, mirrors graph-to-api.ts intent)
# ---------------------------------------------------------------------------
def _find_provider_for_generate(
    nodes: list[dict], edges: list[dict], node_index: dict[str, dict], gen_id: str
) -> Optional[dict]:
    """Provider node wired to Generate's CONFIG_INPUT (edge-trace; no global fallback, decision (a))."""
    edge = _incoming(edges, gen_id, H_CONFIG_INPUT)
    if not edge:
        return None
    src = node_index.get(edge.get("source"))
    return src if src and _node_type(src) == "provider" else None


def _resolve_generate_image_url(
    nodes: list[dict], edges: list[dict], node_index: dict[str, dict], gen_id: str
) -> Optional[str]:
    """image_url for the Generate step.

    Prefers an ImageInput wired to the Generate image handle; else the first ImageInput in
    the graph (image handle default id equals the node type default). Decision (c): if no
    ImageInput image exists, fall back to KlingElements.elementImages[0].
    """
    # ImageInput wired to Generate image_url handle, else first ImageInput node.
    img = _source_data_via_handle(gen_id, "image_url", node_index, edges, "imageInput")
    if img is None:
        img_node = _find_first(nodes, "imageInput")
        img = _node_data(img_node) if img_node else None
    if img and img.get("imageUrl"):
        return img["imageUrl"]

    # Decision (c): KlingElements first element image substitutes for ImageInput.
    kel = _find_first(nodes, "klingElements")
    if kel:
        images = _node_data(kel).get("elementImages") or []
        if images:
            return images[0]
    return None


def _resolve_generate_prompt(
    nodes: list[dict], edges: list[dict], node_index: dict[str, dict], gen_id: str
) -> Optional[dict]:
    prompt = _source_data_via_handle(gen_id, "story_text", node_index, edges, "prompt")
    if prompt is None:
        prompt_node = _find_first(nodes, "prompt")
        prompt = _node_data(prompt_node) if prompt_node else None
    return prompt


def _resolve_camera_work(
    nodes: list[dict], edges: list[dict], node_index: dict[str, dict], gen_id: str
) -> Optional[dict]:
    cam = _source_data_via_handle(gen_id, "camera_work", node_index, edges, "cameraWork")
    if cam is None:
        cam_node = _find_first(nodes, "cameraWork")
        cam = _node_data(cam_node) if cam_node else None
    return cam


def _uses_klingelements_image_substitution(
    nodes: list[dict], edges: list[dict], node_index: dict[str, dict], gen_id: str
) -> bool:
    """True when the image_url comes from KlingElements rather than an ImageInput node."""
    img = _source_data_via_handle(gen_id, "image_url", node_index, edges, "imageInput")
    if img is None:
        img_node = _find_first(nodes, "imageInput")
        img = _node_data(img_node) if img_node else None
    if img and img.get("imageUrl"):
        return False
    kel = _find_first(nodes, "klingElements")
    if kel and (_node_data(kel).get("elementImages") or []):
        return True
    return False


# ---------------------------------------------------------------------------
# compile_graph
# ---------------------------------------------------------------------------
def compile_graph(nodes: list[dict], edges: list[dict]) -> list[Step]:
    """Compile a validated graph into an ordered list of ``Step`` objects.

    Ordering: the single Generate step first, then downstream steps
    (Dialogue / GetVideoFrame / TrimVideo / StitchVideos) in dependency order
    (a step appears after the step that produces its video input).

    Fatal structural problems raise the same errors as :func:`validate_graph`.
    """
    # Reuse validation for fatal categories (raises) and to fail closed on missing pieces.
    result = validate_graph(nodes, edges)
    if not result.is_valid:
        # Non-fatal validation issues still mean we cannot build a runnable Generate step.
        raise WorkflowGraphError(
            "グラフをコンパイルできません: "
            + "; ".join(e.message for e in result.errors)
        )

    node_index = _index_nodes(nodes)
    gen = _find_first(nodes, "generate")
    assert gen is not None  # guaranteed by validate_graph
    gen_id = gen["id"]

    params = _build_generate_params(nodes, edges, node_index, gen_id)
    steps: list[Step] = [Step(node_id=gen_id, node_type="generate", params=params)]

    steps.extend(_compile_downstream(nodes, edges, node_index, gen_id))
    return steps


def _build_generate_params(
    nodes: list[dict], edges: list[dict], node_index: dict[str, dict], gen_id: str
) -> dict[str, Any]:
    """Build the Generate step params (StoryVideoCreate-compatible dict).

    Mirrors graph-to-api.ts I2V path (:296-441). Undefined/empty optional fields are omitted,
    matching the frontend which never serialises ``undefined`` properties. Always emits
    image_url, story_text, aspect_ratio, video_provider, subject_type, film_grain, use_lut.
    """
    provider_node = _find_provider_for_generate(nodes, edges, node_index, gen_id)
    provider = _node_data(provider_node) if provider_node else _empty_or_first(nodes, "provider")

    image_url = _resolve_generate_image_url(nodes, edges, node_index, gen_id) or ""
    prompt = _resolve_generate_prompt(nodes, edges, node_index, gen_id) or {}
    camera = _resolve_camera_work(nodes, edges, node_index, gen_id)

    bgm = _empty_or_first(nodes, "bgm")
    film_grain = _empty_or_first(nodes, "filmGrain")
    lut = _empty_or_first(nodes, "lut")
    overlay = _empty_or_first(nodes, "overlay")

    provider_kind = provider.get("provider") if provider else None

    params: dict[str, Any] = {
        "image_url": image_url,
        "story_text": prompt.get("englishPrompt", ""),
        "aspect_ratio": (provider.get("aspectRatio") if provider else None) or "9:16",
        "video_provider": provider_kind or "runway",
        "subject_type": (prompt.get("subjectType") if prompt else None) or "person",
        "film_grain": (film_grain.get("grain") if film_grain else None) or "medium",
        "use_lut": lut.get("useLut") if (lut and "useLut" in lut) else True,
    }

    # camera_work (omitted if empty).
    if camera and camera.get("promptText"):
        params["camera_work"] = camera["promptText"]

    # BGM.
    if bgm:
        if bgm.get("bgmTrackId"):
            params["bgm_track_id"] = bgm["bgmTrackId"]
        if bgm.get("customBgmUrl"):
            params["custom_bgm_url"] = bgm["customBgmUrl"]

    # Overlay (only if text set).
    if overlay and overlay.get("text"):
        params["overlay"] = {
            "text": overlay.get("text"),
            "position": overlay.get("position"),
            "font": overlay.get("font"),
            "color": overlay.get("color"),
        }

    # Duration mapping by provider kind (graph-to-api.ts:337-348).
    duration = provider.get("duration") if provider else None
    if duration is not None:
        if provider_kind == "piapi_kling" and duration in (5, 10):
            params["kling_duration"] = duration
        elif provider_kind == "seedance":
            params["seedance_duration"] = min(15, max(4, round(duration)))
        elif provider_kind == "veo":
            params["veo_duration"] = duration if duration in (4, 6, 8) else 8
        # runway/domoai/hailuo: duration fixed -> ignored.

    # Seedance-specific fields (graph-to-api.ts:351-395).
    if provider_kind == "seedance":
        _apply_seedance_params(params, provider, nodes, edges, node_index, provider_node)

    # Kling-specific fields (graph-to-api.ts:398-422).
    if provider_kind == "piapi_kling":
        _apply_kling_params(params, provider_node, node_index, edges)

    # Act-Two (runway + person/animation; graph-to-api.ts:425-433).
    if provider_kind == "runway":
        _apply_act_two_params(params, provider_node, node_index, edges, prompt)

    # Hailuo end frame (graph-to-api.ts:437-439).
    if provider_kind == "hailuo":
        hailuo = _source_data_via_handle(
            provider_node["id"], H_HAILUO_END_FRAME_INPUT, node_index, edges, "hailuoEndFrame"
        ) if provider_node else None
        if hailuo and hailuo.get("lastFrameImageUrl"):
            params["end_frame_image_url"] = hailuo["lastFrameImageUrl"]

    return params


def _empty_or_first(nodes: list[dict], node_type: str) -> Optional[dict]:
    node = _find_first(nodes, node_type)
    return _node_data(node) if node else None


def _apply_seedance_params(
    params: dict[str, Any],
    provider: dict,
    nodes: list[dict],
    edges: list[dict],
    node_index: dict[str, dict],
    provider_node: Optional[dict],
) -> None:
    if provider.get("seedanceMode"):
        params["seedance_mode"] = provider["seedanceMode"]

    # generate_audio is ALWAYS emitted for seedance (graph-to-api.ts:357), default False.
    params["seedance_generate_audio"] = bool(provider.get("seedanceGenerateAudio", False))

    if provider.get("seedanceSeed") is not None:
        params["seedance_seed"] = provider["seedanceSeed"]
    if provider.get("seedanceResolution"):
        params["seedance_resolution"] = provider["seedanceResolution"]
    if provider.get("seedanceCameraFixed") is not None:
        params["seedance_camera_fixed"] = provider["seedanceCameraFixed"]

    # Omni reference (graph-to-api.ts:368-395): OmniReference wired to Provider OMNI_REFERENCE_INPUT.
    if provider_node is None:
        return
    omni = _source_data_via_handle(
        provider_node["id"], H_OMNI_REFERENCE_INPUT, node_index, edges, "omniReference"
    )
    if omni is None:
        return
    if not omni.get("consentAccepted"):
        raise WorkflowGraphError("著作権同意が必要です")

    image_ids = _compact_asset_ids(omni.get("imageSlots"))
    video_ids = _compact_asset_ids(omni.get("videoSlots"))
    audio_ids = _compact_asset_ids(omni.get("audioSlots"))
    if image_ids:
        params["image_reference_asset_ids"] = image_ids
    if video_ids:
        params["video_reference_asset_ids"] = video_ids
    if audio_ids:
        params["audio_reference_asset_ids"] = audio_ids


def _compact_asset_ids(slots: Optional[list]) -> list[str]:
    """Non-empty slot asset ids in order (mirrors omni-reference-compact.ts compactSlots)."""
    if not slots:
        return []
    return [s["assetId"] for s in slots if s and s.get("assetId")]


def _apply_kling_params(
    params: dict[str, Any],
    provider_node: Optional[dict],
    node_index: dict[str, dict],
    edges: list[dict],
) -> None:
    if provider_node is None:
        return
    pid = provider_node["id"]

    kmode = _source_data_via_handle(pid, H_KLING_MODE_INPUT, node_index, edges, "klingMode")
    if kmode and kmode.get("mode"):
        params["kling_mode"] = kmode["mode"]

    kel = _source_data_via_handle(pid, H_KLING_ELEMENTS_INPUT, node_index, edges, "klingElements")
    if kel and (kel.get("elementImages") or []):
        params["element_images"] = [{"image_url": url} for url in kel["elementImages"]]

    kend = _source_data_via_handle(pid, H_KLING_END_FRAME_INPUT, node_index, edges, "klingEndFrame")
    if kend and kend.get("endFrameImageUrl"):
        params["end_frame_image_url"] = kend["endFrameImageUrl"]

    kcam = _source_data_via_handle(
        pid, H_KLING_CAMERA_CONTROL_INPUT, node_index, edges, "klingCameraControl"
    )
    if kcam:
        config = kcam.get("config") or {}
        if any(v != 0 for v in config.values()):
            params["kling_camera_control"] = config
            # Decision (b): 6-axis control removes camera_work.
            params.pop("camera_work", None)


def _apply_act_two_params(
    params: dict[str, Any],
    provider_node: Optional[dict],
    node_index: dict[str, dict],
    edges: list[dict],
    prompt: dict,
) -> None:
    if provider_node is None:
        return
    act = _source_data_via_handle(
        provider_node["id"], H_ACT_TWO_INPUT, node_index, edges, "actTwo"
    )
    if not (act and act.get("useActTwo")):
        return
    subject = (prompt or {}).get("subjectType")
    if subject not in ("person", "animation"):
        return
    params["use_act_two"] = True
    if act.get("motionType"):
        params["motion_type"] = act["motionType"]
    if act.get("expressionIntensity") is not None:
        params["expression_intensity"] = act["expressionIntensity"]
    if act.get("bodyControl") is not None:
        params["body_control"] = act["bodyControl"]


# ---------------------------------------------------------------------------
# Downstream compilation (topological order over the video chain)
# ---------------------------------------------------------------------------
def _compile_downstream(
    nodes: list[dict], edges: list[dict], node_index: dict[str, dict], gen_id: str
) -> list[Step]:
    """Emit downstream steps in dependency order.

    Each downstream node's video source is the upstream node id feeding its input handle
    (Kahn topological sort over those edges). ``gen_id`` is the root producer.
    """
    downstream_nodes = {
        n["id"]: n for n in nodes if _node_type(n) in DOWNSTREAM_NODE_TYPES
    }

    # Build dependency edges (downstream node -> its upstream video-source node ids).
    deps: dict[str, list[str]] = {}
    for node_id, n in downstream_nodes.items():
        deps[node_id] = _video_source_node_ids(n, edges)

    # Kahn topological sort; producers outside the downstream set (e.g. gen_id) are "ready".
    ordered: list[str] = []
    emitted: set[str] = set()
    remaining = dict(downstream_nodes)
    # Deterministic tie-break: preserve node array order.
    order_index = {n["id"]: i for i, n in enumerate(nodes)}

    while remaining:
        ready = [
            nid
            for nid in remaining
            if all(dep not in remaining for dep in deps.get(nid, []))
        ]
        if not ready:
            # Cycle among downstream nodes (shouldn't happen for the 4 linear utilities);
            # emit remaining in stable order to stay pure/total rather than loop forever.
            ready = sorted(remaining, key=lambda x: order_index[x])
        ready.sort(key=lambda x: order_index[x])
        for nid in ready:
            ordered.append(nid)
            emitted.add(nid)
            remaining.pop(nid, None)

    steps: list[Step] = []
    for nid in ordered:
        n = downstream_nodes[nid]
        steps.append(_compile_downstream_step(n, edges))
    return steps


def _video_source_node_ids(node: dict, edges: list[dict]) -> list[str]:
    nt = _node_type(node)
    node_id = node["id"]
    if nt == "stitchVideos":
        pairs: list[tuple[int, str]] = []
        for idx, handle in enumerate(H_STITCH_INPUT_HANDLES):
            e = _incoming(edges, node_id, handle)
            if e is not None:
                pairs.append((idx, e["source"]))
        pairs.sort(key=lambda p: p[0])
        return [src for _, src in pairs]
    handle = _DOWNSTREAM_VIDEO_INPUT_HANDLE.get(nt)
    if handle is None:
        return []
    e = _incoming(edges, node_id, handle)
    return [e["source"]] if e is not None else []


def _compile_downstream_step(node: dict, edges: list[dict]) -> Step:
    nt = _node_type(node)
    data = _node_data(node)
    node_id = node["id"]
    sources = _video_source_node_ids(node, edges)

    if nt == "dialogue":
        params: dict[str, Any] = {
            "text": data.get("text", ""),
            "voice_id": data.get("voiceId"),
            "speed": data.get("speed", 1.0),
            "use_lip_sync": bool(data.get("useLipSync", False)),
            "source_video_node_id": sources[0] if sources else None,
        }
        if data.get("ttsInstructions"):
            params["tts_instructions"] = data["ttsInstructions"]
        if data.get("useKanaMode"):
            params["use_kana_mode"] = True
            if data.get("kanaText"):
                params["kana_text"] = data["kanaText"]
        return Step(node_id=node_id, node_type=nt, params=params)

    if nt == "getVideoFrame":
        return Step(
            node_id=node_id,
            node_type=nt,
            params={
                "direction": data.get("direction", "first"),
                "source_video_node_id": sources[0] if sources else None,
            },
        )

    if nt == "trimVideo":
        return Step(
            node_id=node_id,
            node_type=nt,
            params={
                "start_seconds": data.get("startSeconds", 0),
                "end_seconds": data.get("endSeconds"),
                "source_video_node_id": sources[0] if sources else None,
            },
        )

    if nt == "stitchVideos":
        return Step(
            node_id=node_id,
            node_type=nt,
            params={
                "transition": data.get("transition", "none"),
                "source_video_node_ids": sources,
            },
        )

    # Unreachable: DOWNSTREAM_NODE_TYPES is exhaustive above.
    raise WorkflowGraphError(f"未対応の後段ノード: {nt}")


# ---------------------------------------------------------------------------
# Batch precondition (decision (c)): exactly one ImageInput, no KlingElements substitution
# ---------------------------------------------------------------------------
def validate_batch_preconditions(nodes: list[dict], edges: list[dict]) -> None:
    """Raise ``BatchPreconditionError`` if the graph cannot be batch-executed.

    Batch execution requires exactly one ImageInput node providing the base image. When the
    image comes from KlingElements instead (decision (c)), the graph is batch-ineligible.
    """
    node_index = _index_nodes(nodes)
    gen = _find_first(nodes, "generate")
    image_inputs = [n for n in nodes if _node_type(n) == "imageInput"]

    if gen is not None and _uses_klingelements_image_substitution(
        nodes, edges, node_index, gen["id"]
    ):
        raise BatchPreconditionError(
            "KlingElements 画像を ImageInput の代替に使うグラフはバッチ実行できません "
            "(ImageInput ちょうど1個が必要)"
        )

    if len(image_inputs) != 1:
        raise BatchPreconditionError(
            f"バッチ実行には ImageInput がちょうど1個必要です (検出: {len(image_inputs)} 個)"
        )
