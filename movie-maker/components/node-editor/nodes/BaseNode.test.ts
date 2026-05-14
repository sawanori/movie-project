import { describe, it, expect } from 'vitest'
import { getInputHandleClass, getOutputHandleClass } from './BaseNode'

describe('getInputHandleClass', () => {
  it('video ハンドルは緑クラスを返す', () => {
    expect(getInputHandleClass('video')).toContain('bg-green')
  })

  it('image ハンドルは青クラスを返す', () => {
    expect(getInputHandleClass('image')).toContain('bg-blue')
  })

  it('text ハンドルは紫クラスを返す', () => {
    expect(getInputHandleClass('text')).toContain('bg-purple')
  })

  it('audio ハンドルはオレンジクラスを返す', () => {
    expect(getInputHandleClass('audio')).toContain('bg-orange')
  })

  it('default ハンドルは既存の inputHandleClassName を返す', () => {
    expect(getInputHandleClass('default')).toContain('bg-[#fce300]')
  })
})

describe('getOutputHandleClass', () => {
  it('video ハンドルは緑クラスを返す', () => {
    expect(getOutputHandleClass('video')).toContain('bg-green')
  })

  it('image ハンドルは青クラスを返す', () => {
    expect(getOutputHandleClass('image')).toContain('bg-blue')
  })

  it('text ハンドルは紫クラスを返す', () => {
    expect(getOutputHandleClass('text')).toContain('bg-purple')
  })

  it('audio ハンドルはオレンジクラスを返す', () => {
    expect(getOutputHandleClass('audio')).toContain('bg-orange')
  })

  it('default ハンドルは既存の outputHandleClassName を返す', () => {
    expect(getOutputHandleClass('default')).toContain('bg-[#00bdb6]')
  })
})
