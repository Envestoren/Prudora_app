import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL ?? ''
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY ?? ''

if (!url || !anonKey) {
  console.warn('Prudora Admin: Mangler VITE_SUPABASE_URL eller VITE_SUPABASE_ANON_KEY i .env')
}

// Egen storage uten lock – unngår at Auth-lås henger siden
const authStorage = {
  getItem: (key: string) => Promise.resolve(typeof localStorage !== 'undefined' ? localStorage.getItem(key) : null),
  setItem: (key: string, value: string) => {
    if (typeof localStorage !== 'undefined') localStorage.setItem(key, value)
    return Promise.resolve()
  },
  removeItem: (key: string) => {
    if (typeof localStorage !== 'undefined') localStorage.removeItem(key)
    return Promise.resolve()
  },
}

export const supabase = createClient(url, anonKey, {
  auth: {
    storage: authStorage,
    persistSession: true,
    autoRefreshToken: true,
  },
})
