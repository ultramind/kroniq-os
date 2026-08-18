import type { Role } from '../types'

const storageKey = 'kroniq-offline-workspace'

type OfflineWorkspace = {
  userId: string
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
  localStorage.removeItem(storageKey)
}
