"""
背景削除プロセッサーのテスト

マスター + マット合成パイプライン:
- 動画ジョブはソースを R2 からダウンロードしてプローブし、
  fal 非互換（10bit / ProRes 等）なら H.264 プロキシを作成して投入する
- prores 出力は fal の WebM をアルファマットとしてマスターと合成する
"""
import contextlib
import os
from types import SimpleNamespace

import pytest
from unittest.mock import patch, MagicMock, AsyncMock

from app.external.fal_provider import FalJobRef, FalJobStatus


MOCK_JOB_REF = FalJobRef(
    request_id="req-001",
    status_url="https://queue.fal.run/bria/video/background-removal/requests/req-001/status",
    response_url="https://queue.fal.run/bria/video/background-removal/requests/req-001",
)

# 再投入（リトライ）時に発行される 2 つ目のジョブ参照
MOCK_JOB_REF_2 = FalJobRef(
    request_id="req-002",
    status_url="https://queue.fal.run/bria/video/background-removal/requests/req-002/status",
    response_url="https://queue.fal.run/bria/video/background-removal/requests/req-002",
)

# テスト用ソース URL（R2 配信ドメイン: *.r2.dev はホスト検証を通過する）
SOURCE_URL = "https://pub-test.r2.dev/videos/source.mp4"

# プローブ結果: fal 互換（8bit H.264）→ プロキシ不要
H264_PROBE_INFO = {
    "codec_name": "h264",
    "pix_fmt": "yuv420p",
    "width": 1080,
    "height": 1920,
}

# プローブ結果: fal 非互換（10bit ProRes）→ プロキシ必要
PRORES_PROBE_INFO = {
    "codec_name": "prores",
    "pix_fmt": "yuv422p10le",
    "width": 1920,
    "height": 1080,
}


def _make_mock_db_record(generation_id: str, source_type: str = "video", output_format: str = "webm") -> dict:
    return {
        "id": generation_id,
        "user_id": "user-001",
        "source_type": source_type,
        "source_url": SOURCE_URL,
        "output_format": output_format,
        "provider": "fal",
        "status": "pending",
    }


def _make_mock_db_record_with_refs(
    generation_id: str, source_type: str = "video", output_format: str = "webm"
) -> dict:
    """fal のジョブ参照（provider_*）が保存済みの processing レコードを作る"""
    record = _make_mock_db_record(generation_id, source_type, output_format)
    record.update(
        {
            "status": "processing",
            "provider_request_id": MOCK_JOB_REF.request_id,
            "provider_status_url": MOCK_JOB_REF.status_url,
            "provider_response_url": MOCK_JOB_REF.response_url,
        }
    )
    return record


def _make_mock_supabase(db_record, sweep_rows=None) -> MagicMock:
    mock_supabase = MagicMock()
    mock_supabase.table.return_value.select.return_value.eq.return_value.single.return_value.execute.return_value.data = db_record
    mock_supabase.table.return_value.update.return_value.eq.return_value.execute.return_value = MagicMock()
    # 再開スイープ用: .select().in_().execute() のチェーン
    mock_supabase.table.return_value.select.return_value.in_.return_value.execute.return_value.data = (
        sweep_rows or []
    )
    return mock_supabase


def _make_mock_ffmpeg(probe_info: dict) -> MagicMock:
    """ffmpeg サービスのモック（probe / proxy / composite を AsyncMock でパッチ）"""
    mock_ffmpeg = MagicMock()
    mock_ffmpeg.probe_video_info = AsyncMock(return_value=dict(probe_info))

    async def _fake_create_proxy(input_path: str, output_path: str) -> str:
        with open(output_path, "wb") as f:
            f.write(b"fake proxy content")
        return output_path

    mock_ffmpeg.create_h264_proxy = AsyncMock(side_effect=_fake_create_proxy)

    async def _fake_composite(
        master_path: str, matte_path: str, output_path: str, *, width: int, height: int
    ) -> str:
        with open(output_path, "wb") as f:
            f.write(b"fake prores content")
        return output_path

    mock_ffmpeg.composite_master_with_alpha_matte = AsyncMock(side_effect=_fake_composite)
    return mock_ffmpeg


@contextlib.contextmanager
def _patch_pipeline(db_record, *, probe_info=None, sweep_rows=None):
    """プロセッサーの外部依存（supabase / fal / r2 / ffmpeg / sleep）を一括でパッチする

    yield する名前空間:
        supabase / provider / ffmpeg / download / upload / delete
    """
    mock_supabase = _make_mock_supabase(db_record, sweep_rows)
    mock_provider = AsyncMock()
    mock_ffmpeg = _make_mock_ffmpeg(probe_info or H264_PROBE_INFO)

    async def _fake_upload(content: bytes, key: str, content_type: str) -> str:
        return f"https://pub-test.r2.dev/{key}"

    with patch(
        "app.tasks.bg_removal_processor.get_supabase", return_value=mock_supabase
    ), patch(
        "app.tasks.bg_removal_processor.FalBackgroundRemovalProvider"
    ) as mock_provider_cls, patch(
        "app.external.r2.download_file", new_callable=AsyncMock
    ) as mock_download, patch(
        "app.external.r2.upload_with_key", new_callable=AsyncMock
    ) as mock_upload, patch(
        "app.external.r2.delete_file", new_callable=AsyncMock
    ) as mock_delete, patch(
        "app.services.ffmpeg_service.get_ffmpeg_service", return_value=mock_ffmpeg
    ), patch(
        "asyncio.sleep", new_callable=AsyncMock
    ):
        mock_provider_cls.return_value = mock_provider
        mock_download.return_value = b"fake media content"
        mock_upload.side_effect = _fake_upload

        yield SimpleNamespace(
            supabase=mock_supabase,
            provider=mock_provider,
            ffmpeg=mock_ffmpeg,
            download=mock_download,
            upload=mock_upload,
            delete=mock_delete,
        )


def _completed_status(result_url: str) -> FalJobStatus:
    return FalJobStatus(
        status="completed", progress=100, result_url=result_url, error_message=None
    )


def _update_calls(ns) -> list:
    return ns.supabase.table.return_value.update.call_args_list


class TestBgRemovalProcessor:
    """背景削除バックグラウンドタスクのテスト"""

    @pytest.fixture(autouse=True)
    def _disable_mock_mode(self):
        """テストは実モード（BG_REMOVAL_MOCK=False）を既定とする
        （モックモードのテストは個別に True へパッチする）
        """
        with patch("app.core.config.settings.BG_REMOVAL_MOCK", False):
            yield

    @pytest.mark.asyncio
    async def test_process_background_removal_success(self):
        """背景削除が正常に完了する（probe → submit → poll → R2 → DB completed）"""
        from app.tasks.bg_removal_processor import process_background_removal

        generation_id = "gen-bg-001"
        result_url = "https://v3.fal.media/files/output.webm"

        with _patch_pipeline(_make_mock_db_record(generation_id)) as ns:
            ns.provider.submit_video = AsyncMock(return_value=MOCK_JOB_REF)
            ns.provider.check_status = AsyncMock(return_value=_completed_status(result_url))

            await process_background_removal(generation_id)

        # h264/yuv420p ソース → プロキシ不要: fal にはオリジナル URL を渡す
        ns.provider.submit_video.assert_called_once_with(SOURCE_URL)

        # ダウンロードは ソース → 結果 の 2 回
        download_urls = [call.args[0] for call in ns.download.call_args_list]
        assert download_urls == [SOURCE_URL, result_url]

        # 結果が R2 へアップロードされる（key 規約を確認）
        ns.upload.assert_called_once_with(
            b"fake media content",
            "bg-removal/user-001/gen-bg-001.webm",
            "video/webm",
        )

        # DB が completed で更新されたことを確認
        update_calls = _update_calls(ns)
        assert any(
            "completed" in str(call) for call in update_calls
        ), f"Expected 'completed' in update calls: {update_calls}"

        # ジョブ参照情報（request_id / status_url / response_url）が保存されたことを確認
        assert any(
            "req-001" in str(call) for call in update_calls
        ), f"Expected provider_request_id in update calls: {update_calls}"

        # プローブ完了マイルストーン（progress=10）が書き込まれる
        assert any(
            call.args[0].get("progress") == 10 for call in update_calls
        ), f"Expected progress=10 update after probe: {update_calls}"

    @pytest.mark.asyncio
    async def test_compatible_source_skips_proxy(self):
        """yuv420p H.264 ソースはプロキシを作らず、R2 のプロキシ削除も行わない"""
        from app.tasks.bg_removal_processor import process_background_removal

        generation_id = "gen-bg-noproxy-001"

        with _patch_pipeline(
            _make_mock_db_record(generation_id), probe_info=H264_PROBE_INFO
        ) as ns:
            ns.provider.submit_video = AsyncMock(return_value=MOCK_JOB_REF)
            ns.provider.check_status = AsyncMock(
                return_value=_completed_status("https://v3.fal.media/files/output.webm")
            )

            await process_background_removal(generation_id)

        ns.ffmpeg.probe_video_info.assert_called_once()
        ns.ffmpeg.create_h264_proxy.assert_not_called()
        ns.provider.submit_video.assert_called_once_with(SOURCE_URL)
        ns.delete.assert_not_called()

        # progress=25（プロキシアップロード）は書き込まれない
        update_calls = _update_calls(ns)
        assert not any(
            call.args[0].get("progress") == 25 for call in update_calls
        ), f"Expected no progress=25 update without proxy: {update_calls}"

    @pytest.mark.asyncio
    async def test_10bit_source_creates_proxy_and_deletes_after_success(self):
        """10bit ProRes ソースはプロキシを作成・投入し、完了後に R2 から削除する"""
        from app.tasks.bg_removal_processor import process_background_removal

        generation_id = "gen-bg-proxy-001"
        proxy_key = f"bg-removal/user-001/{generation_id}_proxy.mp4"
        proxy_url = f"https://pub-test.r2.dev/{proxy_key}"

        with _patch_pipeline(
            _make_mock_db_record(generation_id), probe_info=PRORES_PROBE_INFO
        ) as ns:
            ns.provider.submit_video = AsyncMock(return_value=MOCK_JOB_REF)
            ns.provider.check_status = AsyncMock(
                return_value=_completed_status("https://v3.fal.media/files/output.webm")
            )

            await process_background_removal(generation_id)

        # プロキシが作成され、R2 にアップロードされる
        ns.ffmpeg.create_h264_proxy.assert_called_once()
        proxy_upload_calls = [
            call for call in ns.upload.call_args_list if call.args[1] == proxy_key
        ]
        assert len(proxy_upload_calls) == 1, (
            f"Expected proxy upload with key {proxy_key}: {ns.upload.call_args_list}"
        )
        assert proxy_upload_calls[0].args[0] == b"fake proxy content"
        assert proxy_upload_calls[0].args[2] == "video/mp4"

        # fal にはプロキシ URL が投入される（オリジナルではない）
        ns.provider.submit_video.assert_called_once_with(proxy_url)

        # 完了後にプロキシ R2 オブジェクトが削除される
        ns.delete.assert_called_once_with(proxy_key)

        # 進捗マイルストーン: 10（プローブ後）→ 25（プロキシアップロード後）
        update_calls = _update_calls(ns)
        assert any(call.args[0].get("progress") == 10 for call in update_calls)
        assert any(call.args[0].get("progress") == 25 for call in update_calls)

        # 最終的に completed で更新される
        assert any(
            call.args[0].get("status") == "completed" for call in update_calls
        ), f"Expected 'completed' in update calls: {update_calls}"

    @pytest.mark.asyncio
    async def test_10bit_source_proxy_deleted_on_failure(self):
        """プロキシ投入後に fal が失敗しても、プロキシは R2 から削除される（失敗パス）"""
        from app.tasks.bg_removal_processor import process_background_removal

        generation_id = "gen-bg-proxy-002"
        proxy_key = f"bg-removal/user-001/{generation_id}_proxy.mp4"

        with _patch_pipeline(
            _make_mock_db_record(generation_id), probe_info=PRORES_PROBE_INFO
        ) as ns:
            ns.provider.submit_video = AsyncMock(return_value=MOCK_JOB_REF)
            ns.provider.check_status = AsyncMock(
                return_value=FalJobStatus(
                    status="failed",
                    progress=0,
                    result_url=None,
                    error_message="fal.ai側のエラーが発生しました",
                )
            )

            await process_background_removal(generation_id)

        # 失敗パスでもプロキシ R2 オブジェクトが削除される
        ns.delete.assert_called_once_with(proxy_key)

        update_calls = _update_calls(ns)
        assert any(
            call.args[0].get("status") == "failed" for call in update_calls
        ), f"Expected 'failed' in update calls: {update_calls}"

    @pytest.mark.asyncio
    async def test_rejects_non_r2_source_url(self):
        """R2 以外のソース URL はダウンロード前に日本語メッセージで failed にする（SSRF 防止）"""
        from app.tasks.bg_removal_processor import process_background_removal

        generation_id = "gen-bg-src-ssrf-001"
        record = _make_mock_db_record(generation_id)
        record["source_url"] = "https://attacker.example/internal.mp4"

        with _patch_pipeline(record) as ns:
            ns.provider.submit_video = AsyncMock(return_value=MOCK_JOB_REF)

            await process_background_removal(generation_id)

        # ダウンロードも fal 投入も行われない
        ns.download.assert_not_called()
        ns.provider.submit_video.assert_not_called()
        ns.ffmpeg.probe_video_info.assert_not_called()

        update_calls = _update_calls(ns)
        assert any(
            call.args[0].get("status") == "failed" for call in update_calls
        ), f"Expected 'failed' in update calls: {update_calls}"
        assert any(
            "入力動画のURLが不正です" in str(call) for call in update_calls
        ), f"Expected source URL rejection message in update calls: {update_calls}"

    @pytest.mark.asyncio
    async def test_process_background_removal_image_uploads_png(self):
        """画像ソースの場合 submit_image が呼ばれ、png として R2 にアップロードされる
        （画像はプローブ / プロキシの対象外）
        """
        from app.tasks.bg_removal_processor import process_background_removal

        generation_id = "gen-bg-img-001"
        result_url = "https://v3.fal.media/files/output.png"

        with _patch_pipeline(
            _make_mock_db_record(generation_id, source_type="image", output_format="png")
        ) as ns:
            ns.provider.submit_image = AsyncMock(return_value=MOCK_JOB_REF)
            ns.provider.check_status = AsyncMock(return_value=_completed_status(result_url))

            await process_background_removal(generation_id)

        ns.provider.submit_image.assert_called_once_with(SOURCE_URL)
        ns.upload.assert_called_once_with(
            b"fake media content",
            f"bg-removal/user-001/{generation_id}.png",
            "image/png",
        )

        # 画像ジョブはプローブ / プロキシを行わない
        ns.ffmpeg.probe_video_info.assert_not_called()
        ns.ffmpeg.create_h264_proxy.assert_not_called()
        # ダウンロードは結果のみ（ソースはダウンロードしない）
        assert [call.args[0] for call in ns.download.call_args_list] == [result_url]

    @pytest.mark.asyncio
    async def test_prores_composites_master_with_matte_and_uploads_mov(self):
        """prores: マスターと fal のアルファマットを合成し .mov / video/quicktime でアップロードする

        - fal からは WebM（マット）を受け取る
        - composite にはマスターのローカルパスとプローブした W/H が渡される
        - 合成前に progress=75（合成フェーズ）が書き込まれる
        - 一時ファイル（マスター / マット / 出力 .mov）は処理後に削除される
        """
        from app.tasks.bg_removal_processor import process_background_removal

        generation_id = "gen-bg-prores-001"

        seen: dict = {}

        async def _fake_composite(
            master_path: str, matte_path: str, output_path: str, *, width: int, height: int
        ) -> str:
            seen["master"] = master_path
            seen["matte"] = matte_path
            seen["output"] = output_path
            seen["width"] = width
            seen["height"] = height
            # マスターにはソースのバイト列、マットには fal の WebM が書き込まれている
            with open(master_path, "rb") as f:
                assert f.read() == b"fake source content"
            with open(matte_path, "rb") as f:
                assert f.read() == b"fake webm matte"
            with open(output_path, "wb") as f:
                f.write(b"fake prores content")
            return output_path

        with _patch_pipeline(
            _make_mock_db_record(generation_id, output_format="prores"),
            probe_info=H264_PROBE_INFO,  # 8bit ソースでも常に合成方式を使う
        ) as ns:
            ns.ffmpeg.composite_master_with_alpha_matte = AsyncMock(
                side_effect=_fake_composite
            )
            ns.provider.submit_video = AsyncMock(return_value=MOCK_JOB_REF)
            ns.provider.check_status = AsyncMock(
                return_value=_completed_status("https://v3.fal.media/files/output.webm")
            )
            # 1 回目 = ソースのダウンロード、2 回目 = マット（fal 結果）のダウンロード
            ns.download.side_effect = [b"fake source content", b"fake webm matte"]

            await process_background_removal(generation_id)

        # 8bit ソースなのでプロキシは作られない（fal にはオリジナル URL）
        ns.ffmpeg.create_h264_proxy.assert_not_called()
        ns.provider.submit_video.assert_called_once_with(SOURCE_URL)

        # composite がマスターのプローブ解像度（W/H）で呼ばれる
        ns.ffmpeg.composite_master_with_alpha_matte.assert_called_once()
        assert seen["width"] == H264_PROBE_INFO["width"]
        assert seen["height"] == H264_PROBE_INFO["height"]

        # 合成後のバイト列が .mov としてアップロードされる
        ns.upload.assert_called_once_with(
            b"fake prores content",
            f"bg-removal/user-001/{generation_id}.mov",
            "video/quicktime",
        )

        # 合成前に progress=75（合成フェーズ）が書き込まれる
        update_calls = _update_calls(ns)
        assert any(
            call.args[0].get("progress") == 75 for call in update_calls
        ), f"Expected progress=75 update before composite: {update_calls}"

        # 一時ファイルが削除されている（マスター / マット / 出力 .mov）
        for name in ("master", "matte", "output"):
            assert not os.path.exists(seen[name]), f"Expected temp file cleaned up: {seen[name]}"

    @pytest.mark.asyncio
    async def test_prores_composite_failure_marks_failed(self):
        """prores: 合成失敗時は failed + 日本語メッセージで更新し、一時ファイルを削除する"""
        from app.services.ffmpeg_service import FFmpegError
        from app.tasks.bg_removal_processor import process_background_removal

        generation_id = "gen-bg-prores-002"

        with _patch_pipeline(
            _make_mock_db_record(generation_id, output_format="prores")
        ) as ns:
            ns.ffmpeg.composite_master_with_alpha_matte = AsyncMock(
                side_effect=FFmpegError("マスターとアルファマットの合成に失敗: boom")
            )
            ns.provider.submit_video = AsyncMock(return_value=MOCK_JOB_REF)
            ns.provider.check_status = AsyncMock(
                return_value=_completed_status("https://v3.fal.media/files/output.webm")
            )

            # 合成失敗でも例外を再送出しない
            await process_background_removal(generation_id)

        # 合成失敗時はアップロードされない
        ns.upload.assert_not_called()

        # failed + 日本語メッセージで更新される
        update_calls = _update_calls(ns)
        assert any(
            call.args[0].get("status") == "failed" for call in update_calls
        ), f"Expected 'failed' in update calls: {update_calls}"
        assert any(
            "マスターとアルファマットの合成に失敗" in str(call) for call in update_calls
        ), f"Expected composite failure message in update calls: {update_calls}"

        # 合成呼び出し時の一時ファイルが削除されている（finally でのクリーンアップ）
        composite_call = ns.ffmpeg.composite_master_with_alpha_matte.call_args
        for path in composite_call.args:
            assert not os.path.exists(path), f"Expected temp file cleaned up: {path}"

    @pytest.mark.asyncio
    async def test_process_background_removal_handles_provider_error(self):
        """プロバイダーエラーを適切に処理する（failed 更新・例外を再送出しない）"""
        from app.tasks.bg_removal_processor import process_background_removal
        from app.external.fal_provider import FalProviderError

        generation_id = "gen-bg-002"

        with _patch_pipeline(_make_mock_db_record(generation_id)) as ns:
            ns.provider.submit_video = AsyncMock(
                side_effect=FalProviderError("fal.aiのクレジット不足またはレート制限です")
            )

            # エラーでも例外を再送出しない
            await process_background_removal(generation_id)

        update_calls = _update_calls(ns)
        assert any(
            "failed" in str(call) for call in update_calls
        ), f"Expected 'failed' in update calls: {update_calls}"
        assert any(
            "fal.aiのクレジット不足またはレート制限です" in str(call) for call in update_calls
        ), f"Expected error_message in update calls: {update_calls}"

    @pytest.mark.asyncio
    async def test_process_background_removal_retries_on_retryable_error(self):
        """一時エラー（retryable=True）の 1 回目失敗後に再投入し、2 回目で完了する"""
        from app.tasks.bg_removal_processor import process_background_removal
        from app.external.fal_provider import FalProviderError

        generation_id = "gen-bg-retry-001"
        result_url = "https://v3.fal.media/files/output.webm"

        with _patch_pipeline(_make_mock_db_record(generation_id)) as ns:
            # 再投入で新しいジョブ参照（req-002）が発行される
            ns.provider.submit_video = AsyncMock(
                side_effect=[MOCK_JOB_REF, MOCK_JOB_REF_2]
            )
            # 1 回目のポーリングで一時エラー → 2 回目（再投入後）で完了
            ns.provider.check_status = AsyncMock(
                side_effect=[
                    FalProviderError(
                        "fal.ai側のエラーが発生しました（Internal server error）",
                        retryable=True,
                    ),
                    _completed_status(result_url),
                ]
            )

            await process_background_removal(generation_id)

        # submit が 2 回呼ばれる（再投入）
        assert ns.provider.submit_video.call_count == 2

        # provider_request_id が 2 回保存される（req-001 → req-002 で上書き）
        update_calls = _update_calls(ns)
        request_id_updates = [
            call.args[0]["provider_request_id"]
            for call in update_calls
            if "provider_request_id" in call.args[0]
        ]
        assert request_id_updates == ["req-001", "req-002"], (
            f"Expected provider_request_id updated twice: {update_calls}"
        )

        # 最終的に completed で更新され、failed では更新されない
        assert any(
            call.args[0].get("status") == "completed" for call in update_calls
        ), f"Expected 'completed' in update calls: {update_calls}"
        assert not any(
            call.args[0].get("status") == "failed" for call in update_calls
        ), f"Expected no 'failed' update calls: {update_calls}"

    @pytest.mark.asyncio
    async def test_process_background_removal_fails_after_max_retryable_errors(self):
        """一時エラーが 2 回連続した場合は failed + 人間化メッセージで更新する"""
        from app.tasks.bg_removal_processor import process_background_removal
        from app.external.fal_provider import FalProviderError

        generation_id = "gen-bg-retry-002"

        with _patch_pipeline(_make_mock_db_record(generation_id)) as ns:
            ns.provider.submit_video = AsyncMock(
                side_effect=[MOCK_JOB_REF, MOCK_JOB_REF_2]
            )
            # 両試行とも一時エラー
            ns.provider.check_status = AsyncMock(
                side_effect=[
                    FalProviderError(
                        "fal.ai側のエラーが発生しました（Internal server error）",
                        retryable=True,
                    ),
                    FalProviderError(
                        "fal.ai側のエラーが発生しました（Internal server error）",
                        retryable=True,
                    ),
                ]
            )

            # エラーでも例外を再送出しない
            await process_background_removal(generation_id)

        # 再投入は 1 回まで（submit は計 2 回）
        assert ns.provider.submit_video.call_count == 2

        update_calls = _update_calls(ns)
        assert any(
            call.args[0].get("status") == "failed" for call in update_calls
        ), f"Expected 'failed' in update calls: {update_calls}"
        assert any(
            "fal.ai側のエラーが発生しました（Internal server error）" in str(call)
            for call in update_calls
        ), f"Expected humanized error_message in update calls: {update_calls}"

    @pytest.mark.asyncio
    async def test_process_background_removal_does_not_retry_non_retryable_error(self):
        """retryable=False のエラーは再投入せず即 failed で更新する"""
        from app.tasks.bg_removal_processor import process_background_removal
        from app.external.fal_provider import FalProviderError

        generation_id = "gen-bg-retry-003"

        with _patch_pipeline(_make_mock_db_record(generation_id)) as ns:
            ns.provider.submit_video = AsyncMock(return_value=MOCK_JOB_REF)
            # retryable=False（デフォルト）のエラー → 再試行しない
            ns.provider.check_status = AsyncMock(
                side_effect=FalProviderError(
                    "fal.aiのAPIキーが無効か、残高が不足しています"
                )
            )

            await process_background_removal(generation_id)

        # 再投入されない（submit は 1 回だけ）
        ns.provider.submit_video.assert_called_once()

        update_calls = _update_calls(ns)
        assert any(
            call.args[0].get("status") == "failed" for call in update_calls
        ), f"Expected 'failed' in update calls: {update_calls}"
        assert any(
            "fal.aiのAPIキーが無効か、残高が不足しています" in str(call)
            for call in update_calls
        ), f"Expected error_message in update calls: {update_calls}"

    @pytest.mark.asyncio
    async def test_process_background_removal_handles_failed_status(self):
        """プロバイダーから failed ステータスを受け取った場合は failed で更新する"""
        from app.tasks.bg_removal_processor import process_background_removal

        generation_id = "gen-bg-003"

        with _patch_pipeline(_make_mock_db_record(generation_id)) as ns:
            ns.provider.submit_video = AsyncMock(return_value=MOCK_JOB_REF)
            ns.provider.check_status = AsyncMock(
                return_value=FalJobStatus(
                    status="failed",
                    progress=0,
                    result_url=None,
                    error_message="fal.ai側のエラーが発生しました",
                )
            )

            await process_background_removal(generation_id)

        update_calls = _update_calls(ns)
        assert any(
            "failed" in str(call) for call in update_calls
        ), f"Expected 'failed' in update calls: {update_calls}"

    @pytest.mark.asyncio
    async def test_process_background_removal_timeout(self):
        """ポーリング上限到達でタイムアウトし、failed + メッセージで更新する"""
        from app.tasks.bg_removal_processor import process_background_removal

        generation_id = "gen-bg-004"

        with _patch_pipeline(_make_mock_db_record(generation_id)) as ns:
            ns.provider.submit_video = AsyncMock(return_value=MOCK_JOB_REF)
            # 常に処理中 → タイムアウトに到達する
            ns.provider.check_status = AsyncMock(
                return_value=FalJobStatus(
                    status="processing",
                    progress=50,
                    result_url=None,
                    error_message=None,
                )
            )

            with patch("app.tasks.bg_removal_processor.MAX_POLLING_ATTEMPTS", 3):
                await process_background_removal(generation_id)

        update_calls = _update_calls(ns)
        assert any(
            "failed" in str(call) for call in update_calls
        ), f"Expected 'failed' in update calls: {update_calls}"
        assert any(
            "処理がタイムアウトしました" in str(call) for call in update_calls
        ), f"Expected timeout message in update calls: {update_calls}"

    @pytest.mark.asyncio
    async def test_process_background_removal_handles_missing_record(self):
        """DB レコードが存在しない場合を適切に処理する"""
        from app.tasks.bg_removal_processor import process_background_removal

        generation_id = "gen-nonexistent"

        mock_supabase = _make_mock_supabase(None)

        with patch("app.tasks.bg_removal_processor.get_supabase") as mock_get_supabase:
            mock_get_supabase.return_value = mock_supabase

            # 例外を再送出しない
            await process_background_removal(generation_id)

        # update は呼ばれないはず
        mock_supabase.table.return_value.update.assert_not_called()

    @pytest.mark.asyncio
    async def test_process_background_removal_updates_progress_during_polling(self):
        """ポーリング中に progress が更新される"""
        from app.tasks.bg_removal_processor import process_background_removal

        generation_id = "gen-bg-005"

        status_sequence = [
            FalJobStatus(status="processing", progress=50, result_url=None, error_message=None),
            _completed_status("https://v3.fal.media/files/output.webm"),
        ]

        with _patch_pipeline(_make_mock_db_record(generation_id)) as ns:
            ns.provider.submit_video = AsyncMock(return_value=MOCK_JOB_REF)
            ns.provider.check_status = AsyncMock(side_effect=status_sequence)

            await process_background_removal(generation_id)

        # progress 更新が含まれる update が呼ばれたことを確認
        update_calls = _update_calls(ns)
        assert len(update_calls) >= 3, f"Expected at least 3 update calls, got: {update_calls}"

    @pytest.mark.asyncio
    async def test_process_background_removal_mock_mode_skips_everything(self):
        """モックモードではプローブ / プロキシ / R2 転写をすべてスキップし、
        結果 URL をそのまま output_url にする
        """
        from app.tasks.bg_removal_processor import process_background_removal

        generation_id = "gen-bg-mock-001"

        with patch("app.core.config.settings.BG_REMOVAL_MOCK", True):
            with _patch_pipeline(_make_mock_db_record(generation_id)) as ns:
                ns.provider.submit_video = AsyncMock(return_value=MOCK_JOB_REF)
                # モックモードでは source_url がそのまま結果になる
                ns.provider.check_status = AsyncMock(
                    return_value=_completed_status(SOURCE_URL)
                )

                await process_background_removal(generation_id)

        # ダウンロード / プローブ / プロキシ / R2 アップロードは一切行われない
        ns.download.assert_not_called()
        ns.upload.assert_not_called()
        ns.delete.assert_not_called()
        ns.ffmpeg.probe_video_info.assert_not_called()
        ns.ffmpeg.create_h264_proxy.assert_not_called()

        # output_url = source_url のまま completed / progress=100 で更新される
        update_calls = _update_calls(ns)
        completed_updates = [
            call.args[0] for call in update_calls if call.args[0].get("status") == "completed"
        ]
        assert len(completed_updates) == 1, f"Expected 1 completed update: {update_calls}"
        assert completed_updates[0]["output_url"] == SOURCE_URL
        assert completed_updates[0]["progress"] == 100

    @pytest.mark.asyncio
    async def test_process_background_removal_rejects_non_fal_result_url(self):
        """許可外ホストの結果 URL はダウンロードせず failed で更新する"""
        from app.tasks.bg_removal_processor import process_background_removal

        generation_id = "gen-bg-ssrf-001"

        with _patch_pipeline(_make_mock_db_record(generation_id)) as ns:
            ns.provider.submit_video = AsyncMock(return_value=MOCK_JOB_REF)
            ns.provider.check_status = AsyncMock(
                return_value=_completed_status("http://attacker.example/x.mp4")
            )

            await process_background_removal(generation_id)

        # 不正な結果 URL はダウンロードされない（ダウンロードはソースの 1 回のみ）
        assert [call.args[0] for call in ns.download.call_args_list] == [SOURCE_URL]
        ns.upload.assert_not_called()

        update_calls = _update_calls(ns)
        assert any(
            "failed" in str(call) for call in update_calls
        ), f"Expected 'failed' in update calls: {update_calls}"
        assert any(
            "fal.aiから不正な結果URLが返されました" in str(call) for call in update_calls
        ), f"Expected invalid result URL message in update calls: {update_calls}"

    @pytest.mark.asyncio
    async def test_process_background_removal_unknown_output_format_fails(self):
        """未知の output_format は webm へ暗黙フォールバックせず failed で更新する"""
        from app.tasks.bg_removal_processor import process_background_removal

        generation_id = "gen-bg-fmt-001"

        with _patch_pipeline(
            _make_mock_db_record(generation_id, output_format="avi")
        ) as ns:
            ns.provider.submit_video = AsyncMock(return_value=MOCK_JOB_REF)
            ns.provider.check_status = AsyncMock(
                return_value=_completed_status("https://v3.fal.media/files/output.avi")
            )

            await process_background_removal(generation_id)

        # 結果のダウンロード / アップロードは行われない（ダウンロードはソースの 1 回のみ）
        assert [call.args[0] for call in ns.download.call_args_list] == [SOURCE_URL]
        ns.upload.assert_not_called()

        update_calls = _update_calls(ns)
        assert any(
            "failed" in str(call) for call in update_calls
        ), f"Expected 'failed' in update calls: {update_calls}"
        assert any(
            "未対応の出力形式です" in str(call) for call in update_calls
        ), f"Expected unknown format message in update calls: {update_calls}"

    @pytest.mark.asyncio
    async def test_process_background_removal_skips_redundant_progress_updates(self):
        """同じ進捗値が続くポーリングでは DB 書き込みをスキップする"""
        from app.tasks.bg_removal_processor import process_background_removal

        generation_id = "gen-bg-006"

        status_sequence = [
            FalJobStatus(status="processing", progress=50, result_url=None, error_message=None),
            FalJobStatus(status="processing", progress=50, result_url=None, error_message=None),
            _completed_status("https://v3.fal.media/files/output.webm"),
        ]

        with _patch_pipeline(_make_mock_db_record(generation_id)) as ns:
            ns.provider.submit_video = AsyncMock(return_value=MOCK_JOB_REF)
            ns.provider.check_status = AsyncMock(side_effect=status_sequence)

            await process_background_removal(generation_id)

        # progress=50 の書き込みは 1 回だけ（2 回目はスキップされる）
        update_calls = _update_calls(ns)
        progress_50_updates = [
            call for call in update_calls if call.args[0].get("progress") == 50
        ]
        assert len(progress_50_updates) == 1, f"Expected 1 progress=50 update: {update_calls}"

    @pytest.mark.asyncio
    async def test_start_bg_removal_processing_creates_task(self):
        """start_bg_removal_processing が asyncio タスクを作成し、GC 対策の参照を保持する"""
        from app.tasks import bg_removal_processor
        from app.tasks.bg_removal_processor import start_bg_removal_processing

        with patch("asyncio.create_task") as mock_create_task:
            await start_bg_removal_processing("gen-bg-001")
            mock_create_task.assert_called_once()
            # Close the unawaited coroutine to prevent RuntimeWarning
            mock_create_task.call_args[0][0].close()

        task = mock_create_task.return_value
        # GC 対策: タスク参照が保持され、完了時に破棄するコールバックが登録される
        assert task in bg_removal_processor._tasks
        task.add_done_callback.assert_called_once_with(bg_removal_processor._tasks.discard)
        bg_removal_processor._tasks.discard(task)


class TestResumeBackgroundRemoval:
    """process_background_removal(resume=True) — 中断ジョブのポーリング再開のテスト"""

    @pytest.fixture(autouse=True)
    def _disable_mock_mode(self):
        with patch("app.core.config.settings.BG_REMOVAL_MOCK", False):
            yield

    @pytest.mark.asyncio
    async def test_resume_polls_existing_ref_without_resubmit(self):
        """保存済みジョブ参照がある場合、再投入せず既存 ref のポーリングで完了する"""
        from app.tasks.bg_removal_processor import process_background_removal

        generation_id = "gen-bg-resume-001"
        result_url = "https://v3.fal.media/files/output.webm"

        with _patch_pipeline(_make_mock_db_record_with_refs(generation_id)) as ns:
            ns.provider.submit_video = AsyncMock(return_value=MOCK_JOB_REF_2)
            ns.provider.check_status = AsyncMock(return_value=_completed_status(result_url))

            await process_background_removal(generation_id, resume=True)

        # 再投入されない（submit は呼ばれない）
        ns.provider.submit_video.assert_not_called()
        ns.provider.submit_image.assert_not_called()

        # 保存済み ref（req-001）でポーリングされる
        check_refs = [call.args[0] for call in ns.provider.check_status.call_args_list]
        assert all(ref.request_id == MOCK_JOB_REF.request_id for ref in check_refs)

        # 結果が転写され completed で更新される
        ns.upload.assert_called_once_with(
            b"fake media content",
            f"bg-removal/user-001/{generation_id}.webm",
            "video/webm",
        )
        update_calls = _update_calls(ns)
        assert any(
            call.args[0].get("status") == "completed" for call in update_calls
        ), f"Expected 'completed' in update calls: {update_calls}"

    @pytest.mark.asyncio
    async def test_resume_retryable_error_falls_back_to_resubmit(self):
        """再開ポーリングが一時エラーの場合、再投入リトライにフォールバックして完了する"""
        from app.external.fal_provider import FalProviderError
        from app.tasks.bg_removal_processor import process_background_removal

        generation_id = "gen-bg-resume-002"
        result_url = "https://v3.fal.media/files/output.webm"

        with _patch_pipeline(_make_mock_db_record_with_refs(generation_id)) as ns:
            ns.provider.submit_video = AsyncMock(return_value=MOCK_JOB_REF_2)
            # 再開ポーリングは一時エラー → 再投入後のポーリングで完了
            ns.provider.check_status = AsyncMock(
                side_effect=[
                    FalProviderError(
                        "fal.ai側のエラーが発生しました（Internal server error）",
                        retryable=True,
                    ),
                    _completed_status(result_url),
                ]
            )

            await process_background_removal(generation_id, resume=True)

        # フォールバックで再投入される（自動リトライ機構が有効。プロキシ不要なのでオリジナル URL）
        ns.provider.submit_video.assert_called_once_with(SOURCE_URL)

        update_calls = _update_calls(ns)
        assert any(
            call.args[0].get("status") == "completed" for call in update_calls
        ), f"Expected 'completed' in update calls: {update_calls}"
        assert not any(
            call.args[0].get("status") == "failed" for call in update_calls
        ), f"Expected no 'failed' update calls: {update_calls}"

    @pytest.mark.asyncio
    async def test_resume_without_refs_runs_full_flow(self):
        """ジョブ参照がない（投入前に中断された）場合は通常のフル処理を行う"""
        from app.tasks.bg_removal_processor import process_background_removal

        generation_id = "gen-bg-resume-003"
        result_url = "https://v3.fal.media/files/output.webm"

        # 参照なしの pending レコード
        with _patch_pipeline(_make_mock_db_record(generation_id)) as ns:
            ns.provider.submit_video = AsyncMock(return_value=MOCK_JOB_REF)
            ns.provider.check_status = AsyncMock(return_value=_completed_status(result_url))

            await process_background_removal(generation_id, resume=True)

        # フル処理（submit から）が行われる
        ns.provider.submit_video.assert_called_once_with(SOURCE_URL)
        update_calls = _update_calls(ns)
        assert any(
            call.args[0].get("status") == "completed" for call in update_calls
        ), f"Expected 'completed' in update calls: {update_calls}"

    @pytest.mark.asyncio
    async def test_resume_10bit_prores_composites_with_redownloaded_master(self):
        """resume + prores: マスターを再ダウンロードして合成し、孤児プロキシも削除する"""
        from app.tasks.bg_removal_processor import process_background_removal

        generation_id = "gen-bg-resume-004"
        proxy_key = f"bg-removal/user-001/{generation_id}_proxy.mp4"
        result_url = "https://v3.fal.media/files/output.webm"

        with _patch_pipeline(
            _make_mock_db_record_with_refs(generation_id, output_format="prores"),
            probe_info=PRORES_PROBE_INFO,
        ) as ns:
            ns.provider.submit_video = AsyncMock(return_value=MOCK_JOB_REF_2)
            ns.provider.check_status = AsyncMock(return_value=_completed_status(result_url))

            await process_background_removal(generation_id, resume=True)

        # 再投入されない（既存 ref のポーリングのみ）→ プロキシの再作成も不要
        ns.provider.submit_video.assert_not_called()
        ns.ffmpeg.create_h264_proxy.assert_not_called()

        # マスターのプローブ解像度で合成される
        composite_call = ns.ffmpeg.composite_master_with_alpha_matte.call_args
        assert composite_call.kwargs["width"] == PRORES_PROBE_INFO["width"]
        assert composite_call.kwargs["height"] == PRORES_PROBE_INFO["height"]

        # 前回実行が残した可能性のあるプロキシ R2 オブジェクトを削除する
        ns.delete.assert_called_once_with(proxy_key)

        # .mov としてアップロードされる
        ns.upload.assert_called_once()
        assert ns.upload.call_args.args[1] == f"bg-removal/user-001/{generation_id}.mov"
        assert ns.upload.call_args.args[2] == "video/quicktime"


class TestResumeStuckBackgroundRemovals:
    """resume_stuck_background_removals — 起動時の再開スイープのテスト"""

    @pytest.fixture(autouse=True)
    def _disable_mock_mode(self):
        with patch("app.core.config.settings.BG_REMOVAL_MOCK", False):
            yield

    async def _run_sweep_and_wait(self):
        """スイープを実行し、起動されたバックグラウンドタスクの完了を待つ"""
        import asyncio

        from app.tasks import bg_removal_processor
        from app.tasks.bg_removal_processor import resume_stuck_background_removals

        before = set(bg_removal_processor._tasks)
        await resume_stuck_background_removals()
        new_tasks = [t for t in bg_removal_processor._tasks if t not in before]
        if new_tasks:
            await asyncio.gather(*new_tasks)

    @pytest.mark.asyncio
    async def test_sweep_resumes_row_with_refs_without_resubmit(self):
        """参照ありの行は再投入せず既存 ref のポーリング再開で完了する（E2E）"""
        generation_id = "gen-bg-sweep-001"
        result_url = "https://v3.fal.media/files/output.webm"

        record = _make_mock_db_record_with_refs(generation_id)
        sweep_row = {
            "id": generation_id,
            "provider_request_id": record["provider_request_id"],
            "provider_status_url": record["provider_status_url"],
            "provider_response_url": record["provider_response_url"],
        }

        with _patch_pipeline(record, sweep_rows=[sweep_row]) as ns:
            ns.provider.submit_video = AsyncMock(return_value=MOCK_JOB_REF_2)
            ns.provider.check_status = AsyncMock(return_value=_completed_status(result_url))

            await self._run_sweep_and_wait()

        # 再投入されず、既存 ref のポーリングで完了する
        ns.provider.submit_video.assert_not_called()
        ns.provider.check_status.assert_called()
        ns.upload.assert_called_once()

        update_calls = _update_calls(ns)
        assert any(
            call.args[0].get("status") == "completed" for call in update_calls
        ), f"Expected 'completed' in update calls: {update_calls}"

    @pytest.mark.asyncio
    async def test_sweep_runs_full_flow_for_row_without_refs(self):
        """参照なしの行（投入前に中断）は通常のフル処理（submit から）を行う（E2E）"""
        generation_id = "gen-bg-sweep-002"
        result_url = "https://v3.fal.media/files/output.webm"

        record = _make_mock_db_record(generation_id)  # 参照なし pending
        sweep_row = {
            "id": generation_id,
            "provider_request_id": None,
            "provider_status_url": None,
            "provider_response_url": None,
        }

        with _patch_pipeline(record, sweep_rows=[sweep_row]) as ns:
            ns.provider.submit_video = AsyncMock(return_value=MOCK_JOB_REF)
            ns.provider.check_status = AsyncMock(return_value=_completed_status(result_url))

            await self._run_sweep_and_wait()

        # フル処理（submit から）が行われ完了する
        ns.provider.submit_video.assert_called_once_with(SOURCE_URL)
        update_calls = _update_calls(ns)
        assert any(
            call.args[0].get("status") == "completed" for call in update_calls
        ), f"Expected 'completed' in update calls: {update_calls}"

    @pytest.mark.asyncio
    async def test_sweep_continues_after_bad_row(self):
        """不正な行（id 欠落）があっても他の行の再開を止めない"""
        good_id = "gen-bg-sweep-003"
        sweep_rows = [
            {"provider_request_id": "req-x"},  # id 欠落 → KeyError になる行
            {
                "id": good_id,
                "provider_request_id": MOCK_JOB_REF.request_id,
                "provider_status_url": MOCK_JOB_REF.status_url,
                "provider_response_url": MOCK_JOB_REF.response_url,
            },
        ]
        mock_supabase = _make_mock_supabase(None, sweep_rows=sweep_rows)

        with patch("app.tasks.bg_removal_processor.get_supabase") as mock_get_supabase:
            mock_get_supabase.return_value = mock_supabase

            with patch(
                "app.tasks.bg_removal_processor.process_background_removal",
                new_callable=AsyncMock,
            ) as mock_process:
                await self._run_sweep_and_wait()

        # 不正な行はスキップされ、正常な行は resume=True で処理される
        mock_process.assert_called_once_with(good_id, resume=True)

    @pytest.mark.asyncio
    async def test_sweep_handles_query_failure_gracefully(self):
        """対象行の取得に失敗してもスイープは例外を送出しない"""
        from app.tasks.bg_removal_processor import resume_stuck_background_removals

        mock_supabase = MagicMock()
        mock_supabase.table.return_value.select.return_value.in_.return_value.execute.side_effect = Exception(
            "db down"
        )

        with patch("app.tasks.bg_removal_processor.get_supabase") as mock_get_supabase:
            mock_get_supabase.return_value = mock_supabase

            # 例外を送出しない
            await resume_stuck_background_removals()

    @pytest.mark.asyncio
    async def test_sweep_with_no_rows_does_nothing(self):
        """対象行がない場合は何も起動しない"""
        from app.tasks import bg_removal_processor

        mock_supabase = _make_mock_supabase(None, sweep_rows=[])

        with patch("app.tasks.bg_removal_processor.get_supabase") as mock_get_supabase:
            mock_get_supabase.return_value = mock_supabase

            before = set(bg_removal_processor._tasks)
            await bg_removal_processor.resume_stuck_background_removals()
            assert set(bg_removal_processor._tasks) == before
