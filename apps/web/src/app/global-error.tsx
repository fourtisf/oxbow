'use client';

import { useEffect } from 'react';
import { reportError } from '@/lib/monitoring';

/**
 * Last-resort boundary for errors in the root layout itself. It replaces the
 * whole document, so it can't rely on the layout's providers or stylesheet.
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    reportError(error, { digest: error.digest, scope: 'root' });
  }, [error]);
  return (
    <html lang="en">
      <body style={{ margin: 0, minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#03060C', color: '#F1F6FF', font: '16px/1.5 system-ui, sans-serif' }}>
        <main style={{ maxWidth: 440, padding: 24, textAlign: 'center' }}>
          <h1 style={{ fontSize: 28, margin: '0 0 8px' }}>Something broke</h1>
          <p style={{ color: '#A9B8CB', margin: '0 0 24px' }}>The error was reported. Reload the page to try again.</p>
          <button
            onClick={reset}
            style={{ height: 46, padding: '0 22px', borderRadius: 12, border: 0, background: '#B8DCFF', color: '#04101F', font: '600 15px system-ui, sans-serif', cursor: 'pointer' }}
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
