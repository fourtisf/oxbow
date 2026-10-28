import { mockApi } from './mock/api';
import type { OxbowApi } from './types';

/**
 * The API the UI reads from. M1 runs entirely on the mock layer (the
 * prototype's sample data). M2 swaps in an HTTP client for
 * NEXT_PUBLIC_API_URL behind this same export.
 */
export const api: OxbowApi = mockApi;

export type { OxbowApi } from './types';
