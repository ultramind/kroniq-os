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
  const saved = getStoredOfflineWorkspace()
  return saved?.userId === userId ? saved : undefined
}

/**
 * Returns the device cache owner without granting access to its data. This is
 * used only to erase a previous tenant's local workspace before another user
 * can open the app on the same device.
 */
export function getStoredOfflineWorkspace(): OfflineWorkspace | undefined {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) ?? '') as OfflineWorkspace
    return saved.userId ? saved : undefined
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
