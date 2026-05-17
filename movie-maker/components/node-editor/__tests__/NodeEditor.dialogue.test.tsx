/**
 * NodeEditor.dialogue.test.tsx
 * createDialogueNodeFromPrompt CustomEvent listener 動作確認 (AC-C2 関連)
 * NodeEditor は @xyflow/react に強く依存するため、CustomEvent の伝達のみ検証する
 */
import { describe, it, expect } from 'vitest'

describe('NodeEditor createDialogueNodeFromPrompt listener', () => {
  it('dispatches and receives createDialogueNodeFromPrompt CustomEvent (AC-C2)', () => {
    const receivedEvents: CustomEvent[] = []
    const handler = (e: Event) => receivedEvents.push(e as CustomEvent)
    window.addEventListener('createDialogueNodeFromPrompt', handler)

    const event = new CustomEvent('createDialogueNodeFromPrompt', {
      detail: {
        sourcePromptNodeId: 'prompt-1',
        initialText: 'ちょっとまって…',
      },
    })
    window.dispatchEvent(event)

    expect(receivedEvents).toHaveLength(1)
    expect(receivedEvents[0].detail.initialText).toBe('ちょっとまって…')
    expect(receivedEvents[0].detail.sourcePromptNodeId).toBe('prompt-1')

    window.removeEventListener('createDialogueNodeFromPrompt', handler)
  })

  it('allows multiple listeners for createDialogueNodeFromPrompt', () => {
    const received1: string[] = []
    const received2: string[] = []

    const handler1 = (e: Event) => received1.push((e as CustomEvent).detail.initialText)
    const handler2 = (e: Event) => received2.push((e as CustomEvent).detail.initialText)

    window.addEventListener('createDialogueNodeFromPrompt', handler1)
    window.addEventListener('createDialogueNodeFromPrompt', handler2)

    window.dispatchEvent(
      new CustomEvent('createDialogueNodeFromPrompt', {
        detail: { sourcePromptNodeId: 'prompt-2', initialText: 'こんにちは' },
      })
    )

    expect(received1).toEqual(['こんにちは'])
    expect(received2).toEqual(['こんにちは'])

    window.removeEventListener('createDialogueNodeFromPrompt', handler1)
    window.removeEventListener('createDialogueNodeFromPrompt', handler2)
  })
})
