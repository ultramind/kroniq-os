type CheckoutSound = 'add' | 'clear'

let audioContext: AudioContext | undefined

function getAudioContext() {
  if (audioContext) return audioContext
  const BrowserAudioContext =
    window.AudioContext ??
    (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!BrowserAudioContext) return undefined
  audioContext = new BrowserAudioContext()
  return audioContext
}

/** Plays a short, unobtrusive confirmation tone after a cashier interaction. */
export function playCheckoutSound(type: CheckoutSound) {
  try {
    const context = getAudioContext()
    if (!context) return
    if (context.state === 'suspended') void context.resume()

    const notes = type === 'add' ? [587, 880] : [440, 294]
    const startAt = context.currentTime
    notes.forEach((frequency, index) => {
      const oscillator = context.createOscillator()
      const gain = context.createGain()
      const startsAt = startAt + index * (type === 'add' ? 0.07 : 0.08)
      oscillator.type = 'sine'
      oscillator.frequency.setValueAtTime(frequency, startsAt)
      gain.gain.setValueAtTime(0.0001, startsAt)
      gain.gain.exponentialRampToValueAtTime(type === 'add' ? 0.04 : 0.035, startsAt + 0.01)
      gain.gain.exponentialRampToValueAtTime(0.0001, startsAt + 0.085)
      oscillator.connect(gain)
      gain.connect(context.destination)
      oscillator.start(startsAt)
      oscillator.stop(startsAt + 0.095)
    })
    if (type === 'add') window.dispatchEvent(new Event('kroniq-cart-added'))
  } catch {
    // Audio is an optional UX enhancement and should never interrupt checkout.
  }
}
