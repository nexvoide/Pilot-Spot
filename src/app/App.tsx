import { AppRouter } from '@/app/routes';
import { PwaInstallPrompt } from '@/components/pwa/PwaInstallPrompt';
import { PwaUpdatePrompt } from '@/components/pwa/PwaUpdatePrompt';

export function App() {
  return (
    <>
      <AppRouter />
      <PwaUpdatePrompt />
      <PwaInstallPrompt />
    </>
  );
}
