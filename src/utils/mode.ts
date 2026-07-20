/**
 * Runtime mode detection — local vs Supabase.
 *
 * When VITE_API_URL is set, the app runs in local mode and talks to
 * the self-hosted Node/Hono backend instead of Supabase.
 */
export const isLocalMode = !!import.meta.env.VITE_API_URL;
export const API_URL = import.meta.env.VITE_API_URL || '';
