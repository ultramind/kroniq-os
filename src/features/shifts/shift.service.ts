import { db } from '../../db'
import { supabase } from '../../supabase'
import type { CashShift } from '../../types'

function requireOnlineShifts() {
  if (!supabase || !navigator.onLine) throw new Error('Cash shifts require an internet connection.')
  return supabase
}

export async function openShift(openingCash: number) {
  const client = requireOnlineShifts()
  const active = await db.shifts.filter((shift) => !shift.closedAt).first()
  if (active) throw new Error('Close the current shift before opening another one.')
  const shift: CashShift = { id: crypto.randomUUID(), openedAt: new Date().toISOString(), openingCash, synced: true }
  const { error } = await client.rpc('open_cash_shift', { p_shift: shift })
  if (error) throw error
  await db.shifts.add(shift)
  return shift
}
export async function closeShift(shift: CashShift, countedCash: number, varianceReason?: string) {
  const client = requireOnlineShifts()
  const cashSales = await db.sales.filter((sale) => !sale.returnedAt && sale.paymentMethod === 'cash' && sale.createdAt >= shift.openedAt).toArray()
  const expectedCash = shift.openingCash + cashSales.reduce((sum, sale) => sum + sale.total, 0)
  const closedAt = new Date().toISOString()
  const closure = { closedAt, countedCash, expectedCash, variance: countedCash - expectedCash, varianceReason, synced: true }
  const { error } = await client.rpc('close_cash_shift', { p_shift_id: shift.id, p_closure: closure })
  if (error) throw error
  await db.shifts.update(shift.id, closure)
}
