import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export function PriceSettings() {
  const [requiresPriceApproval, setRequiresPriceApproval] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void load()
  }, [])

  async function load() {
    setLoading(true)
    setError(null)
    const { data, error: e } = await supabase.from('price_settings').select('requires_price_approval').single()
    if (e) {
      setError(e.message)
      setLoading(false)
      return
    }
    setRequiresPriceApproval(!!data?.requires_price_approval)
    setLoading(false)
  }

  async function handleToggle(next: boolean) {
    setSaving(true)
    setError(null)
    const { error: e } = await supabase
      .from('price_settings')
      .update({
        requires_price_approval: next,
        updated_at: new Date().toISOString(),
      })
      .eq('id', 1)

    setSaving(false)
    if (e) {
      setError(e.message)
      return
    }
    setRequiresPriceApproval(next)
  }

  return (
    <div className="products-page">
      <h2 className="section-title">Prisinnstillinger</h2>
      <p className="section-desc">
        Bestem om nye prisregistreringer skal godkjennes av admin eller vises umiddelbart.
      </p>

      {loading ? <p className="loading">Henter innstillinger…</p> : null}
      {error ? <p className="error">{error}</p> : null}

      {!loading ? (
        <div className="card category-form-card">
          <h4>Pris-godkjenning</h4>
          <label className="checkbox-label" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <input
              type="checkbox"
              checked={requiresPriceApproval}
              onChange={(e) => void handleToggle(e.target.checked)}
              disabled={saving}
            />
            <span>Krever godkjenning (pending)</span>
          </label>

          {saving ? <p className="loading" style={{ marginTop: 12 }}>Lagrer…</p> : null}
        </div>
      ) : null}
    </div>
  )
}

