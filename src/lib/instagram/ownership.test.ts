import { describe, it, expect, vi, beforeEach } from 'vitest'
import { assertOwnsAccountIfEmployee } from './ownership'
import { supabase } from '@/lib/supabase/client'

vi.mock('@/lib/supabase/client', () => ({
  supabase: { from: vi.fn() },
}))

function mockAccountLookup(result: { data: unknown; error: unknown }) {
  const maybeSingle = vi.fn().mockResolvedValue(result)
  const eq = vi.fn().mockReturnValue({ maybeSingle })
  const select = vi.fn().mockReturnValue({ eq })
  ;(supabase.from as ReturnType<typeof vi.fn>).mockReturnValue({ select })
}

describe('assertOwnsAccountIfEmployee', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('lets non-Empleado roles through without querying the DB', async () => {
    const result = await assertOwnsAccountIfEmployee('acc-1', { roleName: 'Admin', sub: 'user-1' })
    expect(result).toBeNull()
    expect(supabase.from).not.toHaveBeenCalled()
  })

  it('lets an Empleado touch an account they own', async () => {
    mockAccountLookup({ data: { employeeId: 'user-1' }, error: null })
    const result = await assertOwnsAccountIfEmployee('acc-1', { roleName: 'Empleado', sub: 'user-1' })
    expect(result).toBeNull()
  })

  it('blocks an Empleado from touching someone else\'s account with a 403', async () => {
    mockAccountLookup({ data: { employeeId: 'other-user' }, error: null })
    const result = await assertOwnsAccountIfEmployee('acc-1', { roleName: 'Empleado', sub: 'user-1' })
    expect(result).not.toBeNull()
    expect(result!.status).toBe(403)
    const body = await result!.json()
    expect(body.error).toMatch(/no es tuya/)
  })

  it('returns 404 when the account does not exist', async () => {
    mockAccountLookup({ data: null, error: null })
    const result = await assertOwnsAccountIfEmployee('missing', { roleName: 'Empleado', sub: 'user-1' })
    expect(result).not.toBeNull()
    expect(result!.status).toBe(404)
  })

  it('propagates DB errors instead of swallowing them', async () => {
    mockAccountLookup({ data: null, error: new Error('db down') })
    await expect(
      assertOwnsAccountIfEmployee('acc-1', { roleName: 'Empleado', sub: 'user-1' })
    ).rejects.toThrow('db down')
  })
})
