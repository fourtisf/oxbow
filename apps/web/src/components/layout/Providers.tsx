'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useState, type ReactNode } from 'react';
import { useLiveStream } from '@/lib/live';
import { initMonitoring, reportError } from '@/lib/monitoring';
import { useFollow } from '@/lib/store/follow';

function Live() {
  useLiveStream();
  return null;
}

export function Providers({ children }: { children: ReactNode }) {
  const [qc] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 30_000, refetchOnWindowFocus: false },
        },
      }),
  );

  useEffect(() => {
    useFollow.getState().load();
    void initMonitoring();
    const onError = (e: ErrorEvent) => reportError(e.error ?? e.message);
    const onRejection = (e: PromiseRejectionEvent) => reportError(e.reason);
    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);
    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
    };
  }, []);

  return (
    <QueryClientProvider client={qc}>
      <Live />
      {children}
    </QueryClientProvider>
  );
}
