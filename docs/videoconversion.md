# 実装の全体像

## 入力 / 処理 / 出力

- **入力**: 生成AIが出力した MP4（H.264 / 8bit / 色が濃い / バンディングあり）
- **処理**: FFmpegで **デバンド（段差埋め）** ＋ **擬似LOG化（トーン調整）**
- **出力**: QuickTime（**ProRes 422 HQ / 10bit / フラット / 滑らか**）

---

# STEP 1: FFmpegコマンドの構造理解

コードを書く前に、核となるコマンドの意味を理解します。ここが画質の生命線です。

## コマンド例（Bash）

```bash
ffmpeg -i input.mp4 \
-c:v prores_ks \
-profile:v 3 \
-vendor apl0 \
-bits_per_mb 8000 \
-pix_fmt yuv422p10le \
-vf "gradfun=1.1:20,eq=contrast=0.9:saturation=0.85:brightness=0.03" \
output.mov



import os
import subprocess
import uuid
import boto3
from fastapi import FastAPI, BackgroundTasks, HTTPException
from fastapi.responses import FileResponse

app = FastAPI()

# --- 設定: 一時保存ディレクトリ ---
TEMP_DIR = "/tmp/video_processing"
os.makedirs(TEMP_DIR, exist_ok=True)

# --- 設定: Cloudflare R2 (S3互換) ---
# ※実際の運用では環境変数から読み込んでください
s3_client = boto3.client(
    "s3",
    endpoint_url=os.getenv("R2_ENDPOINT_URL"),
    aws_access_key_id=os.getenv("R2_ACCESS_KEY_ID"),
    aws_secret_access_key=os.getenv("R2_SECRET_ACCESS_KEY"),
    region_name="auto"
)
BUCKET_NAME = "your-bucket-name"


def cleanup_files(file_paths: list[str]):
    """処理が終わったファイルを削除するお掃除関数"""
    for path in file_paths:
        if os.path.exists(path):
            try:
                os.remove(path)
            except Exception as e:
                print(f"Cleanup error: {e}")


@app.get("/convert/prores/{file_key}")
async def convert_and_download(file_key: str, background_tasks: BackgroundTasks):
    """
    R2上のMP4を指定して、デバンド済みのProRes(HQ)動画としてダウンロードさせる
    """
    # ユニークなIDでファイル名を生成（衝突防止）
    task_id = str(uuid.uuid4())
    input_path = os.path.join(TEMP_DIR, f"{task_id}_input.mp4")
    output_path = os.path.join(TEMP_DIR, f"{task_id}_prores.mov")

    try:
        # 1. R2からダウンロード（ストリームではなくファイルとして保存が必要）
        print(f"Downloading: {file_key}")
        s3_client.download_file(BUCKET_NAME, file_key, input_path)

        # 2. FFmpegコマンドの構築
        command = [
            "ffmpeg",
            "-y",  # 上書き許可
            "-i", input_path,  # 入力

            # --- 画質設定 ---
            "-c:v", "prores_ks",            # コーデック
            "-profile:v", "3",              # HQ
            "-vendor", "apl0",              # Apple互換タグ
            "-bits_per_mb", "8000",         # ビットレート確保
            "-pix_fmt", "yuv422p10le",      # 10bit深度指定

            # --- 魔法のフィルター（Deband + Flat Look） ---
            "-vf", "gradfun=1.1:20,eq=contrast=0.9:saturation=0.85:brightness=0.03",

            # --- 音声設定（動画に音声がある場合） ---
            "-c:a", "pcm_s16le",            # ProRes標準の非圧縮音声

            output_path  # 出力
        ]

        # 3. 変換実行
        print("Converting to ProRes...")
        # stdout/stderrをDEVNULLに捨てるとログが出ないので、開発中はPIPE推奨
        result = subprocess.run(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE)

        if result.returncode != 0:
            error_log = result.stderr.decode()
            print(f"FFmpeg Error: {error_log}")
            raise Exception("Encoding failed")

        # 4. レスポンス返却 & 後始末予約
        cleanup_targets = [input_path, output_path]
        background_tasks.add_task(cleanup_files, cleanup_targets)

        return FileResponse(
            path=output_path,
            filename=f"converted_{file_key}.mov",  # ユーザーが見るファイル名
            media_type="video/quicktime"
        )

    except Exception as e:
        # エラーが起きてもゴミを残さない
        cleanup_files([input_path, output_path])
        print(f"Process Error: {e}")
        raise HTTPException(status_code=500, detail="Video processing failed")
