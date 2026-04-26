'use client'
import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import {
  Subscription, Currency, CATS, PAYMENT_METHODS,
  toMonthly, daysUntil, promoActive, effectiveMonthly, fmt, nextRenewDate
} from '@/lib/types'

const CAT_NAMES = Object.keys(CATS)

export default function Dashboard() {
  const router = useRouter()
  const [userId, setUserId] = useState('')
  const [userEmail, setUserEmail] = useState('')
  const [subs, setSubs] = useState<Subscription[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [activePanel, setActivePanel] = useState<'beheer' | 'overzicht' | 'delen'>('beheer')
  const [activeCat, setActiveCat] = useState(CAT_NAMES[0])
  const [catOpen, setCatOpen] = useState<Record<string, boolean>>({})
  const [currency, setCurrency] = useState<Currency>('€')
  const [notifDismissed, setNotifDismissed] = useState(false)

  // Family sharing
  const [familyId, setFamilyId] = useState<string | null>(null)
  const [familyInput, setFamilyInput] = useState('')
  const [familyStatus, setFamilyStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle')
  const [familyMsg, setFamilyMsg] = useState('')

  const supabase = createClient()
  const debounceTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) { router.replace('/login'); return }
      setUserId(session.user.id)
      setUserEmail(session.user.email || '')
      loadProfile(session.user.id)
    })
  }, [])

  async function loadProfile(uid: string) {
    await supabase.from('profiles').upsert({ id: uid }, { onConflict: 'id' })
    const { data: profile } = await supabase
      .from('profiles').select('family_id').eq('id', uid).single()
    const fid = profile?.family_id || null
    setFamilyId(fid)
    loadSubs(uid, fid)
  }

  async function loadSubs(uid: string, fid: string | null) {
    let query = supabase.from('items').select('*').order('created_at', { ascending: true })
    if (fid) {
      query = query.eq('family_id', fid)
    } else {
      query = query.eq('user_id', uid)
    }
    const { data } = await query
    const raw: Subscription[] = data || []

    const updates: Promise<void>[] = []
    const fixed = raw.map(s => {
      if (!s.renew_date) return s
      const advanced = nextRenewDate(s.renew_date, s.cycle)
      if (advanced !== s.renew_date) {
        updates.push(Promise.resolve(supabase.from('items').update({ renew_date: advanced }).eq('id', s.id)).then(() => {}))
        return { ...s, renew_date: advanced }
      }
      return s
    })
    await Promise.all(updates)
    setSubs(fixed)
    setLoading(false)
  }

  // ── Family sharing ───────────────────────────────────────

  async function createFamily() {
    setFamilyStatus('saving')
    const newId = crypto.randomUUID()
    await supabase.from('items').update({ family_id: newId }).eq('user_id', userId)
    await supabase.from('profiles').update({ family_id: newId }).eq('id', userId)
    setFamilyId(newId)
    setFamilyStatus('success')
    setFamilyMsg('Gezinscode aangemaakt! Deel de code hieronder met je partner.')
  }

  async function joinFamily() {
    const input = familyInput.trim()
    if (!input) return
    const { data: existing } = await supabase
      .from('profiles').select('id').eq('family_id', input).limit(1)
    if (!existing || existing.length === 0) {
      setFamilyStatus('error')
      setFamilyMsg('Onbekende gezinscode. Controleer of je de code goed hebt overgenomen.')
      return
    }
    setFamilyStatus('saving')
    await supabase.from('items').update({ family_id: input }).eq('user_id', userId)
    await supabase.from('profiles').update({ family_id: input }).eq('id', userId)
    setFamilyId(input)
    setFamilyStatus('success')
    setFamilyMsg('Gekoppeld! Je ziet nu de gedeelde abonnementen.')
    await loadSubs(userId, input)
  }

  async function leaveFamily() {
    if (!confirm('Weet je zeker dat je de gezinsgroep wilt verlaten? Je eigen abonnementen blijven bewaard.')) return
    await supabase.from('items').update({ family_id: null }).eq('user_id', userId)
    await supabase.from('profiles').update({ family_id: null }).eq('id', userId)
    setFamilyId(null)
    setFamilyStatus('idle')
    setFamilyMsg('')
    await loadSubs(userId, null)
  }

  // ── CRUD ─────────────────────────────────────────────────

  async function logout() {
    await supabase.auth.signOut()
    router.replace('/login')
  }

  async function saveSub(sub: Subscription) {
    setSaving(true)
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    if (sub.id) {
      await supabase.from('items').update({
        name: sub.name, price: sub.price || null, cycle: sub.cycle,
        renew_date: sub.renew_date || null, cat: sub.cat,
        promo_price: sub.promo_price || null, promo_until: sub.promo_until || null,
        payment_method: sub.payment_method,
      }).eq('id', sub.id)
    } else {
      const { data } = await supabase.from('items').insert({
        user_id: session.user.id, family_id: familyId || null,
        name: sub.name, price: sub.price || null, cycle: sub.cycle,
        renew_date: sub.renew_date || null, cat: sub.cat,
        promo_price: sub.promo_price || null, promo_until: sub.promo_until || null,
        payment_method: sub.payment_method,
      }).select().single()
      if (data) { setSubs(prev => prev.map(s => s === sub ? data : s)); setSaving(false); return }
    }
    setSaving(false)
  }

  async function deleteSub(sub: Subscription) {
    if (sub.id) await supabase.from('items').delete().eq('id', sub.id)
    setSubs(prev => prev.filter(s => s !== sub))
  }

  async function addFromSuggestion(item: { name: string; price: number; cycle: 'maand' | 'jaar' }, cat: string) {
    const already = subs.find(s => s.name.toLowerCase() === item.name.toLowerCase())
    if (already) {
      if (!already.renew_date && !already.payment_method) deleteSub(already)
      return
    }
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    const { data } = await supabase.from('items').insert({
      user_id: session.user.id, family_id: familyId || null,
      name: item.name, price: item.price, cycle: item.cycle,
      renew_date: null, cat, promo_price: null, promo_until: null, payment_method: '',
    }).select().single()
    if (data) setSubs(prev => [...prev, data])
  }

  async function addBlank() {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    const { data } = await supabase.from('items').insert({
      user_id: session.user.id, family_id: familyId || null,
      name: '', price: null, cycle: 'maand', renew_date: null, cat: 'Overig',
      promo_price: null, promo_until: null, payment_method: '',
    }).select().single()
    if (data) setSubs(prev => [...prev, data])
  }

  function handleFieldChange(index: number, field: keyof Subscription, value: string) {
    setSubs(prev => { const u = [...prev]; u[index] = { ...u[index], [field]: value }; return u })
    const key = `${index}-${field}`
    clearTimeout(debounceTimers.current[key])
    debounceTimers.current[key] = setTimeout(() => {
      setSubs(prev => { saveSub(prev[index]); return prev })
    }, 800)
  }

  const totalNow = subs.reduce((t, s) => t + effectiveMonthly(s), 0)
  const totalFull = subs.reduce((t, s) => t + toMonthly(Number(s.price), s.cycle), 0)
  const isAdded = (name: string) => subs.some(s => s.name.toLowerCase() === name.toLowerCase())

  const expiringSoon = subs.filter(s => { const d = daysUntil(s.renew_date); return d !== null && d >= 0 && d <= 7 })

  function renderBadge(renew_date: string) {
    const days = daysUntil(renew_date)
    if (days === null) return null
    if (days < 0) return <span className="badge badge-expired">verlopen</span>
    if (days <= 14) return <span className="badge badge-soon">over {days}d</span>
    return <span className="badge badge-ok">over {days}d</span>
  }

  if (loading) return <div style={{ padding: '3rem', textAlign: 'center', color: '#aaa' }}>Laden...</div>

  return (
    <div className="container">
      {!notifDismissed && expiringSoon.length > 0 && (
        <div className="notif-banner">
          <span className="notif-icon">🔔</span>
          <span>
            <strong>{expiringSoon.length === 1 ? `${expiringSoon[0].name} verloopt` : `${expiringSoon.length} abonnementen verlopen`}</strong>{' '}
            binnen 7 dagen:{' '}
            {expiringSoon.map(s => { const d = daysUntil(s.renew_date); return `${s.name} (${d === 0 ? 'vandaag' : `over ${d}d`})` }).join(', ')}
          </span>
          <button className="notif-close" onClick={() => setNotifDismissed(true)}>✕</button>
        </div>
      )}

      <nav className="main-nav">
        <div className="nav-tabs">
          <button className={`main-tab${activePanel === 'beheer' ? ' active' : ''}`} onClick={() => setActivePanel('beheer')}>Mijn abonnementen</button>
          <button className={`main-tab${activePanel === 'overzicht' ? ' active' : ''}`} onClick={() => setActivePanel('overzicht')}>Overzicht</button>
          <button className={`main-tab${activePanel === 'delen' ? ' active' : ''}`} onClick={() => setActivePanel('delen')}>
            Delen {familyId && <span className="family-dot">●</span>}
          </button>
        </div>
        <div className="nav-user">
          <div className="currency-toggle">
            <button className={`currency-btn${currency === '€' ? ' active' : ''}`} onClick={() => setCurrency('€')}>€ EUR</button>
            <button className={`currency-btn${currency === '$' ? ' active' : ''}`} onClick={() => setCurrency('$')}>$ USD</button>
          </div>
          <span className="nav-email">{userEmail}</span>
          <button className="logout-btn" onClick={logout}>Uitloggen</button>
          {saving && <span className="saving">opslaan...</span>}
        </div>
      </nav>

      {/* ── Beheer ── */}
      {activePanel === 'beheer' && (
        <>
          <div className="totals">
            <div className="total-card"><div className="label">Per maand (nu)</div><div className="value">{fmt(totalNow, currency)}</div></div>
            <div className="total-card"><div className="label">Per maand (na actie)</div><div className="value">{fmt(totalFull, currency)}</div></div>
            <div className="total-card"><div className="label">Per jaar (nu)</div><div className="value">{fmt(totalNow * 12, currency)}</div></div>
            <div className="total-card"><div className="label">Aantal</div><div className="value">{subs.length}</div></div>
          </div>

          <div className="section-label">Snel toevoegen</div>
          <div className="cat-pills">
            {CAT_NAMES.filter(c => c !== 'Overig').map(cat => (
              <button key={cat} className={`cat-pill${activeCat === cat ? ' active' : ''}`} onClick={() => setActiveCat(cat)}>
                {CATS[cat].icon} {cat}
              </button>
            ))}
          </div>

          <div className="suggestions-grid">
            {CATS[activeCat]?.items.map(item => {
              const added = isAdded(item.name)
              const existingSub = subs.find(s => s.name.toLowerCase() === item.name.toLowerCase())
              const isReal = existingSub && (existingSub.renew_date || existingSub.payment_method)
              return (
                <button key={item.name}
                  className={`suggestion${added ? ' added' : ''}${isReal ? ' real' : ''}`}
                  onClick={() => addFromSuggestion(item, activeCat)}
                >
                  <span className="s-icon">{CATS[activeCat].icon}</span>
                  <span>
                    <div className="s-name">{item.name}</div>
                    <div className="s-price">{fmt(item.price, currency)}/{item.cycle}</div>
                  </span>
                  {added && <span className="s-check">{isReal ? '●' : '✓'}</span>}
                </button>
              )
            })}
          </div>

          <hr className="divider" />
          <div className="col-labels">
            <span>Naam / categorie</span><span>Prijs</span><span>Cyclus</span>
            <span>Verlenging</span><span>Actieprijs</span><span>Actie t/m</span>
            <span>Betaling</span><span></span>
          </div>

          {subs.map((s, i) => {
            const days = daysUntil(s.renew_date)
            return (
              <div key={s.id || i} className={`sub-row${days !== null && days >= 0 && days <= 7 ? ' expiring' : ''}`}>
                <div className="name-cell">
                  <input type="text" value={s.name} placeholder="Naam" onChange={e => handleFieldChange(i, 'name', e.target.value)} />
                  <select style={{ fontSize: 11, padding: '3px 5px', color: '#888' }} value={s.cat || 'Overig'} onChange={e => handleFieldChange(i, 'cat', e.target.value)}>
                    {CAT_NAMES.map(c => <option key={c} value={c}>{CATS[c].icon} {c}</option>)}
                  </select>
                  {renderBadge(s.renew_date)}
                </div>
                <div className="price-wrap">
                  <span>{currency}</span>
                  <input type="number" value={s.price} placeholder="0,00" min="0" step="0.01" style={{ textAlign: 'right' }} onChange={e => handleFieldChange(i, 'price', e.target.value)} />
                </div>
                <select value={s.cycle} onChange={e => handleFieldChange(i, 'cycle', e.target.value)}>
                  <option value="maand">per maand</option>
                  <option value="kwartaal">per kwartaal</option>
                  <option value="jaar">per jaar</option>
                </select>
                <input type="date" value={s.renew_date || ''} onChange={e => handleFieldChange(i, 'renew_date', e.target.value)} />
                <div className="price-wrap">
                  <span>{currency}</span>
                  <input type="number" value={s.promo_price} placeholder="—" min="0" step="0.01" style={{ textAlign: 'right' }} onChange={e => handleFieldChange(i, 'promo_price', e.target.value)} />
                </div>
                <input type="date" value={s.promo_until || ''} onChange={e => handleFieldChange(i, 'promo_until', e.target.value)} />
                <select value={s.payment_method || ''} onChange={e => handleFieldChange(i, 'payment_method', e.target.value)}>
                  <option value="">— betaling —</option>
                  {PAYMENT_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
                <button className="del-btn" onClick={() => deleteSub(s)}>✕</button>
              </div>
            )
          })}
          <button className="add-btn" onClick={addBlank}>+ Zelf toevoegen</button>
        </>
      )}

      {/* ── Overzicht ── */}
      {activePanel === 'overzicht' && (
        <>
          <div className="totals">
            <div className="total-card"><div className="label">Per maand (nu)</div><div className="value">{fmt(totalNow, currency)}</div></div>
            <div className="total-card"><div className="label">Per jaar (nu)</div><div className="value">{fmt(totalNow * 12, currency)}</div></div>
            <div className="total-card"><div className="label">Per maand (na actie)</div><div className="value">{fmt(totalFull, currency)}</div></div>
          </div>
          {subs.length === 0 ? (
            <div className="empty-state">Nog geen abonnementen. Ga naar <em>Mijn abonnementen</em> om te beginnen.</div>
          ) : (
            <div className="cat-overview">
              {Object.entries(
                subs.reduce((acc, s) => {
                  const cat = s.cat || 'Overig'
                  if (!acc[cat]) acc[cat] = []
                  acc[cat].push(s)
                  return acc
                }, {} as Record<string, Subscription[]>)
              ).sort((a, b) => b[1].reduce((t, s) => t + effectiveMonthly(s), 0) - a[1].reduce((t, s) => t + effectiveMonthly(s), 0))
              .map(([cat, items]) => {
                const catNow = items.reduce((t, s) => t + effectiveMonthly(s), 0)
                const catFull = items.reduce((t, s) => t + toMonthly(Number(s.price), s.cycle), 0)
                const pct = totalNow > 0 ? (catNow / totalNow * 100) : 0
                const isOpen = catOpen[cat] !== false
                return (
                  <div key={cat} className="cat-block">
                    <div className="cat-block-header" onClick={() => setCatOpen(prev => ({ ...prev, [cat]: !isOpen }))}>
                      <div className="cat-block-title">{CATS[cat]?.icon || '📌'} {cat} <span style={{ fontSize: 12, color: '#aaa', fontWeight: 400 }}>({items.length})</span></div>
                      <div className="cat-block-meta">
                        {catFull > catNow
                          ? <span style={{ fontSize: 12, color: '#854F0B' }}>{fmt(catNow, currency)}/mnd → {fmt(catFull, currency)}</span>
                          : <span className="amount">{fmt(catNow, currency)}/mnd</span>}
                        <span style={{ fontSize: 12, color: '#aaa' }}>{pct.toFixed(0)}%</span>
                        <span className={`chevron${isOpen ? ' open' : ''}`}>▶</span>
                      </div>
                    </div>
                    <div className="bar-track"><div className="bar-fill" style={{ width: `${pct.toFixed(1)}%` }} /></div>
                    {isOpen && (
                      <div>
                        {items.map(s => {
                          const effM = effectiveMonthly(s)
                          const fullM = toMonthly(Number(s.price), s.cycle)
                          const hasPromo = promoActive(s)
                          return (
                            <div key={s.id} className="cat-item">
                              <div className="cat-item-left">
                                <span>{s.name || '(naamloos)'}</span>
                                {s.payment_method && <span className="payment-badge">{s.payment_method}</span>}
                                {hasPromo && <span className="promo-tag">actie nog {daysUntil(s.promo_until)}d</span>}
                              </div>
                              <div className="cat-item-right">
                                <span>{fmt(effM, currency)}/mnd</span>
                                {hasPromo && <span style={{ color: '#aaa', fontSize: 11 }}>→ {fmt(fullM, currency)}</span>}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })}
              <div className="cat-block" style={{ marginTop: 8 }}>
                <div className="cat-block-header" style={{ cursor: 'default' }}>
                  <div className="cat-block-title">💳 Verdeling per betaalrekening</div>
                </div>
                <div>
                  {Object.entries(
                    subs.reduce((acc, s) => {
                      const pm = s.payment_method || 'Niet ingesteld'
                      acc[pm] = (acc[pm] || 0) + effectiveMonthly(s)
                      return acc
                    }, {} as Record<string, number>)
                  ).sort((a, b) => b[1] - a[1]).map(([pm, total]) => {
                    const pct = totalNow > 0 ? (total / totalNow * 100) : 0
                    return (
                      <div key={pm} className="cat-item" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 4 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span>{pm}</span>
                          <span style={{ fontWeight: 500 }}>{fmt(total, currency)}/mnd <span style={{ color: '#aaa', fontWeight: 400, fontSize: 12 }}>({pct.toFixed(0)}%)</span></span>
                        </div>
                        <div className="bar-track" style={{ margin: 0 }}><div className="bar-fill" style={{ width: `${pct.toFixed(1)}%` }} /></div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* ── Delen ── */}
      {activePanel === 'delen' && (
        <div className="share-panel">
          <div className="share-card">
            <div className="share-icon">👨‍👩‍👦</div>
            <h2>Data delen met je partner</h2>
            <p>Koppel jullie accounts zodat je samen één lijst bijhoudt. Alle wijzigingen zijn direct zichtbaar voor elkaar.</p>

            {familyId ? (
              <>
                <div className="share-status connected">
                  <span className="share-status-dot">●</span> Gekoppeld als gezinsgroep
                </div>
                <div className="share-code-block">
                  <div className="share-code-label">Gezinscode</div>
                  <div className="share-code-row">
                    <code className="share-code">{familyId}</code>
                    <button className="copy-btn" onClick={() => {
                      navigator.clipboard.writeText(familyId)
                      const btn = document.querySelector('.copy-btn') as HTMLButtonElement
                      if (btn) { btn.textContent = 'Gekopieerd!'; setTimeout(() => { btn.textContent = 'Kopieer' }, 2000) }
                    }}>Kopieer</button>
                  </div>
                  <p className="share-hint">Stuur deze code naar je partner. Zij voert hem in onder "Koppelen met code".</p>
                </div>
                {familyStatus === 'success' && <div className="success-msg">{familyMsg}</div>}
                <button className="leave-btn" onClick={leaveFamily}>Gezinsgroep verlaten</button>
              </>
            ) : (
              <>
                <div className="share-status disconnected">
                  <span className="share-status-dot">○</span> Nog niet gekoppeld
                </div>
                <div className="share-options">
                  <div className="share-option">
                    <div className="share-option-title">Nieuwe gezinsgroep starten</div>
                    <p className="share-option-desc">Jij maakt een code aan die je deelt met je partner.</p>
                    <button className="share-action-btn primary" onClick={createFamily} disabled={familyStatus === 'saving'}>
                      {familyStatus === 'saving' ? 'Aanmaken...' : '+ Gezinsgroep aanmaken'}
                    </button>
                  </div>
                  <div className="share-divider">of</div>
                  <div className="share-option">
                    <div className="share-option-title">Koppelen met bestaande code</div>
                    <p className="share-option-desc">Voer de gezinscode in die je van je partner hebt gekregen.</p>
                    <div className="share-input-row">
                      <input type="text" className="share-input" placeholder="Plak hier de gezinscode..."
                        value={familyInput} onChange={e => setFamilyInput(e.target.value)} />
                      <button className="share-action-btn" onClick={joinFamily} disabled={familyStatus === 'saving' || !familyInput.trim()}>
                        Koppelen
                      </button>
                    </div>
                  </div>
                </div>
                {familyStatus === 'success' && <div className="success-msg">{familyMsg}</div>}
                {familyStatus === 'error' && <div className="error-msg">{familyMsg}</div>}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
