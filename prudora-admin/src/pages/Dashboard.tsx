import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Profile } from '../types/database'

type DashboardProps = {
  profile: Profile
}

export function Dashboard({ profile }: DashboardProps) {
  const [users, setUsers] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [updatingId, setUpdatingId] = useState<string | null>(null)

  useEffect(() => {
    loadUsers()
  }, [])

  async function loadUsers() {
    setLoading(true)
    setError(null)
    const { data, error: e } = await supabase
      .from('profiles')
      .select('id, first_name, last_name, age, email, is_admin, created_at, updated_at')
      .order('created_at', { ascending: false })
    if (e) {
      setError(e.message)
      setUsers([])
    } else {
      setUsers((data ?? []) as Profile[])
    }
    setLoading(false)
  }

  async function toggleAdmin(p: Profile) {
    if (p.id === profile.id) return
    setUpdatingId(p.id)
    setError(null)
    const { error: e } = await supabase
      .from('profiles')
      .update({ is_admin: !p.is_admin, updated_at: new Date().toISOString() })
      .eq('id', p.id)
    if (e) setError(e.message)
    else setUsers((prev) => prev.map((u) => (u.id === p.id ? { ...u, is_admin: !u.is_admin } : u)))
    setUpdatingId(null)
  }

  return (
    <div className="users-page">
      <h2 className="section-title">Brukeradministrasjon</h2>
      {error && <p className="error">{error}</p>}

      {loading ? (
        <p className="loading">Henter brukere…</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Navn</th>
                <th>E-post</th>
                <th>Alder</th>
                <th>Registrert</th>
                <th>Admin</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td>
                    {u.first_name} {u.last_name}
                  </td>
                  <td>{u.email ?? '–'}</td>
                  <td>{u.age}</td>
                  <td>{new Date(u.created_at).toLocaleDateString('nb-NO')}</td>
                  <td>
                    <label className="toggle">
                      <input
                        type="checkbox"
                        checked={u.is_admin}
                        onChange={() => toggleAdmin(u)}
                        disabled={updatingId === u.id || u.id === profile.id}
                      />
                      <span>{u.is_admin ? 'Ja' : 'Nei'}</span>
                    </label>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
