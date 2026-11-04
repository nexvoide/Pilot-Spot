import { useEffect, useState } from 'react';
import { registerSW } from 'virtual:pwa-register';

export function PwaUpdatePrompt() {
  const [offlineReady, setOfflineReady] = useState(false);
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [updateServiceWorker, setUpdateServiceWorker] = useState<(() => Promise<void>) | null>(
    null,
  );

  useEffect(() => {
    const update = registerSW({
      onNeedRefresh: () => setUpdateAvailable(true),
      onOfflineReady: () => setOfflineReady(true),
    });
    setUpdateServiceWorker(() => update);
  }, []);

  if (!offlineReady && !updateAvailable) {
    return null;
  }

  return (
    <div className="pwa-prompt" role="status">
      <span>{updateAvailable ? 'A newer version is ready.' : 'App ready for offline access.'}</span>
      {updateAvailable && (
        <button onClick={() => updateServiceWorker?.()} type="button">
          Update
        </button>
      )}
      <button
        aria-label="Dismiss notification"
        onClick={() => {
          setOfflineReady(false);
          setUpdateAvailable(false);
        }}
        type="button"
      >
        ×
      </button>
    </div>
  );
}
