import type { Role } from '../types'

const storageKey = 'kroniq-offline-workspace'

type OfflineWorkspace = {
  userId: string
  organizationId?: string
  role: Role
  staffName?: string
  tenantName?: string
  tenantLogoUrl?: string
  savedAt: string
}

export function saveOfflineWorkspace(workspace: Omit<OfflineWorkspace, 'savedAt'>) {
  localStorage.setItem(storageKey, JSON.stringify({ ...workspace, savedAt: new Date().toISOString() }))
}

export function getOfflineWorkspace(userId: string): OfflineWorkspace | undefined {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) ?? '') as OfflineWorkspace
    return saved.userId === userId ? saved : undefined
  } catch {
    return undefined
  }
}

export function clearOfflineWorkspace() {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) ?? '') as OfflineWorkspace
    if (saved.userId) sessionStorage.removeItem(`kroniq-active-organization:${saved.userId}`)
  } catch {
    // Nothing to clear.
  }
  localStorage.removeItem(storageKey)
}
