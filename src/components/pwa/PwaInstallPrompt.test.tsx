import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PwaInstallPrompt } from './PwaInstallPrompt';

describe('PwaInstallPrompt', () => {
  beforeEach(() => {
    vi.spyOn(HTMLDialogElement.prototype, 'showModal').mockImplementation(function (this: HTMLDialogElement) {
      this.open = true;
    });
    vi.spyOn(HTMLDialogElement.prototype, 'close').mockImplementation(function (this: HTMLDialogElement) {
      this.open = false;
    });
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false })));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('shows iOS instructions again on a new visit after dismissal', () => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('iPhone');
    const { unmount } = render(<PwaInstallPrompt />);
    expect(screen.getByText(/share button/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /continue in browser/i }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    unmount();
    render(<PwaInstallPrompt />);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('does not prompt in the installed app', () => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Android');
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true })));
    render(<PwaInstallPrompt />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('opens the browser install prompt on Android', async () => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Android');
    render(<PwaInstallPrompt />);
    const prompt = vi.fn().mockResolvedValue(undefined);
    const event = new Event('beforeinstallprompt', { cancelable: true });
    Object.assign(event, { prompt, userChoice: Promise.resolve({ outcome: 'accepted' }) });
    fireEvent(window, event);
    expect(event.defaultPrevented).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Install app' }));
    expect(prompt).toHaveBeenCalledOnce();
    expect(await screen.findByText(/add the app to your home screen/i)).toBeInTheDocument();
  });
});
