import { useEffect, useRef, useState } from 'react';

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

type MobilePlatform = 'ios' | 'android';

function getMobilePlatform(): MobilePlatform | null {
  const userAgent = navigator.userAgent;
  if (/iPad|iPhone|iPod/i.test(userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) {
    return 'ios';
  }
  return /Android/i.test(userAgent) ? 'android' : null;
}

function isInstalled(): boolean {
  return window.matchMedia?.('(display-mode: standalone)').matches === true ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

export function PwaInstallPrompt() {
  const [platform] = useState(getMobilePlatform);
  const [visible, setVisible] = useState(() => getMobilePlatform() !== null && !isInstalled());
  const [installEvent, setInstallEvent] = useState<InstallPromptEvent | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const handleInstallPrompt = (event: Event) => {
      if (platform !== 'android' || isInstalled()) return;
      event.preventDefault();
      setInstallEvent(event as InstallPromptEvent);
    };
    const handleInstalled = () => {
      setInstallEvent(null);
      setVisible(false);
    };
    window.addEventListener('beforeinstallprompt', handleInstallPrompt);
    window.addEventListener('appinstalled', handleInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', handleInstallPrompt);
      window.removeEventListener('appinstalled', handleInstalled);
    };
  }, [platform]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!visible || !dialog) return;
    dialog.showModal();
    return () => dialog.close();
  }, [visible]);

  async function install() {
    if (!installEvent) return;
    setInstallEvent(null);
    try {
      await installEvent.prompt();
      const choice = await installEvent.userChoice;
      if (choice.outcome === 'accepted') setVisible(false);
    } catch {
      // The browser may withdraw its install prompt; the manual instructions remain available.
    }
  }

  if (!visible || !platform) return null;

  return (
    <dialog
      aria-labelledby="install-title"
      className="install-dialog"
      onCancel={(event) => {
        event.preventDefault();
        setVisible(false);
      }}
      ref={dialogRef}
    >
      <img alt="" className="install-dialog-icon" src="/spot-ladder-apple.png" />
      <h2 id="install-title">Install Spot Ladder</h2>
      <p>Add the app to your home screen for quick access.</p>
      {platform === 'ios' ? (
        <p>Tap the Share button in your browser, then choose <strong>Add to Home Screen</strong>. You may need to scroll through the menu.</p>
      ) : (
        <p>Open your browser menu and choose <strong>Install app</strong> or <strong>Add to Home screen</strong>.</p>
      )}
      {platform === 'android' && installEvent && (
        <button className="install-dialog-primary" onClick={() => void install()} type="button">
          Install app
        </button>
      )}
      <button className="install-dialog-dismiss" onClick={() => setVisible(false)} type="button">
        Continue in browser
      </button>
    </dialog>
  );
}
