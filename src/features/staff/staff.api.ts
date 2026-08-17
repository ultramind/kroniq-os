import { supabase } from '../../supabase'
import type { Role, StaffMember } from '../../types'

type CreateStaffInput = { fullName: string; email: string; password: string; role: Role }
async function invoke<T>(body: Record<string, unknown>) {
  if (!supabase) throw new Error('Supabase is not configured.')
  const client = supabase
  const { data, error } = await client.functions.invoke<T>('manage-staff', { body })
  if (error || !data) throw error ?? new Error('Empty response from staff service.')
  return data
}
export const staffApi = {
  list: async () => (await invoke<{ staff: StaffMember[] }>({ action: 'list' })).staff,
  create: (input: CreateStaffInput) => invoke<{ staff: StaffMember }>({ action: 'create', ...input }),
  deactivate: (staffId: string) => invoke<{ success: true }>({ action: 'deactivate', staffId }),
}
