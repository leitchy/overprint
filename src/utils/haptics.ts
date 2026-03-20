/** Short tap vibration for actions like control placement */
export function hapticTap(): void {
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    navigator.vibrate(30);
  }
}

/** Double-pulse vibration for confirmations */
export function hapticConfirm(): void {
  if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
    navigator.vibrate([30, 50, 30]);
  }
}
