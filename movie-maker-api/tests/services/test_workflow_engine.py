"""Tests for app.services.workflow_engine (pure graph validation + compilation).

Covers 5 fixture graph families:
  (1) minimal ImageInput->Prompt->Provider->Generate
  (2) full graph with all supported node categories (Generate + Dialogue + utility)
  (3) unsupported node type mixed in  -> UnsupportedNodeError
  (4) disconnected graph (Generate has no incoming edges / missing input) -> validation error
  (5) multiple Generate (v2v chain)  -> MultipleGenerateError / V2vChainNotSupportedError

Plus a parity check that reads tests/services/fixtures/parity_graphs.json and asserts the
compiled Generate step params equal the expected StoryVideoCreate payload traced from
graph-to-api.ts. graph-to-api.ts is the source of truth (see fixture _readme); if this ever
diverges, task_009's frontend test settles it and the fixture/backend get fixed to match.
"""
from __future__ import annotations

import json
from pathlib import Path

import pytest

from app.services import workflow_engine as we
from app.videos.schemas import StoryVideoCreate

FIXTURE_PATH = Path(__file__).parent / "fixtures" / "parity_graphs.json"


# ---------------------------------------------------------------------------
# Small graph builders (kept literal so a bug in the engine is caught, not masked)
# ---------------------------------------------------------------------------

def _image_node(node_id: str = "img-1", url: str = "https://r2.example.com/i.png") -> dict:
    return {
        "id": node_id,
        "type": "imageInput",
        "data": {"type": "imageInput", "isValid": True, "imageUrl": url, "imagePreview": url},
    }


def _prompt_node(node_id: str = "prompt-1", en: str = "a running dog", subject: str = "person") -> dict:
    return {
        "id": node_id,
        "type": "prompt",
        "data": {
            "type": "prompt",
            "isValid": True,
            "japanesePrompt": "犬が走る",
            "englishPrompt": en,
            "isTranslating": False,
            "subjectType": subject,
        },
    }


def _provider_node(node_id: str = "prov-1", provider: str = "runway", aspect: str = "9:16", duration=None) -> dict:
    return {
        "id": node_id,
        "type": "provider",
        "data": {
            "type": "provider",
            "isValid": True,
            "provider": provider,
            "aspectRatio": aspect,
            "duration": duration,
        },
    }


def _generate_node(node_id: str = "gen-1", video_url=None) -> dict:
    return {
        "id": node_id,
        "type": "generate",
        "data": {
            "type": "generate",
            "isValid": False,
            "isGenerating": False,
            "progress": 0,
            "videoUrl": video_url,
            "error": None,
        },
    }


def _edge(edge_id: str, source: str, target: str, source_handle: str, target_handle: str) -> dict:
    return {
        "id": edge_id,
        "source": source,
        "target": target,
        "sourceHandle": source_handle,
        "targetHandle": target_handle,
    }


def _minimal_graph():
    """Family (1): ImageInput->Prompt->Provider->Generate (runway i2v)."""
    nodes = [_image_node(), _prompt_node(), _provider_node(), _generate_node()]
    edges = [
        _edge("e1", "img-1", "gen-1", "image_url", "image_url"),
        _edge("e2", "prompt-1", "gen-1", "story_text", "story_text"),
        _edge("e3", "prov-1", "gen-1", "config", "config"),
    ]
    return nodes, edges


# ===========================================================================
# Family (1): minimal graph
# ===========================================================================

class TestMinimalGraph:
    def test_validate_ok(self):
        nodes, edges = _minimal_graph()
        result = we.validate_graph(nodes, edges)
        assert result.is_valid is True
        assert result.errors == []

    def test_compile_returns_single_generate_step(self):
        nodes, edges = _minimal_graph()
        steps = we.compile_graph(nodes, edges)
        assert len(steps) == 1
        step = steps[0]
        # Step exposes the documented dict-like keys
        assert step["node_id"] == "gen-1"
        assert step["node_type"] == "generate"
        assert step["params"]["image_url"] == "https://r2.example.com/i.png"
        assert step["params"]["story_text"] == "a running dog"
        assert step["params"]["video_provider"] == "runway"

    def test_generate_params_validate_against_story_video_create(self):
        nodes, edges = _minimal_graph()
        steps = we.compile_graph(nodes, edges)
        # Must be a shape StoryVideoCreate accepts (task completion criterion).
        model = StoryVideoCreate(**steps[0]["params"])
        assert model.image_url == "https://r2.example.com/i.png"
        assert model.video_provider.value == "runway"


# ===========================================================================
# Family (2): full graph (Generate + all downstream chain node categories)
# ===========================================================================

class TestFullGraph:
    def _full_graph(self):
        """Generate (kling with post-processing + camera work) -> Dialogue -> GetVideoFrame
        plus a TrimVideo and a StitchVideos consuming outputs. Exercises every supported
        node category so the compiler emits the ordered Generate + downstream steps.
        """
        nodes = [
            _image_node("img-1", "https://r2.example.com/base.png"),
            _prompt_node("prompt-1", "a hero poses", "person"),
            _provider_node("prov-1", "runway", "9:16", None),
            {"id": "cam-1", "type": "cameraWork", "data": {"type": "cameraWork", "isValid": True, "cameraWorkId": 3, "promptText": "slow zoom in"}},
            {"id": "bgm-1", "type": "bgm", "data": {"type": "bgm", "isValid": True, "bgmTrackId": "track-42", "customBgmUrl": None}},
            {"id": "grain-1", "type": "filmGrain", "data": {"type": "filmGrain", "isValid": True, "grain": "light"}},
            {"id": "lut-1", "type": "lut", "data": {"type": "lut", "isValid": True, "useLut": True}},
            {"id": "ovl-1", "type": "overlay", "data": {"type": "overlay", "isValid": True, "text": "HELLO", "position": "bottom", "font": "sans-serif", "color": "#ffffff"}},
            {"id": "act-1", "type": "actTwo", "data": {"type": "actTwo", "isValid": True, "useActTwo": True, "motionType": "wave_hand", "expressionIntensity": 4, "bodyControl": True}},
            _generate_node("gen-1"),
            {"id": "dlg-1", "type": "dialogue", "data": {"type": "dialogue", "isValid": True, "text": "こんにちは", "voiceId": "voice-1", "language": "ja", "speed": 1.0, "useLipSync": False, "status": "idle", "progress": 0, "generationId": None, "outputVideoUrl": None}},
            {"id": "frame-1", "type": "getVideoFrame", "data": {"type": "getVideoFrame", "isValid": True, "inputVideoUrl": None, "direction": "last", "status": "idle", "outputImageUrl": None}},
            {"id": "trim-1", "type": "trimVideo", "data": {"type": "trimVideo", "isValid": True, "inputVideoUrl": None, "startSeconds": 1.0, "endSeconds": 3.0, "status": "idle", "outputVideoUrl": None}},
            {"id": "stitch-1", "type": "stitchVideos", "data": {"type": "stitchVideos", "isValid": True, "transition": "none", "status": "idle", "progress": 0, "stitchId": None, "outputVideoUrl": None}},
        ]
        edges = [
            _edge("e1", "img-1", "gen-1", "image_url", "image_url"),
            _edge("e2", "prompt-1", "gen-1", "story_text", "story_text"),
            _edge("e3", "prov-1", "gen-1", "config", "config"),
            _edge("e4", "cam-1", "gen-1", "camera_work", "camera_work"),
            _edge("e5", "act-1", "prov-1", "act_two", "act_two_input"),
            # Generate -> Dialogue (video chain)
            _edge("e6", "gen-1", "dlg-1", "video_url", "dialogue_video_input"),
            # Dialogue -> GetVideoFrame
            _edge("e7", "dlg-1", "frame-1", "dialogue_video_output", "get_video_frame_video_input"),
            # Dialogue -> TrimVideo
            _edge("e8", "dlg-1", "trim-1", "dialogue_video_output", "trim_video_input"),
            # Generate + Trim -> Stitch (2 inputs)
            _edge("e9", "gen-1", "stitch-1", "video_url", "video_1"),
            _edge("e10", "trim-1", "stitch-1", "trim_video_output", "video_2"),
        ]
        return nodes, edges

    def test_validate_ok(self):
        nodes, edges = self._full_graph()
        result = we.validate_graph(nodes, edges)
        assert result.is_valid is True, result.errors

    def test_compile_orders_generate_first_then_downstream(self):
        nodes, edges = self._full_graph()
        steps = we.compile_graph(nodes, edges)
        node_types = [s["node_type"] for s in steps]
        # Exactly one generate, emitted first
        assert node_types[0] == "generate"
        assert node_types.count("generate") == 1
        # All downstream chain nodes present
        assert set(node_types) == {"generate", "dialogue", "getVideoFrame", "trimVideo", "stitchVideos"}

    def test_generate_step_has_camera_work_and_post_processing(self):
        nodes, edges = self._full_graph()
        steps = we.compile_graph(nodes, edges)
        gen = next(s for s in steps if s["node_type"] == "generate")
        params = gen["params"]
        assert params["camera_work"] == "slow zoom in"
        assert params["bgm_track_id"] == "track-42"
        assert params["film_grain"] == "light"
        assert params["overlay"]["text"] == "HELLO"
        assert params["use_act_two"] is True
        # validates against schema
        StoryVideoCreate(**params)

    def test_downstream_step_input_wiring(self):
        """Each downstream step records which upstream node id feeds its video input,
        matching the frontend getNodeVideoOutput(upstream) chain semantics."""
        nodes, edges = self._full_graph()
        steps = we.compile_graph(nodes, edges)
        by_id = {s["node_id"]: s for s in steps}

        # Dialogue consumes Generate's video output
        assert by_id["dlg-1"]["params"]["source_video_node_id"] == "gen-1"
        # GetVideoFrame consumes Dialogue's video output
        assert by_id["frame-1"]["params"]["source_video_node_id"] == "dlg-1"
        assert by_id["frame-1"]["params"]["direction"] == "last"
        # TrimVideo consumes Dialogue's video output
        assert by_id["trim-1"]["params"]["source_video_node_id"] == "dlg-1"
        assert by_id["trim-1"]["params"]["start_seconds"] == 1.0
        assert by_id["trim-1"]["params"]["end_seconds"] == 3.0
        # Stitch consumes two ordered inputs: gen-1 (video_1) then trim-1 (video_2)
        assert by_id["stitch-1"]["params"]["source_video_node_ids"] == ["gen-1", "trim-1"]


# ===========================================================================
# Family (3): unsupported node type
# ===========================================================================

class TestUnsupportedNode:
    def test_unsupported_node_rejected(self):
        """Defensive requirement: future / malformed node types must be reported by name.
        All 22 current node types are supported, so we inject a synthetic 'futureThing' type.
        """
        nodes, edges = _minimal_graph()
        nodes.append({"id": "x-1", "type": "futureThing", "data": {"type": "futureThing", "isValid": True}})
        with pytest.raises(we.UnsupportedNodeError) as exc:
            we.validate_graph(nodes, edges)
        assert "futureThing" in str(exc.value)
        assert "futureThing" in exc.value.node_types

    def test_stickynote_is_ignored_not_rejected(self):
        """StickyNote is a registered node but purely cosmetic; it must be ignored, not fail."""
        nodes, edges = _minimal_graph()
        nodes.append({"id": "note-1", "type": "stickyNote", "data": {"type": "stickyNote", "isValid": True, "text": "hi", "color": "yellow"}})
        result = we.validate_graph(nodes, edges)
        assert result.is_valid is True
        steps = we.compile_graph(nodes, edges)
        assert all(s["node_type"] != "stickyNote" for s in steps)


# ===========================================================================
# Family (4): disconnected graph
# ===========================================================================

class TestDisconnectedGraph:
    def test_generate_missing_image_input(self):
        # Prompt + Provider + Generate but no image source at all
        nodes = [_prompt_node(), _provider_node(), _generate_node()]
        edges = [
            _edge("e2", "prompt-1", "gen-1", "story_text", "story_text"),
            _edge("e3", "prov-1", "gen-1", "config", "config"),
        ]
        result = we.validate_graph(nodes, edges)
        assert result.is_valid is False
        assert any(e.type == "missing_input" for e in result.errors)

    def test_generate_has_no_incoming_edges(self):
        nodes = [_image_node(), _prompt_node(), _provider_node(), _generate_node()]
        edges: list[dict] = []  # nothing connected
        result = we.validate_graph(nodes, edges)
        assert result.is_valid is False
        assert any(e.type in ("disconnected", "missing_input") for e in result.errors)

    def test_no_generate_node(self):
        nodes = [_image_node(), _prompt_node(), _provider_node()]
        edges: list[dict] = []
        result = we.validate_graph(nodes, edges)
        assert result.is_valid is False
        assert any(e.type == "missing_node" for e in result.errors)

    def test_dangling_downstream_without_source(self):
        """A GetVideoFrame with no upstream video edge is a disconnected error."""
        nodes, edges = _minimal_graph()
        nodes.append({"id": "frame-1", "type": "getVideoFrame", "data": {"type": "getVideoFrame", "isValid": True, "inputVideoUrl": None, "direction": "first", "status": "idle", "outputImageUrl": None}})
        result = we.validate_graph(nodes, edges)
        assert result.is_valid is False
        assert any(e.type == "disconnected" and e.node_id == "frame-1" for e in result.errors)


# ===========================================================================
# Family (5): multiple Generate / v2v chain
# ===========================================================================

class TestMultipleGenerate:
    def test_two_generate_nodes_rejected(self):
        nodes = [
            _image_node(),
            _prompt_node(),
            _provider_node(),
            _generate_node("gen-1", video_url="https://r2.example.com/out1.mp4"),
            _generate_node("gen-2"),
        ]
        edges = [
            _edge("e1", "img-1", "gen-1", "image_url", "image_url"),
            _edge("e2", "prompt-1", "gen-1", "story_text", "story_text"),
            _edge("e3", "prov-1", "gen-1", "config", "config"),
        ]
        with pytest.raises(we.MultipleGenerateError):
            we.validate_graph(nodes, edges)

    def test_v2v_generate_to_generate_chain_rejected(self):
        """GenerateNode -> GenerateNode via source_video_url is the v2v chain that
        server-side v1 explicitly does not support. graph-to-api.ts:193-223."""
        nodes = [
            _image_node(),
            _prompt_node(),
            _provider_node("prov-1", "runway"),
            _generate_node("gen-1", video_url="https://r2.example.com/out1.mp4"),
            _generate_node("gen-2"),
        ]
        edges = [
            _edge("e1", "img-1", "gen-1", "image_url", "image_url"),
            _edge("e2", "prompt-1", "gen-1", "story_text", "story_text"),
            _edge("e3", "prov-1", "gen-1", "config", "config"),
            # v2v chain edge
            _edge("e4", "gen-1", "gen-2", "video_url", "source_video_url"),
        ]
        with pytest.raises((we.V2vChainNotSupportedError, we.MultipleGenerateError)):
            we.validate_graph(nodes, edges)


# ===========================================================================
# Batch preconditions (decision (c): KlingElements image substitution -> batch-ineligible)
# ===========================================================================

class TestBatchPreconditions:
    def test_single_image_input_is_batch_eligible(self):
        nodes, edges = _minimal_graph()
        # Should not raise.
        we.validate_batch_preconditions(nodes, edges)

    def test_klingelements_image_substitution_blocks_batch(self):
        """Decision (c): when the base image comes from KlingElements instead of an
        ImageInput node, the graph is not batch-eligible."""
        nodes = [
            _prompt_node(),
            _provider_node("prov-1", "piapi_kling"),
            {
                "id": "kel-1",
                "type": "klingElements",
                "data": {"type": "klingElements", "isValid": True, "elementImages": ["https://r2.example.com/el1.png"]},
            },
            _generate_node(),
        ]
        edges = [
            _edge("e2", "prompt-1", "gen-1", "story_text", "story_text"),
            _edge("e3", "prov-1", "gen-1", "config", "config"),
            _edge("e4", "kel-1", "prov-1", "kling_elements", "kling_elements_input"),
        ]
        with pytest.raises(we.BatchPreconditionError):
            we.validate_batch_preconditions(nodes, edges)

    def test_two_image_inputs_block_batch(self):
        nodes, edges = _minimal_graph()
        nodes.append(_image_node("img-2", "https://r2.example.com/i2.png"))
        with pytest.raises(we.BatchPreconditionError):
            we.validate_batch_preconditions(nodes, edges)


# ===========================================================================
# Parity check against shared fixture (graph-to-api.ts is source of truth)
# ===========================================================================

def _load_parity_cases():
    data = json.loads(FIXTURE_PATH.read_text(encoding="utf-8"))
    return data["cases"]


@pytest.mark.parametrize("case", _load_parity_cases(), ids=lambda c: c["name"])
def test_parity_generate_payload(case):
    """compile_graph's Generate step params must equal the expected payload traced from
    graph-to-api.ts. NOTE: graph-to-api.ts is the final source of truth; if task_009's
    frontend parity test flags a mismatch, fix the fixture + backend to match the frontend,
    never the reverse.
    """
    graph = case["graph"]
    steps = we.compile_graph(graph["nodes"], graph["edges"])
    gen_steps = [s for s in steps if s["node_type"] == "generate"]
    assert len(gen_steps) == 1, f"{case['name']}: expected exactly 1 generate step"

    actual = gen_steps[0]["params"]
    expected = case["expectedPayload"]

    # Exact key set match (omitted keys must be absent, matching graph-to-api.ts undefined-omit).
    assert set(actual.keys()) == set(expected.keys()), (
        f"{case['name']}: key mismatch\n"
        f"  only in actual:   {sorted(set(actual) - set(expected))}\n"
        f"  only in expected: {sorted(set(expected) - set(actual))}"
    )
    for key, exp_val in expected.items():
        assert actual[key] == exp_val, f"{case['name']}: field '{key}' mismatch: {actual[key]!r} != {exp_val!r}"

    # And the compiled params must satisfy StoryVideoCreate.
    StoryVideoCreate(**actual)
