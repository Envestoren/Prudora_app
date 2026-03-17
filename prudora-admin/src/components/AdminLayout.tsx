import { useEffect, useState } from 'react'
import type { Profile } from '../types/database'

const THEME_KEY = 'prudora-admin-theme'

type Theme = 'light' | 'dark'

function getStoredTheme(): Theme {
  if (typeof localStorage === 'undefined') return 'light'
  const t = localStorage.getItem(THEME_KEY)
  return t === 'dark' || t === 'light' ? t : 'light'
}

function setStoredTheme(theme: Theme) {
  localStorage.setItem(THEME_KEY, theme)
  document.documentElement.setAttribute('data-theme', theme)
}

type AdminLayoutProps = {
  profile: Profile
  onLogout: () => void
  activeTab: 'users' | 'stores' | 'products'
  onTabChange: (tab: 'users' | 'stores' | 'products') => void
  children: React.ReactNode
}

export function AdminLayout({ profile, onLogout, activeTab, onTabChange, children }: AdminLayoutProps) {
  const [theme, setTheme] = useState<Theme>(getStoredTheme)

  useEffect(() => {
    setStoredTheme(theme)
  }, [theme])

  function toggleTheme() {
    setTheme((t) => (t === 'light' ? 'dark' : 'light'))
  }

  return (
    <div className="page dashboard-page">
      <header className="header">
        <div>
          <h1>Prudora Admin</h1>
          <p className="user-info">
            {profile.first_name} {profile.last_name}
            {profile.email && ` (${profile.email})`}
          </p>
        </div>
        <div className="header-actions">
          <button
            type="button"
            className="btn-theme-toggle"
            onClick={toggleTheme}
            title={theme === 'light' ? 'Bytt til mørk modus' : 'Bytt til lys modus'}
            aria-label={theme === 'light' ? 'Bytt til mørk modus' : 'Bytt til lys modus'}
          >
            {theme === 'light' ? (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
              </svg>
            ) : (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <circle cx="12" cy="12" r="5" />
                <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
              </svg>
            )}
          </button>
          <button type="button" className="logout" onClick={onLogout}>
            Logg ut
          </button>
        </div>
      </header>

      <nav className="admin-tabs">
        <button
          type="button"
          className={activeTab === 'users' ? 'active' : ''}
          onClick={() => onTabChange('users')}
        >
          Brukere
        </button>
        <button
          type="button"
          className={activeTab === 'stores' ? 'active' : ''}
          onClick={() => onTabChange('stores')}
        >
          Butikker
        </button>
        <button
          type="button"
          className={activeTab === 'products' ? 'active' : ''}
          onClick={() => onTabChange('products')}
        >
          Produkter
        </button>
      </nav>

      <main className="admin-main">{children}</main>
    </div>
  )
}
