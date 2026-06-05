import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { VoiceSelector } from './voice-selector'
import type { VoiceInfo } from '@/lib/api/client'

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
    },
  }),
}))

vi.mock('@/lib/api/client', () => ({
  ttsApi: {
    listVoices: vi.fn(),
  },
}))

const mockVoices: VoiceInfo[] = [
  { voice_id: 'v1', name: 'Hikari', language: 'ja' },
  { voice_id: 'v2', name: 'Emma', language: 'en' },
  { voice_id: 'v3', name: 'Sora', language: 'ja' },
]

describe('VoiceSelector', () => {
  it('renders the list of voices', () => {
    render(
      <VoiceSelector
        voices={mockVoices}
        selectedVoiceId="v1"
        onSelect={vi.fn()}
      />
    )

    expect(screen.getByText('Hikari')).toBeDefined()
    expect(screen.getByText('Emma')).toBeDefined()
    expect(screen.getByText('Sora')).toBeDefined()
  })

  it('highlights the selected voice', () => {
    render(
      <VoiceSelector
        voices={mockVoices}
        selectedVoiceId="v2"
        onSelect={vi.fn()}
      />
    )

    const emmaButton = screen.getByText('Emma').closest('button')
    expect(emmaButton?.getAttribute('aria-pressed')).toBe('true')

    const hikariButton = screen.getByText('Hikari').closest('button')
    expect(hikariButton?.getAttribute('aria-pressed')).toBe('false')
  })

  it('calls onSelect with the voice id when a voice is clicked', () => {
    const onSelect = vi.fn()
    render(
      <VoiceSelector
        voices={mockVoices}
        selectedVoiceId="v1"
        onSelect={onSelect}
      />
    )

    fireEvent.click(screen.getByText('Emma'))
    expect(onSelect).toHaveBeenCalledWith('v2')
  })

  it('shows loading state when loading prop is true', () => {
    render(
      <VoiceSelector
        voices={[]}
        selectedVoiceId=""
        onSelect={vi.fn()}
        loading={true}
      />
    )

    expect(screen.getByText('読み込み中...')).toBeDefined()
  })
})
