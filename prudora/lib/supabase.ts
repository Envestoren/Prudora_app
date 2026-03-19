import { Platform } from 'react-native';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    'Supabase: Mangler EXPO_PUBLIC_SUPABASE_URL eller EXPO_PUBLIC_SUPABASE_ANON_KEY. ' +
      'Opprett en .env-fil i prosjektroten (se .env.example).'
  );
}

/** Lagring for auth: unngår AsyncStorage på web (SSR) fordi den krever `window`. */
function getAuthStorage() {
  if (Platform.OS === 'web') {
    if (typeof window === 'undefined') {
      return {
        getItem: async () => null,
        setItem: async () => {},
        removeItem: async () => {},
      };
    }
    return {
      getItem: (key: string) => Promise.resolve(localStorage.getItem(key)),
      setItem: (key: string, value: string) => {
        localStorage.setItem(key, value);
        return Promise.resolve();
      },
      removeItem: (key: string) => {
        localStorage.removeItem(key);
        return Promise.resolve();
      },
    };
  }
  const AsyncStorage = require('@react-native-async-storage/async-storage').default;
  return AsyncStorage;
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: getAuthStorage(),
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: Platform.OS === 'web',
    // Bruk no-op lock-funksjon for å unngå låsefeil ("Lock broken by another request with the 'steal' option")
    // @ts-expect-error: 'lock' er ikke typet i alle versjoner av supabase-js, men støttes i auth-js
    lock: async (_key: string, _isStolen: boolean, fn: () => Promise<unknown> | unknown) => {
      return await fn();
    },
  },
});
