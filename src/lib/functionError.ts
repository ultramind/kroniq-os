export async function functionErrorMessage(error: unknown, fallback = 'The server action failed.') {
  if (!error || typeof error !== 'object') return fallback
  const candidate = error as { message?: string; context?: Response }
  try {
    const response = candidate.context
    if (response && typeof response.json === 'function') {
      const body = (await response.clone().json()) as { error?: string; message?: string }
      if (body.error || body.message) return body.error ?? body.message ?? fallback
    }
  } catch {
    /* use the standard message below */
  }
  return candidate.message ?? fallback
}
