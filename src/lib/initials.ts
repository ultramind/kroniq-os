export function initials(name?: string, fallback = 'K') {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return fallback
  return parts
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase()
}
