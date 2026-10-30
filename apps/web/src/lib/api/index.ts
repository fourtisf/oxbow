import { httpApi } from './http';
import type { OxbowApi } from './types';

/** The API the UI reads from. */
export const api: OxbowApi = httpApi;

export type { OxbowApi } from './types';
