import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Product, ProductPrice, Store } from '../types/database'
import { PriceSettings } from './PriceSettings'
import { PriceApprovals } from './PriceApprovals'

type PriceRow = ProductPrice & {
  products?: Pick<Product, 'id' | 'name' | 'unit' | 'barcode'> | null
  stores?: Pick<Store, 'id' | 'chain' | 'name'> | null
}

const STATUS_OPTIONS = [
  { value: '', label: 'Alle statuser' },
  { value: 'approved', label: 'Godkjent' },
  { value: 'pending', label: 'Avventer' },
  { value: 'rejected', label: 'Avvist' },
] as const

export function StorePrices() {
  const [activeSubPage, setActiveSubPage] = useState<'matrix' | 'settings' | 'approvals'>('matrix')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [prices, setPrices] = useState<PriceRow[]>([])
  const [stores, setStores] = useState<Store[]>([])
  const [products, setProducts] = useState<Product[]>([])

  const [filterSearch, setFilterSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [selectedStoreIds, setSelectedStoreIds] = useState<string[]>([])

  const [editing, setEditing] = useState<PriceRow | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [historyRows, setHistoryRows] = useState<PriceRow[]>([])
  const [historyProfilesByUserId, setHistoryProfilesByUserId] = useState<
    Record<string, { first_name: string; last_name: string; email: string | null }>
  >({})
  const [historyTitle, setHistoryTitle] = useState('')
  const [showHistory, setShowHistory] = useState(false)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [form, setForm] = useState({
    product_id: '',
    store_id: '',
    price_amount: '',
    recorded_at: new Date().toISOString().slice(0, 10),
    approval_status: 'approved' as 'pending' | 'approved' | 'rejected',
  })

  useEffect(() => {
    void load()
  }, [])

  async function load() {
    setLoading(true)
    setError(null)

    const [pricesRes, storesRes, productsRes] = await Promise.all([
      supabase
        .from('product_prices')
        .select(
          'id, product_id, store_id, user_id, price_amount, recorded_at, approval_status, approved_by, approved_at, products(id,name,unit,barcode), stores(id,chain,name)'
        )
        .order('recorded_at', { ascending: false }),
      supabase
        .from('stores')
        .select('id, chain, name, address, latitude, longitude, logo_url, created_at, updated_at')
        .order('chain'),
      supabase
        .from('products')
        .select(
          'id, name, supplier, manufacturer, unit, unit_price_amount, is_weight_item, category_id, image_url, barcode, approval_status, submitted_by, submitted_at, approved_by, approved_at, created_at, updated_at'
        )
        .order('name'),
    ])

    if (pricesRes.error || storesRes.error || productsRes.error) {
      setError(
        pricesRes.error?.message ??
          storesRes.error?.message ??
          productsRes.error?.message ??
          'Kunne ikke hente priser.'
      )
      setPrices([])
      setStores([])
      setProducts([])
      setLoading(false)
      return
    }

    setPrices((pricesRes.data as unknown as PriceRow[]) ?? [])
    setStores((storesRes.data as Store[]) ?? [])
    setProducts((productsRes.data as Product[]) ?? [])
    setLoading(false)
  }

  const selectedStores = useMemo(
    () => stores.filter((s) => selectedStoreIds.includes(s.id)),
    [stores, selectedStoreIds]
  )

  const filteredProducts = useMemo(() => {
    const q = filterSearch.trim().toLowerCase()
    if (!q) return products
    return products.filter((p) =>
      `${p.name} ${p.barcode ?? ''} ${p.supplier} ${p.manufacturer}`.toLowerCase().includes(q)
    )
  }, [products, filterSearch])

  const latestPriceByProductAndStore = useMemo(() => {
    const map = new Map<string, PriceRow>()
    const filtered = prices
      .filter((p) => !filterStatus || p.approval_status === filterStatus)
      .sort((a, b) => {
        const ta = new Date(a.recorded_at).getTime()
        const tb = new Date(b.recorded_at).getTime()
        if (tb !== ta) return tb - ta
        return b.id.localeCompare(a.id)
      })

    for (const row of filtered) {
      const key = `${row.product_id}::${row.store_id}`
      if (!map.has(key)) map.set(key, row)
    }
    return map
  }, [prices, filterStatus])

  function openCreate() {
    setEditing(null)
    setForm({
      product_id: '',
      store_id: '',
      price_amount: '',
      recorded_at: new Date().toISOString().slice(0, 10),
      approval_status: 'approved',
    })
    setShowForm(true)
    setError(null)
  }

  function openEdit(row: PriceRow) {
    setEditing(row)
    setForm({
      product_id: row.product_id,
      store_id: row.store_id,
      price_amount: String(row.price_amount),
      recorded_at: row.recorded_at ? row.recorded_at.slice(0, 10) : new Date().toISOString().slice(0, 10),
      approval_status: row.approval_status,
    })
    setShowForm(true)
    setError(null)
  }

  function closeForm() {
    setShowForm(false)
    setEditing(null)
    setError(null)
  }

  async function saveForm(ev: React.FormEvent) {
    ev.preventDefault()
    const amount = parseFloat(form.price_amount.replace(',', '.'))
    if (!form.product_id || !form.store_id) {
      setError('Velg både produkt og butikk.')
      return
    }
    if (!Number.isFinite(amount) || amount < 0) {
      setError('Pris må være et tall større enn eller lik 0.')
      return
    }

    setSaving(true)
    setError(null)
    if (editing) {
      const { error: e } = await supabase
        .from('product_prices')
        .update({
          product_id: form.product_id,
          store_id: form.store_id,
          price_amount: amount,
          recorded_at: new Date(form.recorded_at).toISOString(),
          approval_status: form.approval_status,
        })
        .eq('id', editing.id)
      setSaving(false)
      if (e) {
        setError(e.message)
        return
      }
    } else {
      const { data: auth } = await supabase.auth.getUser()
      const userId = auth.user?.id ?? null
      const { error: e } = await supabase.from('product_prices').insert({
        product_id: form.product_id,
        store_id: form.store_id,
        user_id: userId,
        price_amount: amount,
        recorded_at: new Date(form.recorded_at).toISOString(),
        approval_status: form.approval_status,
      })
      setSaving(false)
      if (e) {
        setError(e.message)
        return
      }
    }

    closeForm()
    await load()
  }

  async function deletePrice(row: PriceRow) {
    if (
      !confirm(
        'Slette nyeste prisregistrering? Forrige registrerte pris for samme produkt/butikk blir da vist i matrisen.'
      )
    )
      return
    setSaving(true)
    setError(null)
    const { error: e } = await supabase.from('product_prices').delete().eq('id', row.id)
    setSaving(false)
    if (e) {
      setError(e.message)
      return
    }
    await load()
  }

  async function deleteAllHistoryForPair(row: PriceRow) {
    if (
      !confirm(
        'Slette ALLE historiske priser for dette produktet i valgt butikk? Dette kan ikke angres.'
      )
    )
      return
    setSaving(true)
    setError(null)
    const { error: e } = await supabase
      .from('product_prices')
      .delete()
      .eq('product_id', row.product_id)
      .eq('store_id', row.store_id)
    setSaving(false)
    if (e) {
      setError(e.message)
      return
    }
    closeForm()
    await load()
  }

  function toggleStore(storeId: string) {
    setSelectedStoreIds((prev) =>
      prev.includes(storeId) ? prev.filter((id) => id !== storeId) : [...prev, storeId]
    )
  }

  function openFromMatrix(productId: string, storeId: string) {
    const existing = latestPriceByProductAndStore.get(`${productId}::${storeId}`)
    if (existing) {
      openEdit(existing)
      return
    }
    setEditing(null)
    setForm({
      product_id: productId,
      store_id: storeId,
      price_amount: '',
      recorded_at: new Date().toISOString().slice(0, 10),
      approval_status: 'approved',
    })
    setShowForm(true)
    setError(null)
  }

  async function openHistory(product: Product, store: Store) {
    setShowHistory(true)
    setHistoryLoading(true)
    setHistoryTitle(`${product.name} - ${store.chain}${store.name ? ` - ${store.name}` : ''}`)
    setHistoryRows([])
    setHistoryProfilesByUserId({})
    setError(null)

    const { data, error: e } = await supabase
      .from('product_prices')
      .select(
        'id, product_id, store_id, user_id, price_amount, recorded_at, approval_status, approved_by, approved_at, products(id,name,unit,barcode), stores(id,chain,name)'
      )
      .eq('product_id', product.id)
      .eq('store_id', store.id)
      .order('recorded_at', { ascending: false })

    if (e) {
      setError(e.message)
      setHistoryLoading(false)
      return
    }

    const rows = (data as unknown as PriceRow[]) ?? []
    setHistoryRows(rows)

    const userIds = [...new Set(rows.map((r) => r.user_id).filter(Boolean))]
    const approverIds = [...new Set(rows.map((r) => r.approved_by).filter(Boolean))] as string[]
    const profileIds = [...new Set([...userIds, ...approverIds])]
    if (profileIds.length > 0) {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, first_name, last_name, email')
        .in('id', profileIds)
      const map: Record<string, { first_name: string; last_name: string; email: string | null }> = {}
      ;(profiles ?? []).forEach((p: any) => {
        map[p.id] = {
          first_name: p.first_name ?? '',
          last_name: p.last_name ?? '',
          email: p.email ?? null,
        }
      })
      setHistoryProfilesByUserId(map)
    }

    setHistoryLoading(false)
  }

  const editingProductUnit =
    editing?.products?.unit ?? products.find((p) => p.id === form.product_id)?.unit ?? 'enhet'

  const subTabs = (
    <div className="products-subtabs" role="tablist" aria-label="Butikkpriser undersider">
      <button
        type="button"
        role="tab"
        aria-selected={activeSubPage === 'matrix'}
        className={activeSubPage === 'matrix' ? 'active' : ''}
        onClick={() => setActiveSubPage('matrix')}
      >
        Prismatrise
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={activeSubPage === 'settings'}
        className={activeSubPage === 'settings' ? 'active' : ''}
        onClick={() => setActiveSubPage('settings')}
      >
        Prisinnstillinger
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={activeSubPage === 'approvals'}
        className={activeSubPage === 'approvals' ? 'active' : ''}
        onClick={() => setActiveSubPage('approvals')}
      >
        Priser til godkjenning
      </button>
    </div>
  )

  if (activeSubPage === 'settings') {
    return (
      <div className="products-page">
        <div className="products-page-header">
          <div>
            <h2 className="section-title">Butikkpriser</h2>
            <p className="section-desc">Administrer prismatrise, innstillinger og godkjenninger.</p>
          </div>
        </div>
        {subTabs}
        <PriceSettings />
      </div>
    )
  }

  if (activeSubPage === 'approvals') {
    return (
      <div className="products-page">
        <div className="products-page-header">
          <div>
            <h2 className="section-title">Butikkpriser</h2>
            <p className="section-desc">Administrer prismatrise, innstillinger og godkjenninger.</p>
          </div>
        </div>
        {subTabs}
        <PriceApprovals />
      </div>
    )
  }

  return (
    <div className="products-page">
      <div className="products-page-header">
        <div>
          <h2 className="section-title">Butikkpriser</h2>
          <p className="section-desc">Nyeste priser per produkt og butikk vises i matriseform (kr per enhet).</p>
        </div>
        <button type="button" className="btn-corner btn-categories" onClick={openCreate}>
          Legg til pris
        </button>
      </div>
      {subTabs}

      {error ? <p className="error">{error}</p> : null}

      <div className="products-filters">
        <input
          type="search"
          className="filter-search"
          placeholder="Søk produkter (navn, strekkode, leverandør)…"
          value={filterSearch}
          onChange={(e) => setFilterSearch(e.target.value)}
        />
        <select className="filter-category" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
          {STATUS_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <p className="loading">Henter butikkpriser…</p>
      ) : (
        <>
          <div className="card" style={{ maxWidth: '100%', padding: 16, marginBottom: 16 }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10, marginBottom: 10 }}>
              <strong>Butikker i matrise</strong>
              <span style={{ fontSize: 13, opacity: 0.8 }}>({selectedStoreIds.length} valgt)</span>
              <button
                type="button"
                className="btn-page"
                onClick={() => setSelectedStoreIds(stores.map((s) => s.id))}
                disabled={stores.length === 0}
              >
                Velg alle
              </button>
              <button
                type="button"
                className="btn-page"
                onClick={() => setSelectedStoreIds([])}
                disabled={selectedStoreIds.length === 0}
              >
                Fjern alle
              </button>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {stores.map((s) => {
                const selected = selectedStoreIds.includes(s.id)
                return (
                  <button
                    key={s.id}
                    type="button"
                    className="btn-page"
                    onClick={() => toggleStore(s.id)}
                    style={{
                      borderColor: selected ? 'var(--accent)' : undefined,
                      background: selected ? 'rgba(37, 99, 235, 0.08)' : undefined,
                    }}
                    title={selected ? 'Fjern butikk fra matrise' : 'Legg butikk i matrise'}
                  >
                    {s.chain}
                    {s.name ? ` - ${s.name}` : ''}
                  </button>
                )
              })}
            </div>
          </div>

          {selectedStores.length === 0 ? (
            <p className="empty">Velg minst én butikk for å vise pris-matrisen.</p>
          ) : filteredProducts.length === 0 ? (
            <p className="empty">Ingen produkter matcher søket.</p>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Produkt</th>
                    {selectedStores.map((store) => (
                      <th key={store.id}>
                        {store.chain}
                        {store.name ? ` - ${store.name}` : ''}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredProducts.map((product) => (
                    <tr key={product.id}>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          {product.image_url ? (
                            <img src={product.image_url} alt="" className="product-thumb" />
                          ) : (
                            <div className="product-thumb product-thumb-placeholder" aria-hidden />
                          )}
                          <div>
                            <strong>{product.name}</strong>
                            <div style={{ fontSize: 12, opacity: 0.85 }}>
                              {product.unit}
                              {product.barcode ? ` · ${product.barcode}` : ''}
                            </div>
                          </div>
                        </div>
                      </td>
                      {selectedStores.map((store) => {
                        const key = `${product.id}::${store.id}`
                        const row = latestPriceByProductAndStore.get(key)
                        const amount =
                          row == null
                            ? null
                            : typeof row.price_amount === 'number'
                              ? row.price_amount
                              : parseFloat(row.price_amount)
                        const amountText =
                          amount == null || !Number.isFinite(amount)
                            ? '—'
                            : `${amount.toFixed(2)} kr/${product.unit}`
                        const dateText = row?.recorded_at
                          ? new Date(row.recorded_at).toLocaleDateString('nb-NO')
                          : ''
                        return (
                          <td key={store.id}>
                            <div style={{ display: 'flex', gap: 6, alignItems: 'stretch' }}>
                              <button
                                type="button"
                                className="btn-page"
                                style={{ flex: 1, textAlign: 'left' }}
                                onClick={() => openFromMatrix(product.id, store.id)}
                                title={
                                  row
                                    ? `Nyeste pris fra ${dateText}. Klikk for å redigere.`
                                    : 'Ingen pris registrert. Klikk for å legge til.'
                                }
                              >
                                <div>{amountText}</div>
                                <div style={{ fontSize: 12, opacity: 0.75 }}>
                                  {row ? `Oppdatert ${dateText}` : 'Legg til pris'}
                                </div>
                              </button>
                              <button
                                type="button"
                                className="btn-page"
                                style={{
                                  width: 34,
                                  minWidth: 34,
                                  padding: '0 8px',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  fontSize: 16,
                                  lineHeight: 1,
                                }}
                                onClick={() => void openHistory(product, store)}
                                title="Vis full historikk for dette produktet i denne butikken"
                                aria-label="Vis prishistorikk"
                              >
                                <span aria-hidden>🕘</span>
                              </button>
                            </div>
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {showForm ? (
        <div className="category-panel-overlay" onClick={closeForm} aria-hidden="true">
          <div className="category-panel product-edit-panel" onClick={(e) => e.stopPropagation()}>
            <div className="category-panel-header">
              <h3>{editing ? 'Rediger pris' : 'Legg til pris'}</h3>
              <button type="button" className="btn-close-panel" onClick={closeForm}>
                Lukk
              </button>
            </div>
            <div className="category-panel-body">
              <form onSubmit={saveForm} className="product-form">
                <label>
                  Produkt
                  {editing ? (
                    <input type="text" value={editing.products?.name ?? 'Ukjent produkt'} readOnly />
                  ) : (
                    <select
                      value={form.product_id}
                      onChange={(e) => setForm((f) => ({ ...f, product_id: e.target.value }))}
                      required
                    >
                      <option value="">Velg produkt</option>
                      {products.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  )}
                </label>
                <label>
                  Butikk
                  {editing ? (
                    <input
                      type="text"
                      value={`${editing.stores?.chain ?? 'Ukjent kjede'}${editing.stores?.name ? ` - ${editing.stores.name}` : ''}`}
                      readOnly
                    />
                  ) : (
                    <select
                      value={form.store_id}
                      onChange={(e) => setForm((f) => ({ ...f, store_id: e.target.value }))}
                      required
                    >
                      <option value="">Velg butikk</option>
                      {stores.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.chain}
                          {s.name ? ` - ${s.name}` : ''}
                        </option>
                      ))}
                    </select>
                  )}
                </label>
                <label>
                  Pris per {editingProductUnit}
                  <input
                    type="text"
                    value={form.price_amount}
                    onChange={(e) => setForm((f) => ({ ...f, price_amount: e.target.value }))}
                    placeholder={`f.eks. 49.90 kr/${editingProductUnit}`}
                    required
                  />
                </label>
                <label>
                  Dato
                  <input
                    type="date"
                    value={form.recorded_at}
                    onChange={(e) => setForm((f) => ({ ...f, recorded_at: e.target.value }))}
                    required
                  />
                </label>
                <label>
                  Status
                  <select
                    value={form.approval_status}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        approval_status: e.target.value as 'pending' | 'approved' | 'rejected',
                      }))
                    }
                  >
                    <option value="approved">Godkjent</option>
                    <option value="pending">Avventer</option>
                    <option value="rejected">Avvist</option>
                  </select>
                </label>

                <div className="form-actions">
                  <button type="submit" disabled={saving}>
                    {saving ? 'Lagrer…' : editing ? 'Lagre endringer' : 'Legg til pris'}
                  </button>
                  {editing ? (
                    <>
                      <p style={{ margin: '6px 0 2px', fontSize: 13, color: 'var(--text)', width: '100%' }}>
                        Slett nyeste: fjerner bare denne raden og viser forrige pris i matrisen. Slett all historikk:
                        fjerner alle priser for dette produktet i denne butikken.
                      </p>
                      <button
                        type="button"
                        className="btn-delete"
                        onClick={() => void deletePrice(editing)}
                        disabled={saving}
                        title="Slett kun den nyeste registrerte prisen"
                      >
                        Slett nyeste pris
                      </button>
                      <button
                        type="button"
                        className="btn-delete"
                        onClick={() => void deleteAllHistoryForPair(editing)}
                        disabled={saving}
                        title="Slett alle historiske priser for produktet i denne butikken"
                      >
                        Slett all historikk
                      </button>
                    </>
                  ) : null}
                  <button type="button" className="btn-cancel" onClick={closeForm} disabled={saving}>
                    Avbryt
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      ) : null}

      {showHistory ? (
        <div className="category-panel-overlay" onClick={() => setShowHistory(false)} aria-hidden="true">
          <div className="category-panel" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Prishistorikk">
            <div className="category-panel-header">
              <h3>Prishistorikk</h3>
              <button type="button" className="btn-close-panel" onClick={() => setShowHistory(false)}>
                Lukk
              </button>
            </div>
            <div className="category-panel-body">
              <p className="section-desc" style={{ marginBottom: 12 }}>
                {historyTitle}
              </p>
              {historyLoading ? (
                <p className="loading">Henter historikk…</p>
              ) : historyRows.length === 0 ? (
                <p className="empty">Ingen historiske priser funnet.</p>
              ) : (
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Pris</th>
                        <th>Dato</th>
                        <th>Status</th>
                        <th>Lagt til av</th>
                        <th>Godkjent av</th>
                      </tr>
                    </thead>
                    <tbody>
                      {historyRows.map((r) => {
                        const amount =
                          typeof r.price_amount === 'number' ? r.price_amount : parseFloat(r.price_amount)
                        const unit = r.products?.unit ?? 'enhet'
                        const who = historyProfilesByUserId[r.user_id]
                        const whoText = who
                          ? `${who.first_name} ${who.last_name}${who.email ? ` (${who.email})` : ''}`
                          : r.user_id
                        const approver = r.approved_by ? historyProfilesByUserId[r.approved_by] : null
                        const approverText = !r.approved_by
                          ? '-'
                          : approver
                            ? `${approver.first_name} ${approver.last_name}${approver.email ? ` (${approver.email})` : ''}`
                            : r.approved_by
                        const statusText =
                          r.approval_status === 'approved'
                            ? 'Godkjent'
                            : r.approval_status === 'rejected'
                              ? 'Avvist'
                              : 'Avventer'
                        return (
                          <tr key={r.id}>
                            <td>
                              {Number.isFinite(amount)
                                ? `${amount.toFixed(2)} kr/${unit}`
                                : `${r.price_amount} kr/${unit}`}
                            </td>
                            <td>{r.recorded_at ? new Date(r.recorded_at).toLocaleDateString('nb-NO') : '-'}</td>
                            <td>{statusText}</td>
                            <td>{whoText}</td>
                            <td>{approverText}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

