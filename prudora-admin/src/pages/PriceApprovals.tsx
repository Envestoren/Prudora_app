import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'

type PendingPrice = {
  id: string
  price_amount: string | number
  recorded_at: string
  user_id: string
  approval_status: 'pending' | 'approved' | 'rejected'
  products?: {
    id: string
    name: string
    supplier: string
    manufacturer: string
    unit: string
    barcode: string | null
    image_url: string | null
  } | null
  stores?: {
    id: string
    chain: string
    name: string | null
  } | null
}

export function PriceApprovals() {
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pendingPrices, setPendingPrices] = useState<PendingPrice[]>([])
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [profileByUserId, setProfileByUserId] = useState<Record<string, { first_name: string; last_name: string; email: string | null }>>(
    {}
  )

  useEffect(() => {
    void load()
  }, [])

  async function load() {
    setLoading(true)
    setError(null)
    setSubmitting(false)

    const { data, error: e } = await supabase
      .from('product_prices')
      .select(
        'id, price_amount, recorded_at, user_id, approval_status,' +
          ' products(id,name,supplier,manufacturer,unit,barcode,image_url),' +
          ' stores(id,chain,name)'
      )
      .eq('approval_status', 'pending')
      .order('recorded_at', { ascending: true })

    if (e) {
      setError(e.message)
      setPendingPrices([])
      setProfileByUserId({})
      setLoading(false)
      return
    }

    const rows = (data as unknown as PendingPrice[]) ?? []
    setPendingPrices(rows)
    setSelectedIds([])

    if (rows.length === 0) {
      setProfileByUserId({})
      setLoading(false)
      return
    }

    const ids = [...new Set(rows.map((r) => r.user_id).filter(Boolean))]
    const { data: profiles, error: profErr } = await supabase
      .from('profiles')
      .select('id, first_name, last_name, email')
      .in('id', ids)

    if (profErr) {
      setProfileByUserId({})
      setLoading(false)
      return
    }

    const map: Record<string, { first_name: string; last_name: string; email: string | null }> = {}
    ;(profiles ?? []).forEach((p: any) => {
      map[p.id] = { first_name: p.first_name ?? '', last_name: p.last_name ?? '', email: p.email ?? null }
    })

    setProfileByUserId(map)
    setLoading(false)
  }

  async function decide(p: PendingPrice, nextStatus: 'approved' | 'rejected') {
    setSubmitting(true)
    setError(null)
    try {
      const { data: auth } = await supabase.auth.getUser()
      const adminId = auth.user?.id ?? null

      const { error: e } = await supabase
        .from('product_prices')
        .update({
          approval_status: nextStatus,
          approved_by: adminId,
          approved_at: new Date().toISOString(),
        })
        .eq('id', p.id)

      if (e) {
        setError(e.message)
        return
      }

      await load()
    } finally {
      setSubmitting(false)
    }
  }

  const allIds = useMemo(() => pendingPrices.map((p) => p.id), [pendingPrices])
  const allSelected = allIds.length > 0 && allIds.every((id) => selectedIds.includes(id))

  function toggleSelected(id: string) {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  function toggleSelectAll() {
    setSelectedIds((prev) => {
      if (allSelected) return prev.filter((id) => !allIds.includes(id))
      const merged = new Set([...prev, ...allIds])
      return Array.from(merged)
    })
  }

  async function decideMany(ids: string[], nextStatus: 'approved' | 'rejected') {
    if (ids.length === 0) return
    setSubmitting(true)
    setError(null)
    try {
      const { data: auth } = await supabase.auth.getUser()
      const adminId = auth.user?.id ?? null
      const nowIso = new Date().toISOString()
      const { error: e } = await supabase
        .from('product_prices')
        .update({
          approval_status: nextStatus,
          approved_by: adminId,
          approved_at: nowIso,
        })
        .in('id', ids)
      if (e) {
        setError(e.message)
        return
      }
      await load()
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="products-page">
      <h2 className="section-title">Priser til godkjenning</h2>
      <p className="section-desc">Her kan admin godkjenne/avvise prisregistreringer som er sendt inn fra appen.</p>

      <div className="products-filters">
        <button type="button" className="btn-page" onClick={() => load()} disabled={loading || submitting}>
          Oppdater
        </button>
        <button
          type="button"
          className="btn-page"
          onClick={toggleSelectAll}
          disabled={loading || submitting || pendingPrices.length === 0}
        >
          {allSelected ? 'Fjern alle markeringer' : 'Velg alle'}
        </button>
        <button
          type="button"
          className="btn-edit"
          onClick={() => void decideMany(selectedIds, 'approved')}
          disabled={loading || submitting || selectedIds.length === 0}
        >
          Godkjenn valgte ({selectedIds.length})
        </button>
        <button
          type="button"
          className="btn-edit"
          onClick={() => {
            if (pendingPrices.length === 0) return
            if (!window.confirm(`Autogodkjenn alle ${pendingPrices.length} prisregistreringer som avventer?`)) return
            void decideMany(pendingPrices.map((p) => p.id), 'approved')
          }}
          disabled={loading || submitting || pendingPrices.length === 0}
        >
          Autogodkjenn alle ({pendingPrices.length})
        </button>
      </div>

      {loading ? <p className="loading">Henter pending-priser…</p> : null}
      {error ? <p className="error">{error}</p> : null}

      {!loading && pendingPrices.length === 0 ? (
        <p className="empty">Ingen prisregistreringer avventer godkjenning.</p>
      ) : null}

      {!loading && pendingPrices.length > 0 ? (
        <div className="products-list">
          {pendingPrices.map((p) => {
            const product = p.products ?? null
            const store = p.stores ?? null
            const submitter = profileByUserId[p.user_id]
            const amount = typeof p.price_amount === 'string' ? parseFloat(p.price_amount) : p.price_amount
            const amountText = Number.isFinite(amount) ? amount.toFixed(2) : String(p.price_amount)

            return (
              <div key={p.id} className="product-row">
                <div className="product-row-select">
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(p.id)}
                    onChange={() => toggleSelected(p.id)}
                    disabled={submitting}
                    aria-label={`Velg prisregistrering for ${product?.name ?? 'ukjent produkt'}`}
                  />
                </div>
                {product?.image_url ? <img src={product.image_url} alt="" className="product-thumb" /> : <div className="product-thumb product-thumb-placeholder" aria-hidden />}
                <div className="product-info">
                  <span className="product-name">
                    {product?.name ?? 'Ukjent produkt'}{' '}
                    <span className="product-status" style={{ marginLeft: 8, fontSize: 12, padding: '2px 8px', borderRadius: 999, border: '1px solid var(--border, #e5e7eb)', background: 'rgba(250, 204, 21, 0.15)' }}>
                      Avventer
                    </span>
                  </span>
                  <span className="product-meta">
                    {store ? `${store.chain}${store.name ? ` – ${store.name}` : ''}` : `Store: ${p.id}`}
                    {' · '}
                    {amountText} kr / {product?.unit ?? 'enhet'}
                    {product?.barcode ? ` · ${product.barcode}` : ''}
                    {' · '}
                    {submitter ? `${submitter.first_name} ${submitter.last_name}` : p.user_id}
                    {p.recorded_at ? ` · ${new Date(p.recorded_at).toLocaleDateString('nb-NO')}` : ''}
                  </span>
                </div>
                <div className="product-row-actions">
                  <button type="button" className="btn-edit" onClick={() => decide(p, 'approved')} disabled={submitting}>
                    Godkjenn
                  </button>
                  <button type="button" className="btn-delete" onClick={() => decide(p, 'rejected')} disabled={submitting}>
                    Avvis
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}

