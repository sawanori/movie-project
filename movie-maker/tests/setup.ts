import '@testing-library/dom'
import { afterEach, vi } from 'vitest'
import { cleanup } from '@testing-library/react'

// React Testing Library のクリーンアップ
afterEach(() => {
  cleanup()
})

// グローバルfetchのモック
global.fetch = vi.fn()

// 環境変数のモック
vi.stubEnv('NEXT_PUBLIC_API_URL', 'http://localhost:8000')
vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://test.supabase.co')
vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'test-anon-key')
