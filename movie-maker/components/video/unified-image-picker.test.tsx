import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { UnifiedImagePicker } from "./unified-image-picker";
import { libraryApi, screenshotsApi, videosApi } from "@/lib/api/client";

// Mock the API clients
vi.mock("@/lib/api/client", () => ({
  libraryApi: {
    list: vi.fn(),
  },
  screenshotsApi: {
    list: vi.fn(),
  },
  videosApi: {
    uploadImage: vi.fn(),
  },
}));

// Mock Next.js Image component
vi.mock("next/image", () => ({
  __esModule: true,
  default: (props: React.ImgHTMLAttributes<HTMLImageElement>) => {
    // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
    return <img {...props} />;
  },
}));

describe("UnifiedImagePicker", () => {
  const mockOnSelect = vi.fn();
  const mockLibraryImages = {
    images: [
      {
        id: "lib-1",
        name: "Test Library Image",
        image_url: "https://example.com/library-1.jpg",
        thumbnail_url: "https://example.com/library-1-thumb.jpg",
        category: "general" as const,
        source: "uploaded" as const,
        user_id: "user-1",
        description: null,
        r2_key: "test-key",
        width: 1080,
        height: 1920,
        aspect_ratio: "9:16",
        file_size_bytes: 1024,
        image_provider: null,
        generated_prompt_ja: null,
        generated_prompt_en: null,
        created_at: "2024-01-01",
        updated_at: "2024-01-01",
      },
    ],
    total: 1,
    page: 1,
    per_page: 20,
    has_next: false,
  };

  const mockScreenshots = {
    screenshots: [
      {
        id: "ss-1",
        image_url: "https://example.com/screenshot-1.jpg",
        title: "Screenshot 1",
        timestamp_seconds: 5.5,
        source_type: "storyboard_scene" as const,
        source_id: "scene-1",
        source_video_url: "https://example.com/video-1.mp4",
        user_id: "user-1",
        width: 1080,
        height: 1920,
        created_at: "2024-01-01T00:00:00Z",
      },
    ],
    total: 1,
    page: 1,
    per_page: 20,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(libraryApi.list).mockResolvedValue(mockLibraryImages);
    vi.mocked(screenshotsApi.list).mockResolvedValue(mockScreenshots);
  });

  describe("Rendering", () => {
    it("should render with all three tabs", () => {
      render(<UnifiedImagePicker onSelect={mockOnSelect} />);

      expect(screen.getByText("アップロード")).toBeDefined();
      expect(screen.getByText("ライブラリ")).toBeDefined();
      expect(screen.getByText("スクリーンショット")).toBeDefined();
    });

    it("should show upload area in upload tab by default", () => {
      const { container } = render(<UnifiedImagePicker onSelect={mockOnSelect} />);

      const fileInput = container.querySelector('input[type="file"]');
      expect(fileInput).toBeDefined();
    });
  });

  describe("Upload Tab", () => {
    it("should handle file upload successfully", async () => {
      const mockUploadResponse = {
        image_url: "https://example.com/uploaded.jpg",
      };
      vi.mocked(videosApi.uploadImage).mockResolvedValue(mockUploadResponse);

      const { container } = render(<UnifiedImagePicker onSelect={mockOnSelect} />);

      const file = new File(["dummy"], "test.jpg", { type: "image/jpeg" });
      const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;

      Object.defineProperty(fileInput, "files", {
        value: [file],
        writable: false,
      });

      fireEvent.change(fileInput);

      await waitFor(() => {
        expect(videosApi.uploadImage).toHaveBeenCalledWith(file);
      });

      await waitFor(() => {
        expect(mockOnSelect).toHaveBeenCalledWith(
          mockUploadResponse.image_url,
          {
            source: "upload",
            name: "test.jpg",
          }
        );
      });
    });

    it("should reject files larger than 10MB", async () => {
      const alertMock = vi.spyOn(window, "alert").mockImplementation(() => {});

      const { container } = render(<UnifiedImagePicker onSelect={mockOnSelect} />);

      const largeFile = new File(["x".repeat(11 * 1024 * 1024)], "large.jpg", {
        type: "image/jpeg",
      });

      const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;

      Object.defineProperty(fileInput, "files", {
        value: [largeFile],
        writable: false,
      });

      fireEvent.change(fileInput);

      await waitFor(() => {
        expect(alertMock).toHaveBeenCalledWith(
          "ファイルサイズが10MBを超えています"
        );
      });

      expect(videosApi.uploadImage).not.toHaveBeenCalled();
      alertMock.mockRestore();
    });
  });

  describe("Library Tab", () => {
    it("should load library images when tab is clicked", async () => {
      render(<UnifiedImagePicker onSelect={mockOnSelect} />);

      const libraryTab = screen.getByText("ライブラリ");
      fireEvent.click(libraryTab);

      await waitFor(() => {
        expect(libraryApi.list).toHaveBeenCalledWith({ page: 1, per_page: 20 });
      });

      await waitFor(() => {
        expect(screen.getByText("Test Library Image")).toBeDefined();
      });
    });

    it("should handle image selection from library", async () => {
      render(<UnifiedImagePicker onSelect={mockOnSelect} />);

      const libraryTab = screen.getByText("ライブラリ");
      fireEvent.click(libraryTab);

      await waitFor(() => {
        expect(screen.getByText("Test Library Image")).toBeDefined();
      });

      const imageCard = screen.getByText("Test Library Image").closest("div") as HTMLElement;
      fireEvent.click(imageCard);

      expect(mockOnSelect).toHaveBeenCalledWith(
        "https://example.com/library-1.jpg",
        {
          source: "library",
          id: "lib-1",
          name: "Test Library Image",
        }
      );
    });
  });

  describe("Screenshot Tab", () => {
    it("should load screenshots when tab is clicked", async () => {
      render(<UnifiedImagePicker onSelect={mockOnSelect} />);

      const screenshotTab = screen.getByText("スクリーンショット");
      fireEvent.click(screenshotTab);

      await waitFor(() => {
        expect(screenshotsApi.list).toHaveBeenCalledWith(1, 20);
      });

      await waitFor(() => {
        expect(screen.getByText("Screenshot 1")).toBeDefined();
      });
    });

    it("should handle screenshot selection", async () => {
      render(<UnifiedImagePicker onSelect={mockOnSelect} />);

      const screenshotTab = screen.getByText("スクリーンショット");
      fireEvent.click(screenshotTab);

      await waitFor(() => {
        expect(screen.getByText("Screenshot 1")).toBeDefined();
      });

      const screenshotCard = screen.getByText("Screenshot 1").closest("div") as HTMLElement;
      fireEvent.click(screenshotCard);

      expect(mockOnSelect).toHaveBeenCalledWith(
        "https://example.com/screenshot-1.jpg",
        {
          source: "screenshot",
          id: "ss-1",
          name: "Screenshot 1",
        }
      );
    });
  });

  describe("Error Handling", () => {
    it("should handle library API errors gracefully", async () => {
      vi.mocked(libraryApi.list).mockRejectedValue(new Error("API Error"));
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      render(<UnifiedImagePicker onSelect={mockOnSelect} />);

      const libraryTab = screen.getByText("ライブラリ");
      fireEvent.click(libraryTab);

      await waitFor(() => {
        expect(consoleSpy).toHaveBeenCalledWith(
          "Failed to load library images:",
          expect.any(Error)
        );
      });

      consoleSpy.mockRestore();
    });

    it("should handle upload errors gracefully", async () => {
      vi.mocked(videosApi.uploadImage).mockRejectedValue(
        new Error("Upload failed")
      );
      const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => {});

      const { container } = render(<UnifiedImagePicker onSelect={mockOnSelect} />);

      const file = new File(["dummy"], "test.jpg", { type: "image/jpeg" });
      const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;

      Object.defineProperty(fileInput, "files", {
        value: [file],
        writable: false,
      });

      fireEvent.change(fileInput);

      await waitFor(() => {
        expect(alertSpy).toHaveBeenCalledWith(
          expect.stringContaining("画像のアップロードに失敗しました")
        );
      });

      alertSpy.mockRestore();
    });
  });
});
