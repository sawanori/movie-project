'use client';

import { useCallback, useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Handle, Position, NodeProps } from '@xyflow/react';
import { Video, Upload, Link, X, Loader2, History as HistoryIcon, Play, AlertTriangle } from 'lucide-react';
import { useDropzone } from 'react-dropzone';
import {
  BaseNode,
  inputHandleClassName,
  outputHandleClassName,
  nodeInputClassName,
  nodeButtonClassName,
} from './BaseNode';
import { cn } from '@/lib/utils';
import type { VideoInputNodeData } from '@/lib/types/node-editor';
import { HANDLE_IDS } from '@/lib/types/node-editor';
import { userVideosApi, type UserVideo } from '@/lib/api/client';

// ===== Constants =====

type VideoInputMode = 'upload' | 'history' | 'url';

const ERROR_MESSAGES = {
  INVALID_FORMAT: 'Unsupported format (MP4/WebM/MOV only)',
  FILE_TOO_LARGE: 'File size too large (50MB max)',
  DURATION_TOO_LONG: 'Video too long (10 seconds max)',
  UPLOAD_FAILED: 'Upload failed. Please try again.',
  NETWORK_ERROR: 'Network error occurred',
  CORS_RESTRICTED: 'Unable to generate thumbnail due to security restrictions',
} as const;

const ACCEPTED_VIDEO_TYPES = {
  'video/mp4': ['.mp4'],
  'video/webm': ['.webm'],
  'video/quicktime': ['.mov'],
};

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
const MAX_DURATION = 10; // 10 seconds

// ===== Types =====

type UploadState =
  | { status: 'idle' }
  | { status: 'uploading'; progress: number }
  | { status: 'success'; videoUrl: string; thumbnailUrl: string; duration: number }
  | { status: 'error'; errorType: keyof typeof ERROR_MESSAGES };

interface VideoInputNodeProps extends NodeProps {
  data: VideoInputNodeData;
  selected: boolean;
}

// ===== Helper Functions =====

/**
 * Capture a video frame as thumbnail with CORS handling
 */
const captureVideoFrame = async (videoUrl: string, timeInSeconds: number = 0): Promise<string> => {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.crossOrigin = 'anonymous';
    video.src = videoUrl;
    video.preload = 'metadata';

    video.onloadedmetadata = () => {
      video.currentTime = Math.min(timeInSeconds, video.duration * 0.1);
    };

    video.onseeked = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Failed to get canvas context'));
          return;
        }
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
        resolve(dataUrl);
      } catch (error) {
        if (error instanceof DOMException && error.name === 'SecurityError') {
          reject(new Error('CORS_RESTRICTED'));
        } else {
          reject(error);
        }
      }
    };

    video.onerror = () => {
      reject(new Error('Failed to load video'));
    };

    // Timeout after 10 seconds
    setTimeout(() => {
      reject(new Error('Timeout while loading video'));
    }, 10000);
  });
};

/**
 * Get video duration
 */
const getVideoDuration = (videoUrl: string): Promise<number> => {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.src = videoUrl;
    video.preload = 'metadata';

    video.onloadedmetadata = () => {
      resolve(video.duration);
    };

    video.onerror = () => {
      reject(new Error('Failed to load video metadata'));
    };

    setTimeout(() => {
      reject(new Error('Timeout'));
    }, 10000);
  });
};

// ===== Component =====

export function VideoInputNode({ data, selected, id }: VideoInputNodeProps) {
  const [mode, setMode] = useState<VideoInputMode>('upload');
  const [urlInput, setUrlInput] = useState('');
  const [uploadState, setUploadState] = useState<UploadState>({ status: 'idle' });
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [isHovering, setIsHovering] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  // History modal state
  const [historyVideos, setHistoryVideos] = useState<UserVideo[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [historyPage, setHistoryPage] = useState(1);
  const [totalVideos, setTotalVideos] = useState(0);

  const PER_PAGE = 20;

  const updateNodeData = useCallback(
    (updates: Partial<VideoInputNodeData>) => {
      const event = new CustomEvent('nodeDataUpdate', {
        detail: { nodeId: id, updates },
      });
      window.dispatchEvent(event);
    },
    [id]
  );

  // Load history videos
  const loadHistoryVideos = useCallback(async (page = 1) => {
    setHistoryLoading(true);
    setHistoryError(null);

    try {
      const response = await userVideosApi.list(page, PER_PAGE);

      if (page === 1) {
        setHistoryVideos(response.videos || []);
      } else {
        setHistoryVideos(prev => [...prev, ...(response.videos || [])]);
      }

      setHistoryPage(page);
      setTotalVideos(response.total);
    } catch (error) {
      console.error('Failed to load video history:', error);

      if (error instanceof Error && error.message.includes('401')) {
        setHistoryError('Login required');
      } else {
        setHistoryError('Failed to load videos');
      }
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  // Pagination check
  const hasMoreVideos = useMemo(() => {
    return historyVideos.length < totalVideos;
  }, [historyVideos.length, totalVideos]);

  // Handle history video selection
  const handleSelectHistoryVideo = useCallback(async (video: UserVideo) => {
    try {
      updateNodeData({
        videoUrl: video.video_url,
        videoThumbnail: video.thumbnail_url || video.thumbnail_webp_url || null,
        videoDuration: video.duration_seconds,
        sourceType: 'history',
        fileSize: video.file_size_bytes,
        mimeType: video.mime_type,
        isValid: true,
        errorMessage: undefined,
      });
    } catch (error) {
      console.error('Failed to select video:', error);
    }
    setShowHistoryModal(false);
  }, [updateNodeData]);

  // Load videos when modal opens
  useEffect(() => {
    if (showHistoryModal && historyVideos.length === 0 && !historyError) {
      loadHistoryVideos(1);
    }
  }, [showHistoryModal, historyVideos.length, historyError, loadHistoryVideos]);

  // Handle file upload
  const handleUpload = useCallback(
    async (file: File) => {
      // Validate file size
      if (file.size > MAX_FILE_SIZE) {
        setUploadState({ status: 'error', errorType: 'FILE_TOO_LARGE' });
        updateNodeData({
          isValid: false,
          errorMessage: ERROR_MESSAGES.FILE_TOO_LARGE,
        });
        return;
      }

      // Validate file type
      const validTypes = Object.keys(ACCEPTED_VIDEO_TYPES);
      if (!validTypes.includes(file.type)) {
        setUploadState({ status: 'error', errorType: 'INVALID_FORMAT' });
        updateNodeData({
          isValid: false,
          errorMessage: ERROR_MESSAGES.INVALID_FORMAT,
        });
        return;
      }

      setUploadState({ status: 'uploading', progress: 0 });

      try {
        // Upload file
        const result = await userVideosApi.upload(file);

        // Validate duration
        if (result.duration_seconds > MAX_DURATION) {
          setUploadState({ status: 'error', errorType: 'DURATION_TOO_LONG' });
          updateNodeData({
            isValid: false,
            errorMessage: ERROR_MESSAGES.DURATION_TOO_LONG,
          });
          return;
        }

        setUploadState({
          status: 'success',
          videoUrl: result.video_url,
          thumbnailUrl: result.thumbnail_url || '',
          duration: result.duration_seconds,
        });

        updateNodeData({
          videoUrl: result.video_url,
          videoThumbnail: result.thumbnail_url || result.thumbnail_webp_url || null,
          videoDuration: result.duration_seconds,
          sourceType: 'upload',
          fileSize: result.file_size_bytes,
          mimeType: result.mime_type,
          isValid: true,
          errorMessage: undefined,
        });
      } catch (error) {
        console.error('Upload failed:', error);
        setUploadState({ status: 'error', errorType: 'UPLOAD_FAILED' });
        updateNodeData({
          isValid: false,
          errorMessage: error instanceof Error ? error.message : ERROR_MESSAGES.UPLOAD_FAILED,
        });
      }
    },
    [updateNodeData]
  );

  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      const file = acceptedFiles[0];
      if (file) {
        handleUpload(file);
      }
    },
    [handleUpload]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: ACCEPTED_VIDEO_TYPES,
    maxFiles: 1,
    disabled: uploadState.status === 'uploading',
  });

  // Handle URL submission
  const handleUrlSubmit = useCallback(async () => {
    const url = urlInput.trim();
    if (!url) return;

    try {
      setUploadState({ status: 'uploading', progress: 0 });

      // Try to get duration and thumbnail
      let duration: number | null = null;
      let thumbnailUrl: string | null = null;

      try {
        duration = await getVideoDuration(url);
      } catch {
        // Duration fetch failed, continue without it
      }

      try {
        thumbnailUrl = await captureVideoFrame(url, 0);
      } catch (error) {
        // Thumbnail capture failed (likely CORS), continue without it
        if (error instanceof Error && error.message === 'CORS_RESTRICTED') {
          console.warn('CORS restriction prevented thumbnail capture');
        }
      }

      setUploadState({ status: 'idle' });

      updateNodeData({
        videoUrl: url,
        videoThumbnail: thumbnailUrl,
        videoDuration: duration,
        sourceType: 'url',
        isValid: true,
        errorMessage: undefined,
      });
    } catch (error) {
      console.error('URL processing failed:', error);
      setUploadState({ status: 'error', errorType: 'NETWORK_ERROR' });
      updateNodeData({
        isValid: false,
        errorMessage: ERROR_MESSAGES.NETWORK_ERROR,
      });
    }
  }, [urlInput, updateNodeData]);

  // Clear video
  const handleClear = useCallback(() => {
    setUrlInput('');
    setUploadState({ status: 'idle' });
    updateNodeData({
      videoUrl: null,
      videoThumbnail: null,
      videoDuration: null,
      sourceType: 'upload',
      fileSize: undefined,
      mimeType: undefined,
      isValid: false,
      errorMessage: undefined,
    });
  }, [updateNodeData]);

  // Format duration
  const formatDuration = (seconds: number): string => {
    return `${seconds.toFixed(1)}s`;
  };

  // Handle video hover for preview
  const handleMouseEnter = useCallback(() => {
    setIsHovering(true);
    if (videoRef.current) {
      videoRef.current.play().catch(() => {
        // Autoplay may be blocked
      });
    }
  }, []);

  const handleMouseLeave = useCallback(() => {
    setIsHovering(false);
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.currentTime = 0;
    }
  }, []);

  const isUploading = uploadState.status === 'uploading';

  return (
    <BaseNode
      title="V2V"
      icon={<Video className="w-4 h-4" />}
      isSelected={selected}
      isValid={data.isValid}
      errorMessage={data.errorMessage}
    >
      {/* Runway-only notice */}
      <div className="flex items-center gap-1 mb-2 px-2 py-1 bg-amber-500/10 rounded text-xs text-amber-400">
        <AlertTriangle className="w-3 h-3" />
        <span>V2VはRunwayのみ対応</span>
      </div>

      {/* Mode tabs */}
      <div className="flex gap-1 mb-3">
        <button
          onClick={() => setMode('upload')}
          className={cn(
            'flex-1 px-2 py-1 text-xs rounded transition-colors',
            mode === 'upload'
              ? 'bg-[#fce300] text-black'
              : 'bg-[#404040] text-white hover:bg-[#505050]'
          )}
        >
          <Upload className="w-3 h-3 inline mr-1" />
          Upload
        </button>
        <button
          onClick={() => setMode('history')}
          className={cn(
            'flex-1 px-2 py-1 text-xs rounded transition-colors',
            mode === 'history'
              ? 'bg-[#fce300] text-black'
              : 'bg-[#404040] text-white hover:bg-[#505050]'
          )}
        >
          <HistoryIcon className="w-3 h-3 inline mr-1" />
          History
        </button>
        <button
          onClick={() => setMode('url')}
          className={cn(
            'flex-1 px-2 py-1 text-xs rounded transition-colors',
            mode === 'url'
              ? 'bg-[#fce300] text-black'
              : 'bg-[#404040] text-white hover:bg-[#505050]'
          )}
        >
          <Link className="w-3 h-3 inline mr-1" />
          URL
        </button>
      </div>

      {/* Preview */}
      {data.videoUrl && data.videoThumbnail ? (
        <div
          className="relative mb-3"
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          {isHovering ? (
            <video
              ref={videoRef}
              src={data.videoUrl}
              className="w-full h-32 object-cover rounded-lg"
              muted
              loop
              playsInline
            />
          ) : (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src={data.videoThumbnail}
              alt="Video Preview"
              className="w-full h-32 object-cover rounded-lg"
            />
          )}
          <button
            onClick={handleClear}
            className="absolute top-1 right-1 p-1 bg-black/50 rounded-full hover:bg-black/70 transition-colors"
          >
            <X className="w-3 h-3 text-white" />
          </button>
          {!isHovering && (
            <div className="absolute bottom-1 left-1 flex items-center gap-1 px-1.5 py-0.5 bg-black/60 rounded text-xs text-white">
              <Play className="w-3 h-3" />
              <span>Hover to play</span>
            </div>
          )}
        </div>
      ) : data.videoUrl ? (
        // Video URL exists but no thumbnail
        <div className="relative mb-3">
          <video
            src={data.videoUrl}
            className="w-full h-32 object-cover rounded-lg bg-zinc-800"
            muted
            playsInline
            poster=""
          />
          <button
            onClick={handleClear}
            className="absolute top-1 right-1 p-1 bg-black/50 rounded-full hover:bg-black/70 transition-colors"
          >
            <X className="w-3 h-3 text-white" />
          </button>
        </div>
      ) : mode === 'upload' ? (
        <div
          {...getRootProps()}
          className={cn(
            'border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors mb-3',
            isDragActive
              ? 'border-[#fce300] bg-[#fce300]/10'
              : 'border-[#404040] hover:border-[#606060]',
            isUploading && 'pointer-events-none opacity-50'
          )}
        >
          {(() => {
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const { value, ...inputProps } = getInputProps() as { value?: string; [key: string]: unknown };
            return <input {...inputProps} />;
          })()}
          {isUploading ? (
            <Loader2 className="w-6 h-6 mx-auto text-[#fce300] animate-spin" />
          ) : (
            <>
              <Video className="w-6 h-6 mx-auto text-gray-500 mb-2" />
              <p className="text-xs text-gray-500">
                {isDragActive ? 'Drop video here' : 'Drop video or click'}
              </p>
              <p className="text-xs text-gray-600 mt-1">
                MP4/WebM/MOV (50MB max, 10s max)
              </p>
            </>
          )}
        </div>
      ) : mode === 'history' ? (
        <button
          onClick={() => setShowHistoryModal(true)}
          className="w-full mb-3 px-2 py-3 text-xs rounded bg-[#404040] text-white hover:bg-[#505050] transition-colors flex items-center justify-center gap-2"
        >
          <HistoryIcon className="w-4 h-4" />
          Select from history
        </button>
      ) : (
        <div className="space-y-2 mb-3">
          <input
            type="text"
            placeholder="Enter video URL"
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            className={nodeInputClassName}
          />
          <button
            onClick={handleUrlSubmit}
            disabled={isUploading || !urlInput.trim()}
            className={cn(nodeButtonClassName, 'disabled:opacity-50 disabled:cursor-not-allowed')}
          >
            {isUploading ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Apply'}
          </button>
        </div>
      )}

      {/* Video info */}
      {data.videoUrl && (
        <div className="text-xs text-gray-400 mb-3">
          {data.videoDuration && (
            <span>Duration: {formatDuration(data.videoDuration)}</span>
          )}
          {data.mimeType && (
            <span className="ml-2">| {data.mimeType.split('/')[1].toUpperCase()}</span>
          )}
        </div>
      )}

      {/* Input handle - 動画入力（GenerateNode出力 or 他のVideoInputNode出力から受け取る） */}
      <Handle
        type="target"
        position={Position.Left}
        id={HANDLE_IDS.SOURCE_VIDEO_INPUT}
        className={inputHandleClassName}
      />

      {/* Output handle */}
      <Handle
        type="source"
        position={Position.Right}
        id={HANDLE_IDS.SOURCE_VIDEO_OUTPUT}
        className={outputHandleClassName}
      />

      {/* History Modal (Portal to body) */}
      {showHistoryModal && typeof document !== 'undefined' && createPortal(
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60"
          onClick={() => setShowHistoryModal(false)}
        >
          <div
            className="bg-zinc-900 rounded-xl border border-zinc-700 p-6 w-full max-w-4xl mx-4 max-h-[85vh] overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-semibold text-white">Select from history</h3>
              <button
                onClick={() => setShowHistoryModal(false)}
                className="p-1 text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            {/* Error display */}
            {historyError && (
              <div className="text-center py-6">
                <p className="text-sm text-red-400 mb-3">{historyError}</p>
                <button
                  onClick={() => loadHistoryVideos(1)}
                  className="text-sm text-[#fce300] hover:underline"
                >
                  Retry
                </button>
              </div>
            )}

            {/* Loading (initial) */}
            {historyLoading && historyVideos.length === 0 && !historyError && (
              <div className="flex justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-[#fce300]" />
              </div>
            )}

            {/* Content */}
            {!historyError && historyVideos.length > 0 && (
              <div className="flex-1 overflow-y-auto">
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3">
                  {historyVideos.map((video) => (
                    <button
                      key={video.id}
                      onClick={() => handleSelectHistoryVideo(video)}
                      className="relative aspect-video rounded-lg overflow-hidden hover:ring-2 hover:ring-[#fce300] transition-all bg-zinc-800 group"
                    >
                      {video.thumbnail_url || video.thumbnail_webp_url ? (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img
                          src={video.thumbnail_webp_url || video.thumbnail_url || ''}
                          alt={video.title || 'Video thumbnail'}
                          className="w-full h-full object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Video className="w-8 h-8 text-zinc-600" />
                        </div>
                      )}
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                        <Play className="w-8 h-8 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>
                      <div className="absolute bottom-1 right-1 px-1.5 py-0.5 bg-black/70 rounded text-xs text-white">
                        {formatDuration(video.duration_seconds)}
                      </div>
                    </button>
                  ))}
                </div>

                {/* Load more */}
                {hasMoreVideos && (
                  <button
                    onClick={() => loadHistoryVideos(historyPage + 1)}
                    disabled={historyLoading}
                    className="w-full py-3 mt-4 text-sm bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white rounded-lg disabled:opacity-50 transition-colors"
                  >
                    {historyLoading ? (
                      <Loader2 className="w-5 h-5 animate-spin mx-auto" />
                    ) : (
                      'Load more'
                    )}
                  </button>
                )}
              </div>
            )}

            {/* Empty state */}
            {!historyLoading && !historyError && historyVideos.length === 0 && (
              <div className="text-center py-12">
                <Video className="w-12 h-12 mx-auto text-zinc-600 mb-3" />
                <p className="text-sm text-zinc-500">No videos in history</p>
              </div>
            )}
          </div>
        </div>,
        document.body
      )}
    </BaseNode>
  );
}
