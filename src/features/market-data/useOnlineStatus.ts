import { useEffect, useState } from 'react';

export function useOnlineStatus() {
  const [status, setStatus] = useState(() => ({
    online: typeof navigator === 'undefined' || navigator.onLine,
    reconnectedAt: 0,
  }));

  useEffect(() => {
    const offline = () => setStatus((current) => ({ ...current, online: false }));
    const online = () => setStatus({ online: true, reconnectedAt: Date.now() });
    window.addEventListener('offline', offline);
    window.addEventListener('online', online);
    return () => {
      window.removeEventListener('offline', offline);
      window.removeEventListener('online', online);
    };
  }, []);

  return status;
}
