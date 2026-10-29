import { httpApi } from './http';
import { mockApi } from './mock/api';
import { SAMPLE_DATA } from './mode';
import type { OxbowApi } from './types';

/**
 * The API the UI reads from: the Oxbow API over HTTP when NEXT_PUBLIC_LIVE_DATA
 * is set, otherwise the mock layer with the prototype's sample data.
 */
export const api: OxbowApi = SAMPLE_DATA ? mockApi : httpApi;

export type { OxbowApi } from './types';
