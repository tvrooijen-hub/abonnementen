'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { Subscription, CATS, PAYMENT_METHODS, toMonthly, daysUntil, promoActive, effectiveMonthly, fmt } from '@/lib/types'

const CAT_NAMES = Object.keys(CATS)

export default function Dashboard() {
  const router = useRouter()
  const [userEmail, setUserEmail] = useState('')
  const [subs, setSubs] = useState<Subscription[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [activePanel, setActivePanel] = useState<'beheer' | 'overzicht'>('beheer')
  const [activeCat, setActiveCat] = useState(CAT_NAMES[0])
  const [catOpen, setCatOpen] = useState<Record<string, boolean>>({})
  const supabase = createClient()

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) { router.replace('/login'); return }
      setUserEmail(session.user.email || '')
      loadSubs(session.user.id)
    })
  }, [])

  async function loadSubs(userId: string) {
    const { data } = await supabase
      .from('subscriptions')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: true })
    setSubs(data || [])
    setLoading(false)
  }

  async function logout() {
    await supabase.auth.signOut()
    router.replace('/login')
  }

  async function saveSub(sub: Subscription) {
    setSaving(true)
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    if (sub.id) {
      await supabase.from('subscriptions').update({
        name: sub.name, price: sub.price || null, cycle: sub.cycle,
        renew_date: sub.renew_date || null, cat: sub.cat,
        promo_price: sub.promo_price || null, promo_until: sub.promo_until || null,
        payment_method: sub.payment_method,
      }).eq('id', sub.id)
    } else {
      const { data } = await supabase.from('subscriptions').insert({
        user_id: session.user.id, name: sub.name, price: sub.price || null,
        cycle: sub.cycle, renew_date: sub.renew_date || null, cat: sub.cat,
        promo_price: sub.promo_price || null, promo_until: sub.promo_until || null,
        payment_method: sub.payment_method,
      }).select().single()
      if (data) {
        setSubs(prev => prev.map(s => s === sub ? data : s))
        setSaving(false)
        return
      }
    }
    setSaving(false)
  }

  async function deleteSub(sub: Subscription) {
    if (sub.id) await supabase.from('subscriptions').delete().eq('id', sub.id)
    setSubs(prev => prev.filter(s => s !== sub))
  }

  async function addFromSuggestion(item: { name: string; price: number; cycle: 'maand' | 'jaar' }, cat: string) {
    const already = subs.find(s => s.name.toLowerCase() === item.name.toLowerCase())
    if (already) { deleteSub(already); return }
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    const { data } = await supabase.from('subscriptions').insert({
      user_id: session.user.id, name: item.name, price: item.price,
      cycle: item.cycle, renew_date: null, cat,
      promo_price: null, promo_until: null, payment_method: '',
    }).select().single()
    if (data) setSubs(prev => [...prev, data])
  }

  async function addBlank() {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    const { data } = await supabase.from('subscriptions').insert({
      user_id: session.user.id, name: '', price: null,
      cycle: 'maand', renew_date: null, cat: 'Overig',
      promo_price: null, promo_until: null, payment_method: '',
    }).select().single()
    if (data) setSubs(prev => [...prev, data])
  }

  function updateLocal(index: number, field: keyof Subscription, value: string) {
    setSubs(prev => {
      const updated = [...prev]
      updated[index] = { ...updated[index], [field]: value }
      return updated
    })
  }

  const debounceTimers: Record<string, ReturnType<typeof setTimeout>> = {}
  function handleFieldChange(index: number, field: keyof Subscription, value: string) {
    updateLocal(index, field, value)
    const key = `${index}-${field}`
    clearTimeout(debounceTimers[key])
    debounceTimers[key] = setTimeout(() => {
      setSubs(prev => { saveSub(prev[index]); return prev })
    }, 800)
  }

  const totalNow = subs.reduce((t, s) => t + effectiveMonthly(s), 0)
  const totalFull = subs.reduce((t, s) => t + toMonthly(Number(s.price), s.cycle), 0)

  function isAdded(name: string) {
    return subs.some(s => s.name.toLowerCase() === name.toLowerCase())
  }

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
      <nav className="main-nav">
        <div className="nav-tabs">
          <button className={`main-tab${activePanel === 'beheer' ? ' active' : ''}`} onClick={() => setActivePanel('beheer')}>Mijn abonnementen</button>
          <button className={`main-tab${activePanel === 'overzicht' ? ' active' : ''}`} onClick={() => setActivePanel('overzicht')}>Overzicht per categorie</button>
        </div>
        <div className="nav-user">
          <span>{userEmail}</span>
          <button className="logout-btn" onClick={logout}>Uitloggen</button>
          {saving && <span className="saving">opslaan...</span>}
        </div>
      </nav>

      {activePanel === 'beheer' && (
        <>
          <div className="totals">
            <div className="total-card"><div className="label">Per maand (nu)</div><div className="value">{fmt(totalNow)}</div></div>
            <div className="total-card"><div className="label">Per maand (na actie)</div><div className="value">{fmt(totalFull)}</div></div>
            <div className="total-card"><div className="label">Per jaar (nu)</div><div className="value">{fmt(totalNow * 12)}</div></div>
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
            {(CATS[activeCat]?.items || []).map(item => {
              const added = isAdded(item.name)
              return (
                <div key={item.name} className={`suggestion${added ? ' added' : ''}`} onClick={() => addFromSuggestion(item, activeCat)}>
                  <span className="s-icon">{CATS[activeCat].icon}</span>
                  <div>
                    <div className="s-name">{item.name}</div>
                    <div className="s-price">{added ? '✓ toegevoegd' : `${fmt(toMonthly(item.price, item.cycle))}/mnd`}</div>
                  </div>
                </div>
              )
            })}
          </div>

          <hr className="divider" />
          <div className="section-label" style={{ marginBottom: 10 }}>Mijn lijst</div>
          <div className="col-labels">
            <span>naam / cat.</span><span>prijs</span><span>periode</span>
            <span>verlenging</span><span>actieprijs</span><span>actie t/m</span>
            <span>betaling</span><span></span>
          </div>

          {subs.map((s, i) => (
            <div key={s.id || i} className="sub-row">
              <div className="name-cell">
                <input type="text" value={s.name} placeholder="Naam" onChange={e => handleFieldChange(i, 'name', e.target.value)} />
                <select style={{ fontSize: 11, padding: '3px 5px', color: '#888' }} value={s.cat || 'Overig'} onChange={e => handleFieldChange(i, 'cat', e.target.value)}>
                  {CAT_NAMES.map(c => <option key={c} value={c}>{CATS[c].icon} {c}</option>)}
                </select>
                {renderBadge(s.renew_date)}
              </div>
              <div className="price-wrap">
                <span>€</span>
                <input type="number" value={s.price} placeholder="0,00" min="0" step="0.01" style={{ textAlign: 'right' }} onChange={e => handleFieldChange(i, 'price', e.target.value)} />
              </div>
              <select value={s.cycle} onChange={e => handleFieldChange(i, 'cycle', e.target.value)}>
                <option value="maand">per maand</option>
                <option value="kwartaal">per kwartaal</option>
                <option value="jaar">per jaar</option>
              </select>
              <input type="date" value={s.renew_date || ''} onChange={e => handleFieldChange(i, 'renew_date', e.target.value)} />
              <div className="price-wrap">
                <span>€</span>
                <input type="number" value={s.promo_price} placeholder="—" min="0" step="0.01" style={{ textAlign: 'right' }} onChange={e => handleFieldChange(i, 'promo_price', e.target.value)} />
              </div>
              <input type="date" value={s.promo_until || ''} onChange={e => handleFieldChange(i, 'promo_until', e.target.value)} />
              <select value={s.payment_method || ''} onChange={e => handleFieldChange(i, 'payment_method', e.target.value)}>
                <option value="">— betaling —</option>
                {PAYMENT_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
              <button className="del-btn" onClick={() => deleteSub(s)}>✕</button>
            </div>
          ))}
          <button className="add-btn" onClick={addBlank}>+ Zelf toevoegen</button>
        </>
      )}

      {activePanel === 'overzicht' && (
        <>
          <div className="totals">
            <div className="total-card"><div className="label">Per maand (nu)</div><div className="value">{fmt(totalNow)}</div></div>
            <div className="total-card"><div className="label">Per jaar (nu)</div><div className="value">{fmt(totalNow * 12)}</div></div>
            <div className="total-card"><div className="label">Per maand (na actie)</div><div className="value">{fmt(totalFull)}</div></div>
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
              ).sort((a, b) => {
                const sa = a[1].reduce((t, s) => t + effectiveMonthly(s), 0)
                const sb = b[1].reduce((t, s) => t + effectiveMonthly(s), 0)
                return sb - sa
              }).map(([cat, items]) => {
                const catNow = items.reduce((t, s) => t + effectiveMonthly(s), 0)
                const catFull = items.reduce((t, s) => t + toMonthly(Number(s.price), s.cycle), 0)
                const pct = totalNow > 0 ? (catNow / totalNow * 100) : 0
                const isOpen = catOpen[cat] !== false
                return (
                  <div key={cat} className="cat-block">
                    <div className="cat-block-header" onClick={() => setCatOpen(prev => ({ ...prev, [cat]: !isOpen }))}>
                      <div className="cat-block-title">
                        {CATS[cat]?.icon || '📌'} {cat}
                        <span style={{ fontSize: 12, color: '#aaa', fontWeight: 400 }}>({items.length})</span>
                      </div>
                      <div className="cat-block-meta">
                        {catFull > catNow
                          ? <span style={{ fontSize: 12, color: '#854F0B' }}>{fmt(catNow)}/mnd → {fmt(catFull)}</span>
                          : <span className="amount">{fmt(catNow)}/mnd</span>
                        }
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
                          const promoDays = daysUntil(s.promo_until)
                          return (
                            <div key={s.id} className="cat-item">
                              <div className="cat-item-left">
                                <span>{s.name || '(naamloos)'}</span>
                                {s.payment_method && <span className="payment-badge">{s.payment_method}</span>}
                                {hasPromo && <span className="promo-tag">actie nog {promoDays}d</span>}
                              </div>
                              <div className="cat-item-right">
                                <span>{fmt(effM)}/mnd</span>
                                {hasPromo && <span style={{ color: '#aaa', fontSize: 11 }}>→ {fmt(fullM)}</span>}
                              </div>
                            </div>
                          )
                        })}
                        {(() => {
                          const byPayment = items.reduce((acc, s) => {
                            const pm = s.payment_method || 'Onbekend'
                            acc[pm] = (acc[pm] || 0) + effectiveMonthly(s)
                            return acc
                          }, {} as Record<string, number>)
                          const entries = Object.entries(byPayment)
                          if (entries.length <= 1) return null
                          return (
                            <div style={{ padding: '8px 16px 10px', borderTop: '1px solid #f0f0ee', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                              {entries.map(([pm, total]) => (
                                <span key={pm} style={{ fontSize: 11, color: '#888', background: '#f5f5f2', padding: '2px 8px', borderRadius: 4 }}>
                                  {pm}: {fmt(total)}/mnd
                                </span>
                              ))}
                            </div>
                          )
                        })()}
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
                          <span style={{ fontWeight: 500 }}>{fmt(total)}/mnd <span style={{ color: '#aaa', fontWeight: 400, fontSize: 12 }}>({pct.toFixed(0)}%)</span></span>
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
    </div>
  )
}