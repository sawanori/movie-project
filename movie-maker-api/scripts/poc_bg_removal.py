#!/usr/bin/env python3
"""背景削除 PoC: fal.ai 上の3モデルに同一クリップを投入して品質・速度・コストを比較する.

使い方:
    1. movie-maker-api/.env に FAL_KEY=... を設定 (または環境変数で渡す)
    2. pip install fal-client  (venv: ./venv/bin/pip install fal-client)
    3. ./venv/bin/python scripts/poc_bg_removal.py [動画パス ...]

引数を省略するとリポジトリ直下の check/base.mp4 を使う。
結果は poc_output/{モデル名}/ にダウンロードされ、最後にサマリー表を表示する。
人物・商品・髪の細かい被写体の3クリップで実行し、目視で品質比較すること。

比較対象 (2026-06-12 検証済み価格):
    - bria/video/background-removal/v3   $0.00425/秒   (透過WebM/ProRes、音声保持)
    - veed/video-background-removal/fast $0.012/30f    (VP9アルファ)
    - fal-ai/ben/v2/video                $0.001/MP     (WebMアルファ)
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_CLIP = REPO_ROOT / "check" / "base.mp4"
OUTPUT_DIR = REPO_ROOT / "poc_output"

# モデルごとの入力パラメータ。422 エラー時はレスポンス本文に正しいスキーマが
# 出るので、それを見てここを直す。
MODELS: dict[str, dict] = {
    "bria/video/background-removal/v3": {
        "background_color": "Transparent",
    },
    "veed/video-background-removal/fast": {
        "output_codec": "vp9",
        "subject_is_person": True,
        "refine_foreground_edges": True,
    },
    "fal-ai/ben/v2/video": {
        "output_format": "webm",
    },
}


def load_fal_key() -> str:
    key = os.environ.get("FAL_KEY")
    if not key:
        env_path = REPO_ROOT / "movie-maker-api" / ".env"
        if env_path.exists():
            for line in env_path.read_text().splitlines():
                if line.startswith("FAL_KEY="):
                    key = line.split("=", 1)[1].strip().strip('"')
                    break
    if not key:
        sys.exit(
            "FAL_KEY が見つかりません。https://fal.ai で取得し、"
            "movie-maker-api/.env に FAL_KEY=... を追記してください。"
        )
    os.environ["FAL_KEY"] = key
    return key


def probe_video(path: Path) -> dict:
    """ffprobe で長さ・解像度・fps を取得 (コスト試算用)。失敗しても続行する。"""
    try:
        out = subprocess.run(
            [
                "ffprobe", "-v", "quiet", "-print_format", "json",
                "-show_format", "-show_streams", str(path),
            ],
            capture_output=True, text=True, check=True,
        ).stdout
        data = json.loads(out)
        stream = next(s for s in data["streams"] if s["codec_type"] == "video")
        num, den = stream.get("avg_frame_rate", "30/1").split("/")
        fps = float(num) / float(den) if float(den) else 30.0
        return {
            "duration": float(data["format"]["duration"]),
            "width": int(stream["width"]),
            "height": int(stream["height"]),
            "fps": fps,
        }
    except Exception:
        return {"duration": 0.0, "width": 0, "height": 0, "fps": 30.0}


def estimate_cost(model: str, info: dict) -> float:
    dur, fps = info["duration"], info["fps"]
    mp_per_frame = info["width"] * info["height"] / 1_000_000
    if model.startswith("bria/"):
        return dur * 0.00425
    if model.startswith("veed/"):
        return dur * fps / 30 * 0.012
    if "ben" in model:
        return dur * fps * mp_per_frame * 0.001
    return 0.0


def find_result_urls(obj, urls=None) -> list[str]:
    """結果 JSON から動画/画像 URL を再帰的に集める (モデル毎に構造が違うため)。"""
    if urls is None:
        urls = []
    if isinstance(obj, dict):
        for v in obj.values():
            find_result_urls(v, urls)
    elif isinstance(obj, list):
        for v in obj:
            find_result_urls(v, urls)
    elif isinstance(obj, str) and obj.startswith("http") and any(
        ext in obj.lower() for ext in (".webm", ".mp4", ".mov", ".mkv", ".png", ".gif")
    ):
        urls.append(obj)
    return urls


def run_model(fal_client, model: str, video_url: str, clip_name: str) -> dict:
    args = {"video_url": video_url, **MODELS[model]}
    print(f"\n=== {model} ===")
    print(f"  入力: {json.dumps(args, ensure_ascii=False)}")
    started = time.time()
    try:
        result = fal_client.subscribe(model, arguments=args, with_logs=False)
    except Exception as exc:  # 422 等はスキーマ確認のため本文を全部出す
        print(f"  ✗ 失敗: {exc}")
        return {"model": model, "ok": False, "error": str(exc)}
    elapsed = time.time() - started

    urls = find_result_urls(result)
    out_dir = OUTPUT_DIR / model.replace("/", "_")
    out_dir.mkdir(parents=True, exist_ok=True)
    saved = []
    for i, url in enumerate(urls):
        ext = Path(url.split("?")[0]).suffix or ".bin"
        dest = out_dir / f"{clip_name}_{i}{ext}"
        urllib.request.urlretrieve(url, dest)
        saved.append(dest)
        print(f"  ↓ {dest.relative_to(REPO_ROOT)}")
    print(f"  ✓ 完了 {elapsed:.1f}秒, 結果ファイル {len(saved)} 件")
    return {
        "model": model, "ok": True, "elapsed": elapsed,
        "files": [str(p) for p in saved], "raw": result,
    }


def main() -> None:
    load_fal_key()
    try:
        import fal_client
    except ImportError:
        sys.exit("fal-client が必要です: ./venv/bin/pip install fal-client")

    clips = [Path(p) for p in sys.argv[1:]] or [DEFAULT_CLIP]
    for clip in clips:
        if not clip.exists():
            sys.exit(f"動画が見つかりません: {clip}")

    summary = []
    for clip in clips:
        info = probe_video(clip)
        print(f"\n##### クリップ: {clip.name} "
              f"({info['duration']:.1f}秒 {info['width']}x{info['height']} "
              f"{info['fps']:.0f}fps) #####")
        print("アップロード中...")
        video_url = fal_client.upload_file(str(clip))
        for model in MODELS:
            res = run_model(fal_client, model, video_url, clip.stem)
            res["clip"] = clip.name
            res["est_cost"] = estimate_cost(model, info)
            summary.append(res)

    print("\n\n========== サマリー ==========")
    print(f"{'クリップ':<16}{'モデル':<40}{'結果':<6}{'処理秒':<8}{'試算コスト'}")
    for r in summary:
        status = "OK" if r["ok"] else "FAIL"
        elapsed = f"{r.get('elapsed', 0):.1f}" if r["ok"] else "-"
        print(f"{r['clip']:<16}{r['model']:<40}{status:<6}{elapsed:<8}"
              f"${r['est_cost']:.3f}")
    print(f"\n結果は {OUTPUT_DIR.relative_to(REPO_ROOT)}/ を目視比較してください。"
          "\n(QuickTime は WebM アルファ非対応のため、Chrome で開くか "
          "ffplay で確認すること)")


if __name__ == "__main__":
    main()
