import useSWR from 'swr';
import { videosApi, storyboardApi, authApi, motionsApi, userVideosApi, adCreatorProjectsApi, libraryApi, Storyboard, Motion, UserVideo, AdCreatorProject, LibraryImage } from '@/lib/api/client';

// VideoItem type (matches dashboard/components/video-cards.tsx)
export interface VideoItem {
  id: string;
  status: string;
  user_prompt: string;
  original_image_url: string;
  final_video_url: string | null;
  created_at: string;
}

// Usage type
export interface Usage {
  plan_type: string;
  videos_used: number;
  videos_limit: number;
  videos_remaining: number;
}

// Fetcher functions
const fetchVideos = (): Promise<VideoItem[]> => videosApi.list(1, 10).then(res => res.videos || []);
const fetchStoryboards = (): Promise<Storyboard[]> => storyboardApi.list(1, 10).then(res => res.storyboards || []);
const fetchUsage = (): Promise<Usage> => authApi.getUsage();
const fetchMotions = (): Promise<Motion[]> => motionsApi.list().catch(() => []);
const fetchUserVideos = (): Promise<UserVideo[]> => userVideosApi.list(1, 20).then(res => res.videos || []).catch(() => []);
const fetchAdProjects = (): Promise<AdCreatorProject[]> => adCreatorProjectsApi.list(1, 20).then(res => res.projects || []).catch(() => []);
const fetchLibraryImages = (): Promise<LibraryImage[]> => libraryApi.list({ page: 1, per_page: 20 }).then(res => res.images || []).catch(() => []);

// Custom hooks with SWR
export function useVideos(enabled = true) {
  return useSWR<VideoItem[]>(enabled ? 'dashboard-videos' : null, fetchVideos, {
    revalidateOnFocus: false,
    dedupingInterval: 30000, // 30 seconds deduplication
  });
}

export function useStoryboards(enabled = true) {
  return useSWR<Storyboard[]>(enabled ? 'dashboard-storyboards' : null, fetchStoryboards, {
    revalidateOnFocus: false,
    dedupingInterval: 30000,
  });
}

export function useUsage(enabled = true) {
  return useSWR<Usage>(enabled ? 'dashboard-usage' : null, fetchUsage, {
    revalidateOnFocus: false,
    dedupingInterval: 60000, // 1 minute cache
  });
}

export function useMotions(enabled = true) {
  return useSWR<Motion[]>(enabled ? 'dashboard-motions' : null, fetchMotions, {
    revalidateOnFocus: false,
    dedupingInterval: 30000,
  });
}

export function useUserVideos(enabled = true) {
  return useSWR<UserVideo[]>(enabled ? 'dashboard-user-videos' : null, fetchUserVideos, {
    revalidateOnFocus: false,
    dedupingInterval: 30000,
  });
}

export function useAdProjects(enabled = true) {
  return useSWR<AdCreatorProject[]>(enabled ? 'dashboard-ad-projects' : null, fetchAdProjects, {
    revalidateOnFocus: false,
    dedupingInterval: 30000,
  });
}

export function useLibraryImages(enabled = true) {
  return useSWR<LibraryImage[]>(enabled ? 'dashboard-library-images' : null, fetchLibraryImages, {
    revalidateOnFocus: false,
    dedupingInterval: 30000,
  });
}
