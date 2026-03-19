import { useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Product, ProductCategory } from '../types/database'

export function ProductApprovals() {
  const [categories, setCategories] = useState<ProductCategory[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [search, setSearch] = useState('')

  const [editingProduct, setEditingProduct] = useState<Product | null>(null)
  const [showProductPanel, setShowProductPanel] = useState(false)
  const [saving, setSaving] = useState(false)
  const [productForm, setProductForm] = useState({
    name: '',
    supplier: '',
    manufacturer: '',
    unit: '',
    unit_price_amount: '',
    is_weight_item: false,
    category_id: '' as string,
    image_url: '',
    barcode: '',
  })
  const productNameInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    void load()
  }, [])

  async function load() {
    setLoading(true)
    setError(null)
    const [{ data: cats, error: catErr }, { data: prods, error: prodErr }] = await Promise.all([
      supabase.from('product_categories').select('id, name, created_at, updated_at').order('name'),
      supabase
        .from('products')
        .select(
          'id, name, supplier, manufacturer, unit, unit_price_amount, is_weight_item, category_id, image_url, barcode, approval_status, submitted_by, submitted_at, approved_by, approved_at, created_at, updated_at'
        )
        .eq('approval_status', 'pending')
        .order('submitted_at', { ascending: true }),
    ])

    if (catErr || prodErr) {
      setCategories([])
      setProducts([])
      setError((catErr ?? prodErr)?.message ?? 'Kunne ikke hente data.')
      setLoading(false)
      return
    }

    setCategories((cats ?? []) as ProductCategory[])
    setProducts((prods ?? []) as Product[])
    setLoading(false)
  }

  const categoryById = useMemo(() => {
    const map = new Map<string, ProductCategory>()
    categories.forEach((c) => map.set(c.id, c))
    return map
  }, [categories])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return products
    return products.filter((p) => {
      const hay = `${p.name} ${p.supplier} ${p.manufacturer} ${p.barcode ?? ''}`.toLowerCase()
      return hay.includes(q)
    })
  }, [products, search])

  async function decide(p: Product, nextStatus: 'approved' | 'rejected') {
    setSubmitting(true)
    setError(null)
    try {
      const { data: auth } = await supabase.auth.getUser()
      const adminId = auth.user?.id ?? null
      const { error: err } = await supabase
        .from('products')
        .update({
          approval_status: nextStatus,
          approved_by: adminId,
          approved_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', p.id)
      if (err) {
        setError(err.message)
        return
      }
      await load()
    } finally {
      setSubmitting(false)
    }
  }

  function openEdit(p: Product) {
    setEditingProduct(p)
    setProductForm({
      name: p.name ?? '',
      supplier: p.supplier ?? '',
      manufacturer: p.manufacturer ?? '',
      unit: p.unit ?? '',
      unit_price_amount: String(p.unit_price_amount ?? ''),
      is_weight_item: !!p.is_weight_item,
      category_id: p.category_id ?? '',
      image_url: p.image_url ?? '',
      barcode: p.barcode ?? '',
    })
    setShowProductPanel(true)
    setError(null)
    setTimeout(() => productNameInputRef.current?.focus(), 0)
  }

  function closeEdit() {
    setEditingProduct(null)
    setShowProductPanel(false)
    setSaving(false)
    setProductForm({
      name: '',
      supplier: '',
      manufacturer: '',
      unit: '',
      unit_price_amount: '',
      is_weight_item: false,
      category_id: '',
      image_url: '',
      barcode: '',
    })
    setError(null)
  }

  async function saveEdits() {
    if (!editingProduct) return false
    const name = productForm.name.trim()
    if (!name) {
      setError('Skriv inn produktnavn.')
      return false
    }
    const amount = parseFloat(productForm.unit_price_amount.replace(',', '.'))
    if (Number.isNaN(amount) || amount < 0) {
      setError('Mengde må være et tall ≥ 0.')
      return false
    }
    setSaving(true)
    setError(null)
    const optimisticUpdatedAt = new Date().toISOString()
    const nextLocal: Product = {
      ...editingProduct,
      name,
      supplier: productForm.supplier.trim() || 'Diverse',
      manufacturer: productForm.manufacturer.trim() || 'Diverse',
      unit: productForm.unit.trim() || 'stk',
      unit_price_amount: amount as any,
      is_weight_item: !!productForm.is_weight_item,
      category_id: productForm.category_id || null,
      image_url: productForm.image_url.trim() || null,
      barcode: productForm.barcode.trim() || null,
      updated_at: optimisticUpdatedAt,
    }
    // Oppdater UI umiddelbart
    setProducts((prev) => prev.map((row) => (row.id === editingProduct.id ? nextLocal : row)))
    setEditingProduct(nextLocal)
    const { error: err } = await supabase
      .from('products')
      .update({
        name,
        supplier: productForm.supplier.trim() || 'Diverse',
        manufacturer: productForm.manufacturer.trim() || 'Diverse',
        unit: productForm.unit.trim() || 'stk',
        unit_price_amount: amount,
        is_weight_item: !!productForm.is_weight_item,
        category_id: productForm.category_id || null,
        image_url: productForm.image_url.trim() || null,
        barcode: productForm.barcode.trim() || null,
        updated_at: optimisticUpdatedAt,
      })
      .eq('id', editingProduct.id)
    setSaving(false)
    if (err) {
      setError(err.message)
      // Re-sync hvis DB feiler (tilbake til server state)
      void load()
      return false
    }
    // Re-sync i bakgrunnen for å sikre korrekt data
    void load()
    return true
  }

  async function saveAndApprove() {
    if (!editingProduct) return
    const ok = await saveEdits()
    if (!ok) return
    await decide(editingProduct, 'approved')
    closeEdit()
  }

  return (
    <div className="products-page">
      <div className="products-page-header">
        <div>
          <h2 className="section-title">Godkjenning</h2>
          <p className="section-desc">Produkter sendt inn fra appen ligger her til godkjenning.</p>
        </div>
      </div>

      {error && <p className="error">{error}</p>}

      <div className="products-filters">
        <input
          type="search"
          className="filter-search"
          placeholder="Søk i pending (navn, leverandør, strekkode…)"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button type="button" className="btn-page" onClick={() => load()} disabled={loading || submitting}>
          Oppdater
        </button>
      </div>

      {loading ? (
        <p className="loading">Henter produkter til godkjenning…</p>
      ) : filtered.length === 0 ? (
        <p className="empty">Ingen produkter avventer godkjenning.</p>
      ) : (
        <div className="products-list">
          {filtered.map((p) => {
            const cat = p.category_id ? categoryById.get(p.category_id) ?? null : null
            return (
              <div key={p.id} className="product-row">
                {p.image_url ? (
                  <img src={p.image_url} alt="" className="product-thumb" />
                ) : (
                  <div className="product-thumb product-thumb-placeholder" aria-hidden />
                )}
                <div className="product-info">
                  <span className="product-name">
                    {p.name}{' '}
                    <span
                      className="product-status"
                      style={{
                        marginLeft: 8,
                        fontSize: 12,
                        padding: '2px 8px',
                        borderRadius: 999,
                        border: '1px solid var(--border, #e5e7eb)',
                        background: 'rgba(250, 204, 21, 0.15)',
                      }}
                      title="pending"
                    >
                      Avventer
                    </span>
                  </span>
                  <span className="product-meta">
                    {p.supplier} · {p.manufacturer} · {p.unit_price_amount} {p.unit}
                    {p.is_weight_item && ' (vekt)'}
                    {cat && ` · ${cat.name}`}
                    {p.barcode ? ` · Strekkode: ${p.barcode}` : ''}
                    {p.submitted_at ? ` · Sendt: ${new Date(p.submitted_at).toLocaleDateString('nb-NO')}` : ''}
                  </span>
                </div>
                <div className="product-row-actions">
                  <button type="button" className="btn-edit" onClick={() => openEdit(p)} disabled={submitting || saving}>
                    Rediger
                  </button>
                  <button
                    type="button"
                    className="btn-edit"
                    onClick={() => decide(p, 'approved')}
                    disabled={submitting || saving}
                    title="Godkjenn uten å redigere"
                  >
                    Godkjenn
                  </button>
                  <button
                    type="button"
                    className="btn-delete"
                    onClick={() => decide(p, 'rejected')}
                    disabled={submitting || saving}
                  >
                    Avvis
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {showProductPanel && editingProduct && (
        <div className="category-panel-overlay" onClick={closeEdit} aria-hidden="true">
          <div
            className="category-panel product-edit-panel"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-labelledby="product-approval-edit-title"
          >
            <div className="category-panel-header">
              <h3 id="product-approval-edit-title">Rediger før godkjenning</h3>
              <button type="button" className="btn-close-panel" onClick={closeEdit} aria-label="Lukk">
                Lukk
              </button>
            </div>
            <div className="category-panel-body">
              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  void saveEdits()
                }}
                className="product-form"
              >
                <label>
                  Produktnavn
                  <input
                    ref={productNameInputRef}
                    type="text"
                    value={productForm.name}
                    onChange={(e) => setProductForm((f) => ({ ...f, name: e.target.value }))}
                    required
                  />
                </label>
                <label>
                  Strekkode (unik, valgfritt)
                  <input
                    type="text"
                    value={productForm.barcode}
                    onChange={(e) => setProductForm((f) => ({ ...f, barcode: e.target.value }))}
                    placeholder="f.eks. 7038010001234"
                    inputMode="numeric"
                  />
                </label>
                <label>
                  Leverandør
                  <input
                    type="text"
                    value={productForm.supplier}
                    onChange={(e) => setProductForm((f) => ({ ...f, supplier: e.target.value }))}
                    placeholder="f.eks. Tine"
                  />
                </label>
                <label>
                  Produsent
                  <input
                    type="text"
                    value={productForm.manufacturer}
                    onChange={(e) => setProductForm((f) => ({ ...f, manufacturer: e.target.value }))}
                    placeholder="f.eks. Tine"
                  />
                </label>
                <label>
                  Enhet
                  <input
                    type="text"
                    value={productForm.unit}
                    onChange={(e) => setProductForm((f) => ({ ...f, unit: e.target.value }))}
                    placeholder="stk, kg, l"
                  />
                </label>
                <label>
                  Mengde (i forhold til enhet)
                  <input
                    type="text"
                    value={productForm.unit_price_amount}
                    onChange={(e) => setProductForm((f) => ({ ...f, unit_price_amount: e.target.value }))}
                    placeholder="f.eks. 1 for 1 kg, 0.35 for 350 g"
                  />
                </label>
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={productForm.is_weight_item}
                    onChange={(e) => setProductForm((f) => ({ ...f, is_weight_item: e.target.checked }))}
                  />
                  Vektvare (pris per kg/l osv.)
                </label>
                <label>
                  Kategori
                  <select
                    value={productForm.category_id}
                    onChange={(e) => setProductForm((f) => ({ ...f, category_id: e.target.value }))}
                  >
                    <option value="">Ingen kategori</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Bildelenke (valgfritt)
                  <input
                    type="url"
                    value={productForm.image_url}
                    onChange={(e) => setProductForm((f) => ({ ...f, image_url: e.target.value }))}
                    placeholder="https://..."
                  />
                </label>
                {error && <p className="error">{error}</p>}
                <div className="form-actions">
                  <button type="button" onClick={() => void saveAndApprove()} disabled={saving || submitting}>
                    {saving || submitting ? 'Lagrer…' : 'Lagre og godkjenn'}
                  </button>
                  <button
                    type="submit"
                    className="btn-cancel"
                    disabled={saving || submitting}
                    title="Lagre uten å godkjenne"
                  >
                    Lagre
                  </button>
                  <button type="button" className="btn-cancel" onClick={closeEdit} disabled={saving || submitting}>
                    Avbryt
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

