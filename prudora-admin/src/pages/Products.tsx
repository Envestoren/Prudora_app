import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Product, ProductCategory } from '../types/database'
import { ProductApprovals } from './ProductApprovals'

const PAGE_SIZE_OPTIONS = [50, 100, 250, 500] as const
const STATUS_OPTIONS = [
  { value: '', label: 'Alle statuser' },
  { value: 'approved', label: 'Godkjent' },
  { value: 'rejected', label: 'Avvist' },
] as const

export function Products() {
  const [activeSection, setActiveSection] = useState<'products' | 'approvals'>('products')
  const [categories, setCategories] = useState<ProductCategory[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [pageSize, setPageSize] = useState(100)
  const [page, setPage] = useState(1)
  const [totalCount, setTotalCount] = useState<number | null>(null)
  const [productsLoading, setProductsLoading] = useState(true)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [showCategoryForm, setShowCategoryForm] = useState(false)
  const [editingCategory, setEditingCategory] = useState<ProductCategory | null>(null)
  const [categoryName, setCategoryName] = useState('')
  const [showCategoryPanel, setShowCategoryPanel] = useState(false)
  const [filterCategoryId, setFilterCategoryId] = useState<string>('')
  const [filterSearch, setFilterSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState<string>('')
  const [editingProduct, setEditingProduct] = useState<Product | null>(null)
  const [showProductPanel, setShowProductPanel] = useState(false)
  const [deletingProductId, setDeletingProductId] = useState<string | null>(null)
  const [imageUploading, setImageUploading] = useState(false)
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
    approval_status: 'approved' as 'pending' | 'approved' | 'rejected',
  })
  const nameInputRef = useRef<HTMLInputElement>(null)
  const productNameInputRef = useRef<HTMLInputElement>(null)

  const filteredProducts = products.filter((p) => {
    if (filterCategoryId && p.category_id !== filterCategoryId) return false
    if (filterStatus && p.approval_status !== filterStatus) return false
    if (filterSearch.trim()) {
      const q = filterSearch.trim().toLowerCase()
      return (
        p.name.toLowerCase().includes(q) ||
        p.supplier.toLowerCase().includes(q) ||
        p.manufacturer.toLowerCase().includes(q)
      )
    }
    return true
  })

  useEffect(() => {
    loadCategories()
  }, [])

  useEffect(() => {
    loadProducts()
  }, [pageSize, page])

  async function loadCategories() {
    setLoading(true)
    setError(null)
    const { data, error: e } = await supabase
      .from('product_categories')
      .select('id, name, created_at, updated_at')
      .order('name')
    if (e) {
      setError(e.message)
      setCategories([])
    } else {
      setCategories((data ?? []) as ProductCategory[])
    }
    setLoading(false)
  }

  async function loadProducts() {
    setProductsLoading(true)
    setError(null)
    const from = (page - 1) * pageSize
    const to = page * pageSize - 1
    const { data, error: e, count } = await supabase
      .from('products')
      .select('id, name, supplier, manufacturer, unit, unit_price_amount, is_weight_item, category_id, image_url, barcode, approval_status, submitted_by, submitted_at, approved_by, approved_at, created_at, updated_at', { count: 'exact' })
      .neq('approval_status', 'pending')
      .order('name')
      .range(from, to)
    if (e) {
      setError(e.message)
      setProducts([])
      setTotalCount(null)
    } else {
      setProducts((data ?? []) as Product[])
      setTotalCount(count ?? null)
    }
    setProductsLoading(false)
  }

  const totalPages = totalCount != null ? Math.max(1, Math.ceil(totalCount / pageSize)) : null
  const hasNextPage = totalPages != null ? page < totalPages : (products.length === pageSize)
  const hasPrevPage = page > 1

  function openAddCategory() {
    setEditingCategory(null)
    setCategoryName('')
    setShowCategoryForm(true)
    setError(null)
    setTimeout(() => nameInputRef.current?.focus(), 0)
  }

  function openEditCategory(cat: ProductCategory) {
    setEditingCategory(cat)
    setCategoryName(cat.name)
    setShowCategoryForm(true)
    setError(null)
    setTimeout(() => nameInputRef.current?.focus(), 0)
  }

  function cancelCategoryForm() {
    setShowCategoryForm(false)
    setEditingCategory(null)
    setCategoryName('')
    setError(null)
  }

  async function handleSaveCategory(ev: React.FormEvent) {
    ev.preventDefault()
    const name = categoryName.trim()
    if (!name) {
      setError('Skriv inn et kategorinavn.')
      return
    }
    setError(null)
    setSubmitting(true)
    if (editingCategory) {
      const { error: err } = await supabase
        .from('product_categories')
        .update({ name, updated_at: new Date().toISOString() })
        .eq('id', editingCategory.id)
      if (err) setError(err.message)
      else {
        cancelCategoryForm()
        await loadCategories()
      }
    } else {
      const { error: err } = await supabase
        .from('product_categories')
        .insert({ name })
      if (err) setError(err.message)
      else {
        cancelCategoryForm()
        await loadCategories()
      }
    }
    setSubmitting(false)
  }

  async function handleDeleteCategory(cat: ProductCategory) {
    if (!confirm(`Er du sikker på at du vil slette kategorien «${cat.name}»?`)) return
    setDeletingId(cat.id)
    setError(null)
    const { error: err } = await supabase.from('product_categories').delete().eq('id', cat.id)
    if (err) setError(err.message)
    else await loadCategories()
    setDeletingId(null)
  }

  function openEditProduct(p: Product) {
    setEditingProduct(p)
    setProductForm({
      name: p.name,
      supplier: p.supplier,
      manufacturer: p.manufacturer,
      unit: p.unit,
      unit_price_amount: String(p.unit_price_amount),
      is_weight_item: p.is_weight_item,
      category_id: p.category_id ?? '',
      image_url: p.image_url ?? '',
      barcode: p.barcode ?? '',
      approval_status: p.approval_status ?? 'approved',
    })
    setShowProductPanel(true)
    setError(null)
    setTimeout(() => productNameInputRef.current?.focus(), 0)
  }

  async function handleProductImageChange(ev: React.ChangeEvent<HTMLInputElement>) {
    const file = ev.target.files?.[0]
    if (!file || !editingProduct) return

    setError(null)
    setImageUploading(true)

    try {
      const ext = file.name.split('.').pop() || 'jpg'
      const path = `products/${editingProduct.id}/${Date.now()}.${ext}`

      const { error: uploadError } = await supabase.storage
        .from('product-images')
        .upload(path, file, {
          cacheControl: '3600',
          upsert: true,
        })

      if (uploadError) {
        setError(uploadError.message)
        return
      }

      const { data: publicUrlData } = supabase.storage
        .from('product-images')
        .getPublicUrl(path)

      const publicUrl = publicUrlData?.publicUrl
      if (!publicUrl) {
        setError('Kunne ikke hente offentlig URL for bildet.')
        return
      }

      setProductForm((f) => ({
        ...f,
        image_url: publicUrl,
      }))
    } catch (e: any) {
      setError(e?.message ?? 'Noe gikk galt ved opplasting av bildet.')
    } finally {
      setImageUploading(false)
      // Allow selecting same file again if needed
      ev.target.value = ''
    }
  }

  function cancelProductForm() {
    setEditingProduct(null)
    setShowProductPanel(false)
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
      approval_status: 'approved',
    })
    setError(null)
  }

  async function handleSaveProduct(ev: React.FormEvent) {
    ev.preventDefault()
    if (!editingProduct) return
    const name = productForm.name.trim()
    if (!name) {
      setError('Skriv inn produktnavn.')
      return
    }
    const amount = parseFloat(productForm.unit_price_amount.replace(',', '.'))
    if (Number.isNaN(amount) || amount < 0) {
      setError('Mengde må være et tall ≥ 0.')
      return
    }
    setError(null)
    setSubmitting(true)
    const optimisticUpdatedAt = new Date().toISOString()
    const nextLocal: Product = {
      ...editingProduct,
      name,
      supplier: productForm.supplier.trim() || 'Diverse',
      manufacturer: productForm.manufacturer.trim() || 'Diverse',
      unit: productForm.unit.trim() || 'stk',
      unit_price_amount: amount as any,
      is_weight_item: productForm.is_weight_item,
      category_id: productForm.category_id || null,
      image_url: productForm.image_url.trim() || null,
      barcode: productForm.barcode.trim() || null,
      approval_status: productForm.approval_status,
      updated_at: optimisticUpdatedAt,
    }
    // Oppdater UI umiddelbart
    setProducts((prev) => prev.map((row) => (row.id === editingProduct.id ? nextLocal : row)))
    const { error: err } = await supabase
      .from('products')
      .update({
        name,
        supplier: productForm.supplier.trim() || 'Diverse',
        manufacturer: productForm.manufacturer.trim() || 'Diverse',
        unit: productForm.unit.trim() || 'stk',
        unit_price_amount: amount,
        is_weight_item: productForm.is_weight_item,
        category_id: productForm.category_id || null,
        image_url: productForm.image_url.trim() || null,
        barcode: productForm.barcode.trim() || null,
        approval_status: productForm.approval_status,
        updated_at: optimisticUpdatedAt,
      })
      .eq('id', editingProduct.id)
    if (err) setError(err.message)
    else {
      cancelProductForm()
      // Re-sync i bakgrunnen (UI er allerede oppdatert)
      void loadProducts()
    }
    setSubmitting(false)
  }

  async function handleDeleteProduct(p: Product) {
    if (!confirm(`Er du sikker på at du vil slette produktet «${p.name}»?`)) return
    setDeletingProductId(p.id)
    setError(null)
    const { error: err } = await supabase.from('products').delete().eq('id', p.id)
    if (err) setError(err.message)
    else await loadProducts()
    setDeletingProductId(null)
  }

  const sectionTabs = (
    <div className="products-subtabs" role="tablist" aria-label="Produktsider">
      <button
        type="button"
        role="tab"
        aria-selected={activeSection === 'products'}
        className={activeSection === 'products' ? 'active' : ''}
        onClick={() => setActiveSection('products')}
      >
        Produkter
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={activeSection === 'approvals'}
        className={activeSection === 'approvals' ? 'active' : ''}
        onClick={() => setActiveSection('approvals')}
      >
        Godkjenning
      </button>
    </div>
  )

  if (activeSection === 'approvals') {
    return (
      <div className="products-page">
        <div className="products-page-header">
          <div>
            <h2 className="section-title">Produkter</h2>
            <p className="section-desc">Administrer produkter og godkjenninger.</p>
          </div>
        </div>
        {sectionTabs}
        <ProductApprovals />
      </div>
    )
  }

  return (
    <div className="products-page">
      <div className="products-page-header">
        <div>
          <h2 className="section-title">Produkter</h2>
          <p className="section-desc">Her kan du legge til matprodukter. Definer kategorier først via knappen til høyre.</p>
        </div>
        <button
          type="button"
          className="btn-corner btn-categories"
          onClick={() => setShowCategoryPanel(true)}
        >
          Kategorier
        </button>
      </div>
      {sectionTabs}

      {error && <p className="error">{error}</p>}

      <div className="products-filters">
        <input
          type="search"
          className="filter-search"
          placeholder="Søk på navn, leverandør, produsent…"
          value={filterSearch}
          onChange={(e) => setFilterSearch(e.target.value)}
        />
        <select
          className="filter-category"
          value={filterStatus}
          onChange={(e) => {
            setFilterStatus(e.target.value)
          }}
          aria-label="Statusfilter"
        >
          {STATUS_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
        <select
          className="filter-category"
          value={filterCategoryId}
          onChange={(e) => setFilterCategoryId(e.target.value)}
        >
          <option value="">Alle kategorier</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        <div className="products-page-size">
          <span className="page-size-label">Vis:</span>
          <select
            className="filter-page-size"
            value={pageSize}
            onChange={(e) => {
              setPageSize(Number(e.target.value))
              setPage(1)
            }}
            aria-label="Antall produkter per side"
          >
            {PAGE_SIZE_OPTIONS.map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </div>
      </div>

      {productsLoading ? (
        <p className="loading">Henter produkter…</p>
      ) : filteredProducts.length === 0 ? (
        <p className="empty">
          {products.length === 0
            ? 'Ingen produkter i databasen ennå.'
            : 'Ingen produkter matcher filteret.'}
        </p>
      ) : (
        <>
          <div className="products-list">
            {filteredProducts.map((p) => {
              const cat = p.category_id ? categories.find((c) => c.id === p.category_id) : null
              const statusLabel =
                p.approval_status === 'pending'
                  ? 'Avventer'
                  : p.approval_status === 'rejected'
                    ? 'Avvist'
                    : 'Godkjent'
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
                          background:
                            p.approval_status === 'pending'
                              ? 'rgba(250, 204, 21, 0.15)'
                              : p.approval_status === 'rejected'
                                ? 'rgba(239, 68, 68, 0.12)'
                                : 'rgba(34, 197, 94, 0.12)',
                        }}
                        title={p.approval_status}
                      >
                        {statusLabel}
                      </span>
                    </span>
                    <span className="product-meta">
                      {p.supplier} · {p.manufacturer} · {p.unit_price_amount} {p.unit}
                      {p.is_weight_item && ' (vekt)'}
                      {cat && ` · ${cat.name}`}
                      {p.barcode ? ` · Strekkode: ${p.barcode}` : ''}
                    </span>
                  </div>
                  <div className="product-row-actions">
                    <button
                      type="button"
                      className="btn-edit"
                      onClick={() => openEditProduct(p)}
                    >
                      Rediger
                    </button>
                    <button
                      type="button"
                      className="btn-delete"
                      onClick={() => handleDeleteProduct(p)}
                      disabled={deletingProductId === p.id}
                    >
                      {deletingProductId === p.id ? 'Sletter…' : 'Slett'}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
          {(hasPrevPage || hasNextPage) && (
            <div className="products-pagination">
              <button
                type="button"
                className="btn-page btn-prev"
                disabled={!hasPrevPage}
                onClick={() => setPage((p) => p - 1)}
              >
                Forrige side
              </button>
              <span className="products-page-info">
                Side {page}{totalPages != null ? ` av ${totalPages}` : ''}
              </span>
              <button
                type="button"
                className="btn-page btn-next"
                disabled={!hasNextPage}
                onClick={() => setPage((p) => p + 1)}
              >
                Neste side
              </button>
            </div>
          )}
        </>
      )}

      {showCategoryPanel && (
        <div className="category-panel-overlay" onClick={() => setShowCategoryPanel(false)} aria-hidden="true">
          <div
            className="category-panel"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-labelledby="category-panel-title"
          >
            <div className="category-panel-header">
              <h3 id="category-panel-title">Kategorisystem</h3>
              <button
                type="button"
                className="btn-close-panel"
                onClick={() => setShowCategoryPanel(false)}
                aria-label="Lukk"
              >
                Lukk
              </button>
            </div>
            <div className="category-panel-body">
              <div className="categories-header">
                <span className="categories-heading">Kategorier</span>
                <button
                  type="button"
                  className="btn-add"
                  onClick={openAddCategory}
                  disabled={!!editingCategory}
                >
                  Legg til kategori
                </button>
              </div>

              {showCategoryForm && (
                <div className="card category-form-card">
                  <h4>{editingCategory ? 'Rediger kategori' : 'Ny kategori'}</h4>
                  <form onSubmit={handleSaveCategory}>
                    <label>
                      Kategorinavn
                      <input
                        ref={nameInputRef}
                        type="text"
                        value={categoryName}
                        onChange={(e) => setCategoryName(e.target.value)}
                        placeholder="f.eks. Meieri, Brød"
                      />
                    </label>
                    {error && <p className="error">{error}</p>}
                    <div className="form-actions">
                      <button type="submit" disabled={submitting}>
                        {submitting ? 'Lagrer…' : editingCategory ? 'Lagre' : 'Legg til'}
                      </button>
                      <button type="button" className="btn-cancel" onClick={cancelCategoryForm} disabled={submitting}>
                        Avbryt
                      </button>
                    </div>
                  </form>
                </div>
              )}

              {loading ? (
                <p className="loading">Henter kategorier…</p>
              ) : categories.length === 0 ? (
                <p className="empty">
                  Ingen kategorier ennå. Klikk «Legg til kategori» for å definere kategorier.
                </p>
              ) : (
                <div className="categories-list">
                  {categories.map((cat) => (
                    <div key={cat.id} className="category-row">
                      <span className="category-name">{cat.name}</span>
                      <div className="category-row-actions">
                        <button
                          type="button"
                          className="btn-edit"
                          onClick={() => openEditCategory(cat)}
                          disabled={!!editingCategory}
                        >
                          Rediger
                        </button>
                        <button
                          type="button"
                          className="btn-delete"
                          onClick={() => handleDeleteCategory(cat)}
                          disabled={deletingId === cat.id}
                        >
                          {deletingId === cat.id ? 'Sletter…' : 'Slett'}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {showProductPanel && editingProduct && (
        <div className="category-panel-overlay" onClick={cancelProductForm} aria-hidden="true">
          <div
            className="category-panel product-edit-panel"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-labelledby="product-edit-title"
          >
            <div className="category-panel-header">
              <h3 id="product-edit-title">Rediger produkt</h3>
              <button
                type="button"
                className="btn-close-panel"
                onClick={cancelProductForm}
                aria-label="Lukk"
              >
                Lukk
              </button>
            </div>
            <div className="category-panel-body">
              <form onSubmit={handleSaveProduct} className="product-form">
                <label>
                  Produktnavn
                  <input
                    ref={productNameInputRef}
                    type="text"
                    value={productForm.name}
                    onChange={(e) => setProductForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder="f.eks. Melk 1 l"
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
                  Status
                  <select
                    value={productForm.approval_status}
                    onChange={(e) =>
                      setProductForm((f) => ({
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
                  Produktbilde (valgfritt)
                  <div className="product-image-field">
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleProductImageChange}
                      disabled={imageUploading || submitting}
                    />
                    {imageUploading && <span className="product-image-uploading">Laster opp…</span>}
                  </div>
                  <small>Velg et bilde fra PC-en. Når det er lastet opp, lagres lenken automatisk.</small>
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
                  <button type="submit" disabled={submitting}>
                    {submitting ? 'Lagrer…' : 'Lagre'}
                  </button>
                  <button type="button" className="btn-cancel" onClick={cancelProductForm} disabled={submitting}>
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
