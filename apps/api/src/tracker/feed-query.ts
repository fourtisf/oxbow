import type { z } from 'zod';
import type { FeedQuerySchema } from '@oxbow/shared';

export type FeedQuery = z.output<typeof FeedQuerySchema>;
