import { useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Profile } from '../types/database'

type LoginProps = {
  onAdminVerified: (profile: Profile) => void
}

export function Login({ onAdminVerified }: LoginProps) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(ev: React.FormEvent) {
    ev.preventDefault()
    setError(null)
    setLoading(true)
    const timeoutMs = 20000
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Tidsavbrudd. Sjekk internett og prøv igjen.')), timeoutMs)
    )
    try {
      const work = (async () => {
        const { data: authData, error: signInError } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        })
        if (signInError) {
          const msg = signInError.message.toLowerCase()
          if (msg.includes('invalid') && msg.includes('credential')) {
            throw new Error('Ukjent e-post eller feil passord. Bruk samme konto som du har registrert i Prudora-appen.')
          }
          throw new Error(signInError.message)
        }
        const userId = authData.user?.id
        if (!userId) throw new Error('Innlogging feilet')
        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select(
            'id, first_name, last_name, age, email, is_admin, is_price_verified, price_verification_requested_at, created_at, updated_at'
          )
          .eq('id', userId)
          .single()
        if (profileError || !profile) {
          await supabase.auth.signOut()
          throw new Error(
            profileError?.message
              ? `Kunne ikke hente brukerprofil: ${profileError.message}`
              : 'Kunne ikke hente brukerprofil. Har du registrert deg i Prudora-appen?'
          )
        }
        const p = profile as Profile
        if (!p.is_admin) {
          await supabase.auth.signOut()
          throw new Error('Du har ikke admin-rettigheter. Kun administratorer kan logge inn her.')
        }
        return p
      })()
      const profile = await Promise.race([work, timeoutPromise])
      onAdminVerified(profile)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Noe gikk galt. Prøv igjen.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="page login-page">
      <div className="card">
        <h1>Prudora Admin</h1>
        <p className="subtitle">Logg inn med en admin-konto</p>
        <p className="hint">Bruk samme e-post og passord som i Prudora-appen. Kontoen må være registrert der først.</p>
        <form onSubmit={handleSubmit}>
          <label>
            E-post
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@eksempel.no"
              required
              autoComplete="email"
            />
          </label>
          <label>
            Passord
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
          </label>
          {error && <p className="error">{error}</p>}
          <button type="submit" disabled={loading}>
            {loading ? 'Logger inn…' : 'Logg inn'}
          </button>
        </form>
      </div>
    </div>
  )
}
