"""
60fps補間機能のテスト
"""
import pytest
from unittest.mock import patch, MagicMock, AsyncMock
import uuid


class TestInterpolateEndpoint:
    """単体動画の60fps補間エンドポイントのテスト"""

    def test_interpolate_video_not_found(self, auth_client):
        """存在しない動画は404エラー"""
        video_id = str(uuid.uuid4())

        with patch("app.videos.router.get_supabase") as mock_supabase:
            mock_supabase.return_value.table.return_value.select.return_value.eq.return_value.eq.return_value.single.return_value.execute.return_value.data = None

            response = auth_client.post(
                f"/api/v1/videos/{video_id}/interpolate-60fps",
                json={"model": "apo-8"}
            )

            assert response.status_code == 404
            assert "動画が見つかりません" in response.json()["detail"]

    def test_interpolate_video_not_completed(self, auth_client):
        """未完了の動画は400エラー"""
        video_id = str(uuid.uuid4())

        with patch("app.videos.router.get_supabase") as mock_supabase:
            mock_supabase.return_value.table.return_value.select.return_value.eq.return_value.eq.return_value.single.return_value.execute.return_value.data = {
                "id": video_id,
                "status": "processing",
                "final_video_url": None,
            }

            response = auth_client.post(
                f"/api/v1/videos/{video_id}/interpolate-60fps",
                json={"model": "apo-8"}
            )

            assert response.status_code == 400
            assert "完了していません" in response.json()["detail"]

    def test_interpolate_video_no_url(self, auth_client):
        """動画URLがない場合は400エラー"""
        video_id = str(uuid.uuid4())

        with patch("app.videos.router.get_supabase") as mock_supabase:
            mock_supabase.return_value.table.return_value.select.return_value.eq.return_value.eq.return_value.single.return_value.execute.return_value.data = {
                "id": video_id,
                "status": "completed",
                "final_video_url": None,
                "raw_video_url": None,
            }

            response = auth_client.post(
                f"/api/v1/videos/{video_id}/interpolate-60fps",
                json={"model": "apo-8"}
            )

            assert response.status_code == 400
            assert "URLが見つかりません" in response.json()["detail"]

    def test_interpolate_video_starts_processing(self, auth_client):
        """60fps補間はバックグラウンド処理を開始"""
        video_id = str(uuid.uuid4())
        final_video_url = "https://example.com/video.mp4"

        with patch("app.videos.router.get_supabase") as mock_supabase:
            mock_supabase.return_value.table.return_value.select.return_value.eq.return_value.eq.return_value.single.return_value.execute.return_value.data = {
                "id": video_id,
                "status": "completed",
                "final_video_url": final_video_url,
            }
            mock_supabase.return_value.table.return_value.insert.return_value.execute.return_value = MagicMock()

            with patch("app.tasks.start_interpolation_processing"):
                response = auth_client.post(
                    f"/api/v1/videos/{video_id}/interpolate-60fps",
                    json={"model": "apo-8"}
                )

                assert response.status_code == 200
                data = response.json()
                assert data["status"] == "pending"
                assert data["model"] == "apo-8"
                assert data["original_video_url"] == final_video_url
                assert data["progress"] == 0
                assert data["video_id"] == video_id

    def test_interpolate_video_with_different_models(self, auth_client):
        """異なる補間モデルでも正常に動作"""
        video_id = str(uuid.uuid4())
        final_video_url = "https://example.com/video.mp4"

        models = ["apo-8", "apf-2", "chr-2", "chf-3"]

        for model in models:
            with patch("app.videos.router.get_supabase") as mock_supabase:
                mock_supabase.return_value.table.return_value.select.return_value.eq.return_value.eq.return_value.single.return_value.execute.return_value.data = {
                    "id": video_id,
                    "status": "completed",
                    "final_video_url": final_video_url,
                }
                mock_supabase.return_value.table.return_value.insert.return_value.execute.return_value = MagicMock()

                with patch("app.tasks.start_interpolation_processing"):
                    response = auth_client.post(
                        f"/api/v1/videos/{video_id}/interpolate-60fps",
                        json={"model": model}
                    )

                    assert response.status_code == 200
                    assert response.json()["model"] == model


class TestInterpolateStatusEndpoint:
    """60fps補間ステータスエンドポイントのテスト"""

    def test_get_interpolation_status_completed(self, auth_client):
        """完了した補間のステータスを取得"""
        video_id = str(uuid.uuid4())
        interpolation_id = str(uuid.uuid4())
        interpolated_url = "https://example.com/interpolated.mp4"

        with patch("app.videos.router.get_supabase") as mock_supabase:
            mock_supabase.return_value.table.return_value.select.return_value.eq.return_value.eq.return_value.order.return_value.limit.return_value.execute.return_value.data = [{
                "id": interpolation_id,
                "status": "completed",
                "progress": 100,
                "interpolated_video_url": interpolated_url,
                "model": "apo-8",
            }]

            response = auth_client.get(
                f"/api/v1/videos/{video_id}/interpolate-60fps/status"
            )

            assert response.status_code == 200
            data = response.json()
            assert data["status"] == "completed"
            assert data["progress"] == 100
            assert data["interpolated_video_url"] == interpolated_url
            assert "完了" in data["message"]

    def test_get_interpolation_status_processing(self, auth_client):
        """処理中の補間のステータスを取得"""
        video_id = str(uuid.uuid4())
        interpolation_id = str(uuid.uuid4())

        with patch("app.videos.router.get_supabase") as mock_supabase:
            mock_supabase.return_value.table.return_value.select.return_value.eq.return_value.eq.return_value.order.return_value.limit.return_value.execute.return_value.data = [{
                "id": interpolation_id,
                "status": "processing",
                "progress": 50,
                "interpolated_video_url": None,
                "model": "apo-8",
            }]

            response = auth_client.get(
                f"/api/v1/videos/{video_id}/interpolate-60fps/status"
            )

            assert response.status_code == 200
            data = response.json()
            assert data["status"] == "processing"
            assert data["progress"] == 50
            assert "補間中" in data["message"]

    def test_get_interpolation_status_not_found(self, auth_client):
        """補間ジョブが存在しない場合は404"""
        video_id = str(uuid.uuid4())

        with patch("app.videos.router.get_supabase") as mock_supabase:
            mock_supabase.return_value.table.return_value.select.return_value.eq.return_value.eq.return_value.order.return_value.limit.return_value.execute.return_value.data = []

            response = auth_client.get(
                f"/api/v1/videos/{video_id}/interpolate-60fps/status"
            )

            assert response.status_code == 404


class TestStoryboardInterpolateEndpoint:
    """ストーリーボード動画の60fps補間エンドポイントのテスト"""

    def test_interpolate_storyboard_not_found(self, auth_client):
        """存在しないストーリーボードは404エラー"""
        storyboard_id = str(uuid.uuid4())

        with patch("app.videos.router.get_supabase") as mock_supabase:
            mock_supabase.return_value.table.return_value.select.return_value.eq.return_value.eq.return_value.single.return_value.execute.return_value.data = None

            response = auth_client.post(
                f"/api/v1/videos/storyboard/{storyboard_id}/interpolate-60fps",
                json={"model": "apo-8"}
            )

            assert response.status_code == 404

    def test_interpolate_storyboard_no_video(self, auth_client):
        """動画がまだ生成されていない場合は400エラー"""
        storyboard_id = str(uuid.uuid4())

        with patch("app.videos.router.get_supabase") as mock_supabase:
            mock_supabase.return_value.table.return_value.select.return_value.eq.return_value.eq.return_value.single.return_value.execute.return_value.data = {
                "id": storyboard_id,
                "final_video_url": None,
            }

            response = auth_client.post(
                f"/api/v1/videos/storyboard/{storyboard_id}/interpolate-60fps",
                json={"model": "apo-8"}
            )

            assert response.status_code == 400
            assert "生成されていません" in response.json()["detail"]

    def test_interpolate_storyboard_starts_processing(self, auth_client):
        """ストーリーボードの60fps補間はバックグラウンド処理を開始"""
        storyboard_id = str(uuid.uuid4())
        final_video_url = "https://example.com/storyboard.mp4"

        with patch("app.videos.router.get_supabase") as mock_supabase:
            mock_supabase.return_value.table.return_value.select.return_value.eq.return_value.eq.return_value.single.return_value.execute.return_value.data = {
                "id": storyboard_id,
                "final_video_url": final_video_url,
            }
            mock_supabase.return_value.table.return_value.insert.return_value.execute.return_value = MagicMock()

            with patch("app.tasks.start_interpolation_processing"):
                response = auth_client.post(
                    f"/api/v1/videos/storyboard/{storyboard_id}/interpolate-60fps",
                    json={"model": "chr-2"}
                )

                assert response.status_code == 200
                data = response.json()
                assert data["status"] == "pending"
                assert data["model"] == "chr-2"
                assert data["storyboard_id"] == storyboard_id


class TestConcatInterpolateEndpoint:
    """結合動画の60fps補間エンドポイントのテスト"""

    def test_interpolate_concat_not_found(self, auth_client):
        """存在しない結合動画は404エラー"""
        concat_id = str(uuid.uuid4())

        with patch("app.videos.router.get_supabase") as mock_supabase:
            mock_supabase.return_value.table.return_value.select.return_value.eq.return_value.eq.return_value.single.return_value.execute.return_value.data = None

            response = auth_client.post(
                f"/api/v1/videos/concat/{concat_id}/interpolate-60fps",
                json={"model": "apo-8"}
            )

            assert response.status_code == 404

    def test_interpolate_concat_not_completed(self, auth_client):
        """未完了の結合動画は400エラー"""
        concat_id = str(uuid.uuid4())

        with patch("app.videos.router.get_supabase") as mock_supabase:
            mock_supabase.return_value.table.return_value.select.return_value.eq.return_value.eq.return_value.single.return_value.execute.return_value.data = {
                "id": concat_id,
                "status": "processing",
            }

            response = auth_client.post(
                f"/api/v1/videos/concat/{concat_id}/interpolate-60fps",
                json={"model": "apo-8"}
            )

            assert response.status_code == 400
            assert "完了していません" in response.json()["detail"]

    def test_interpolate_concat_starts_processing(self, auth_client):
        """結合動画の60fps補間はバックグラウンド処理を開始"""
        concat_id = str(uuid.uuid4())
        final_video_url = "https://example.com/concat.mp4"

        with patch("app.videos.router.get_supabase") as mock_supabase:
            mock_supabase.return_value.table.return_value.select.return_value.eq.return_value.eq.return_value.single.return_value.execute.return_value.data = {
                "id": concat_id,
                "status": "completed",
                "final_video_url": final_video_url,
            }
            mock_supabase.return_value.table.return_value.insert.return_value.execute.return_value = MagicMock()

            with patch("app.tasks.start_interpolation_processing"):
                response = auth_client.post(
                    f"/api/v1/videos/concat/{concat_id}/interpolate-60fps",
                    json={"model": "apf-2"}
                )

                assert response.status_code == 200
                data = response.json()
                assert data["status"] == "pending"
                assert data["model"] == "apf-2"
                assert data["concat_id"] == concat_id


class TestTopazServiceIntegration:
    """TopazVideoServiceの統合テスト"""

    @pytest.mark.asyncio
    async def test_topaz_service_initialization(self):
        """TopazServiceが正しく初期化される"""
        from app.services.topaz_service import get_topaz_service, TopazVideoService

        service = get_topaz_service()
        assert isinstance(service, TopazVideoService)

    @pytest.mark.asyncio
    async def test_topaz_service_headers(self):
        """Topazサービスがヘッダーを正しく生成する"""
        from app.services.topaz_service import TopazVideoService

        with patch("app.services.topaz_service.settings") as mock_settings:
            mock_settings.TOPAZ_API_KEY = "test-api-key"
            service = TopazVideoService()
            headers = service._get_headers()
            assert headers["X-API-Key"] == "test-api-key"
            assert "Content-Type" in headers


class TestInterpolationSchemas:
    """補間スキーマのテスト"""

    def test_interpolate_request_default_model(self):
        """InterpolateRequestのデフォルトモデル"""
        from app.videos.schemas import InterpolateRequest

        request = InterpolateRequest()
        assert request.model.value == "apo-8"

    def test_interpolate_request_valid_models(self):
        """InterpolateRequestの有効なモデル"""
        from app.videos.schemas import InterpolateRequest, InterpolateModel

        valid_models = ["apo-8", "apf-2", "chr-2", "chf-3"]
        for model in valid_models:
            request = InterpolateRequest(model=InterpolateModel(model))
            assert request.model.value == model

    def test_interpolate_response_fields(self):
        """InterpolateResponseのフィールド"""
        from app.videos.schemas import InterpolateResponse, InterpolateModel

        response = InterpolateResponse(
            id="test-id",
            video_id="video-id",
            status="pending",
            model=InterpolateModel.APO_8,
            original_video_url="https://example.com/video.mp4",
        )
        assert response.id == "test-id"
        assert response.video_id == "video-id"
        assert response.status == "pending"
        assert response.model == InterpolateModel.APO_8
        assert response.progress == 0


class TestCalculateTargetResolution:
    """calculate_target_resolution静的メソッドのテスト"""

    def test_basic_2x_upscale(self):
        """2倍アップスケールの基本ケース"""
        from app.services.topaz_service import TopazVideoService

        result = TopazVideoService.calculate_target_resolution(1080, 1920, 2)
        assert result == {"width": 2160, "height": 3840}

    def test_basic_4x_upscale(self):
        """4倍アップスケールの基本ケース"""
        from app.services.topaz_service import TopazVideoService

        result = TopazVideoService.calculate_target_resolution(540, 960, 4)
        assert result == {"width": 2160, "height": 3840}

    def test_h265_limit_clamping(self):
        """H265上限(8192x8192)を超える場合のクランプ"""
        from app.services.topaz_service import TopazVideoService

        # 4320x7680 * 2 = 8640x15360 -> 超過するのでクランプ
        result = TopazVideoService.calculate_target_resolution(4320, 7680, 2)
        assert result["width"] <= 8192
        assert result["height"] <= 8192

    def test_h265_limit_preserves_aspect_ratio(self):
        """H265上限クランプ時にアスペクト比を維持"""
        from app.services.topaz_service import TopazVideoService

        # 1080x1920 * 4 = 4320x7680 -> 範囲内
        result = TopazVideoService.calculate_target_resolution(1080, 1920, 4)
        assert result == {"width": 4320, "height": 7680}

    def test_even_number_rounding(self):
        """奇数の場合は偶数に丸められる"""
        from app.services.topaz_service import TopazVideoService

        # 奇数幅: 541 * 2 = 1082 (既に偶数)
        result = TopazVideoService.calculate_target_resolution(541, 960, 2)
        assert result["width"] % 2 == 0
        assert result["height"] % 2 == 0

    def test_large_resolution_with_4x_clamped(self):
        """大きな解像度の4倍はクランプされる"""
        from app.services.topaz_service import TopazVideoService

        # 3840x2160 * 4 = 15360x8640 -> 超過
        result = TopazVideoService.calculate_target_resolution(3840, 2160, 4)
        assert result["width"] <= 8192
        assert result["height"] <= 8192
        # 偶数であること
        assert result["width"] % 2 == 0
        assert result["height"] % 2 == 0

    def test_default_scale_factor(self):
        """デフォルトスケールファクターは2"""
        from app.services.topaz_service import TopazVideoService

        result = TopazVideoService.calculate_target_resolution(1080, 1920)
        assert result == {"width": 2160, "height": 3840}

    def test_square_resolution(self):
        """正方形解像度のアップスケール"""
        from app.services.topaz_service import TopazVideoService

        result = TopazVideoService.calculate_target_resolution(1080, 1080, 2)
        assert result == {"width": 2160, "height": 2160}


class TestCreateEnhancementRequest:
    """_create_enhancement_requestメソッドのテスト"""

    @pytest.mark.asyncio
    async def test_create_enhancement_request_success(self):
        """Enhancement リクエストが正しく作成される"""
        from app.services.topaz_service import TopazVideoService

        service = TopazVideoService()

        mock_response = MagicMock()
        mock_response.json.return_value = {
            "requestId": "test-req-123",
            "estimates": {
                "cost": [10, 15],
                "time": [120, 300],
            },
        }
        mock_response.raise_for_status = MagicMock()

        mock_client = AsyncMock()
        mock_client.post = AsyncMock(return_value=mock_response)

        with patch.object(service, "_get_client", return_value=mock_client):
            with patch("app.services.topaz_service.settings") as mock_settings:
                mock_settings.TOPAZ_API_KEY = "test-key"

                result = await service._create_enhancement_request(
                    video_url="https://example.com/video.mp4",
                    model="prob-4",
                    target_resolution={"width": 2160, "height": 3840},
                    video_metadata={
                        "container": "mp4",
                        "size": 50000000,
                        "duration": 10.0,
                        "frameCount": 300,
                        "frameRate": 30.0,
                        "resolution": {"width": 1080, "height": 1920},
                        "hasAudio": True,
                    },
                )

        assert result["request_id"] == "test-req-123"
        assert result["estimated_credits_min"] == 10
        assert result["estimated_credits_max"] == 15
        assert result["estimated_time_min"] == 120
        assert result["estimated_time_max"] == 300

    @pytest.mark.asyncio
    async def test_create_enhancement_request_no_audio(self):
        """音声なし動画のEnhancementリクエスト"""
        from app.services.topaz_service import TopazVideoService

        service = TopazVideoService()

        mock_response = MagicMock()
        mock_response.json.return_value = {
            "requestId": "test-req-456",
            "estimates": {
                "cost": [5, 10],
                "time": [60, 180],
            },
        }
        mock_response.raise_for_status = MagicMock()

        mock_client = AsyncMock()
        mock_client.post = AsyncMock(return_value=mock_response)

        with patch.object(service, "_get_client", return_value=mock_client):
            with patch("app.services.topaz_service.settings") as mock_settings:
                mock_settings.TOPAZ_API_KEY = "test-key"

                result = await service._create_enhancement_request(
                    video_url="https://example.com/video.mp4",
                    model="prob-4",
                    target_resolution={"width": 2160, "height": 3840},
                    video_metadata={
                        "container": "mp4",
                        "size": 30000000,
                        "duration": 5.0,
                        "frameCount": 150,
                        "frameRate": 30.0,
                        "resolution": {"width": 1080, "height": 1920},
                        "hasAudio": False,
                    },
                )

        # リクエストボディを検証
        call_args = mock_client.post.call_args
        request_body = call_args.kwargs["json"]
        assert request_body["output"]["audioTransfer"] == "None"
        assert result["request_id"] == "test-req-456"

    @pytest.mark.asyncio
    async def test_create_enhancement_request_empty_estimates(self):
        """estimatesが空の場合のデフォルト値"""
        from app.services.topaz_service import TopazVideoService

        service = TopazVideoService()

        mock_response = MagicMock()
        mock_response.json.return_value = {
            "requestId": "test-req-789",
            "estimates": {},
        }
        mock_response.raise_for_status = MagicMock()

        mock_client = AsyncMock()
        mock_client.post = AsyncMock(return_value=mock_response)

        with patch.object(service, "_get_client", return_value=mock_client):
            with patch("app.services.topaz_service.settings") as mock_settings:
                mock_settings.TOPAZ_API_KEY = "test-key"

                result = await service._create_enhancement_request(
                    video_url="https://example.com/video.mp4",
                    model="prob-4",
                    target_resolution={"width": 2160, "height": 3840},
                    video_metadata={
                        "container": "mp4",
                        "size": 50000000,
                        "duration": 10.0,
                        "frameCount": 300,
                        "frameRate": 30.0,
                        "resolution": {"width": 1080, "height": 1920},
                        "hasAudio": True,
                    },
                )

        assert result["request_id"] == "test-req-789"
        assert result["estimated_credits_min"] == 0
        assert result["estimated_credits_max"] == 0
        assert result["estimated_time_min"] == 0
        assert result["estimated_time_max"] == 0


class TestEnhanceVideo:
    """enhance_videoメソッドのテスト"""

    @pytest.mark.asyncio
    async def test_enhance_video_success(self):
        """Enhancement処理が正常に完了する"""
        from app.services.topaz_service import TopazVideoService

        service = TopazVideoService()

        video_metadata = {
            "container": "mp4",
            "size": 50000000,
            "duration": 10.0,
            "frameCount": 300,
            "frameRate": 30.0,
            "resolution": {"width": 1080, "height": 1920},
            "hasAudio": True,
        }

        request_result = {
            "request_id": "enhance-req-001",
            "estimated_credits_min": 10,
            "estimated_credits_max": 15,
            "estimated_time_min": 120,
            "estimated_time_max": 300,
        }

        with patch.object(service, "_get_video_metadata", return_value=video_metadata):
            with patch.object(service, "_create_enhancement_request", return_value=request_result):
                with patch.object(service, "_accept_request", return_value={"uploadUrls": ["https://upload.example.com"]}):
                    with patch.object(service, "_upload_video_streaming", return_value=[{"partNum": 1, "eTag": "abc"}]):
                        with patch.object(service, "_complete_upload", return_value=None):
                            with patch.object(service, "_wait_for_completion", return_value="https://download.example.com/enhanced.mp4"):
                                result = await service.enhance_video(
                                    video_url="https://example.com/video.mp4",
                                    model="prob-4",
                                    scale_factor=2,
                                )

        assert result["download_url"] == "https://download.example.com/enhanced.mp4"
        assert result["request_id"] == "enhance-req-001"
        assert result["estimated_credits_min"] == 10
        assert result["estimated_credits_max"] == 15
        assert result["estimated_time_min"] == 120
        assert result["estimated_time_max"] == 300

    @pytest.mark.asyncio
    async def test_enhance_video_calls_progress_callback(self):
        """進捗コールバックが呼ばれる"""
        from app.services.topaz_service import TopazVideoService

        service = TopazVideoService()

        video_metadata = {
            "container": "mp4",
            "size": 50000000,
            "duration": 10.0,
            "frameCount": 300,
            "frameRate": 30.0,
            "resolution": {"width": 1080, "height": 1920},
            "hasAudio": True,
        }

        request_result = {
            "request_id": "enhance-req-002",
            "estimated_credits_min": 10,
            "estimated_credits_max": 15,
            "estimated_time_min": 120,
            "estimated_time_max": 300,
        }

        progress_callback = AsyncMock()

        with patch.object(service, "_get_video_metadata", return_value=video_metadata):
            with patch.object(service, "_create_enhancement_request", return_value=request_result):
                with patch.object(service, "_accept_request", return_value={"uploadUrls": ["https://upload.example.com"]}):
                    with patch.object(service, "_upload_video_streaming", return_value=[{"partNum": 1, "eTag": "abc"}]):
                        with patch.object(service, "_complete_upload", return_value=None):
                            with patch.object(service, "_wait_for_completion", return_value="https://download.example.com/enhanced.mp4"):
                                await service.enhance_video(
                                    video_url="https://example.com/video.mp4",
                                    progress_callback=progress_callback,
                                )

        progress_callback.assert_awaited_once_with(65)

    @pytest.mark.asyncio
    async def test_enhance_video_http_400_error(self):
        """400エラーが適切にハンドリングされる"""
        from app.services.topaz_service import TopazVideoService, TopazServiceError

        service = TopazVideoService()

        video_metadata = {
            "container": "mp4",
            "size": 50000000,
            "duration": 10.0,
            "frameCount": 300,
            "frameRate": 30.0,
            "resolution": {"width": 1080, "height": 1920},
            "hasAudio": True,
        }

        mock_response = MagicMock()
        mock_response.status_code = 400
        mock_response.text = "Bad Request"

        import httpx
        http_error = httpx.HTTPStatusError(
            "400 Bad Request",
            request=MagicMock(),
            response=mock_response,
        )

        with patch.object(service, "_get_video_metadata", return_value=video_metadata):
            with patch.object(service, "_create_enhancement_request", side_effect=http_error):
                with pytest.raises(TopazServiceError, match="リクエスト形式が不正です"):
                    await service.enhance_video(
                        video_url="https://example.com/video.mp4",
                    )

    @pytest.mark.asyncio
    async def test_enhance_video_http_401_error(self):
        """401エラーが適切にハンドリングされる"""
        from app.services.topaz_service import TopazVideoService, TopazServiceError

        service = TopazVideoService()

        video_metadata = {
            "container": "mp4",
            "size": 50000000,
            "duration": 10.0,
            "frameCount": 300,
            "frameRate": 30.0,
            "resolution": {"width": 1080, "height": 1920},
            "hasAudio": True,
        }

        mock_response = MagicMock()
        mock_response.status_code = 401
        mock_response.text = "Unauthorized"

        import httpx
        http_error = httpx.HTTPStatusError(
            "401 Unauthorized",
            request=MagicMock(),
            response=mock_response,
        )

        with patch.object(service, "_get_video_metadata", return_value=video_metadata):
            with patch.object(service, "_create_enhancement_request", side_effect=http_error):
                with pytest.raises(TopazServiceError, match="APIキーが無効です"):
                    await service.enhance_video(
                        video_url="https://example.com/video.mp4",
                    )

    @pytest.mark.asyncio
    async def test_enhance_video_http_402_error(self):
        """402エラーが適切にハンドリングされる"""
        from app.services.topaz_service import TopazVideoService, TopazServiceError

        service = TopazVideoService()

        video_metadata = {
            "container": "mp4",
            "size": 50000000,
            "duration": 10.0,
            "frameCount": 300,
            "frameRate": 30.0,
            "resolution": {"width": 1080, "height": 1920},
            "hasAudio": True,
        }

        mock_response = MagicMock()
        mock_response.status_code = 402
        mock_response.text = "Payment Required"

        import httpx
        http_error = httpx.HTTPStatusError(
            "402 Payment Required",
            request=MagicMock(),
            response=mock_response,
        )

        with patch.object(service, "_get_video_metadata", return_value=video_metadata):
            with patch.object(service, "_create_enhancement_request", side_effect=http_error):
                with pytest.raises(TopazServiceError, match="クレジットが不足"):
                    await service.enhance_video(
                        video_url="https://example.com/video.mp4",
                    )

    @pytest.mark.asyncio
    async def test_enhance_video_http_403_error(self):
        """403エラーが適切にハンドリングされる"""
        from app.services.topaz_service import TopazVideoService, TopazServiceError

        service = TopazVideoService()

        video_metadata = {
            "container": "mp4",
            "size": 50000000,
            "duration": 10.0,
            "frameCount": 300,
            "frameRate": 30.0,
            "resolution": {"width": 1080, "height": 1920},
            "hasAudio": True,
        }

        mock_response = MagicMock()
        mock_response.status_code = 403
        mock_response.text = "Forbidden"

        import httpx
        http_error = httpx.HTTPStatusError(
            "403 Forbidden",
            request=MagicMock(),
            response=mock_response,
        )

        with patch.object(service, "_get_video_metadata", return_value=video_metadata):
            with patch.object(service, "_create_enhancement_request", side_effect=http_error):
                with pytest.raises(TopazServiceError, match="アクセス権限がありません"):
                    await service.enhance_video(
                        video_url="https://example.com/video.mp4",
                    )

    @pytest.mark.asyncio
    async def test_enhance_video_http_404_error(self):
        """404エラーが適切にハンドリングされる"""
        from app.services.topaz_service import TopazVideoService, TopazServiceError

        service = TopazVideoService()

        video_metadata = {
            "container": "mp4",
            "size": 50000000,
            "duration": 10.0,
            "frameCount": 300,
            "frameRate": 30.0,
            "resolution": {"width": 1080, "height": 1920},
            "hasAudio": True,
        }

        mock_response = MagicMock()
        mock_response.status_code = 404
        mock_response.text = "Not Found"

        import httpx
        http_error = httpx.HTTPStatusError(
            "404 Not Found",
            request=MagicMock(),
            response=mock_response,
        )

        with patch.object(service, "_get_video_metadata", return_value=video_metadata):
            with patch.object(service, "_create_enhancement_request", side_effect=http_error):
                with pytest.raises(TopazServiceError, match="リクエストが見つかりません"):
                    await service.enhance_video(
                        video_url="https://example.com/video.mp4",
                    )

    @pytest.mark.asyncio
    async def test_enhance_video_http_413_error(self):
        """413エラーが適切にハンドリングされる"""
        from app.services.topaz_service import TopazVideoService, TopazServiceError

        service = TopazVideoService()

        video_metadata = {
            "container": "mp4",
            "size": 50000000,
            "duration": 10.0,
            "frameCount": 300,
            "frameRate": 30.0,
            "resolution": {"width": 1080, "height": 1920},
            "hasAudio": True,
        }

        mock_response = MagicMock()
        mock_response.status_code = 413
        mock_response.text = "Payload Too Large"

        import httpx
        http_error = httpx.HTTPStatusError(
            "413 Payload Too Large",
            request=MagicMock(),
            response=mock_response,
        )

        with patch.object(service, "_get_video_metadata", return_value=video_metadata):
            with patch.object(service, "_create_enhancement_request", side_effect=http_error):
                with pytest.raises(TopazServiceError, match="500MB"):
                    await service.enhance_video(
                        video_url="https://example.com/video.mp4",
                    )

    @pytest.mark.asyncio
    async def test_enhance_video_http_429_error(self):
        """429エラーが適切にハンドリングされる"""
        from app.services.topaz_service import TopazVideoService, TopazServiceError

        service = TopazVideoService()

        video_metadata = {
            "container": "mp4",
            "size": 50000000,
            "duration": 10.0,
            "frameCount": 300,
            "frameRate": 30.0,
            "resolution": {"width": 1080, "height": 1920},
            "hasAudio": True,
        }

        mock_response = MagicMock()
        mock_response.status_code = 429
        mock_response.text = "Too Many Requests"

        import httpx
        http_error = httpx.HTTPStatusError(
            "429 Too Many Requests",
            request=MagicMock(),
            response=mock_response,
        )

        with patch.object(service, "_get_video_metadata", return_value=video_metadata):
            with patch.object(service, "_create_enhancement_request", side_effect=http_error):
                with pytest.raises(TopazServiceError, match="レート制限"):
                    await service.enhance_video(
                        video_url="https://example.com/video.mp4",
                    )

    @pytest.mark.asyncio
    async def test_enhance_video_http_503_error(self):
        """503エラーが適切にハンドリングされる"""
        from app.services.topaz_service import TopazVideoService, TopazServiceError

        service = TopazVideoService()

        video_metadata = {
            "container": "mp4",
            "size": 50000000,
            "duration": 10.0,
            "frameCount": 300,
            "frameRate": 30.0,
            "resolution": {"width": 1080, "height": 1920},
            "hasAudio": True,
        }

        mock_response = MagicMock()
        mock_response.status_code = 503
        mock_response.text = "Service Unavailable"

        import httpx
        http_error = httpx.HTTPStatusError(
            "503 Service Unavailable",
            request=MagicMock(),
            response=mock_response,
        )

        with patch.object(service, "_get_video_metadata", return_value=video_metadata):
            with patch.object(service, "_create_enhancement_request", side_effect=http_error):
                with pytest.raises(TopazServiceError, match="メンテナンス中"):
                    await service.enhance_video(
                        video_url="https://example.com/video.mp4",
                    )

    @pytest.mark.asyncio
    async def test_enhance_video_generic_exception(self):
        """一般的な例外が適切にハンドリングされる"""
        from app.services.topaz_service import TopazVideoService, TopazServiceError

        service = TopazVideoService()

        with patch.object(service, "_get_video_metadata", side_effect=RuntimeError("Network error")):
            with pytest.raises(TopazServiceError, match="アップスケールに失敗しました"):
                await service.enhance_video(
                    video_url="https://example.com/video.mp4",
                )


class TestEstimateEnhancementCost:
    """estimate_enhancement_costメソッドのテスト"""

    @pytest.mark.asyncio
    async def test_estimate_enhancement_cost_success(self):
        """Enhancement見積もりが正常に完了する"""
        from app.services.topaz_service import TopazVideoService

        service = TopazVideoService()

        video_metadata = {
            "container": "mp4",
            "size": 50000000,
            "duration": 10.0,
            "frameCount": 300,
            "frameRate": 30.0,
            "resolution": {"width": 1080, "height": 1920},
            "hasAudio": True,
        }

        request_result = {
            "request_id": "estimate-req-001",
            "estimated_credits_min": 10,
            "estimated_credits_max": 15,
            "estimated_time_min": 120,
            "estimated_time_max": 300,
        }

        with patch.object(service, "_get_video_metadata", return_value=video_metadata):
            with patch.object(service, "_create_enhancement_request", return_value=request_result):
                with patch.object(service, "cancel_task", return_value=True) as mock_cancel:
                    result = await service.estimate_enhancement_cost(
                        video_url="https://example.com/video.mp4",
                        model="prob-4",
                        scale_factor=2,
                    )

        assert result["request_id"] == "estimate-req-001"
        assert result["estimated_credits_min"] == 10
        assert result["estimated_credits_max"] == 15
        assert result["estimated_time_min"] == 120
        assert result["estimated_time_max"] == 300
        assert result["target_width"] == 2160
        assert result["target_height"] == 3840
        # キャンセルが呼ばれたことを確認
        mock_cancel.assert_awaited_once_with("estimate-req-001")

    @pytest.mark.asyncio
    async def test_estimate_enhancement_cost_with_4x_scale(self):
        """4倍スケールの見積もり"""
        from app.services.topaz_service import TopazVideoService

        service = TopazVideoService()

        video_metadata = {
            "container": "mp4",
            "size": 50000000,
            "duration": 10.0,
            "frameCount": 300,
            "frameRate": 30.0,
            "resolution": {"width": 1080, "height": 1920},
            "hasAudio": True,
        }

        request_result = {
            "request_id": "estimate-req-002",
            "estimated_credits_min": 20,
            "estimated_credits_max": 30,
            "estimated_time_min": 240,
            "estimated_time_max": 600,
        }

        with patch.object(service, "_get_video_metadata", return_value=video_metadata):
            with patch.object(service, "_create_enhancement_request", return_value=request_result):
                with patch.object(service, "cancel_task", return_value=True):
                    result = await service.estimate_enhancement_cost(
                        video_url="https://example.com/video.mp4",
                        model="prob-4",
                        scale_factor=4,
                    )

        assert result["target_width"] == 4320
        assert result["target_height"] == 7680


class TestBackwardCompatibility:
    """後方互換性のテスト"""

    def test_topaz_interpolation_service_alias_exists(self):
        """TopazInterpolationServiceエイリアスが存在する"""
        from app.services.topaz_service import TopazInterpolationService, TopazVideoService

        assert TopazInterpolationService is TopazVideoService

    def test_can_instantiate_via_alias(self):
        """エイリアス経由でインスタンス化できる"""
        from app.services.topaz_service import TopazInterpolationService

        service = TopazInterpolationService()
        assert service is not None
