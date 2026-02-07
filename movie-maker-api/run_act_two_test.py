#!/usr/bin/env python3
"""
Act-Two Story Processor Direct Test
"""
import asyncio
import sys
sys.path.insert(0, '/Users/noritakasawada/AI_P/practice/movie-project/movie-maker-api')

from dotenv import load_dotenv
load_dotenv()

from app.tasks.story_processor import process_story_video

VIDEO_ID = "8280dccd-0d5f-403f-91ee-5578aa1cd1e1"

async def main():
    print(f"Starting Act-Two test for video: {VIDEO_ID}")
    print("=" * 60)

    try:
        await process_story_video(VIDEO_ID, "runway")
        print("\n" + "=" * 60)
        print("✓ Test completed successfully!")
    except Exception as e:
        print(f"\n✗ Test failed: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(main())
