"""
FalBackgroundRemovalProvider のユニットテスト
"""
import pytest
from unittest.mock import patch, AsyncMock, MagicMock


def _make_mock_client(*, post_response=None, get_response=None, get_side_effect=None):
    """httpx.AsyncClient のコンテキストマネージャをモックするヘルパー"""
    mock_client = AsyncMock()
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=None)
    if post_response is not None:
        mock_client.post = AsyncMock(return_value=post_response)
    if get_response is not None:
        mock_client.get = AsyncMock(return_value=get_response)
    if get_side_effect is not None:
        mock_client.get = AsyncMock(side_effect=get_side_effect)
    return mock_client


def _make_json_response(payload: dict):
    """raise_for_status が成功する JSON レスポンスのモックを作る"""
    mock_response = MagicMock()
    mock_response.raise_for_status = MagicMock()
    mock_response.json.return_value = payload
    return mock_response


def _make_http_error_response(status_code: int, *, json_payload=None, text="error"):
    """httpx.HTTPStatusError を raise するレスポンスのモックを作る"""
    import httpx

    error_response = MagicMock()
    error_response.status_code = status_code
    error_response.text = text
    if json_payload is not None:
        error_response.json.return_value = json_payload
    else:
        error_response.json.side_effect = ValueError("not json")

    http_error = httpx.HTTPStatusError(
        "error", request=MagicMock(), response=error_response
    )

    mock_response = MagicMock()
    mock_response.raise_for_status = MagicMock(side_effect=http_error)
    return mock_response


SUBMIT_RESPONSE = {
    "request_id": "req-001",
    "status_url": "https://queue.fal.run/bria/video/background-removal/requests/req-001/status",
    "response_url": "https://queue.fal.run/bria/video/background-removal/requests/req-001",
}


class TestFalBackgroundRemovalProvider:
    """FalBackgroundRemovalProvider のテスト"""

    @pytest.fixture(autouse=True)
    def _set_fal_key(self):
        """テスト中は FAL_KEY を擬似値に固定する
        （未設定だと __init__ がガードで ValueError を投げるため）
        """
        with patch("app.core.config.settings.FAL_KEY", "test-fal-key"), patch(
            "app.core.config.settings.BG_REMOVAL_MOCK", False
        ):
            yield

    def test_provider_name_returns_fal(self):
        """provider_name が 'fal' を返す"""
        from app.external.fal_provider import FalBackgroundRemovalProvider

        provider = FalBackgroundRemovalProvider()
        assert provider.provider_name == "fal"

    def test_init_raises_when_fal_key_missing(self):
        """FAL_KEY 未設定時は __init__ で明確な ValueError を投げる"""
        from app.external.fal_provider import FalBackgroundRemovalProvider

        with patch("app.core.config.settings.FAL_KEY", ""):
            with pytest.raises(ValueError, match="FAL_KEY"):
                FalBackgroundRemovalProvider()

    def test_init_does_not_raise_in_mock_mode(self):
        """BG_REMOVAL_MOCK=true なら FAL_KEY 未設定でも初期化できる"""
        from app.external.fal_provider import FalBackgroundRemovalProvider

        with patch("app.core.config.settings.FAL_KEY", ""), patch(
            "app.core.config.settings.BG_REMOVAL_MOCK", True
        ):
            provider = FalBackgroundRemovalProvider()
            assert provider.mock_enabled is True

    @pytest.mark.asyncio
    async def test_submit_video_sends_correct_request(self):
        """submit_video が正しい URL / ヘッダー / body で POST し、FalJobRef を返す"""
        from app.external.fal_provider import FalBackgroundRemovalProvider

        provider = FalBackgroundRemovalProvider()

        mock_client = _make_mock_client(post_response=_make_json_response(SUBMIT_RESPONSE))

        with patch("httpx.AsyncClient", return_value=mock_client):
            ref = await provider.submit_video("https://example.com/video.mp4")

        assert ref.request_id == "req-001"
        assert ref.status_url == SUBMIT_RESPONSE["status_url"]
        assert ref.response_url == SUBMIT_RESPONSE["response_url"]

        call = mock_client.post.call_args
        assert call.args[0] == "https://queue.fal.run/bria/video/background-removal/v3"
        sent_body = call.kwargs["json"]
        assert sent_body["video_url"] == "https://example.com/video.mp4"
        assert sent_body["background_color"] == "Transparent"
        # webm（デフォルト）では出力コーデック未指定
        assert "output_container_and_codec" not in sent_body
        # Authorization ヘッダーを検証
        assert call.kwargs["headers"]["Authorization"] == "Key test-fal-key"

    @pytest.mark.asyncio
    async def test_submit_video_always_requests_webm(self):
        """submit_video は常に WebM を要求する（ProRes 出力コーデックを送らない）

        Bria 側の ProRes 出力（mov_proresks）は不安定なため使用しない。
        ProRes はローカルの ffmpeg 変換で生成する方針。
        """
        import inspect

        from app.external.fal_provider import FalBackgroundRemovalProvider

        # output_format パラメータ自体が削除されている
        sig = inspect.signature(FalBackgroundRemovalProvider.submit_video)
        assert "output_format" not in sig.parameters

        provider = FalBackgroundRemovalProvider()

        mock_client = _make_mock_client(post_response=_make_json_response(SUBMIT_RESPONSE))

        with patch("httpx.AsyncClient", return_value=mock_client):
            await provider.submit_video("https://example.com/video.mp4")

        sent_body = mock_client.post.call_args.kwargs["json"]
        assert "output_container_and_codec" not in sent_body
        assert sent_body == {
            "video_url": "https://example.com/video.mp4",
            "background_color": "Transparent",
        }

    @pytest.mark.asyncio
    async def test_submit_image_sends_correct_request(self):
        """submit_image が画像モデルへ image_url を POST する"""
        from app.external.fal_provider import FalBackgroundRemovalProvider

        provider = FalBackgroundRemovalProvider()

        mock_client = _make_mock_client(post_response=_make_json_response(SUBMIT_RESPONSE))

        with patch("httpx.AsyncClient", return_value=mock_client):
            ref = await provider.submit_image("https://example.com/image.png")

        assert ref.request_id == "req-001"

        call = mock_client.post.call_args
        assert call.args[0] == "https://queue.fal.run/fal-ai/bria/background/remove"
        sent_body = call.kwargs["json"]
        assert sent_body == {"image_url": "https://example.com/image.png"}

    @pytest.mark.asyncio
    async def test_submit_missing_fields_raises(self):
        """submit レスポンスに request_id 等がない場合は FalProviderError を投げる"""
        from app.external.fal_provider import FalBackgroundRemovalProvider, FalProviderError

        provider = FalBackgroundRemovalProvider()

        mock_client = _make_mock_client(post_response=_make_json_response({"foo": "bar"}))

        with patch("httpx.AsyncClient", return_value=mock_client):
            with pytest.raises(FalProviderError):
                await provider.submit_video("https://example.com/video.mp4")

    @pytest.mark.asyncio
    async def test_check_status_in_queue_returns_pending(self):
        """IN_QUEUE → pending / progress=0"""
        from app.external.fal_provider import FalBackgroundRemovalProvider, FalJobRef

        provider = FalBackgroundRemovalProvider()
        ref = FalJobRef(
            request_id="req-001",
            status_url=SUBMIT_RESPONSE["status_url"],
            response_url=SUBMIT_RESPONSE["response_url"],
        )

        mock_client = _make_mock_client(
            get_response=_make_json_response({"status": "IN_QUEUE"})
        )

        with patch("httpx.AsyncClient", return_value=mock_client):
            status = await provider.check_status(ref)

        assert status.status == "pending"
        assert status.progress == 0
        assert status.result_url is None

    @pytest.mark.asyncio
    async def test_check_status_in_progress_returns_processing(self):
        """IN_PROGRESS → processing / progress=50"""
        from app.external.fal_provider import FalBackgroundRemovalProvider, FalJobRef

        provider = FalBackgroundRemovalProvider()
        ref = FalJobRef(
            request_id="req-001",
            status_url=SUBMIT_RESPONSE["status_url"],
            response_url=SUBMIT_RESPONSE["response_url"],
        )

        mock_client = _make_mock_client(
            get_response=_make_json_response({"status": "IN_PROGRESS"})
        )

        with patch("httpx.AsyncClient", return_value=mock_client):
            status = await provider.check_status(ref)

        assert status.status == "processing"
        assert status.progress == 50

    @pytest.mark.asyncio
    async def test_check_status_completed_extracts_result_url(self):
        """COMPLETED → response_url から結果 URL を再帰探索で抽出する"""
        from app.external.fal_provider import FalBackgroundRemovalProvider, FalJobRef

        provider = FalBackgroundRemovalProvider()
        ref = FalJobRef(
            request_id="req-001",
            status_url=SUBMIT_RESPONSE["status_url"],
            response_url=SUBMIT_RESPONSE["response_url"],
        )

        status_response = _make_json_response({"status": "COMPLETED"})
        # ネストした結果 JSON（キー名はモデルにより異なるため再帰探索される）
        result_response = _make_json_response(
            {"video": {"url": "https://v3.fal.media/files/output.webm", "content_type": "video/webm"}}
        )

        mock_client = _make_mock_client(get_side_effect=[status_response, result_response])

        with patch("httpx.AsyncClient", return_value=mock_client):
            status = await provider.check_status(ref)

        assert status.status == "completed"
        assert status.progress == 100
        assert status.result_url == "https://v3.fal.media/files/output.webm"

        # status_url と response_url の両方に GET していることを確認
        get_urls = [call.args[0] for call in mock_client.get.call_args_list]
        assert get_urls == [ref.status_url, ref.response_url]

    @pytest.mark.asyncio
    async def test_check_status_completed_without_media_url_raises(self):
        """COMPLETED だが結果にメディア URL がない場合は FalProviderError を投げる"""
        from app.external.fal_provider import (
            FalBackgroundRemovalProvider,
            FalJobRef,
            FalProviderError,
        )

        provider = FalBackgroundRemovalProvider()
        ref = FalJobRef(
            request_id="req-001",
            status_url=SUBMIT_RESPONSE["status_url"],
            response_url=SUBMIT_RESPONSE["response_url"],
        )

        status_response = _make_json_response({"status": "COMPLETED"})
        result_response = _make_json_response({"detail": "no media here"})

        mock_client = _make_mock_client(get_side_effect=[status_response, result_response])

        with patch("httpx.AsyncClient", return_value=mock_client):
            with pytest.raises(FalProviderError):
                await provider.check_status(ref)

    @pytest.mark.asyncio
    async def test_check_status_rejects_non_fal_host(self):
        """status_url のホストが queue.fal.run 以外なら FalProviderError を投げる"""
        from app.external.fal_provider import (
            FalBackgroundRemovalProvider,
            FalJobRef,
            FalProviderError,
        )

        provider = FalBackgroundRemovalProvider()
        ref = FalJobRef(
            request_id="req-001",
            status_url="https://evil.example.com/status",
            response_url="https://evil.example.com/response",
        )

        with pytest.raises(FalProviderError) as exc_info:
            await provider.check_status(ref)

        # ユーザー向けメッセージに不正な URL を含めない（ログにのみ記録）
        assert "evil.example.com" not in str(exc_info.value)

    @pytest.mark.asyncio
    @pytest.mark.parametrize(
        "status_code,expected_message",
        [
            (401, "fal.aiのAPIキーが無効か、残高が不足しています"),
            (403, "fal.aiのAPIキーが無効か、残高が不足しています"),
            (402, "fal.aiのクレジット不足またはレート制限です"),
            (429, "fal.aiのクレジット不足またはレート制限です"),
            (500, "fal.ai側のエラーが発生しました"),
            (503, "fal.ai側のエラーが発生しました"),
        ],
    )
    async def test_submit_humanizes_http_errors(self, status_code, expected_message):
        """HTTP エラーがユーザー向け日本語メッセージに人間化される"""
        from app.external.fal_provider import FalBackgroundRemovalProvider, FalProviderError

        provider = FalBackgroundRemovalProvider()

        mock_client = _make_mock_client(
            post_response=_make_http_error_response(status_code)
        )

        with patch("httpx.AsyncClient", return_value=mock_client):
            with pytest.raises(FalProviderError) as exc_info:
                await provider.submit_video("https://example.com/video.mp4")

        assert expected_message in str(exc_info.value)

    @pytest.mark.asyncio
    async def test_submit_422_includes_response_detail(self):
        """422 エラーはレスポンスの detail を含める"""
        from app.external.fal_provider import FalBackgroundRemovalProvider, FalProviderError

        provider = FalBackgroundRemovalProvider()

        mock_client = _make_mock_client(
            post_response=_make_http_error_response(
                422, json_payload={"detail": "video_url is invalid"}
            )
        )

        with patch("httpx.AsyncClient", return_value=mock_client):
            with pytest.raises(FalProviderError) as exc_info:
                await provider.submit_video("https://example.com/video.mp4")

        assert "video_url is invalid" in str(exc_info.value)

    @pytest.mark.asyncio
    @pytest.mark.parametrize("status_code", [500, 503])
    async def test_submit_5xx_error_is_retryable_with_detail(self, status_code):
        """5xx エラーは retryable=True で、レスポンスの detail をメッセージに含める"""
        from app.external.fal_provider import FalBackgroundRemovalProvider, FalProviderError

        provider = FalBackgroundRemovalProvider()

        mock_client = _make_mock_client(
            post_response=_make_http_error_response(
                status_code, json_payload={"detail": "Internal server error"}
            )
        )

        with patch("httpx.AsyncClient", return_value=mock_client):
            with pytest.raises(FalProviderError) as exc_info:
                await provider.submit_video("https://example.com/video.mp4")

        assert exc_info.value.retryable is True
        assert "fal.ai側のエラーが発生しました（Internal server error）" in str(exc_info.value)

    @pytest.mark.asyncio
    async def test_submit_5xx_error_without_detail_is_retryable_with_generic_message(self):
        """5xx エラーで body に detail がない場合は従来の汎用メッセージにフォールバックする"""
        from app.external.fal_provider import FalBackgroundRemovalProvider, FalProviderError

        provider = FalBackgroundRemovalProvider()

        mock_client = _make_mock_client(
            post_response=_make_http_error_response(500)
        )

        with patch("httpx.AsyncClient", return_value=mock_client):
            with pytest.raises(FalProviderError) as exc_info:
                await provider.submit_video("https://example.com/video.mp4")

        assert exc_info.value.retryable is True
        assert str(exc_info.value) == "fal.ai側のエラーが発生しました"

    @pytest.mark.asyncio
    async def test_submit_5xx_error_detail_is_truncated(self):
        """5xx エラーの detail は約100文字に切り詰められる"""
        from app.external.fal_provider import FalBackgroundRemovalProvider, FalProviderError

        provider = FalBackgroundRemovalProvider()

        long_detail = "x" * 300
        mock_client = _make_mock_client(
            post_response=_make_http_error_response(
                500, json_payload={"detail": long_detail}
            )
        )

        with patch("httpx.AsyncClient", return_value=mock_client):
            with pytest.raises(FalProviderError) as exc_info:
                await provider.submit_video("https://example.com/video.mp4")

        message = str(exc_info.value)
        assert "x" * 100 in message
        assert "x" * 101 not in message

    @pytest.mark.asyncio
    @pytest.mark.parametrize("status_code", [401, 403, 402, 429, 422])
    async def test_submit_4xx_errors_are_not_retryable(self, status_code):
        """401/403/402/429/422 エラーは retryable=False のまま"""
        from app.external.fal_provider import FalBackgroundRemovalProvider, FalProviderError

        provider = FalBackgroundRemovalProvider()

        mock_client = _make_mock_client(
            post_response=_make_http_error_response(status_code)
        )

        with patch("httpx.AsyncClient", return_value=mock_client):
            with pytest.raises(FalProviderError) as exc_info:
                await provider.submit_video("https://example.com/video.mp4")

        assert exc_info.value.retryable is False

    @pytest.mark.asyncio
    async def test_submit_timeout_is_retryable(self):
        """submit のタイムアウト / 接続エラーは retryable=True になる"""
        import httpx

        from app.external.fal_provider import FalBackgroundRemovalProvider, FalProviderError

        provider = FalBackgroundRemovalProvider()

        mock_client = _make_mock_client()
        mock_client.post = AsyncMock(
            side_effect=httpx.ConnectTimeout("connection timed out")
        )

        with patch("httpx.AsyncClient", return_value=mock_client):
            with pytest.raises(FalProviderError) as exc_info:
                await provider.submit_video("https://example.com/video.mp4")

        assert exc_info.value.retryable is True
        assert "fal.aiへのジョブ投入に失敗しました" in str(exc_info.value)

    @pytest.mark.asyncio
    async def test_check_status_timeout_is_retryable(self):
        """check_status のタイムアウト / 接続エラーは retryable=True になる"""
        import httpx

        from app.external.fal_provider import (
            FalBackgroundRemovalProvider,
            FalJobRef,
            FalProviderError,
        )

        provider = FalBackgroundRemovalProvider()
        ref = FalJobRef(
            request_id="req-001",
            status_url=SUBMIT_RESPONSE["status_url"],
            response_url=SUBMIT_RESPONSE["response_url"],
        )

        mock_client = _make_mock_client()
        mock_client.get = AsyncMock(side_effect=httpx.ReadTimeout("read timed out"))

        with patch("httpx.AsyncClient", return_value=mock_client):
            with pytest.raises(FalProviderError) as exc_info:
                await provider.check_status(ref)

        assert exc_info.value.retryable is True
        assert "fal.aiのステータス確認に失敗しました" in str(exc_info.value)

    def test_fal_provider_error_retryable_defaults_to_false(self):
        """FalProviderError の retryable はデフォルト False"""
        from app.external.fal_provider import FalProviderError

        error = FalProviderError("テストエラー")
        assert error.retryable is False
        assert str(error) == "テストエラー"

    @pytest.mark.asyncio
    async def test_mock_mode_submit_and_check_status(self):
        """モックモード: submit はダミー ref を返し、check_status は即 completed を返す"""
        from app.external.fal_provider import FalBackgroundRemovalProvider

        with patch("app.core.config.settings.BG_REMOVAL_MOCK", True):
            provider = FalBackgroundRemovalProvider()

            ref = await provider.submit_video("https://example.com/video.mp4")

            assert ref.request_id.startswith("mock-")
            assert ref.status_url == "mock"
            assert ref.response_url == "mock"

            status = await provider.check_status(ref)

            assert status.status == "completed"
            assert status.progress == 100
            # モックモードでは source_url がそのまま結果になる
            assert status.result_url == "https://example.com/video.mp4"

    @pytest.mark.asyncio
    async def test_mock_mode_submit_image(self):
        """モックモード: submit_image も同様に動作する"""
        from app.external.fal_provider import FalBackgroundRemovalProvider

        with patch("app.core.config.settings.BG_REMOVAL_MOCK", True):
            provider = FalBackgroundRemovalProvider()

            ref = await provider.submit_image("https://example.com/image.png")
            status = await provider.check_status(ref)

            assert status.status == "completed"
            assert status.result_url == "https://example.com/image.png"

    def test_extract_media_url_handles_query_string(self):
        """クエリ付き URL でも拡張子を正しく判定する"""
        from app.external.fal_provider import _extract_media_url

        data = {"output": ["https://v3.fal.media/files/output.png?token=abc"]}
        assert (
            _extract_media_url(data)
            == "https://v3.fal.media/files/output.png?token=abc"
        )

    def test_extract_media_url_ignores_non_media_urls(self):
        """メディア拡張子でない URL は無視する"""
        from app.external.fal_provider import _extract_media_url

        data = {"docs": "https://example.com/manual.html", "id": "abc"}
        assert _extract_media_url(data) is None

    def test_extract_media_url_prefers_known_keys_over_input_echo(self):
        """入力エコーバックより既知のキー形状（video.url）を優先して抽出する"""
        from app.external.fal_provider import _extract_media_url

        # "input" が先に列挙されても video.url が優先される
        data = {
            "input": {"video_url": "http://attacker.example/x.mp4"},
            "video": {"url": "https://v3.fal.media/files/ok.webm"},
        }
        assert _extract_media_url(data) == "https://v3.fal.media/files/ok.webm"

    @pytest.mark.parametrize(
        "payload",
        [
            {"video": {"url": "https://v3.fal.media/files/ok.webm"}},
            {"image": {"url": "https://v3.fal.media/files/ok.webm"}},
            {"images": [{"url": "https://v3.fal.media/files/ok.webm"}]},
            {"video_url": "https://v3.fal.media/files/ok.webm"},
            {"image_url": "https://v3.fal.media/files/ok.webm"},
        ],
    )
    def test_extract_media_url_known_key_shapes(self, payload):
        """既知のキー形状をすべて抽出できる"""
        from app.external.fal_provider import _extract_media_url

        assert _extract_media_url(payload) == "https://v3.fal.media/files/ok.webm"


class TestValidateResultUrl:
    """validate_result_url（結果 URL ホスト許可リスト）のテスト"""

    @pytest.mark.parametrize(
        "url",
        [
            "https://fal.media/files/output.webm",
            "https://v3.fal.media/files/output.webm",
            "https://v2.fal.media/files/output.png",
            "https://queue.fal.run/bria/video/background-removal/requests/req-001",
            "https://temp.bria.ai/9c4d61bbc940/output.webm",
        ],
    )
    def test_allows_fal_hosts(self, url):
        """fal.ai の配信ドメインは許可される（raise しない）"""
        from app.external.fal_provider import validate_result_url

        validate_result_url(url)

    @pytest.mark.parametrize(
        "url",
        [
            "http://attacker.example/x.mp4",
            "https://evil.fal.media.attacker.example/x.webm",
            "https://notfal.media/files/output.webm",
            "https://fal.run/files/output.webm",
            "https://evil.temp.bria.ai.attacker.example/x.webm",
            "https://bria.ai/files/output.webm",
        ],
    )
    def test_rejects_non_fal_hosts(self, url):
        """fal.ai 以外のホストは FalProviderError で拒否される"""
        from app.external.fal_provider import FalProviderError, validate_result_url

        with pytest.raises(FalProviderError) as exc_info:
            validate_result_url(url)

        assert "fal.aiから不正な結果URLが返されました" in str(exc_info.value)
        # ユーザー向けメッセージに不正な URL を含めない（ログにのみ記録）
        assert url not in str(exc_info.value)
