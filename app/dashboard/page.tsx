'use client'
import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createBrowserClient } from '@supabase/ssr'
import {
  Subscription, Kenmerk, PriceHistory,
  CATS, CAT_KENMERKEN, PAYMENT_METHODS, fmt,
  effectiveMonthlyEUR, effectiveMonthlyEURForDate,
  daysUntil, logoUrl, defaultKenmerken, toMonthly
} from '@/lib/types'

// ── Helpers ──────────────────────────────────────────────────
const CAT_NAMES = Object.keys(CATS)
const USD_RATE = 1.08

function toMonthlyEUR(s: Subscription): number {
  return effectiveMonthlyEUR(s)
}

// ── Types for UI state ────────────────────────────────────────
type Panel = 'beheer' | 'overzicht' | 'prognose' | 'inzichten' | 'delen'
type AddStep = 'upload' | 'manual' | 'review'

interface ExtractedContract {
  naam?: string
  prijs?: number
  cyclus?: string
  verlengdatum?: string
  samenvatting?: string
  kenmerken?: { key: string; value: string }[]
}

// ── Main Component ────────────────────────────────────────────
export default function Dashboard() {
  const router = useRouter()
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  const [subs, setSubs] = useState<Subscription[]>([])
  const [loading, setLoading] = useState(true)
  const [panel, setPanel] = useState<Panel>('beheer')
  const [activeCat, setActiveCat] = useState(CAT_NAMES[0])
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const [openAccordions, setOpenAccordions] = useState<Set<string>>(new Set())

  // Add modal state
  const [addOpen, setAddOpen] = useState(false)
  const [addStep, setAddStep] = useState<AddStep>('upload')
  const [addPrefill, setAddPrefill] = useState<Partial<Subscription> | null>(null)
  const [addExtracted, setAddExtracted] = useState<ExtractedContract | null>(null)
  const [addLoading, setAddLoading] = useState(false)
  const [addError, setAddError] = useState('')

  // Overstap modal
  const [overstapOpen, setOverstapOpen] = useState(false)
  const [overstapSub, setOverstapSub] = useState<Subscription | null>(null)
  const [overstapStep, setOverstapStep] = useState(1)
  const [overstapData, setOverstapData] = useState({ opzegDatum: '', nieuweNaam: '', nieuwePrijs: '', nieuweCyclus: 'maand', })

  // AI upload for existing sub
  const [aiUploadSub, setAiUploadSub] = useState<Subscription | null>(null)
  const [aiLoading, setAiLoading] = useState(false)

  // ── Auth ────────────────────────────────────────────────────
  useEffect(() => {
    const checkAuth = async () => {
      const { data } = await supabase.auth.getSession()
      if (!data.session) router.replace('/login')
    }
    checkAuth()
  }, [])

  // ── Data fetching ───────────────────────────────────────────
  const fetchSubs = useCallback(async () => {
    const res = await fetch('/api/subscriptions')
    if (res.status === 401) { router.replace('/login'); return }
    const data = await res.json()
    setSubs(data || [])
    setLoading(false)
  }, [])

  useEffect(() => { fetchSubs() }, [fetchSubs])

  // ── CRUD helpers ────────────────────────────────────────────
  async function saveSub(sub: Subscription) {
    const method = sub.id ? 'PATCH' : 'POST'
    await fetch('/api/subscriptions', {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(sub),
    })
    fetchSubs()
  }

  async function deleteSub(id: string) {
    await fetch(`/api/subscriptions?id=${id}`, { method: 'DELETE' })
    fetchSubs()
  }

  async function updateField(sub: Subscription, fields: Partial<Subscription>) {
    await fetch('/api/subscriptions', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: sub.id, ...fields }),
    })
    fetchSubs()
  }

  // ── Accordion helpers ───────────────────────────────────────
  function toggleAccordion(id: string) {
    setOpenAccordions(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function openAccordion(id: string) {
    setOpenAccordions(prev => new Set([...prev, id]))
  }

  // ── Add modal ───────────────────────────────────────────────
  function openAddModal(prefill?: Partial<Subscription>) {
    setAddPrefill(prefill || null)
    setAddStep('upload')
    setAddExtracted(null)
    setAddError('')
    setAddOpen(true)
  }

  async function handleFileForAdd(file: File) {
    setAddLoading(true)
    setAddError('')
    try {
      const base64 = await fileToBase64(file)
      const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg'
      const mimeMap: Record<string, string> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp', pdf: 'application/pdf' }
      const mediaType = file.type || mimeMap[ext] || 'image/jpeg'

      const res = await fetch('/api/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ base64, mediaType, subName: addPrefill?.name, cat: addPrefill?.cat || activeCat }),
      })
      if (!res.ok) throw new Error((await res.json()).error || 'Fout bij AI analyse')
      const extracted: ExtractedContract = await res.json()
      setAddExtracted(extracted)
      setAddStep('review')
    } catch (e) {
      setAddError(e instanceof Error ? e.message : 'Onbekende fout')
    }
    setAddLoading(false)
  }

  async function confirmAdd(data: any) {
    const cat = data.cat || addPrefill?.cat || activeCat
    let kenmerken = data.kenmerken || []
    if (!kenmerken.length) kenmerken = defaultKenmerken(cat)

    await saveSub({
      name: data.name || '',
      price: data.price || 0,
      price_currency: data.price_currency || '€',
      cycle: (data.cycle || 'maand') as 'maand' | 'kwartaal' | 'jaar',
      renew_date: data.renew_date || '',
      cat,
      payment_method: data.payment_method || '',
      domain: addPrefill?.domain || '',
      status: 'actief',
      kenmerken,
      price_history: [],
    })
    setAddOpen(false)
  }

  // ── AI upload for existing sub ───────────────────────────────
  async function handleAiUpload(sub: Subscription, file: File) {
    setAiLoading(true)
    setAiUploadSub(sub)
    try {
      const base64 = await fileToBase64(file)
      const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg'
      const mimeMap: Record<string, string> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp', pdf: 'application/pdf' }
      const mediaType = file.type || mimeMap[ext] || 'image/jpeg'

      const res = await fetch('/api/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ base64, mediaType, subName: sub.name, cat: sub.cat }),
      })
      const extracted: ExtractedContract = await res.json()

      // Apply extracted data to sub
      const updates: Partial<Subscription> = {}
      if (extracted.naam) updates.name = extracted.naam
      if (extracted.prijs) updates.price = extracted.prijs
      if (extracted.cyclus) updates.cycle = extracted.cyclus as Subscription['cycle']
      if (extracted.verlengdatum) updates.renew_date = extracted.verlengdatum

      // Merge kenmerken
      const existing = sub.kenmerken || []
      const aiKenm = extracted.kenmerken || []
      const merged = [...aiKenm.map(k => ({ key: k.key, value: k.value }))]
      defaultKenmerken(sub.cat).forEach(d => {
        if (!merged.some(m => m.key.toLowerCase() === d.key.toLowerCase())) merged.push(d)
      })
      updates.kenmerken = merged

      await updateField(sub, updates)
    } catch (e) {
      console.error(e)
    }
    setAiLoading(false)
    setAiUploadSub(null)
  }

  // ── Overstap wizard ──────────────────────────────────────────
  async function confirmOverstap() {
    if (!overstapSub) return
    const newSub: Subscription = {
      name: overstapData.nieuweNaam || 'Nieuwe aanbieder',
      price: parseFloat(overstapData.nieuwePrijs) || 0,
      price_currency: overstapSub.price_currency,
      cycle: overstapData.nieuweCyclus as Subscription['cycle'],
      renew_date: '',
      cat: overstapSub.cat,
      payment_method: overstapSub.payment_method,
      domain: '',
      status: 'actief',
      predecessor_id: overstapSub.id,
      kenmerken: defaultKenmerken(overstapSub.cat),
      price_history: [],
    }
    const res = await fetch('/api/subscriptions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newSub),
    })
    const created = await res.json()

    await updateField(overstapSub, {
      status: 'opgezegd',
      renew_date: overstapData.opzegDatum || overstapSub.renew_date,
      successor_id: created.id,
    })

    setOverstapOpen(false)
    fetchSubs()
  }

  // ── Prognose ─────────────────────────────────────────────────
  function buildPrognose() {
    const now = new Date()
    const months = []
    for (let i = 0; i < 36; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1)
      const activeSubs = subs.filter(s => {
        if (s.status === 'opgezegd') {
          if (!s.renew_date) return false
          return d <= new Date(s.renew_date)
        }
        return true
      })
      const total = activeSubs.reduce((t, s) => t + effectiveMonthlyEURForDate(s, d), 0)

      const events: { name: string; detail: string; delta: number }[] = []
      subs.filter(s => s.status !== 'opgezegd').forEach(s => {
        ;(s.price_history || []).forEach(ph => {
          if (!ph.valid_from) return
          const phd = new Date(ph.valid_from)
          if (phd.getFullYear() === d.getFullYear() && phd.getMonth() === d.getMonth()) {
            const prev = parseFloat(String(s.price)) || 0
            const delta = (ph.price - prev) / (s.cycle === 'jaar' ? 12 : s.cycle === 'kwartaal' ? 3 : 1)
            events.push({ name: s.name, detail: `→ ${fmt(ph.price)}/${s.cycle}${ph.note ? ' · ' + ph.note : ''}`, delta })
          }
        })
      })

      months.push({
        yr: d.getFullYear(), mo: d.getMonth(), total, events,
        label: d.toLocaleDateString('nl-NL', { month: 'short', year: '2-digit' }),
        date: d,
      })
    }
    return months
  }

  // ── Totals ────────────────────────────────────────────────────
  const activeSubs = subs.filter(s => s.status === 'actief')
  const totalMonthly = activeSubs.reduce((t, s) => t + toMonthlyEUR(s), 0)
  const totalYearly = totalMonthly * 12
  const cancelledSubs = subs.filter(s => s.status === 'opgezegd')
  const savedMonthly = cancelledSubs.reduce((t, s) => {
    if (s.successor_id) {
      const succ = subs.find(x => x.id === s.successor_id)
      return t + (toMonthlyEUR(s) - (succ ? toMonthlyEUR(succ) : 0))
    }
    return t + toMonthlyEUR(s)
  }, 0)

  // ── Render helpers ────────────────────────────────────────────
  function LogoImg({ domain, cat }: { domain: string; cat: string }) {
    const icon = CATS[cat]?.icon || '📌'
    const url = logoUrl(domain)
    if (!url) return <span style={{ fontSize: 18 }}>{icon}</span>
    return (
      <img
        src={url}
        alt=""
        width={24}
        height={24}
        style={{ borderRadius: 6, objectFit: 'contain' }}
        onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
      />
    )
  }

  // ── Logout ────────────────────────────────────────────────────
  async function handleLogout() {
    await (supabase as any).auth.signOut()
    router.replace('/login')
  }

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: '#71717A' }}>
      Laden…
    </div>
  )

  // ── JSX ───────────────────────────────────────────────────────
  return (
    <div className="app-container">

      {/* NAV */}
      <nav className="nav">
        <div className="nav-tabs">
          {(['beheer', 'overzicht', 'prognose', 'inzichten', 'delen'] as Panel[]).map(p => (
            <button key={p} className={`tab${panel === p ? ' active' : ''}`} onClick={() => setPanel(p)}>
              {p === 'beheer' ? 'Abonnementen' : p === 'prognose' ? 'Prognose 36m' : p.charAt(0).toUpperCase() + p.slice(1)}
            </button>
          ))}
        </div>
      </nav>

      {/* ── BEHEER ── */}
      {panel === 'beheer' && (
        <div className="panel">
          {/* Totals */}
          <div className="totals">
            <div className="total-card"><div className="lbl">Per maand</div><div className="val">{fmt(totalMonthly)}</div></div>
            <div className="total-card"><div className="lbl">Per jaar</div><div className="val">{fmt(totalYearly)}</div></div>
            {savedMonthly > 0 && <div className="total-card"><div className="lbl">Bespaard</div><div className="val" style={{ color: 'var(--green)' }}>{fmt(savedMonthly)}/mnd</div></div>}
          </div>

          {/* Category pills */}
          <div className="cat-pills">
            {CAT_NAMES.map(c => (
              <button key={c} className={`cat-pill${activeCat === c ? ' active' : ''}`} onClick={() => setActiveCat(c)}>
                {CATS[c].icon} {c}
              </button>
            ))}
          </div>

          {/* Quick add suggestions */}
          {CATS[activeCat]?.items.length > 0 && (
            <div className="suggestions-grid">
              {CATS[activeCat].items.map(item => {
                const exists = subs.some(s => s.name.toLowerCase() === item.name.toLowerCase())
                return (
                  <button key={item.name}
                    className={`suggestion-chip${exists ? ' active' : ''}`}
                    onClick={() => openAddModal({ name: item.name, price: item.price, cycle: item.cycle, domain: item.domain, cat: activeCat })}>
                    {item.name}
                  </button>
                )
              })}
            </div>
          )}

          {/* Sub list */}
          <div className="section-lbl">Mijn abonnementen <button className="logout-btn" onClick={handleLogout}>Uitloggen</button></div>
          <div className="sub-list">
            {subs.map(s => {
              const isExpanded = s.id ? expandedIds.has(s.id) : false
              const days = daysUntil(s.renew_date)
              const monthly = toMonthlyEUR(s)

              return (
                <div key={s.id}>
                  {/* Collapsed row */}
                  <div
                    className={`sub-row-collapsed${s.status === 'opgezegd' ? ' cancelled' : ''}${isExpanded ? ' expanded' : ''}`}
                    onClick={() => s.id && setExpandedIds(prev => { const n = new Set(prev); n.has(s.id!) ? n.delete(s.id!) : n.add(s.id!); return n })}
                  >
                    <div className="sub-row-logo">
                      <LogoImg domain={s.domain} cat={s.cat} />
                    </div>
                    <span className="sub-row-name">{s.name || '(geen naam)'}</span>
                    <div className="sub-row-meta">
                      <span className="sub-row-price">{fmt(monthly)}/mnd</span>
                      <span className="sub-row-cycle">{s.cycle}</span>
                      {s.status === 'opgezegd'
                        ? <span className="badge badge-cancelled">Opgezegd</span>
                        : days !== null && days <= 7
                          ? <span className="badge badge-soon">over {days}d</span>
                          : days !== null && days <= 30
                            ? <span className="badge badge-ok">over {days}d</span>
                            : null}
                    </div>
                    <span className={`expand-chevron${isExpanded ? ' open' : ''}`}>▶</span>
                    <button className="sub-del-sm" onClick={e => { e.stopPropagation(); if (s.id) deleteSub(s.id) }}>✕</button>
                  </div>

                  {/* Expanded detail */}
                  {isExpanded && s.id && (
                    <div className="sub-detail">
                      {/* Name + AI button */}
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10 }}>
                        <input className="sub-name-edit" style={{ flex: 1, marginBottom: 0 }}
                          defaultValue={s.name}
                          onBlur={e => updateField(s, { name: e.target.value })} />
                        <label style={{ flexShrink: 0 }}>
                          <input type="file" accept=".pdf,image/*" style={{ display: 'none' }}
                            onChange={e => e.target.files?.[0] && handleAiUpload(s, e.target.files[0])} />
                          <span className="ai-upload-btn" style={{ cursor: 'pointer' }}>
                            {aiLoading && aiUploadSub?.id === s.id ? '⏳' : '🤖 AI'}
                          </span>
                        </label>
                      </div>

                      {/* Core fields */}
                      <div className="sub-fields">
                        <div className="field-group">
                          <div className="field-label">Prijs</div>
                          <div className="price-row">
                            <select className="cur-select-small" defaultValue={s.price_currency}
                              onChange={e => updateField(s, { price_currency: e.target.value as '€' | '$' })}>
                              <option>€</option><option>$</option>
                            </select>
                            <input className="field-input" type="number" defaultValue={s.price as number} min={0} step={0.01}
                              style={{ flex: 1, textAlign: 'right' }}
                              onBlur={e => updateField(s, { price: parseFloat(e.target.value) || 0 })} />
                          </div>
                        </div>
                        <div className="field-group">
                          <div className="field-label">Cyclus</div>
                          <select className="field-input" defaultValue={s.cycle}
                            onChange={e => updateField(s, { cycle: e.target.value as Subscription['cycle'] })}>
                            <option value="maand">maand</option>
                            <option value="kwartaal">kwartaal</option>
                            <option value="jaar">jaar</option>
                          </select>
                        </div>
                        <div className="field-group">
                          <div className="field-label">Verlengdatum</div>
                          <input className="field-input" type="date" defaultValue={s.renew_date}
                            onBlur={e => updateField(s, { renew_date: e.target.value })} />
                        </div>
                        <div className="field-group">
                          <div className="field-label">Betaling</div>
                          <select className="field-input" defaultValue={s.payment_method}
                            onChange={e => updateField(s, { payment_method: e.target.value })}>
                            <option value="">— kies —</option>
                            {PAYMENT_METHODS.map(m => <option key={m}>{m}</option>)}
                          </select>
                        </div>
                        <div className="field-group">
                          <div className="field-label">Categorie</div>
                          <select className="field-input" defaultValue={s.cat}
                            onChange={e => {
                              const newCat = e.target.value
                              const hasValues = (s.kenmerken || []).some(k => k.value)
                              updateField(s, {
                                cat: newCat,
                                ...(!hasValues ? { kenmerken: defaultKenmerken(newCat) } : {}),
                              })
                            }}>
                            {CAT_NAMES.map(c => <option key={c} value={c}>{CATS[c].icon} {c}</option>)}
                          </select>
                        </div>

                        {/* Status trio */}
                        <div className="field-group">
                          <div className="field-label">Status</div>
                          <div className="status-trio">
                            <button className={`status-btn${s.status === 'actief' ? ' active green' : ''}`}
                              onClick={() => updateField(s, { status: 'actief' })}>✓ Actief</button>
                            <button className={`status-btn${overstapSub?.id === s.id ? ' active blue' : ''}`}
                              onClick={() => { setOverstapSub(s); setOverstapStep(1); setOverstapData({ opzegDatum: '', nieuweNaam: '', nieuwePrijs: String(s.price), nieuweCyclus: s.cycle }); setOverstapOpen(true) }}>
                              🔄 Overstappen
                            </button>
                            <button className={`status-btn${s.status === 'opgezegd' ? ' active red' : ''}`}
                              onClick={() => updateField(s, { status: 'opgezegd' })}>✕ Opgezegd</button>
                          </div>
                          {s.predecessor_id && <div style={{ fontSize: 11, color: '#7C3AED', marginTop: 5 }}>
                            ↩ Opvolger van {subs.find(x => x.id === s.predecessor_id)?.name}
                          </div>}
                          {s.status === 'opgezegd' && s.successor_id && (() => {
                            const succ = subs.find(x => x.id === s.successor_id)
                            const net = toMonthlyEUR(s) - (succ ? toMonthlyEUR(succ) : 0)
                            return <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 5 }}>
                              Vervangen door <strong>{succ?.name}</strong> · netto {net > 0 ? 'besparing' : 'meerkosten'}: <span style={{ color: net > 0 ? 'var(--green)' : 'var(--red)' }}>{fmt(Math.abs(net))}/mnd</span>
                            </div>
                          })()}
                          {s.status === 'opgezegd' && !s.successor_id && <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 5 }}>Telt niet mee in totalen</div>}
                        </div>
                      </div>

                      {/* Kenmerken accordion */}
                      <AccordionSection
                        id={`kenm-${s.id}`}
                        label="📋 Kenmerken"
                        badge={(s.kenmerken || []).filter(k => k.value).length || (s.kenmerken || []).length || 0}
                        open={openAccordions.has(`kenm-${s.id}`)}
                        onToggle={() => {
                          if (!openAccordions.has(`kenm-${s.id}`)) {
                            // Auto-populate defaults if no values filled in
                            const hasValues = (s.kenmerken || []).some(k => k.value)
                            if (!hasValues) {
                              const merged = [...(s.kenmerken || [])]
                              defaultKenmerken(s.cat).forEach(d => {
                                if (!merged.some(m => m.key.toLowerCase() === d.key.toLowerCase())) merged.push(d)
                              })
                              updateField(s, { kenmerken: merged })
                            }
                          }
                          toggleAccordion(`kenm-${s.id}`)
                        }}
                      >
                        {(s.kenmerken || []).map((kv, ki) => (
                          <div key={ki} className="kenmerk-row">
                            <input className="kenmerk-key" type="text" defaultValue={kv.key} placeholder="Kenmerk"
                              onBlur={e => {
                                const updated = [...(s.kenmerken || [])]
                                updated[ki] = { ...updated[ki], key: e.target.value }
                                updateField(s, { kenmerken: updated })
                              }} />
                            <input className="kenmerk-val" type="text" defaultValue={kv.value} placeholder="Waarde"
                              onBlur={e => {
                                const updated = [...(s.kenmerken || [])]
                                updated[ki] = { ...updated[ki], value: e.target.value }
                                updateField(s, { kenmerken: updated })
                              }} />
                            <button className="kenmerk-del" onClick={() => {
                              const updated = (s.kenmerken || []).filter((_, j) => j !== ki)
                              updateField(s, { kenmerken: updated })
                              openAccordion(`kenm-${s.id}`)
                            }}>✕</button>
                          </div>
                        ))}
                        <button className="kenmerk-add-btn" onClick={() => {
                          const updated = [...(s.kenmerken || []), { key: '', value: '' }]
                          updateField(s, { kenmerken: updated })
                          openAccordion(`kenm-${s.id}`)
                        }}>+ Kenmerk toevoegen</button>
                      </AccordionSection>

                      {/* Prijswijzigingen accordion */}
                      <AccordionSection
                        id={`prijs-${s.id}`}
                        label="📈 Prijswijzigingen"
                        badge={(s.price_history || []).length}
                        open={openAccordions.has(`prijs-${s.id}`)}
                        onToggle={() => toggleAccordion(`prijs-${s.id}`)}
                      >
                        <div className="prijshist-current">
                          Nu: <strong>{s.price_currency} {parseFloat(String(s.price)).toFixed(2).replace('.', ',')} / {s.cycle}</strong>
                        </div>
                        {(s.price_history || [])
                          .sort((a, b) => a.valid_from.localeCompare(b.valid_from))
                          .map((ph, pi) => (
                            <div key={pi} className="prijshist-row">
                              <input className="prijshist-input" type="date" defaultValue={ph.valid_from}
                                onBlur={e => {
                                  const updated = [...(s.price_history || [])]
                                  updated[pi] = { ...updated[pi], valid_from: e.target.value }
                                  updateField(s, { price_history: updated })
                                }} />
                              <input className="prijshist-input" type="number" defaultValue={ph.price} min={0} step={0.01}
                                onBlur={e => {
                                  const updated = [...(s.price_history || [])]
                                  updated[pi] = { ...updated[pi], price: parseFloat(e.target.value) || 0 }
                                  updateField(s, { price_history: updated })
                                }} />
                              <input className="prijshist-note" type="text" defaultValue={ph.note || ''} placeholder="Notitie"
                                onBlur={e => {
                                  const updated = [...(s.price_history || [])]
                                  updated[pi] = { ...updated[pi], note: e.target.value }
                                  updateField(s, { price_history: updated })
                                }} />
                              <button className="prijshist-del" onClick={() => {
                                const updated = (s.price_history || []).filter((_, j) => j !== pi)
                                updateField(s, { price_history: updated })
                                openAccordion(`prijs-${s.id}`)
                              }}>✕</button>
                            </div>
                          ))}
                        <button className="prijshist-add" onClick={() => {
                          const updated = [...(s.price_history || []), { price: parseFloat(String(s.price)) || 0, valid_from: '', note: '' }]
                          updateField(s, { price_history: updated })
                          openAccordion(`prijs-${s.id}`)
                        }}>+ Geplande verhoging</button>
                      </AccordionSection>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
          <button className="add-btn" onClick={() => openAddModal()}>+ Abonnement toevoegen</button>
        </div>
      )}

      {/* ── PROGNOSE ── */}
      {panel === 'prognose' && (
        <div className="panel">
          <PrognosePanel subs={subs} />
        </div>
      )}

      {/* ── OVERZICHT ── */}
      {panel === 'overzicht' && (
        <div className="panel">
          <div className="totals">
            <div className="total-card"><div className="lbl">Per maand</div><div className="val">{fmt(totalMonthly)}</div></div>
            <div className="total-card"><div className="lbl">Per jaar</div><div className="val">{fmt(totalYearly)}</div></div>
          </div>
          <div className="section-lbl">Per categorie</div>
          {CAT_NAMES.filter(c => subs.some(s => s.cat === c && s.status === 'actief')).map(c => {
            const catSubs = subs.filter(s => s.cat === c && s.status === 'actief')
            const catTotal = catSubs.reduce((t, s) => t + toMonthlyEUR(s), 0)
            return (
              <div key={c} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', marginBottom: 6, fontSize: 13 }}>
                <span>{CATS[c].icon} {c} <span style={{ color: 'var(--muted)' }}>({catSubs.length})</span></span>
                <span style={{ fontFamily: 'monospace', fontWeight: 500 }}>{fmt(catTotal)}/mnd</span>
              </div>
            )
          })}
        </div>
      )}

      {/* ── INZICHTEN ── */}
      {panel === 'inzichten' && (
        <div className="panel">
          <InzichtenPanel subs={subs} />
        </div>
      )}

      {/* ── DELEN ── */}
      {panel === 'delen' && (
        <div className="panel">
          <div style={{ padding: '20px 0', fontSize: 14, color: 'var(--muted)' }}>
            Gezinsdeling komt binnenkort. Je kunt je partner uitnodigen via een gezinscode zodat jullie samen één overzicht hebben.
          </div>
        </div>
      )}

      {/* ── ADD MODAL ── */}
      {addOpen && (
        <div className="add-modal-overlay" onClick={e => e.target === e.currentTarget && setAddOpen(false)}>
          <div className="add-modal">
            <div className="add-modal-header">
              <span className="add-modal-title">{addPrefill?.name ? `${addPrefill.name} toevoegen` : 'Abonnement toevoegen'}</span>
              <button className="ai-modal-close" onClick={() => setAddOpen(false)}>✕</button>
            </div>
            <div className="add-modal-body">
              {addStep === 'upload' && (
                <>
                  <label className="drop-zone">
                    <input type="file" accept=".pdf,image/*" style={{ display: 'none' }}
                      onChange={e => e.target.files?.[0] && handleFileForAdd(e.target.files[0])} />
                    <div className="drop-zone-icon">{addLoading ? '⏳' : '📄'}</div>
                    <div className="drop-zone-title">{addLoading ? 'Contract wordt gelezen…' : 'Sleep je contract hiernaartoe'}</div>
                    <div className="drop-zone-sub">{addLoading ? 'Even geduld' : 'of klik om te kiezen · PDF, JPG, PNG'}</div>
                  </label>
                  {addPrefill?.name && (
                    <div style={{ marginTop: 12, padding: '10px 12px', background: 'var(--blue-bg)', border: '1px solid #B3D4F5', borderRadius: 'var(--radius-sm)', fontSize: 12.5, color: 'var(--blue)' }}>
                      💡 AI herkent automatisch prijs, datum en kenmerken van <strong>{addPrefill.name}</strong>.
                    </div>
                  )}
                  {addError && <div className="ai-error" style={{ marginTop: 10 }}>{addError}</div>}
                  <div className="add-manual-link" onClick={() => setAddStep('manual')}>Liever zelf invullen →</div>
                </>
              )}

              {addStep === 'manual' && (
                <ManualAddForm
                  prefill={addPrefill}
                  activeCat={activeCat}
                  onSubmit={confirmAdd}
                  onBack={() => setAddStep('upload')}
                />
              )}

              {addStep === 'review' && addExtracted && (
                <ReviewForm
                  extracted={addExtracted}
                  prefill={addPrefill}
                  activeCat={activeCat}
                  onSubmit={confirmAdd}
                  onBack={() => setAddStep('upload')}
                />
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── OVERSTAP MODAL ── */}
      {overstapOpen && overstapSub && (
        <div className="add-modal-overlay" onClick={e => e.target === e.currentTarget && setOverstapOpen(false)}>
          <div className="add-modal">
            <div className="add-modal-header">
              <span className="add-modal-title">{overstapSub.name} · Overstappen</span>
              <button className="ai-modal-close" onClick={() => setOverstapOpen(false)}>✕</button>
            </div>
            <div className="add-modal-body">
              <div style={{ display: 'flex', justifyContent: 'center', gap: 5, marginBottom: 16 }}>
                {[1, 2, 3].map(n => <div key={n} style={{ width: 6, height: 6, borderRadius: '50%', background: n === overstapStep ? 'var(--blue)' : 'var(--border)' }} />)}
              </div>
              {overstapStep === 1 && (
                <div className="overstap-step">
                  <div className="overstap-step-title">Wanneer zeg je op?</div>
                  <div className="overstap-step-sub">Huidig: {overstapSub.name} · {fmt(toMonthlyEUR(overstapSub))}/mnd</div>
                  <div className="add-manual-field">
                    <label className="add-manual-label">Opzegdatum</label>
                    <input className="add-manual-input" type="date" value={overstapData.opzegDatum}
                      onChange={e => setOverstapData(d => ({ ...d, opzegDatum: e.target.value }))} />
                  </div>
                </div>
              )}
              {overstapStep === 2 && (
                <div className="overstap-step">
                  <div className="overstap-step-title">Wat neem je ervoor in de plaats?</div>
                  <div className="add-manual-form">
                    <div className="add-manual-field">
                      <label className="add-manual-label">Naam nieuwe aanbieder</label>
                      <input className="add-manual-input" type="text" value={overstapData.nieuweNaam} placeholder="bijv. Youfone"
                        onChange={e => setOverstapData(d => ({ ...d, nieuweNaam: e.target.value }))} />
                    </div>
                    <div className="add-manual-row">
                      <div className="add-manual-field">
                        <label className="add-manual-label">Prijs (€)</label>
                        <input className="add-manual-input" type="number" value={overstapData.nieuwePrijs} step={0.01}
                          onChange={e => setOverstapData(d => ({ ...d, nieuwePrijs: e.target.value }))} />
                      </div>
                      <div className="add-manual-field">
                        <label className="add-manual-label">Cyclus</label>
                        <select className="add-manual-input" value={overstapData.nieuweCyclus}
                          onChange={e => setOverstapData(d => ({ ...d, nieuweCyclus: e.target.value }))}>
                          <option value="maand">Per maand</option>
                          <option value="kwartaal">Per kwartaal</option>
                          <option value="jaar">Per jaar</option>
                        </select>
                      </div>
                    </div>
                  </div>
                </div>
              )}
              {overstapStep === 3 && (() => {
                const oudMnd = toMonthlyEUR(overstapSub)
                const nieuwPrijs = parseFloat(overstapData.nieuwePrijs) || 0
                let nieuwMnd = nieuwPrijs
                if (overstapData.nieuweCyclus === 'jaar') nieuwMnd /= 12
                if (overstapData.nieuweCyclus === 'kwartaal') nieuwMnd /= 3
                const netto = oudMnd - nieuwMnd
                return (
                  <div className="overstap-step">
                    <div className="overstap-step-title">Samenvatting</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <div style={{ padding: 12, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: 13 }}>
                        <div style={{ color: 'var(--muted)', fontSize: 11, marginBottom: 4 }}>OPGEZEGD</div>
                        <strong>{overstapSub.name}</strong> · {fmt(oudMnd)}/mnd
                      </div>
                      <div style={{ textAlign: 'center', fontSize: 18, color: 'var(--muted)' }}>↓</div>
                      <div style={{ padding: 12, background: 'var(--green-bg)', border: '1px solid #b5d97a', borderRadius: 'var(--radius-sm)', fontSize: 13 }}>
                        <div style={{ color: 'var(--green)', fontSize: 11, marginBottom: 4 }}>NIEUW</div>
                        <strong>{overstapData.nieuweNaam || 'Nieuwe aanbieder'}</strong> · {fmt(nieuwMnd)}/mnd
                      </div>
                      <div className={`overstap-netto${netto <= 0 ? ' cost' : ''}`}>
                        {netto > 0 ? `✓ Netto besparing: ${fmt(netto)}/mnd · ${fmt(netto * 12)}/jaar` : `⚠ Meerkosten: ${fmt(Math.abs(netto))}/mnd`}
                      </div>
                    </div>
                  </div>
                )
              })()}
            </div>
            <div className="add-modal-footer">
              <button className="add-secondary-btn" onClick={() => overstapStep > 1 ? setOverstapStep(s => s - 1) : setOverstapOpen(false)}>← Terug</button>
              <button className="add-primary-btn" onClick={() => overstapStep < 3 ? setOverstapStep(s => s + 1) : confirmOverstap()}>
                {overstapStep < 3 ? 'Volgende →' : '✓ Verwerken'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────

function AccordionSection({ id, label, badge, open, onToggle, children }: {
  id: string; label: string; badge: number; open: boolean; onToggle: () => void; children: React.ReactNode
}) {
  return (
    <div className="accordion-section">
      <button className="accordion-trigger" onClick={onToggle}>
        <span className="accordion-trigger-left">{label}</span>
        <span className="accordion-trigger-right">
          <span className={`accordion-badge${badge > 0 ? ' filled' : ''}`}>{badge > 0 ? badge : 'leeg'}</span>
          <span className={`accordion-chevron${open ? ' open' : ''}`}>▶</span>
        </span>
      </button>
      {open && <div className="accordion-body">{children}</div>}
    </div>
  )
}

function ManualAddForm({ prefill, activeCat, onSubmit, onBack }: {
  prefill: Partial<Subscription> | null
  activeCat: string
  onSubmit: (data: any) => void
  onBack: () => void
}) {
  const [cat, setCat] = useState(prefill?.cat || '')
  const [form, setForm] = useState<{name:string;price:string;cycle:string;renew_date:string;payment_method:string}>({
    name: prefill?.name || '',
    price: prefill?.price ? String(prefill.price) : '',
    cycle: prefill?.cycle || 'maand',
    renew_date: '',
    payment_method: '',
  })

  const defaults = cat ? defaultKenmerken(cat) : []
  const [kenmerkenVals, setKenmerkenVals] = useState<string[]>(defaults.map(() => ''))

  useEffect(() => {
    const d = cat ? defaultKenmerken(cat) : []
    setKenmerkenVals(d.map(() => ''))
  }, [cat])

  function handleSubmit() {
    const defaults2 = cat ? defaultKenmerken(cat) : []
    const kenmerken = defaults2.map((k, i) => ({ key: k.key, value: kenmerkenVals[i] || '' }))
    onSubmit({ ...form, price: parseFloat(form.price) || 0, cycle: form.cycle as any, cat: cat || activeCat, kenmerken })
  }

  return (
    <div className="add-manual-form">
      <div className="add-manual-field">
        <label className="add-manual-label">Naam</label>
        <input className="add-manual-input" type="text" value={form.name} placeholder="bijv. Netflix"
          onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
      </div>
      <div className="add-manual-row">
        <div className="add-manual-field">
          <label className="add-manual-label">Prijs (€)</label>
          <input className="add-manual-input" type="number" value={form.price} step={0.01} min={0}
            onChange={e => setForm(f => ({ ...f, price: e.target.value }))} />
        </div>
        <div className="add-manual-field">
          <label className="add-manual-label">Cyclus</label>
          <select className="add-manual-input" value={form.cycle} onChange={e => setForm(f => ({ ...f, cycle: e.target.value }))}>
            <option value="maand">Per maand</option>
            <option value="kwartaal">Per kwartaal</option>
            <option value="jaar">Per jaar</option>
          </select>
        </div>
      </div>
      <div className="add-manual-row">
        <div className="add-manual-field">
          <label className="add-manual-label">Verlengdatum</label>
          <input className="add-manual-input" type="date" value={form.renew_date}
            onChange={e => setForm(f => ({ ...f, renew_date: e.target.value }))} />
        </div>
        <div className="add-manual-field">
          <label className="add-manual-label">Betaalrekening</label>
          <select className="add-manual-input" value={form.payment_method} onChange={e => setForm(f => ({ ...f, payment_method: e.target.value }))}>
            <option value="">— kies —</option>
            {PAYMENT_METHODS.map(m => <option key={m}>{m}</option>)}
          </select>
        </div>
      </div>
      <div className="add-manual-field">
        <label className="add-manual-label">Categorie</label>
        <select className="add-manual-input" value={cat} onChange={e => setCat(e.target.value)}>
          <option value="">— kies een categorie —</option>
          {Object.entries(CATS).map(([c, v]) => <option key={c} value={c}>{v.icon} {c}</option>)}
        </select>
      </div>
      {defaults.length > 0 && (
        <div className="add-manual-field">
          <label className="add-manual-label">Kenmerken <span style={{ fontWeight: 400, color: 'var(--subtle)' }}>(standaard voor {cat})</span></label>
          {defaults.map((kv, ki) => (
            <div key={ki} style={{ display: 'flex', gap: 6, marginBottom: 4 }}>
              <input className="add-manual-input" style={{ width: '38%' }} type="text" value={kv.key} readOnly />
              <input className="add-manual-input" style={{ flex: 1 }} type="text" placeholder="Waarde"
                value={kenmerkenVals[ki] || ''}
                onChange={e => { const v = [...kenmerkenVals]; v[ki] = e.target.value; setKenmerkenVals(v) }} />
            </div>
          ))}
        </div>
      )}
      <div className="add-modal-footer" style={{ padding: 0, marginTop: 12 }}>
        <button className="add-secondary-btn" onClick={onBack}>← Terug</button>
        <button className="add-primary-btn" onClick={handleSubmit}>Toevoegen</button>
      </div>
    </div>
  )
}

function ReviewForm({ extracted, prefill, activeCat, onSubmit, onBack }: {
  extracted: ExtractedContract
  prefill: Partial<Subscription> | null
  activeCat: string
  onSubmit: (data: any) => void
  onBack: () => void
}) {
  const [form, setForm] = useState<{name:string;price:string;cycle:string;renew_date:string;payment_method:string}>({
    name: extracted.naam || prefill?.name || '',
    price: String(extracted.prijs ?? prefill?.price ?? ''),
    cycle: extracted.cyclus || prefill?.cycle || 'maand',
    renew_date: extracted.verlengdatum || '',
    payment_method: '',
  })
  const [kenmerken, setKenmerken] = useState<Kenmerk[]>(
    (extracted.kenmerken || []).map(k => ({ key: k.key, value: k.value }))
  )

  return (
    <div className="add-manual-form">
      {extracted.samenvatting && (
        <div className="ai-summary">💡 {extracted.samenvatting}</div>
      )}
      <div className="add-manual-field">
        <label className="add-manual-label">Naam</label>
        <input className="add-manual-input" type="text" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
      </div>
      <div className="add-manual-row">
        <div className="add-manual-field">
          <label className="add-manual-label">Prijs (€)</label>
          <input className="add-manual-input" type="number" value={form.price} step={0.01} onChange={e => setForm(f => ({ ...f, price: e.target.value }))} />
        </div>
        <div className="add-manual-field">
          <label className="add-manual-label">Cyclus</label>
          <select className="add-manual-input" value={form.cycle} onChange={e => setForm(f => ({ ...f, cycle: e.target.value }))}>
            <option value="maand">Per maand</option>
            <option value="kwartaal">Per kwartaal</option>
            <option value="jaar">Per jaar</option>
          </select>
        </div>
      </div>
      <div className="add-manual-row">
        <div className="add-manual-field">
          <label className="add-manual-label">Verlengdatum</label>
          <input className="add-manual-input" type="date" value={form.renew_date} onChange={e => setForm(f => ({ ...f, renew_date: e.target.value }))} />
        </div>
        <div className="add-manual-field">
          <label className="add-manual-label">Betaalrekening</label>
          <select className="add-manual-input" value={form.payment_method} onChange={e => setForm(f => ({ ...f, payment_method: e.target.value }))}>
            <option value="">— kies —</option>
            {PAYMENT_METHODS.map(m => <option key={m}>{m}</option>)}
          </select>
        </div>
      </div>
      {kenmerken.length > 0 && (
        <div className="add-manual-field">
          <label className="add-manual-label">Kenmerken (AI herkend)</label>
          {kenmerken.map((kv, ki) => (
            <div key={ki} style={{ display: 'flex', gap: 6, marginBottom: 4 }}>
              <input className="add-manual-input" style={{ width: '38%' }} type="text" value={kv.key}
                onChange={e => { const u = [...kenmerken]; u[ki] = { ...u[ki], key: e.target.value }; setKenmerken(u) }} />
              <input className="add-manual-input" style={{ flex: 1 }} type="text" value={kv.value}
                onChange={e => { const u = [...kenmerken]; u[ki] = { ...u[ki], value: e.target.value }; setKenmerken(u) }} />
            </div>
          ))}
        </div>
      )}
      <div className="add-modal-footer" style={{ padding: 0, marginTop: 12 }}>
        <button className="add-secondary-btn" onClick={onBack}>← Opnieuw</button>
        <button className="add-primary-btn" onClick={() => onSubmit({ ...form, price: parseFloat(form.price) || 0, cycle: form.cycle as 'maand' | 'kwartaal' | 'jaar', cat: prefill?.cat || activeCat, kenmerken })}>✓ Toevoegen</button>
      </div>
    </div>
  )
}

function PrognosePanel({ subs }: { subs: Subscription[] }) {
  const now = new Date()
  const months: {d:Date;total:number;events:{name:string;detail:string;delta:number}[];label:string}[] = []
  for (let i = 0; i < 36; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1)
    const activeSubs = subs.filter(s => {
      if (s.status === 'opgezegd') { if (!s.renew_date) return false; return d <= new Date(s.renew_date) }
      return true
    })
    const total = activeSubs.reduce((t, s) => t + effectiveMonthlyEURForDate(s, d), 0)
    const events: { name: string; detail: string; delta: number }[] = []
    subs.filter(s => s.status !== 'opgezegd').forEach(s => {
      ;(s.price_history || []).forEach(ph => {
        if (!ph.valid_from) return
        const phd = new Date(ph.valid_from)
        if (phd.getFullYear() === d.getFullYear() && phd.getMonth() === d.getMonth()) {
          const base = parseFloat(String(s.price)) || 0
          let delta = ph.price - base
          if (s.cycle === 'jaar') delta /= 12
          if (s.cycle === 'kwartaal') delta /= 3
          events.push({ name: s.name, detail: `→ ${fmt(ph.price)}/${s.cycle}${ph.note ? ' · ' + ph.note : ''}`, delta })
        }
      })
    })
    months.push({ d, total, events, label: d.toLocaleDateString('nl-NL', { month: 'short', year: '2-digit' }) })
  }

  const now0 = months[0].total
  const end = months[35].total
  const changeEvents = months.flatMap((m, mi) => m.events.map(ev => ({ ...ev, mi, dateLabel: m.d.toLocaleDateString('nl-NL', { month: 'long', year: 'numeric' }) })))

  return (
    <>
      <div className="totals">
        <div className="total-card"><div className="lbl">Nu / maand</div><div className="val">{fmt(now0)}</div></div>
        <div className="total-card"><div className="lbl">Over 36 maanden</div><div className="val" style={{ color: end > now0 ? 'var(--red)' : 'var(--green)' }}>{fmt(end)}</div></div>
      </div>
      <div className="section-lbl">Geplande wijzigingen</div>
      {changeEvents.length === 0
        ? <div style={{ fontSize: 13, color: 'var(--muted)', padding: '12px 0', lineHeight: 1.6 }}>Geen prijswijzigingen ingevoerd. Open een abonnement en voeg een geplande verhoging toe.</div>
        : changeEvents.map((ev, i) => (
          <div key={i} className={`prog-event ${ev.delta > 0 ? 'up' : 'down'}`}>
            <div className="prog-event-icon">{ev.delta > 0 ? '↑' : '↓'}</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 500 }}>{ev.name}</div>
              <div className="prog-event-date">{ev.dateLabel} · over {ev.mi} mnd</div>
              <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>{ev.detail}</div>
            </div>
            <div className="prog-event-delta">{ev.delta > 0 ? '+' : ''}{fmt(ev.delta)}/mnd</div>
          </div>
        ))}
      <div className="section-lbl" style={{ marginTop: 20 }}>Maandoverzicht</div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
          <thead><tr>
            <th style={{ textAlign: 'left', padding: '7px 10px', fontSize: 10.5, color: 'var(--subtle)', textTransform: 'uppercase', borderBottom: '1px solid var(--border)' }}>Maand</th>
            <th style={{ textAlign: 'right', padding: '7px 10px', fontSize: 10.5, color: 'var(--subtle)', textTransform: 'uppercase', borderBottom: '1px solid var(--border)' }}>Per maand</th>
            <th style={{ textAlign: 'right', padding: '7px 10px', fontSize: 10.5, color: 'var(--subtle)', textTransform: 'uppercase', borderBottom: '1px solid var(--border)' }}>Per jaar</th>
          </tr></thead>
          <tbody>
            {months.slice(0, 12).map((m, i) => {
              const isNow = m.d.getFullYear() === now.getFullYear() && m.d.getMonth() === now.getMonth()
              const prev = i > 0 ? months[i - 1].total : m.total
              const change = m.total - prev
              return (
                <tr key={i} style={{ background: isNow ? '#FFFBF0' : m.events.length ? 'var(--blue-bg)' : 'transparent' }}>
                  <td style={{ padding: '8px 10px', borderBottom: '1px solid #F7F7F5', fontWeight: isNow ? 600 : 400 }}>
                    {isNow ? '▶ ' : ''}{m.d.toLocaleDateString('nl-NL', { month: 'long' })}{isNow ? ' (nu)' : ''}
                    {m.events.map((ev, ei) => <span key={ei} style={{ marginLeft: 6, fontSize: 10, padding: '1px 6px', borderRadius: 99, background: ev.delta > 0 ? 'var(--red-bg)' : 'var(--green-bg)', color: ev.delta > 0 ? 'var(--red)' : 'var(--green)' }}>{ev.name}</span>)}
                  </td>
                  <td style={{ padding: '8px 10px', textAlign: 'right', fontFamily: 'monospace', borderBottom: '1px solid #F7F7F5' }}>
                    {fmt(m.total)}
                    {i > 0 && Math.abs(change) > 0.01 && <span style={{ marginLeft: 6, fontSize: 10, padding: '1px 6px', borderRadius: 99, background: change > 0 ? 'var(--red-bg)' : 'var(--green-bg)', color: change > 0 ? 'var(--red)' : 'var(--green)', fontFamily: 'sans-serif' }}>{change > 0 ? '+' : ''}{fmt(change)}</span>}
                  </td>
                  <td style={{ padding: '8px 10px', textAlign: 'right', fontFamily: 'monospace', color: 'var(--muted)', borderBottom: '1px solid #F7F7F5' }}>{fmt(m.total * 12)}/jr</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </>
  )
}

function InzichtenPanel({ subs }: { subs: Subscription[] }) {
  const activeSubs = subs.filter(s => s.status === 'actief')
  const totalMonthly = activeSubs.reduce((t, s) => t + effectiveMonthlyEUR(s), 0)
  const insights: { title: string; body: string; type: 'tip' | 'warning' | 'save' }[] = []

  // Streaming overlap
  const streamingSubs = activeSubs.filter(s => s.cat === 'Streaming')
  if (streamingSubs.length >= 3) {
    const streamTotal = streamingSubs.reduce((t, s) => t + effectiveMonthlyEUR(s), 0)
    insights.push({ type: 'warning', title: `${streamingSubs.length} streamingdiensten: ${fmt(streamTotal)}/mnd`, body: `Je hebt ${streamingSubs.map(s => s.name).join(', ')}. Mogelijk overlap — kijk of je kunt combineren of rouleren.` })
  }

  // USD subs
  const usdSubs = activeSubs.filter(s => s.price_currency === '$')
  if (usdSubs.length) insights.push({ type: 'tip', title: `${usdSubs.length} abonnement${usdSubs.length > 1 ? 'en' : ''} in dollars`, body: `${usdSubs.map(s => s.name).join(', ')} — wisselkoersrisico. Prijs kan variëren met de dollar.` })

  // Expiring soon
  const soonSubs = activeSubs.filter(s => { const d = daysUntil(s.renew_date); return d !== null && d >= 0 && d <= 14 })
  if (soonSubs.length) insights.push({ type: 'warning', title: `${soonSubs.length} abonnement${soonSubs.length > 1 ? 'en' : ''} verlengt binnen 14 dagen`, body: soonSubs.map(s => `${s.name} (over ${daysUntil(s.renew_date)}d)`).join(', ') })

  // Cancelled savings
  const cancelledSubs = subs.filter(s => s.status === 'opgezegd')
  if (cancelledSubs.length) {
    const saved = cancelledSubs.reduce((t, s) => {
      if (s.successor_id) { const succ = subs.find(x => x.id === s.successor_id); return t + effectiveMonthlyEUR(s) - (succ ? effectiveMonthlyEUR(succ) : 0) }
      return t + effectiveMonthlyEUR(s)
    }, 0)
    if (saved > 0) insights.push({ type: 'save', title: `Bespaard: ${fmt(saved)}/mnd · ${fmt(saved * 12)}/jaar`, body: `Door ${cancelledSubs.length} abonnement${cancelledSubs.length > 1 ? 'en' : ''} op te zeggen of te wisselen.` })
  }

  if (!insights.length) return <div style={{ fontSize: 13, color: 'var(--muted)', padding: '20px 0' }}>Voeg meer abonnementen toe voor inzichten.</div>

  return (
    <>
      {insights.map((ins, i) => (
        <div key={i} style={{ padding: '14px 16px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', marginBottom: 8, display: 'flex', gap: 12, alignItems: 'flex-start' }}>
          <div style={{ fontSize: 18, flexShrink: 0 }}>{ins.type === 'save' ? '✓' : ins.type === 'warning' ? '⚠' : '💡'}</div>
          <div>
            <div style={{ fontWeight: 500, fontSize: 13, marginBottom: 4 }}>{ins.title}</div>
            <div style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.6 }}>{ins.body}</div>
          </div>
        </div>
      ))}
    </>
  )
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader()
    r.onload = () => res((r.result as string).split(',')[1])
    r.onerror = rej
    r.readAsDataURL(file)
  })
}
