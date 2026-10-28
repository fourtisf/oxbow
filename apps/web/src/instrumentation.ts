/**
 * Server-side error reporting. Sentry initializes only when SENTRY_DSN is set,
 * so unconfigured deployments load nothing extra. (Next 14 needs
 * `experimental.instrumentationHook`, set in next.config.mjs.)
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs' && process.env.SENTRY_DSN) {
    const S = await import('@sentry/nextjs');
    S.init({
      dsn: process.env.SENTRY_DSN,
      environment: process.env.SOLANA_CLUSTER || 'devnet',
      tracesSampleRate: 0,
    });
  }
}
