import { useCallback, useEffect, useState } from 'react'
import { supabase } from './lib/supabase'
import type { Profile } from './types/database'
import { Login } from './pages/Login'
import { Dashboard } from './pages/Dashboard'
import { Stores } from './pages/Stores'
import { Products } from './pages/Products'
import { ProductApprovals } from './pages/ProductApprovals'
import { PriceSettings } from './pages/PriceSettings'
import { PriceApprovals } from './pages/PriceApprovals'
import { AdminLayout } from './components/AdminLayout'

export default function App() {
  const [adminProfile, setAdminProfile] = useState<Profile | null>(null)
  const [checking, setChecking] = useState(true)
  const [activeTab, setActiveTab] = useState<
    'users' | 'stores' | 'products' | 'approvals' | 'price-settings' | 'price-approvals'
  >('users')

  const onLogout = useCallback(async () => {
    await supabase.auth.signOut()
    setAdminProfile(null)
  }, [])

  useEffect(() => {
    const saved = localStorage.getItem('prudora-admin-theme')
    if (saved === 'dark' || saved === 'light') {
      document.documentElement.setAttribute('data-theme', saved)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    let unsubscribe: (() => void) | null = null
    const timeoutMs = 8000
    const timeoutPromise = new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs))

    Promise.race([
      supabase.auth.getSession().then(async ({ data: { session } }) => {
        if (!session?.user) return null
        const { data: profile } = await supabase
          .from('profiles')
          .select(
            'id, first_name, last_name, age, email, is_admin, is_price_verified, price_verification_requested_at, created_at, updated_at'
          )
          .eq('id', session.user.id)
          .single()
        if (profile && (profile as Profile).is_admin) return profile as Profile
        return null
      }),
      timeoutPromise,
    ])
      .then((profile) => {
        if (cancelled) return
        if (profile) setAdminProfile(profile)
        setChecking(false)
        let lastUserId: string | null = null
        const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
          if (!session?.user) {
            lastUserId = null
            if (!cancelled) setAdminProfile(null)
            return
          }
          if (session.user.id === lastUserId && event !== 'SIGNED_OUT') return
          lastUserId = session.user.id
          const { data: p } = await supabase
            .from('profiles')
            .select(
              'id, first_name, last_name, age, email, is_admin, is_price_verified, price_verification_requested_at, created_at, updated_at'
            )
            .eq('id', session.user.id)
            .single()
          if (!cancelled) {
            if (p && (p as Profile).is_admin) setAdminProfile(p as Profile)
            else setAdminProfile(null)
          }
        })
        unsubscribe = () => subscription.unsubscribe()
      })
      .catch(() => setChecking(false))

    return () => {
      cancelled = true
      unsubscribe?.()
    }
  }, [])

  if (checking) {
    return (
      <div className="page">
        <p className="loading">Sjekker innlogging…</p>
      </div>
    )
  }

  if (adminProfile) {
    return (
      <AdminLayout
        profile={adminProfile}
        onLogout={onLogout}
        activeTab={activeTab}
        onTabChange={setActiveTab}
      >
        {activeTab === 'users' ? (
          <Dashboard profile={adminProfile} />
        ) : activeTab === 'stores' ? (
          <Stores />
        ) : activeTab === 'approvals' ? (
          <ProductApprovals />
        ) : activeTab === 'price-settings' ? (
          <PriceSettings />
        ) : activeTab === 'price-approvals' ? (
          <PriceApprovals />
        ) : (
          <Products />
        )}
      </AdminLayout>
    )
  }

  return <Login onAdminVerified={setAdminProfile} />
}
