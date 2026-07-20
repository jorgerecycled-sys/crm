import { describe, it, expect, vi } from 'vitest'
import { inChunks } from './chunked'

describe('inChunks', () => {
  it('returns an empty array for an empty id list without calling build', async () => {
    const build = vi.fn()
    const result = await inChunks([], build)
    expect(result).toEqual([])
    expect(build).not.toHaveBeenCalled()
  })

  it('makes a single call when the id list fits in one chunk', async () => {
    const ids = Array.from({ length: 10 }, (_, i) => `id-${i}`)
    const build = vi.fn(async (chunk: string[]) => ({ data: chunk.map(id => ({ id })), error: null }))
    const result = await inChunks(ids, build)
    expect(build).toHaveBeenCalledTimes(1)
    expect(result).toHaveLength(10)
  })

  it('splits ids larger than the chunk size into multiple calls and merges results in order', async () => {
    const ids = Array.from({ length: 320 }, (_, i) => `id-${i}`)
    const seenChunks: string[][] = []
    const build = vi.fn(async (chunk: string[]) => {
      seenChunks.push(chunk)
      return { data: chunk.map(id => ({ id })), error: null }
    })
    const result = await inChunks(ids, build)

    // 320 ids at 150/chunk -> 3 calls (150, 150, 20)
    expect(build).toHaveBeenCalledTimes(3)
    expect(seenChunks.map(c => c.length)).toEqual([150, 150, 20])
    expect(result).toHaveLength(320)
    expect(result.map((r: { id: string }) => r.id)).toEqual(ids)
  })

  it('throws and stops on the first chunk error instead of swallowing it', async () => {
    // 400 ids at 150/chunk = 3 chunks — fail on the 2nd and confirm the 3rd never runs
    const ids = Array.from({ length: 400 }, (_, i) => `id-${i}`)
    let calls = 0
    const build = vi.fn(async () => {
      calls++
      if (calls === 2) return { data: null, error: new Error('boom') }
      return { data: [{ id: 'ok' }], error: null }
    })
    await expect(inChunks(ids, build)).rejects.toThrow('boom')
    expect(calls).toBe(2)
  })

  it('treats a null data response as an empty chunk instead of throwing', async () => {
    const build = vi.fn(async () => ({ data: null, error: null }))
    const result = await inChunks(['a', 'b'], build)
    expect(result).toEqual([])
  })
})
