// ---------------------------------------------------------------------------
// Toast – lightweight notification popup for transient messages.
// ---------------------------------------------------------------------------

export type ToastType = 'info' | 'warning' | 'error';

/**
 * Show a temporary toast notification at the bottom of the screen.
 * Auto-dismisses after `durationMs` (default 4 s).
 */
export function showToast(
  message: string,
  type: ToastType = 'info',
  durationMs = 4000,
): void {
  const el = document.createElement('div');
  el.className = `ft-toast ft-toast--${type}`;
  el.textContent = message;
  document.body.appendChild(el);

  // Force reflow so the transition plays from the initial state.
  void el.offsetWidth;
  el.classList.add('ft-toast--visible');

  setTimeout(() => {
    el.classList.remove('ft-toast--visible');
    el.addEventListener('transitionend', () => el.remove(), { once: true });
    // Safety net: remove if transitionend never fires
    setTimeout(() => el.remove(), 500);
  }, durationMs);
}
