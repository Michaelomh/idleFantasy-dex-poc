import { useRegisterSW } from 'virtual:pwa-register/react';

/**
 * This function helps to identify if there is a new version of the PWA, which
 * would then prompt the user to reload the page.
 */
export function ReloadPrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW();

  if (!needRefresh) return null;

  return (
    <div
      role="status"
      className="fixed inset-x-0 bottom-0 z-50 flex items-center justify-between gap-3 border-t border-border bg-background px-4 py-3 font-mono text-sm"
    >
      <span>A new version is available.</span>
      <div className="flex gap-2">
        <button type="button" className="text-muted-foreground" onClick={() => setNeedRefresh(false)}>
          Dismiss
        </button>
        <button type="button" className="font-semibold text-primary" onClick={() => updateServiceWorker(true)}>
          Reload
        </button>
      </div>
    </div>
  );
}
