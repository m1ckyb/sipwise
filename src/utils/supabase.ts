import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Supabase credentials missing in environment variables.');
}

export const supabase = createClient(supabaseUrl || '', supabaseAnonKey || '', {
  global: {
    fetch: (url, options) => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      return fetch(url, {
        ...options,
        signal: options?.signal || controller.signal,
      }).finally(() => clearTimeout(timeoutId));
    }
  }
});
