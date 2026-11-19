import { AppRouter } from '@/app/routes';
import { PwaUpdatePrompt } from '@/components/pwa/PwaUpdatePrompt';

export function App() {
  return (
    <>
      <AppRouter />
      <PwaUpdatePrompt />
    </>
  );
}
