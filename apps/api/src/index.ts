/**
 * Oxbow API (Fastify). M1 ships only the server skeleton and a health check;
 * the routes from brief section 6, Redis caching, rate limits and the
 * register endpoint land in M2.
 */
import Fastify from 'fastify';

const port = Number(process.env.PORT ?? 4000);
const app = Fastify({ logger: true, bodyLimit: 64 * 1024 });

app.get('/health', async () => ({ ok: true }));

app.listen({ port, host: '127.0.0.1' }).catch((err) => {
  app.log.error(err);
  process.exit(1);
});
