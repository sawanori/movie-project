import { describe, it, expect } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useNodesAvailability } from './useNodesAvailability'

describe('useNodesAvailability', () => {
  it('videoInput is always available without a provider', () => {
    const { result } = renderHook(() =>
      useNodesAvailability({ selectedProvider: null, subjectType: null })
    )
    expect(result.current.isNodeAvailable('videoInput')).toBe(true)
  })

  it('dialogue is always available without a provider', () => {
    const { result } = renderHook(() =>
      useNodesAvailability({ selectedProvider: null, subjectType: null })
    )
    expect(result.current.isNodeAvailable('dialogue')).toBe(true)
  })

  it('stitchVideos is always available without a provider', () => {
    const { result } = renderHook(() =>
      useNodesAvailability({ selectedProvider: null, subjectType: null })
    )
    expect(result.current.isNodeAvailable('stitchVideos')).toBe(true)
  })

  it('trimVideo is always available without a provider', () => {
    const { result } = renderHook(() =>
      useNodesAvailability({ selectedProvider: null, subjectType: null })
    )
    expect(result.current.isNodeAvailable('trimVideo')).toBe(true)
  })

  it('getVideoFrame is always available without a provider', () => {
    const { result } = renderHook(() =>
      useNodesAvailability({ selectedProvider: null, subjectType: null })
    )
    expect(result.current.isNodeAvailable('getVideoFrame')).toBe(true)
  })

  it('stickyNote is always available without a provider', () => {
    const { result } = renderHook(() =>
      useNodesAvailability({ selectedProvider: null, subjectType: null })
    )
    expect(result.current.isNodeAvailable('stickyNote')).toBe(true)
  })

  it('klingCameraControl is available only when piapi_kling is selected', () => {
    const { result: klingResult } = renderHook(() =>
      useNodesAvailability({ selectedProvider: 'piapi_kling', subjectType: null })
    )
    expect(klingResult.current.isNodeAvailable('klingCameraControl')).toBe(true)

    const { result: noProviderResult } = renderHook(() =>
      useNodesAvailability({ selectedProvider: null, subjectType: null })
    )
    expect(noProviderResult.current.isNodeAvailable('klingCameraControl')).toBe(false)

    const { result: runwayResult } = renderHook(() =>
      useNodesAvailability({ selectedProvider: 'runway', subjectType: null })
    )
    expect(runwayResult.current.isNodeAvailable('klingCameraControl')).toBe(false)
  })

  it('availableNodes includes all always-available nodes when no provider is selected', () => {
    const { result } = renderHook(() =>
      useNodesAvailability({ selectedProvider: null, subjectType: null })
    )
    const alwaysAvailable = [
      'imageInput',
      'videoInput',
      'prompt',
      'provider',
      'cameraWork',
      'generate',
      'dialogue',
      'bgm',
      'filmGrain',
      'lut',
      'overlay',
      'getVideoFrame',
      'trimVideo',
      'stitchVideos',
      'stickyNote',
    ]
    for (const node of alwaysAvailable) {
      expect(result.current.availableNodes).toContain(node)
    }
  })

  it('klingCameraControl appears in availableNodes for piapi_kling but not in unavailableNodes', () => {
    const { result } = renderHook(() =>
      useNodesAvailability({ selectedProvider: 'piapi_kling', subjectType: null })
    )
    expect(result.current.availableNodes).toContain('klingCameraControl')
    expect(result.current.unavailableNodes).not.toContain('klingCameraControl')
  })

  it('omniReference is available only when seedance is selected', () => {
    const { result: seedanceResult } = renderHook(() =>
      useNodesAvailability({ selectedProvider: 'seedance', subjectType: null })
    )
    expect(seedanceResult.current.isNodeAvailable('omniReference')).toBe(true)

    const { result: noProviderResult } = renderHook(() =>
      useNodesAvailability({ selectedProvider: null, subjectType: null })
    )
    expect(noProviderResult.current.isNodeAvailable('omniReference')).toBe(false)

    const { result: runwayResult } = renderHook(() =>
      useNodesAvailability({ selectedProvider: 'runway', subjectType: null })
    )
    expect(runwayResult.current.isNodeAvailable('omniReference')).toBe(false)

    const { result: klingResult } = renderHook(() =>
      useNodesAvailability({ selectedProvider: 'piapi_kling', subjectType: null })
    )
    expect(klingResult.current.isNodeAvailable('omniReference')).toBe(false)
  })

  it('omniReference appears in availableNodes for seedance but not in unavailableNodes', () => {
    const { result } = renderHook(() =>
      useNodesAvailability({ selectedProvider: 'seedance', subjectType: null })
    )
    expect(result.current.availableNodes).toContain('omniReference')
    expect(result.current.unavailableNodes).not.toContain('omniReference')
  })
})
