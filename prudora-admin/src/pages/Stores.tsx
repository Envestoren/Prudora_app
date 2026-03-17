import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Store } from '../types/database'

const CHAIN_OPTIONS = ['Rema 1000', 'Kiwi', 'Coop Extra', 'Coop Prix', 'Bunnpris', 'Meny', 'Spar', 'Joker', 'Annet']

export function Stores() {
  const [stores, setStores] = useState<Store[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [form, setForm] = useState({
    chain: '',
    name: '',
    address: '',
    latitude: '',
    longitude: '',
    logo_url: '',
  })
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [logoPreview, setLogoPreview] = useState<string | null>(null)
  const [editingStore, setEditingStore] = useState<Store | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [filterChain, setFilterChain] = useState('')
  const [filterSearch, setFilterSearch] = useState('')
  const logoInputRef = useRef<HTMLInputElement>(null)

  const filteredStores = stores.filter((s) => {
    if (filterChain && s.chain !== filterChain) return false
    if (filterSearch.trim()) {
      const q = filterSearch.trim().toLowerCase()
      return (
        s.chain.toLowerCase().includes(q) ||
        (s.name && s.name.toLowerCase().includes(q)) ||
        s.address.toLowerCase().includes(q)
      )
    }
    return true
  })

  useEffect(() => {
    loadStores()
  }, [])

  async function loadStores() {
    setLoading(true)
    setError(null)
    const { data, error: e } = await supabase
      .from('stores')
      .select('id, chain, name, address, latitude, longitude, logo_url, created_at, updated_at')
      .order('created_at', { ascending: false })
    if (e) {
      setError(e.message)
      setStores([])
    } else {
      setStores((data ?? []) as Store[])
    }
    setLoading(false)
  }

  function handleLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) {
      setLogoFile(null)
      setLogoPreview(null)
      return
    }
    if (!file.type.startsWith('image/')) {
      setError('Velg et bilde (PNG, JPG, WebP osv.).')
      setLogoFile(null)
      setLogoPreview(null)
      return
    }
    setError(null)
    setLogoFile(file)
    const url = URL.createObjectURL(file)
    setLogoPreview(url)
  }

  function startEdit(store: Store) {
    setEditingStore(store)
    setShowForm(true)
    setForm({
      chain: store.chain,
      name: store.name || '',
      address: store.address,
      latitude: String(store.latitude),
      longitude: String(store.longitude),
      logo_url: store.logo_url || '',
    })
    setLogoFile(null)
    if (store.logo_url) setLogoPreview(store.logo_url)
    else setLogoPreview(null)
    if (logoInputRef.current) logoInputRef.current.value = ''
    setError(null)
  }

  function cancelEdit() {
    setEditingStore(null)
    setShowForm(false)
    setForm({ chain: '', name: '', address: '', latitude: '', longitude: '', logo_url: '' })
    setLogoFile(null)
    if (logoPreview && logoPreview.startsWith('blob:')) URL.revokeObjectURL(logoPreview)
    setLogoPreview(null)
    if (logoInputRef.current) logoInputRef.current.value = ''
    setError(null)
  }

  async function handleDelete(store: Store) {
    const label = store.name ? `${store.chain} «${store.name}»` : store.chain
    if (!confirm(`Er du sikker på at du vil slette ${label} – ${store.address}?`)) return
    setDeletingId(store.id)
    setError(null)
    const { error: err } = await supabase.from('stores').delete().eq('id', store.id)
    if (err) setError(err.message)
    else await loadStores()
    setDeletingId(null)
  }

  async function handleSubmit(ev: React.FormEvent) {
    ev.preventDefault()
    setError(null)
    setSubmitting(true)
    const lat = parseFloat(form.latitude.replace(',', '.'))
    const lon = parseFloat(form.longitude.replace(',', '.'))
    if (Number.isNaN(lat) || Number.isNaN(lon)) {
      setError('Latitude og longitude må være tall.')
      setSubmitting(false)
      return
    }
    let logoUrl: string | null = editingStore?.logo_url ?? null
    if (logoFile) {
      const ext = logoFile.name.split('.').pop() || 'png'
      const path = `${crypto.randomUUID()}.${ext}`
      const { error: uploadErr } = await supabase.storage.from('store-logos').upload(path, logoFile, {
        cacheControl: '3600',
        upsert: false,
      })
      if (uploadErr) {
        setError(uploadErr.message ?? 'Kunne ikke laste opp logo.')
        setSubmitting(false)
        return
      }
      const { data: urlData } = supabase.storage.from('store-logos').getPublicUrl(path)
      logoUrl = urlData.publicUrl
    } else if (editingStore) {
      logoUrl = editingStore.logo_url
    }

    if (editingStore) {
      const { error: err } = await supabase
        .from('stores')
        .update({
          chain: form.chain.trim(),
          name: form.name.trim() || null,
          address: form.address.trim(),
          latitude: lat,
          longitude: lon,
          logo_url: logoUrl,
          updated_at: new Date().toISOString(),
        })
        .eq('id', editingStore.id)
      if (err) {
        setError(err.message ?? 'Kunne ikke oppdatere butikk.')
      } else {
        cancelEdit()
        await loadStores()
      }
    } else {
      const { error: err } = await supabase.from('stores').insert({
        chain: form.chain.trim(),
        name: form.name.trim() || null,
        address: form.address.trim(),
        latitude: lat,
        longitude: lon,
        logo_url: logoUrl,
      })
      if (err) {
        setError(err.message ?? 'Kunne ikke legge til butikk.')
      } else {
        setForm((f) => ({ ...f, name: '', address: '', latitude: '', longitude: '', logo_url: '' }))
        setLogoFile(null)
        if (logoPreview && logoPreview.startsWith('blob:')) URL.revokeObjectURL(logoPreview)
        setLogoPreview(null)
        if (logoInputRef.current) logoInputRef.current.value = ''
        setShowForm(false)
        await loadStores()
      }
    }
    setSubmitting(false)
  }

  return (
    <div className="stores-page">
      <h2 className="section-title">Butikker</h2>

      <div className="stores-toolbar">
        <div className="stores-filters">
          <select
            value={filterChain}
            onChange={(e) => setFilterChain(e.target.value)}
            className="filter-select"
            aria-label="Filtrer på kjede"
          >
            <option value="">Alle kjedene</option>
            {CHAIN_OPTIONS.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <input
            type="search"
            value={filterSearch}
            onChange={(e) => setFilterSearch(e.target.value)}
            placeholder="Søk adresse eller kjede…"
            className="filter-search"
            aria-label="Søk butikker"
          />
        </div>
        <button
          type="button"
          className="btn-add-store"
          onClick={() => setShowForm(true)}
          disabled={!!editingStore || showForm}
        >
          Legg til butikk
        </button>
      </div>

      {(showForm || editingStore) && (
      <div className="store-form-card card">
        <h3>{editingStore ? 'Rediger butikk' : 'Legg til butikk'}</h3>
        <form onSubmit={handleSubmit}>
          <label>
            Butikkjede
            <select
              value={form.chain}
              onChange={(e) => setForm((f) => ({ ...f, chain: e.target.value }))}
              required
            >
              <option value="">Velg kjede</option>
              {CHAIN_OPTIONS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <label>
            Butikknavn (valgfritt)
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="f.eks. Brekkeveien"
            />
          </label>
          <label>
            Adresse
            <input
              type="text"
              value={form.address}
              onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
              placeholder="Gateadresse 1, 0123 Oslo"
              required
            />
          </label>
          <div className="form-row">
            <label>
              Latitude
              <input
                type="text"
                value={form.latitude}
                onChange={(e) => setForm((f) => ({ ...f, latitude: e.target.value }))}
                placeholder="59.9139"
                required
              />
            </label>
            <label>
              Longitude
              <input
                type="text"
                value={form.longitude}
                onChange={(e) => setForm((f) => ({ ...f, longitude: e.target.value }))}
                placeholder="10.7522"
                required
              />
            </label>
          </div>
          <div className="file-label">
            <span className="file-label-text">Logo (bilde fra PC)</span>
            <span className="file-input-wrap">
              <input
                ref={logoInputRef}
                type="file"
                accept="image/*"
                onChange={handleLogoChange}
                className="file-input"
              />
              <span className="file-input-btn">Velg fil</span>
            </span>
            {logoPreview && (
              <div className="logo-preview">
                <img src={logoPreview} alt="Forhåndsvisning" />
                <span>
                  {editingStore
                    ? 'Velg et nytt bilde for å erstatte logoen, eller behold den nåværende.'
                    : 'Valgt bilde vil lastes opp når du legger til butikken.'}
                </span>
              </div>
            )}
          </div>
          {error && <p className="error">{error}</p>}
          <div className="form-actions">
            <button type="submit" disabled={submitting}>
              {submitting
                ? editingStore
                  ? 'Lagrer…'
                  : 'Legger til…'
                : editingStore
                  ? 'Lagre endringer'
                  : 'Legg til butikk'}
            </button>
            {(editingStore || showForm) && (
              <button type="button" className="btn-cancel" onClick={cancelEdit} disabled={submitting}>
                Avbryt
              </button>
            )}
          </div>
        </form>
      </div>
      )}

      {loading ? (
        <p className="loading">Henter butikker…</p>
      ) : stores.length === 0 ? (
        <p className="empty">Ingen butikker lagt til ennå. Klikk «Legg til butikk» for å legge til.</p>
      ) : (
        <>
          {filteredStores.length !== stores.length && (
            <p className="filter-info">
              Viser {filteredStores.length} av {stores.length} butikker
            </p>
          )}
          {filteredStores.length === 0 ? (
            <p className="empty">Ingen butikker passer med filteret.</p>
          ) : (
        <div className="stores-list">
          {filteredStores.map((s) => (
            <article key={s.id} className="store-row">
              {s.logo_url ? (
                <img src={s.logo_url} alt="" className="store-logo" />
              ) : (
                <span className="store-logo-placeholder">{s.chain.slice(0, 2)}</span>
              )}
              <div className="store-row-info">
                <strong>{s.name ? `${s.chain} «${s.name}»` : s.chain}</strong>
                <span className="store-address">{s.address}</span>
                <span className="store-coords">
                  {s.latitude.toFixed(5)}, {s.longitude.toFixed(5)}
                </span>
              </div>
              <div className="store-row-actions">
                <button
                  type="button"
                  className="btn-edit"
                  onClick={() => startEdit(s)}
                  disabled={!!editingStore}
                >
                  Rediger
                </button>
                <button
                  type="button"
                  className="btn-delete"
                  onClick={() => handleDelete(s)}
                  disabled={deletingId === s.id}
                >
                  {deletingId === s.id ? 'Sletter…' : 'Slett'}
                </button>
              </div>
            </article>
          ))}
        </div>
          )}
        </>
      )}
    </div>
  )
}
