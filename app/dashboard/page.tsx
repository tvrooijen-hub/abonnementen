'use client'
import 'chart.js/auto'
import { useEffect, useState, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import {
  Subscription, Currency, CATS, PAYMENT_METHODS,
  toMonthly, daysUntil, introActive, effectiveMonthlyEUR, normalMonthlyEUR,
  fmt, nextRenewDate, logoUrl, USD_RATE
} from '@/lib/types'

const CAT_NAMES = Object.keys(CATS)
const COLORS = ['#378ADD','#1D9E75','#D85A30','#D4537E','#BA7517','#639922','#7F77DD','#5DCAA5']

type Panel = 'beheer' | 'overzicht' | 'inzichten' | 'delen'

export default function Dashboard() {
  const router = useRouter()
  const [userId, setUserId] = useState('')
  const [userEmail, setUserEmail] = useState('')
  const [subs, setSubs] = useState<Subscription[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [panel, setPanel] = useState<Panel>('beheer')
  const [activeCat, setActiveCat] = useState(CAT_NAMES[0])
  const [currency, setCurrency] = useState<Currency>('€')
  const [notifDismissed, setNotifDismissed] = useState(false)
  const [analysesCat, setAnalyseCat] = useState<string | null>(null)

  // Family sharing
  const [familyId, setFamilyId] = useState<string | null>(null)
  const [familyInput, setFamilyInput] = useState('')
  const [familyStatus, setFamilyStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle')
  const [familyMsg, setFamilyMsg] = useState('')
  const [copyLabel, setCopyLabel] = useState('Kopieer')

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
    const { data: profile } = await supabase.from('profiles').select('family_id').eq('id', uid).single()
    const fid = profile?.family_id || null
    setFamilyId(fid)
    loadSubs(uid, fid)
  }

  async function loadSubs(uid: string, fid: string | null) {
    let query = supabase.from('subscriptions').select('*').order('created_at', { ascending: true })
    if (fid) query = query.eq('family_id', fid)
    else query = query.eq('user_id', uid)

    const { data } = await query
    const raw: Subscription[] = (data || []).map(s => ({
      ...s,
      price_currency: s.price_currency || '€',
      domain: s.domain || '',
      intro_price: s.intro_price || null,
      intro_until: s.intro_until || null,
    }))

    // Auto-advance verlopen datums
    const updates: Promise<void>[] = []
    const fixed = raw.map(s => {
      if (!s.renew_date) return s
      const advanced = nextRenewDate(s.renew_date, s.cycle)
      if (advanced !== s.renew_date) {
        updates.push(Promise.resolve(
          supabase.from('subscriptions').update({ renew_date: advanced }).eq('id', s.id)
        ).then(() => {}))
        return { ...s, renew_date: advanced }
      }
      return s
    })
    await Promise.all(updates)
    setSubs(fixed)
    setLoading(false)
  }

  async function logout() {
    await supabase.auth.signOut()
    router.replace('/login')
  }

  async function saveSub(sub: Subscription) {
    setSaving(true)
    const payload = {
      name: sub.name,
      price: sub.price || null,
      price_currency: sub.price_currency || '€',
      cycle: sub.cycle,
      renew_date: sub.renew_date || null,
      cat: sub.cat,
      intro_price: sub.intro_price || null,
      intro_until: sub.intro_until || null,
      payment_method: sub.payment_method,
      domain: sub.domain || '',
    }
    if (sub.id) {
      await supabase.from('subscriptions').update(payload).eq('id', sub.id)
    } else {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { setSaving(false); return }
      const { data } = await supabase.from('subscriptions').insert({
        ...payload,
        user_id: session.user.id,
        family_id: familyId || null,
      }).select().single()
      if (data) {
        setSubs(prev => prev.map(s => s === sub ? { ...data, price_currency: data.price_currency || '€', domain: data.domain || '', intro_price: data.intro_price || null, intro_until: data.intro_until || null } : s))
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

  async function addFromSuggestion(item: { name: string; price: number; cycle: 'maand' | 'jaar'; domain: string }) {
    const already = subs.find(s => s.name.toLowerCase() === item.name.toLowerCase())
    if (already) {
      if (!already.renew_date && !already.payment_method) deleteSub(already)
      return
    }
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    const { data } = await supabase.from('subscriptions').insert({
      user_id: session.user.id,
      family_id: familyId || null,
      name: item.name,
      price: item.price,
      price_currency: '€',
      cycle: item.cycle,
      renew_date: null,
      cat: activeCat,
      intro_price: null,
      intro_until: null,
      payment_method: '',
      domain: item.domain,
    }).select().single()
    if (data) setSubs(prev => [...prev, { ...data, price_currency: data.price_currency || '€', domain: data.domain || '', intro_price: null, intro_until: null }])
  }

  async function addBlank() {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    const { data } = await supabase.from('subscriptions').insert({
      user_id: session.user.id,
      family_id: familyId || null,
      name: '',
      price: null,
      price_currency: '€',
      cycle: 'maand',
      renew_date: null,
      cat: 'Overig',
      intro_price: null,
      intro_until: null,
      payment_method: '',
      domain: '',
    }).select().single()
    if (data) setSubs(prev => [...prev, { ...data, price_currency: '€', domain: '', intro_price: null, intro_until: null }])
  }

  function updateField(index: number, field: keyof Subscription, value: string | null) {
    setSubs(prev => {
      const updated = [...prev]
      updated[index] = { ...updated[index], [field]: value }
      return updated
    })
    const key = `${index}-${field}`
    clearTimeout(debounceTimers.current[key])
    debounceTimers.current[key] = setTimeout(() => {
      setSubs(prev => { saveSub(prev[index]); return prev })
    }, 800)
  }

  function exportCSV() {
    const rows = [['Naam','Prijs','Valuta','Cyclus','Verlengdatum','Categorie','Introprijs','Intro t/m','Betaling','Per maand (EUR)']]
    subs.forEach(s => rows.push([
      s.name, String(s.price), s.price_currency, s.cycle, s.renew_date || '',
      s.cat, String(s.intro_price || ''), s.intro_until || '',
      s.payment_method || '', effectiveMonthlyEUR(s).toFixed(2)
    ]))
    const csv = rows.map(r => r.map(v => `"${v}"`).join(',')).join('\n')
    const a = document.createElement('a')
    a.href = 'data:text/csv;charset=utf-8,\uFEFF' + encodeURIComponent(csv)
    a.download = 'abonnementen.csv'
    a.click()
  }

  // ── Family sharing ──────────────────────────────────────

  async function createFamily() {
    setFamilyStatus('saving')
    const newId = crypto.randomUUID()
    await supabase.from('subscriptions').update({ family_id: newId }).eq('user_id', userId)
    await supabase.from('profiles').update({ family_id: newId }).eq('id', userId)
    setFamilyId(newId)
    setFamilyStatus('success')
    setFamilyMsg('Gezinscode aangemaakt!')
  }

  async function joinFamily() {
    const input = familyInput.trim()
    if (!input) return
    const { data: existing } = await supabase.from('profiles').select('id').eq('family_id', input).limit(1)
    if (!existing || existing.length === 0) {
      setFamilyStatus('error')
      setFamilyMsg('Onbekende gezinscode.')
      return
    }
    setFamilyStatus('saving')
    await supabase.from('subscriptions').update({ family_id: input }).eq('user_id', userId)
    await supabase.from('profiles').update({ family_id: input }).eq('id', userId)
    setFamilyId(input)
    setFamilyStatus('success')
    setFamilyMsg('Gekoppeld!')
    await loadSubs(userId, input)
  }

  async function leaveFamily() {
    if (!confirm('Weet je zeker dat je de gezinsgroep wilt verlaten?')) return
    await supabase.from('subscriptions').update({ family_id: null }).eq('user_id', userId)
    await supabase.from('profiles').update({ family_id: null }).eq('id', userId)
    setFamilyId(null)
    setFamilyStatus('idle')
    setFamilyMsg('')
    await loadSubs(userId, null)
  }

  function copyCode() {
    if (!familyId) return
    navigator.clipboard.writeText(familyId)
    setCopyLabel('Gekopieerd!')
    setTimeout(() => setCopyLabel('Kopieer'), 2000)
  }

  // ── Derived ─────────────────────────────────────────────
  const totalNow = subs.reduce((t, s) => t + effectiveMonthlyEUR(s), 0)
  const expiringSoon = subs.filter(s => { const d = daysUntil(s.renew_date); return d !== null && d >= 0 && d <= 7 })

  function renderBadge(s: Subscription) {
    const days = daysUntil(s.renew_date)
    if (days === null) return null
    const introDays = daysUntil(s.intro_until)
    const isIntroActive = introActive(s)
    return (
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 4 }}>
        {days < 0 && <span className="badge badge-expired">verlopen</span>}
        {days >= 0 && days <= 7 && <span className="badge badge-soon">verlengt over {days}d</span>}
        {days > 7 && days <= 30 && <span className="badge badge-ok">over {days}d</span>}
        {isIntroActive && introDays !== null && <span className="badge badge-intro">intro nog {introDays}d</span>}
      </div>
    )
  }

  if (loading) return <div style={{ padding: '3rem', textAlign: 'center', color: '#aaa' }}>Laden...</div>

  return (
    <div>
      {/* ── Notificatie ── */}
      {!notifDismissed && expiringSoon.length > 0 && (
        <div className="notif-banner">
          <span style={{ fontSize: 16 }}>🔔</span>
          <span>
            <strong>{expiringSoon.length === 1 ? expiringSoon[0].name : `${expiringSoon.length} abonnementen`}</strong>
            {' '}verloopt binnenkort:{' '}
            {expiringSoon.map(s => { const d = daysUntil(s.renew_date); return `${s.name} (${d === 0 ? 'vandaag' : `over ${d}d`})` }).join(', ')}
          </span>
          <button className="notif-close" onClick={() => setNotifDismissed(true)}>✕</button>
        </div>
      )}

      {/* ── Nav ── */}
      <nav className="main-nav">
        <div className="nav-tabs">
          {(['beheer', 'overzicht', 'inzichten', 'delen'] as Panel[]).map(p => (
            <button key={p} className={`main-tab${panel === p ? ' active' : ''}`} onClick={() => { setPanel(p); setAnalyseCat(null) }}>
              {p === 'beheer' ? 'Abonnementen' : p.charAt(0).toUpperCase() + p.slice(1)}
              {p === 'inzichten' ? ' ✦' : ''}
              {p === 'delen' && familyId ? <span className="family-dot">●</span> : null}
            </button>
          ))}
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

      <div className="container">

        {/* ── BEHEER ── */}
        {panel === 'beheer' && (
          <>
            <div className="totals">
              <div className="total-card"><div className="label">Per maand</div><div className="value">{fmt(totalNow, currency)}</div></div>
              <div className="total-card"><div className="label">Per jaar</div><div className="value">{fmt(totalNow * 12, currency)}</div></div>
              <div className="total-card"><div className="label">Aantal</div><div className="value">{subs.length}</div></div>
              <div className="total-card"><div className="label">In dollars</div><div className="value">{subs.filter(s => s.price_currency === '$').length}</div></div>
            </div>

            <div className="export-row">
              <button className="export-btn" onClick={exportCSV}>📄 Export CSV</button>
              <button className="export-btn" onClick={() => window.print()}>🖨️ Print / PDF</button>
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
                const added = subs.some(s => s.name.toLowerCase() === item.name.toLowerCase())
                const existing = subs.find(s => s.name.toLowerCase() === item.name.toLowerCase())
                const isReal = existing && (existing.renew_date || existing.payment_method)
                const logo = logoUrl(item.domain)
                return (
                  <button key={item.name} className={`suggestion${added ? ' added' : ''}${isReal ? ' real' : ''}`} onClick={() => addFromSuggestion(item)}>
                    {logo ? (
                      <img
                        src={logo} alt={item.name} width={24} height={24}
                        style={{ borderRadius: 5, objectFit: 'contain', background: '#fff', border: '1px solid #E4E3DE', padding: 1, flexShrink: 0 }}
                        onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
                      />
                    ) : (
                      <span style={{ fontSize: 16, flexShrink: 0 }}>{CATS[activeCat].icon}</span>
                    )}
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
            <div className="section-label">Mijn abonnementen</div>

            <div className="sub-list">
              {subs.map((s, i) => {
                const days = daysUntil(s.renew_date)
                const isExpiring = days !== null && days >= 0 && days <= 7
                const isIntro = introActive(s)
                const logo = logoUrl(s.domain || '')
                return (
                  <div key={s.id || i} className={`sub-card${isExpiring ? ' expiring' : ''}`}>
                    {/* Header */}
                    <div className="sub-card-header">
                      {logo ? (
                        <img src={logo} alt={s.name} width={32} height={32}
                          style={{ borderRadius: 8, objectFit: 'contain', background: '#fff', border: '1px solid #E4E3DE', padding: 2, flexShrink: 0 }}
                          onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
                        />
                      ) : (
                        <span style={{ width: 32, height: 32, borderRadius: 8, background: '#F4F3EF', border: '1px solid #E4E3DE', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, flexShrink: 0 }}>
                          {CATS[s.cat]?.icon || '📌'}
                        </span>
                      )}
                      <div className="sub-name-wrap">
                        <input
                          className="sub-name-input" type="text" value={s.name} placeholder="Naam"
                          onChange={e => updateField(i, 'name', e.target.value)}
                        />
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2, flexWrap: 'wrap' }}>
                          <select className="sub-cat-select" value={s.cat || 'Overig'} onChange={e => updateField(i, 'cat', e.target.value)}>
                            {CAT_NAMES.map(c => <option key={c} value={c}>{CATS[c].icon} {c}</option>)}
                          </select>
                          {renderBadge(s)}
                        </div>
                      </div>
                      <button className="sub-del" onClick={() => deleteSub(s)}>✕</button>
                    </div>

                    {/* Fields */}
                    <div className="sub-fields">
                      <div className="field-group">
                        <div className="field-label">Normale prijs</div>
                        <div className="price-row">
                          <select className="cur-select-small" value={s.price_currency || '€'} onChange={e => updateField(i, 'price_currency', e.target.value)}>
                            <option>€</option>
                            <option>$</option>
                          </select>
                          <input className="field-input" type="number" value={String(s.price)} min="0" step="0.01"
                            style={{ flex: 1, textAlign: 'right' }} onChange={e => updateField(i, 'price', e.target.value)} />
                        </div>
                        {s.price_currency === '$' && (
                          <div className="converted-note">≈ € {(parseFloat(String(s.price)) / USD_RATE).toFixed(2).replace('.', ',')} / {s.cycle}</div>
                        )}
                      </div>

                      <div className="field-group">
                        <div className="field-label">Cyclus</div>
                        <select className="field-input" value={s.cycle} onChange={e => updateField(i, 'cycle', e.target.value)}>
                          <option value="maand">per maand</option>
                          <option value="kwartaal">per kwartaal</option>
                          <option value="jaar">per jaar</option>
                        </select>
                      </div>

                      <div className="field-group">
                        <div className="field-label">Verlengdatum</div>
                        <input className="field-input" type="date" value={s.renew_date || ''} onChange={e => updateField(i, 'renew_date', e.target.value)} />
                      </div>

                      <div className="field-group">
                        <div className="field-label">Betaling</div>
                        <select className="field-input" value={s.payment_method || ''} onChange={e => updateField(i, 'payment_method', e.target.value)}>
                          <option value="">— kies —</option>
                          {PAYMENT_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
                        </select>
                      </div>
                    </div>

                    {/* Intro price */}
                    {s.intro_price !== null && s.intro_price !== undefined && s.intro_price !== '' ? (
                      <div className="intro-section">
                        <div className="intro-header">
                          <span className="intro-label">Introductieprijs</span>
                          <button className="intro-remove" onClick={() => {
                            updateField(i, 'intro_price', null)
                            updateField(i, 'intro_until', null)
                          }}>Verwijderen</button>
                        </div>
                        <div className="intro-fields">
                          <div className="field-group">
                            <div className="field-label" style={{ color: 'var(--amber, #854F0B)' }}>Intro prijs ({s.price_currency})</div>
                            <input className="intro-input" type="number" value={String(s.intro_price)} min="0" step="0.01"
                              placeholder="1,00" onChange={e => updateField(i, 'intro_price', e.target.value)} />
                          </div>
                          <div className="field-group">
                            <div className="field-label" style={{ color: 'var(--amber, #854F0B)' }}>Geldig t/m</div>
                            <input className="intro-input" type="date" value={s.intro_until || ''} onChange={e => updateField(i, 'intro_until', e.target.value)} />
                          </div>
                        </div>
                        <div style={{ fontSize: 11, color: '#854F0B', marginTop: 6 }}>
                          {isIntro
                            ? `Betaalt nu ${s.price_currency} ${parseFloat(String(s.intro_price)).toFixed(2).replace('.', ',')} → daarna ${s.price_currency} ${parseFloat(String(s.price)).toFixed(2).replace('.', ',')}`
                            : `Introductieprijs verlopen — betaalt nu ${s.price_currency} ${parseFloat(String(s.price)).toFixed(2).replace('.', ',')}`
                          }
                        </div>
                      </div>
                    ) : (
                      <button className="add-intro-btn" onClick={() => updateField(i, 'intro_price', '1')}>
                        + Introductieprijs toevoegen (bijv. 1e jaar € 1,-)
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
            <button className="add-btn" onClick={addBlank}>+ Zelf toevoegen</button>
          </>
        )}

        {/* ── OVERZICHT ── */}
        {panel === 'overzicht' && (
          <>
            <div className="totals">
              <div className="total-card"><div className="label">Per maand</div><div className="value">{fmt(totalNow, currency)}</div></div>
              <div className="total-card"><div className="label">Per jaar</div><div className="value">{fmt(totalNow * 12, currency)}</div></div>
              <div className="total-card"><div className="label">Aantal</div><div className="value">{subs.length}</div></div>
            </div>
            <div className="export-row">
              <button className="export-btn" onClick={exportCSV}>📄 Export CSV</button>
              <button className="export-btn" onClick={() => window.print()}>🖨️ Print / PDF</button>
            </div>
            {subs.length === 0 ? (
              <div className="empty-state">Nog geen abonnementen.</div>
            ) : (
              <OverzichtCharts subs={subs} currency={currency} fmt={fmt} />
            )}
          </>
        )}

        {/* ── INZICHTEN ── */}
        {panel === 'inzichten' && (
          <>
            <div className="totals">
              <div className="total-card"><div className="label">Per maand</div><div className="value">{fmt(totalNow, currency)}</div></div>
              <div className="total-card"><div className="label">Per jaar</div><div className="value">{fmt(totalNow * 12, currency)}</div></div>
            </div>
            {analysesCat ? (
              <AnalyseView cat={analysesCat} subs={subs} currency={currency} fmt={fmt} onBack={() => setAnalyseCat(null)} />
            ) : (
              <InzichtenList subs={subs} currency={currency} fmt={fmt} totalNow={totalNow} onAnalyse={setAnalyseCat} />
            )}
          </>
        )}

        {/* ── DELEN ── */}
        {panel === 'delen' && (
          <div className="share-panel">
            <div className="share-card">
              <div style={{ fontSize: 28, marginBottom: 12 }}>👨‍👩‍👦</div>
              <div style={{ fontSize: 15, fontWeight: 500, marginBottom: 6 }}>Data delen met je partner</div>
              <div style={{ fontSize: 13, color: '#8A8A8F', marginBottom: 20, lineHeight: 1.6 }}>
                Koppel jullie accounts zodat je samen één lijst bijhoudt. Alle wijzigingen zijn direct zichtbaar voor elkaar.
              </div>

              {familyId ? (
                <>
                  <div className="share-status connected">● Gekoppeld als gezinsgroep</div>
                  <div className="share-code-block">
                    <div style={{ fontSize: 10, color: '#B4B4BA', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8 }}>Gezinscode</div>
                    <div className="share-code-row">
                      <code className="share-code">{familyId}</code>
                      <button className="copy-btn" onClick={copyCode}>{copyLabel}</button>
                    </div>
                    <div style={{ fontSize: 12, color: '#8A8A8F' }}>Stuur deze code naar je partner. Die voert hem in onder "Koppelen met code".</div>
                  </div>
                  {familyStatus === 'success' && <div className="success-msg">{familyMsg}</div>}
                  <button className="leave-btn" onClick={leaveFamily}>Gezinsgroep verlaten</button>
                </>
              ) : (
                <>
                  <div className="share-status disconnected">○ Nog niet gekoppeld</div>
                  <div className="share-options">
                    <div className="share-option">
                      <div className="share-option-title">Nieuwe gezinsgroep starten</div>
                      <div className="share-option-desc">Jij maakt een code aan die je deelt met je partner.</div>
                      <button className="share-action-btn primary" onClick={createFamily} disabled={familyStatus === 'saving'}>
                        {familyStatus === 'saving' ? 'Aanmaken...' : '+ Gezinsgroep aanmaken'}
                      </button>
                    </div>
                    <div className="share-divider">of</div>
                    <div className="share-option">
                      <div className="share-option-title">Koppelen met bestaande code</div>
                      <div className="share-option-desc">Voer de gezinscode in die je van je partner hebt gekregen.</div>
                      <div className="share-input-row">
                        <input type="text" className="share-input" placeholder="Plak hier de gezinscode..."
                          value={familyInput} onChange={e => setFamilyInput(e.target.value)} />
                        <button className="share-action-btn" onClick={joinFamily} disabled={familyStatus === 'saving' || !familyInput.trim()}>
                          Koppelen
                        </button>
                      </div>
                    </div>
                  </div>
                  {familyStatus === 'error' && <div className="error-msg">{familyMsg}</div>}
                </>
              )}
            </div>
          </div>
        )}

      </div>
    </div>
  )
}

// ── Overzicht Charts Component ───────────────────────────

function OverzichtCharts({ subs, currency, fmt }: { subs: Subscription[], currency: Currency, fmt: (n: number, c: Currency) => string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const chartRef = useRef<unknown>(null)
  const totalNow = subs.reduce((t, s) => t + effectiveMonthlyEUR(s), 0)

  const catEntries = Object.entries(
    subs.reduce((acc, s) => {
      const cat = s.cat || 'Overig'
      acc[cat] = (acc[cat] || 0) + effectiveMonthlyEUR(s)
      return acc
    }, {} as Record<string, number>)
  ).sort((a, b) => b[1] - a[1])

  useEffect(() => {
    if (!canvasRef.current) return
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const Chart = (window as any).Chart
    if (!Chart) return
    if (chartRef.current) (chartRef.current as { destroy: () => void }).destroy()
    chartRef.current = new Chart(canvasRef.current, {
      type: 'doughnut',
      data: {
        labels: catEntries.map(e => e[0]),
        datasets: [{ data: catEntries.map(e => e[1]), backgroundColor: COLORS.slice(0, catEntries.length), borderWidth: 0 }]
      },
      options: { responsive: true, maintainAspectRatio: false, cutout: '60%', plugins: { legend: { display: false } } }
    })
    return () => { if (chartRef.current) (chartRef.current as { destroy: () => void }).destroy() }
  }, [subs, currency])

  return (
    <div className="chart-grid">
      <div className="chart-card">
        <div className="chart-title">Per categorie</div>
        <div className="chart-sub">{fmt(totalNow, currency)} per maand</div>
        <div style={{ position: 'relative', height: 200 }}>
          <canvas ref={canvasRef} role="img" aria-label="Taartdiagram abonnementen per categorie" />
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12, fontSize: 12, color: '#8A8A8F' }}>
          {catEntries.map(([l], i) => (
            <span key={l} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 8, height: 8, borderRadius: 2, background: COLORS[i], flexShrink: 0 }} />
              {l}
            </span>
          ))}
        </div>
      </div>
      <div className="chart-card">
        <div className="chart-title">Verdeling</div>
        <div className="chart-sub">maandelijks per categorie</div>
        {catEntries.map(([cat, amt], i) => {
          const pct = totalNow > 0 ? (amt / totalNow * 100) : 0
          return (
            <div key={cat} className="cat-row">
              <div className="cat-left">
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: COLORS[i], flexShrink: 0 }} />
                <span>{cat}</span>
              </div>
              <div className="cat-right">
                <div>{fmt(amt, currency)}/mnd</div>
                <div style={{ fontSize: 11, color: '#B4B4BA' }}>{pct.toFixed(0)}% · {fmt(amt * 12, currency)}/jr</div>
                <div className="bar-track"><div className="bar-fill" style={{ width: `${pct.toFixed(1)}%`, background: COLORS[i] }} /></div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Inzichten Component ─────────────────────────────────

function InzichtenList({ subs, currency, fmt, totalNow, onAnalyse }: {
  subs: Subscription[], currency: Currency, fmt: (n: number, c: Currency) => string,
  totalNow: number, onAnalyse: (cat: string) => void
}) {
  const streaming = subs.filter(s => s.cat === 'Streaming')
  const dollarSubs = subs.filter(s => s.price_currency === '$')
  const introSubs = subs.filter(s => s.intro_price && s.intro_until && (daysUntil(s.intro_until) ?? -1) >= 0)
  const cats: Record<string, number> = {}
  subs.forEach(s => { cats[s.cat || 'Overig'] = (cats[s.cat || 'Overig'] || 0) + 1 })
  const topCat = Object.entries(cats).sort((a, b) => b[1] - a[1])[0]

  const insights = [
    streaming.length > 1 && {
      icon: 'warn', sym: '!',
      title: `${streaming.length} streamingdiensten — overlap waarschijnlijk`,
      body: `Je betaalt ${streaming.map(s => s.name).join(', ')} samen ${fmt(streaming.reduce((t, s) => t + effectiveMonthlyEUR(s), 0), currency)}/mnd.`,
      actions: [{ label: 'Analyseer streaming ↗', cat: 'Streaming', primary: true }]
    },
    dollarSubs.length > 0 && {
      icon: 'info', sym: 'i',
      title: `${dollarSubs.length} abonnement${dollarSubs.length > 1 ? 'en' : ''} in dollars`,
      body: `${dollarSubs.map(s => s.name).join(' en ')} worden in USD afgeschreven. Wisselkoers kan maandelijks variëren.`,
      actions: []
    },
    introSubs.length > 0 && {
      icon: 'warn', sym: '!',
      title: `${introSubs.length} introductieprijs loopt binnenkort af`,
      body: introSubs.map(s => `${s.name}: nog ${daysUntil(s.intro_until)}d, daarna ${s.price_currency} ${parseFloat(String(s.price)).toFixed(2).replace('.', ',')}/${s.cycle}`).join(' · '),
      actions: []
    },
    topCat && {
      icon: 'info', sym: 'i',
      title: `${topCat[0]} is je grootste categorie`,
      body: `Je hebt ${topCat[1]} abonnement${topCat[1] > 1 ? 'en' : ''} in ${topCat[0]}. Zijn ze allemaal actief in gebruik?`,
      actions: [{ label: `Analyseer ${topCat[0]} ↗`, cat: topCat[0], primary: false }]
    },
    {
      icon: 'save', sym: '€',
      title: `Totaal: ${fmt(totalNow * 12, currency)} per jaar`,
      body: `Dat is ${fmt(totalNow, currency)} per maand. ${totalNow < 180 ? 'Je zit onder het Nederlandse gemiddelde van €180/mnd.' : 'Je zit boven het Nederlandse gemiddelde van €180/mnd.'}`,
      actions: []
    }
  ].filter(Boolean) as { icon: string; sym: string; title: string; body: string; actions: { label: string; cat: string; primary: boolean }[] }[]

  return (
    <div className="insights-list">
      {insights.map((ins, idx) => (
        <div key={idx} className="insight-card">
          <div className={`i-icon ${ins.icon}`}>{ins.sym}</div>
          <div style={{ flex: 1 }}>
            <div className="i-title">{ins.title}</div>
            <div className="i-body">{ins.body}</div>
            {ins.actions.length > 0 && (
              <div className="i-actions">
                {ins.actions.map(a => (
                  <button key={a.label} className={`i-action-btn${a.primary ? ' primary' : ''}`} onClick={() => onAnalyse(a.cat)}>
                    {a.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

// ── Analyse Component ────────────────────────────────────

function AnalyseView({ cat, subs, currency, fmt, onBack }: {
  cat: string, subs: Subscription[], currency: Currency,
  fmt: (n: number, c: Currency) => string, onBack: () => void
}) {
  const catSubs = subs.filter(s => s.cat === cat)
  const total = catSubs.reduce((t, s) => t + effectiveMonthlyEUR(s), 0)
  const sorted = [...catSubs].sort((a, b) => effectiveMonthlyEUR(b) - effectiveMonthlyEUR(a))

  const questions = [
    `Welke ${cat} dienst kan ik het best opzeggen?`,
    `Zijn er goedkopere alternatieven voor ${sorted[0]?.name || cat}?`,
    catSubs.length > 1 ? `Gebruik ik ${catSubs.map(s => s.name).join(' en ')} allemaal actief?` : `Gebruik ik ${catSubs[0]?.name || cat} genoeg voor de prijs?`
  ]

  return (
    <div className="analyse-wrap">
      <div className="analyse-header">
        <button className="back-btn" onClick={onBack}>← Terug</button>
        <div>
          <div style={{ fontSize: 14, fontWeight: 500 }}>{cat} analyse</div>
          <div style={{ fontSize: 12, color: '#8A8A8F' }}>{catSubs.length} diensten · {fmt(total, currency)}/mnd · {fmt(total * 12, currency)}/jaar</div>
        </div>
      </div>

      <div className="chips-row">
        {sorted.map((s, i) => (
          <div key={s.id} className={`sub-chip${i === 0 ? ' hl' : ''}`}>
            <div className="cn">{s.name}</div>
            <div className="cp">{fmt(effectiveMonthlyEUR(s), currency)}/mnd</div>
          </div>
        ))}
      </div>

      <div className="insights-list">
        {catSubs.length > 1 && (
          <div className="insight-card">
            <div className="i-icon warn">!</div>
            <div>
              <div className="i-title">{fmt(total * 12, currency)}/jaar aan {cat}</div>
              <div className="i-body">Je hebt {catSubs.length} diensten. Gemiddeld gebruikt een huishouden maar 1-2 actief. Overweeg welke je het meest gebruikt.</div>
              <span className="i-saving">Besparing bij opzeggen {sorted[sorted.length - 1]?.name}: {fmt(effectiveMonthlyEUR(sorted[sorted.length - 1]), currency)}/mnd</span>
            </div>
          </div>
        )}
        <div className="insight-card">
          <div className="i-icon info">i</div>
          <div>
            <div className="i-title">{sorted[0]?.name} is je duurste in deze categorie</div>
            <div className="i-body">{fmt(effectiveMonthlyEUR(sorted[0]), currency)}/mnd. Controleer of je alle features gebruikt waarvoor je betaalt.</div>
          </div>
        </div>
      </div>

      <div className="deeper-title">Vertel me meer</div>
      <div className="q-list">
        {questions.map(q => (
          <button key={q} className="q-btn" onClick={() => alert('In de echte app start dit een gesprek met Claude.')}>
            <span>{q}</span>
            <span className="q-arr">↗</span>
          </button>
        ))}
      </div>
    </div>
  )
}
