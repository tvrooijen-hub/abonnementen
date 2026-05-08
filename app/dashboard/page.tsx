'use client'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createBrowserClient } from '@supabase/ssr'
import { CATS, PAYMENT_METHODS, fmt, daysUntil, logoUrl, defaultKenmerken, effectiveMonthlyEUR, effectiveMonthlyEURForDate } from '@/lib/types'

const CAT_NAMES = Object.keys(CATS)
const EUR_PER_USD = 1 / 1.08
const COLORS = ['#378ADD','#1D9E75','#D85A30','#D4537E','#BA7517','#639922','#7F77DD','#5DCAA5','#E8A838','#9B6DCC','#E06030','#4A90D9']

function getSupabase() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

function nullDate(d: string) { return d || null }

// ── Prognose data builder ─────────────────────────────────────
function buildPrognoseData(subs: any[]) {
  const now = new Date()
  const months = []
  for (let i = 0; i < 24; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() + i, 1)
    const yr = d.getFullYear(), mo = d.getMonth()
    const activeSubs = subs.filter(s => {
      if (s.status !== 'actief') return false
      if (s.renew_date && new Date(s.renew_date) < d) return false
      return true
    })
    const total = activeSubs.reduce((t: number, s: any) => t + effectiveMonthlyEURForDate(s, d), 0)
    const label = d.toLocaleDateString('nl-NL', { month: 'short', year: '2-digit' })
    const events: any[] = []
    activeSubs.forEach((s: any) => {
      ;(s.price_history || []).forEach((ph: any) => {
        if (!ph.valid_from || !ph.price) return
        const phd = new Date(ph.valid_from)
        if (phd.getFullYear() === yr && phd.getMonth() === mo) {
          const prevDate = new Date(yr, mo - 1, 15)
          const prev = (s.price_history || [])
            .filter((p: any) => p.valid_from && new Date(p.valid_from) <= prevDate)
            .sort((a: any, b: any) => b.valid_from.localeCompare(a.valid_from))
          const prevPrice = prev.length ? parseFloat(prev[0].price) : parseFloat(s.price)
          const newPrice = parseFloat(ph.price)
          let deltaM = newPrice - prevPrice
          if (s.price_currency === '$') deltaM *= EUR_PER_USD
          if (s.cycle === 'jaar') deltaM /= 12
          if (s.cycle === 'kwartaal') deltaM /= 3
          events.push({ type: 'price-change', name: s.name, delta: deltaM, detail: `${deltaM > 0 ? '↑' : '↓'} € ${newPrice.toFixed(2).replace('.', ',')}/${s.cycle}${ph.note ? ' · ' + ph.note : ''}` })
        }
      })
      if (s.renew_date && s.cycle === 'jaar') {
        const rd = new Date(s.renew_date)
        let rr = new Date(rd)
        const today = new Date(); today.setHours(0, 0, 0, 0)
        while (rr < today) rr.setFullYear(rr.getFullYear() + 1)
        if (rr.getFullYear() === yr && rr.getMonth() === mo)
          events.push({ type: 'annual', name: s.name, delta: 0, detail: `Jaarverlenging: ${fmt(effectiveMonthlyEURForDate(s, d) * 12)}` })
      }
    })
    months.push({ yr, mo, label, total, events })
  }
  return months
}

// ── Donut chart (pure Canvas) ─────────────────────────────────
function DonutChart({ data, colors }: { data: { label: string; value: number }[]; colors: string[] }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const total = data.reduce((t, d) => t + d.value, 0)
  useEffect(() => {
    const canvas = ref.current; if (!canvas || !total) return
    const ctx = canvas.getContext('2d'); if (!ctx) return
    const dpr = window.devicePixelRatio || 1
    const w = canvas.offsetWidth
    canvas.width = w * dpr; canvas.height = w * dpr
    ctx.scale(dpr, dpr)
    const cx = w / 2, cy = w / 2, r = w * 0.38, ir = w * 0.24
    ctx.clearRect(0, 0, w, w)
    let angle = -Math.PI / 2
    data.forEach((d, i) => {
      const slice = (d.value / total) * 2 * Math.PI
      ctx.beginPath(); ctx.moveTo(cx, cy)
      ctx.arc(cx, cy, r, angle, angle + slice)
      ctx.closePath(); ctx.fillStyle = colors[i % colors.length]; ctx.fill()
      angle += slice
    })
    ctx.beginPath(); ctx.arc(cx, cy, ir, 0, 2 * Math.PI)
    ctx.fillStyle = '#FFFFFF'; ctx.fill()
    ctx.font = `600 ${w * 0.075}px 'DM Mono', monospace`
    ctx.fillStyle = '#18181B'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText(fmt(total), cx, cy - w * 0.03)
    ctx.font = `400 ${w * 0.052}px 'DM Sans', sans-serif`
    ctx.fillStyle = '#8A8A8F'
    ctx.fillText('per maand', cx, cy + w * 0.05)
  }, [data, total])
  if (!total) return null
  return <canvas ref={ref} style={{ width: '100%', aspectRatio: '1', display: 'block' }} />
}

// ── Line chart (pure Canvas) ──────────────────────────────────
function LineChart({ months }: { months: any[] }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = ref.current; if (!canvas || !months.length) return
    const ctx = canvas.getContext('2d'); if (!ctx) return
    const dpr = window.devicePixelRatio || 1
    const W = canvas.offsetWidth, H = canvas.offsetHeight
    canvas.width = W * dpr; canvas.height = H * dpr
    ctx.scale(dpr, dpr)
    ctx.clearRect(0, 0, W, H)
    const pad = { top: 16, right: 16, bottom: 40, left: 52 }
    const cw = W - pad.left - pad.right, ch = H - pad.top - pad.bottom
    const values = months.map(m => m.total)
    const rawMin = Math.min(...values)
    const rawMax = Math.max(...values)
    const minV = Math.max(0, Math.floor(rawMin * 0.85 / 50) * 50)
    const maxV = (Math.ceil(rawMax * 1.08 / 50) * 50) || 100
    const xOf = (i: number) => pad.left + (i / (months.length - 1)) * cw
    const yOf = (v: number) => pad.top + ch - ((v - minV) / (maxV - minV)) * ch
    // Grid
    ctx.strokeStyle = 'rgba(0,0,0,.05)'; ctx.lineWidth = 1
    const tickCount = 5
    for (let g = 0; g <= tickCount; g++) {
      const v = minV + (maxV - minV) * (1 - g / tickCount)
      const y = pad.top + (g / tickCount) * ch
      ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(pad.left + cw, y); ctx.stroke()
      ctx.fillStyle = '#8A8A8F'; ctx.font = `10px 'DM Mono',monospace`; ctx.textAlign = 'right'
      ctx.fillText(`€ ${Math.round(v)}`, pad.left - 4, y + 4)
    }
    // X labels
    months.forEach((m, i) => {
      if (i % 6 === 0 || i === months.length - 1) {
        ctx.fillStyle = '#8A8A8F'; ctx.font = `9px 'DM Sans',sans-serif`; ctx.textAlign = 'center'
        ctx.fillText(m.label, xOf(i), H - pad.bottom + 14)
      }
    })
    // Fill
    const grad = ctx.createLinearGradient(0, pad.top, 0, pad.top + ch)
    grad.addColorStop(0, 'rgba(55,138,221,0.12)'); grad.addColorStop(1, 'rgba(55,138,221,0)')
    ctx.beginPath()
    months.forEach((m, i) => i === 0 ? ctx.moveTo(xOf(i), yOf(m.total)) : ctx.lineTo(xOf(i), yOf(m.total)))
    ctx.lineTo(xOf(months.length - 1), pad.top + ch); ctx.lineTo(xOf(0), pad.top + ch)
    ctx.closePath(); ctx.fillStyle = grad; ctx.fill()
    // Line
    for (let i = 1; i < months.length; i++) {
      const delta = months[i].total - months[i - 1].total
      ctx.beginPath(); ctx.moveTo(xOf(i - 1), yOf(months[i - 1].total)); ctx.lineTo(xOf(i), yOf(months[i].total))
      ctx.strokeStyle = delta > 0.05 ? '#D85A30' : delta < -0.05 ? '#1D9E75' : '#378ADD'
      ctx.lineWidth = 2.5; ctx.stroke()
    }
    // Event dots
    months.forEach((m, i) => {
      if (m.events.length > 0 || i === 0) {
        ctx.beginPath(); ctx.arc(xOf(i), yOf(m.total), i === 0 ? 5 : 6, 0, 2 * Math.PI)
        ctx.fillStyle = m.events.some((e: any) => e.delta > 0) ? '#D85A30' : m.events.some((e: any) => e.delta < 0) ? '#1D9E75' : '#378ADD'
        ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke()
      }
    })
  }, [months])
  return <canvas ref={ref} style={{ width: '100%', height: '100%', display: 'block' }} />
}

export default function Dashboard() {
  const router = useRouter()
  const [subs, setSubs] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [panel, setPanel] = useState('beheer')
  const [activeCat, setActiveCat] = useState(CAT_NAMES[0])
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const [openAccordions, setOpenAccordions] = useState<Set<string>>(new Set())
  const [addOpen, setAddOpen] = useState(false)
  const [addForm, setAddForm] = useState<any>({ name: '', price: '', cycle: 'maand', renew_date: '', payment_method: '', cat: '', domain: '' })
  const [overstapOpen, setOverstapOpen] = useState(false)
  const [overstapSub, setOverstapSub] = useState<any>(null)
  const [overstapStep, setOverstapStep] = useState(1)
  const [overstapData, setOverstapData] = useState({ opzegDatum: '', nieuweNaam: '', nieuwePrijs: '', nieuweCyclus: 'maand' })
  const [progTableExpanded, setProgTableExpanded] = useState(false)
  const [renewFilter, setRenewFilter] = useState(0) // 0=alle, 7=week, 30=maand
  // AI upload
  const [aiOpen, setAiOpen] = useState(false)
  const [aiSub, setAiSub] = useState<any>(null)
  const [aiStep, setAiStep] = useState<'upload' | 'result'>('upload')
  const [aiLoading, setAiLoading] = useState(false)
  const [aiResult, setAiResult] = useState<any>(null)
  const [aiError, setAiError] = useState('')
  const [aiForm, setAiForm] = useState<any>({})
  const fileInputRef = useRef<HTMLInputElement>(null)
  // Delen
  const [familyId, setFamilyId] = useState<string | null>(null)
  const [familyInput, setFamilyInput] = useState('')
  const [familyCopied, setFamilyCopied] = useState(false)

  function getSupabaseClient() { return createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!) }

  useEffect(() => {
    const sb = getSupabaseClient()
    sb.auth.getSession().then(({ data }) => {
      if (!data.session) router.replace('/login')
      else { fetchSubs(); loadFamilyId() }
    })
  }, [])

  async function fetchSubs() {
    const sb = getSupabaseClient()
    const { data } = await sb.from('subscriptions')
      .select('*, kenmerken(id, key, value, sort_order), price_history(id, price, valid_from, note)')
      .order('created_at', { ascending: true })
    setSubs(data || [])
    setLoading(false)
  }

  async function loadFamilyId() {
    const sb = getSupabaseClient()
    const { data: { user } } = await sb.auth.getUser()
    if (!user) return
    const { data } = await sb.from('profiles').select('family_id').eq('id', user.id).single()
    if (data?.family_id) setFamilyId(data.family_id)
  }

  async function updateField(sub: any, fields: any) {
    const sb = getSupabaseClient()
    const { kenmerken, price_history, ...rest } = fields
    if (rest.renew_date === '') rest.renew_date = null
    if (Object.keys(rest).length) await sb.from('subscriptions').update(rest).eq('id', sub.id)
    if (kenmerken !== undefined) {
      await sb.from('kenmerken').delete().eq('subscription_id', sub.id)
      if (kenmerken.length) await sb.from('kenmerken').insert(
        kenmerken.map((k: any, i: number) => ({ subscription_id: sub.id, user_id: sub.user_id, key: k.key, value: k.value || '', sort_order: i }))
      )
    }
    if (price_history !== undefined) {
      // Keep all rows in local state immediately (incl. blank new rows)
      setSubs(prev => prev.map(s => s.id === sub.id ? { ...s, price_history } : s))
      // Only persist rows that have both date and price filled in
      await sb.from('price_history').delete().eq('subscription_id', sub.id)
      const valid = price_history.filter((ph: any) => ph.valid_from && ph.price)
      if (valid.length) await sb.from('price_history').insert(
        valid.map((ph: any) => ({ subscription_id: sub.id, user_id: sub.user_id, price: ph.price, valid_from: ph.valid_from, note: ph.note || null }))
      )
      return
    }
    fetchSubs()
  }

  async function addSub(data: any) {
    const sb = getSupabaseClient()
    const { data: { user } } = await sb.auth.getUser()
    const { kenmerken, ...rest } = data
    if (rest.renew_date === '') rest.renew_date = null
    const { data: sub } = await sb.from('subscriptions').insert({ ...rest, user_id: user!.id }).select().single()
    if (sub && kenmerken?.length) await sb.from('kenmerken').insert(
      kenmerken.map((k: any, i: number) => ({ subscription_id: sub.id, user_id: user!.id, key: k.key, value: k.value || '', sort_order: i }))
    )
    setAddOpen(false)
    fetchSubs()
  }

  async function deleteSub(id: string) {
    const sb = getSupabaseClient()
    await sb.from('subscriptions').delete().eq('id', id)
    fetchSubs()
  }

  async function confirmOverstap() {
    if (!overstapSub) return
    const sb = getSupabaseClient()
    const { data: { user } } = await sb.auth.getUser()
    const { data: newSub } = await sb.from('subscriptions').insert({
      name: overstapData.nieuweNaam, price: parseFloat(overstapData.nieuwePrijs) || 0,
      price_currency: overstapSub.price_currency, cycle: overstapData.nieuweCyclus,
      renew_date: null, cat: overstapSub.cat, payment_method: overstapSub.payment_method,
      domain: '', status: 'actief', predecessor_id: overstapSub.id, user_id: user!.id
    }).select().single()
    await sb.from('subscriptions').update({
      status: 'opgezegd', successor_id: newSub?.id,
      renew_date: nullDate(overstapData.opzegDatum) || overstapSub.renew_date || null
    }).eq('id', overstapSub.id)
    setOverstapOpen(false); fetchSubs()
  }

  async function handleLogout() {
    const sb = getSupabaseClient()
    await sb.auth.signOut()
    router.replace('/login')
  }

  function toggleAccordion(id: string) {
    setOpenAccordions(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  // ── AI contract upload ─────────────────────────────────────
  function openAi(sub: any | null) { setAiSub(sub); setAiStep('upload'); setAiResult(null); setAiError(''); setAiOpen(true) }

  async function handleAiFile(file: File) {
    setAiLoading(true); setAiError('')
    try {
      const base64 = await new Promise<string>((res, rej) => {
        const reader = new FileReader()
        reader.onload = () => res((reader.result as string).split(',')[1])
        reader.onerror = rej; reader.readAsDataURL(file)
      })
      const resp = await fetch('/api/extract', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ base64, mediaType: file.type })
      })
      const json = await resp.json()
      if (json.error) throw new Error(json.error)
      setAiResult(json)
      setAiForm({ name: json.naam || aiSub?.name || '', price: json.prijs || aiSub?.price || '', cycle: json.cyclus || aiSub?.cycle || 'maand', renew_date: json.verlengdatum || aiSub?.renew_date || '', payment_method: aiSub?.payment_method || '' })
      setAiStep('result')
    } catch (e: any) { setAiError(e.message || 'Verwerking mislukt') }
    setAiLoading(false)
  }

  async function confirmAiUpdate() {
    if (aiSub) {
      await updateField(aiSub, { name: aiForm.name, price: parseFloat(aiForm.price) || aiSub.price, cycle: aiForm.cycle, renew_date: aiForm.renew_date || null, payment_method: aiForm.payment_method })
    } else {
      await addSub({ name: aiForm.name, price: parseFloat(aiForm.price) || 0, price_currency: '€', cycle: aiForm.cycle, renew_date: aiForm.renew_date || null, payment_method: aiForm.payment_method, cat: activeCat, domain: '', status: 'actief', kenmerken: defaultKenmerken(activeCat) })
    }
    setAiOpen(false); setAiStep('upload'); setAiResult(null); setAiError('')
  }

  // ── Delen / Family ─────────────────────────────────────────
  async function createFamily() {
    const sb = getSupabaseClient()
    const { data: { user } } = await sb.auth.getUser()
    if (!user) return
    const newId = crypto.randomUUID()
    await sb.from('profiles').upsert({ id: user.id, family_id: newId })
    setFamilyId(newId)
  }

  async function joinFamily() {
    if (!familyInput.trim()) return
    const sb = getSupabaseClient()
    const { data: { user } } = await sb.auth.getUser()
    if (!user) return
    await sb.from('profiles').upsert({ id: user.id, family_id: familyInput.trim() })
    setFamilyId(familyInput.trim()); setFamilyInput('')
  }

  async function leaveFamily() {
    const sb = getSupabaseClient()
    const { data: { user } } = await sb.auth.getUser()
    if (!user) return
    await sb.from('profiles').upsert({ id: user.id, family_id: null })
    setFamilyId(null)
  }

  function exportCSV() {
    const rows = [['Naam','Prijs','Munt','Cyclus','Maand €','Categorie','Verlengdatum','Betaling','Status']]
    subs.forEach(s => rows.push([s.name, s.price, s.price_currency, s.cycle, effectiveMonthlyEUR(s).toFixed(2), s.cat, s.renew_date || '', s.payment_method || '', s.status]))
    const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n')
    const a = document.createElement('a'); a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv)
    a.download = 'abonnementen.csv'; a.click()
  }

  // ── Derived ────────────────────────────────────────────────
  const activeSubs = subs.filter(s => s.status === 'actief')
  const cancelledSubs = subs.filter(s => s.status === 'opgezegd')
  const totalMonthly = activeSubs.reduce((t, s) => t + effectiveMonthlyEUR(s), 0)
  const savedMonthly = cancelledSubs.reduce((t, s) => {
    if (s.successor_id) { const succ = subs.find(x => x.id === s.successor_id); return t + effectiveMonthlyEUR(s) - (succ ? effectiveMonthlyEUR(succ) : 0) }
    return t + effectiveMonthlyEUR(s)
  }, 0)
  const catBreakdown = CAT_NAMES
    .map(c => ({ cat: c, subs: activeSubs.filter(s => s.cat === c), total: activeSubs.filter(s => s.cat === c).reduce((t, s) => t + effectiveMonthlyEUR(s), 0) }))
    .filter(c => c.total > 0).sort((a, b) => b.total - a.total)
  const prognoseMonths = buildPrognoseData(subs)

  if (loading) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: '#8A8A8F' }}>Laden…</div>

  return (
    <div className="app-container">
      <nav className="nav">
        <div className="nav-tabs">
          {[['beheer','Abonnementen'],['overzicht','Overzicht'],['inzichten','Inzichten'],['prognose','Prognose'],['delen','Delen']].map(([p,l]) => (
            <button key={p} className={`tab${panel===p?' active':''}`} onClick={() => setPanel(p)}>{l}</button>
          ))}
          <button className="logout-btn" onClick={handleLogout} style={{marginLeft:'auto',alignSelf:'center'}}>Uitloggen</button>
        </div>
      </nav>

      <div className="panel">

        {/* ══════════════ BEHEER ══════════════ */}
        {panel === 'beheer' && <>
          <div className="totals">
            <div className="total-card"><div className="lbl">Per maand</div><div className="val">{fmt(totalMonthly)}</div></div>
            <div className="total-card"><div className="lbl">Per jaar</div><div className="val">{fmt(totalMonthly*12)}</div></div>
            {savedMonthly > 0.01 && <div className="total-card"><div className="lbl">Bespaard</div><div className="val" style={{color:'var(--green)'}}>{fmt(savedMonthly)}/mnd</div></div>}
          </div>

          <div style={{display:'flex',gap:8,marginBottom:14,flexWrap:'wrap'}}>
            <button className="export-btn" onClick={exportCSV}>📄 Export CSV</button>
            <button className="export-btn" onClick={()=>openAi(null)}>🤖 AI Contract scannen</button>
          </div>

          <div className="cat-pills">
            {CAT_NAMES.map(c => <button key={c} className={`cat-pill${activeCat===c?' active':''}`} onClick={() => setActiveCat(c)}>{CATS[c].icon} {c}</button>)}
          </div>

          {CATS[activeCat]?.items.length > 0 && (
            <div className="suggestions-grid">
              {CATS[activeCat].items.map(item => {
                const exists = subs.some(s => s.name?.toLowerCase() === item.name.toLowerCase())
                return <button key={item.name} className={`suggestion-chip${exists?' active':''}`}
                  onClick={() => !exists && addSub({ name: item.name, price: item.price, price_currency:'€', cycle: item.cycle, renew_date: null, cat: activeCat, domain: item.domain, payment_method:'', status:'actief', kenmerken: defaultKenmerken(activeCat) })}>
                  {item.name}
                </button>
              })}
            </div>
          )}

          {/* Notif banner — persistent */}
          {(()=>{const soon=activeSubs.filter(s=>{const d=daysUntil(s.renew_date);return d!==null&&d>=0&&d<=7});return soon.length>0&&(
            <div style={{padding:'10px 14px',background:'var(--amber-bg)',border:'1px solid #F5D89A',borderRadius:'var(--radius-sm)',marginBottom:12,fontSize:13,color:'var(--amber)',display:'flex',gap:8,alignItems:'flex-start'}}>
              <span>🔔</span>
              <span><strong>Binnenkort te verlengen:</strong> {soon.map(s=>{const d=daysUntil(s.renew_date);return `${s.name} (${d===0?'vandaag':d===1?'morgen':'over '+d+'d'})`}).join(' · ')}</span>
            </div>
          )})()}
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:10,gap:8,flexWrap:'wrap'}}>
            <div className="section-lbl" style={{marginBottom:0}}>Mijn abonnementen</div>
            <select value={renewFilter} onChange={e=>setRenewFilter(parseInt(e.target.value))} style={{fontSize:12,padding:'4px 8px',border:'1px solid var(--border)',borderRadius:'var(--radius-xs)',background:'var(--surface)',color:'var(--muted)'}}>
              <option value={0}>Alle abonnementen</option>
              <option value={7}>Verlengt binnen 7 dagen</option>
              <option value={30}>Verlengt binnen 30 dagen</option>
            </select>
          </div>
          <div className="sub-list">
            {subs.filter(s=>renewFilter===0||((daysUntil(s.renew_date)??999)<=renewFilter&&(daysUntil(s.renew_date)??-1)>=0)).map(s => {
              const isExpanded = expandedIds.has(s.id)
              const days = daysUntil(s.renew_date)
              const monthly = effectiveMonthlyEUR(s)
              const expiringStyle = s.status==='actief'&&days!==null&&days<=7 ? {borderColor:'#F5D89A',background:'linear-gradient(90deg,#FFFBF0 0%,var(--surface) 100%)'} : {}
              return (
                <div key={s.id}>
                  <div className={`sub-row-collapsed${s.status==='opgezegd'?' cancelled':''}${isExpanded?' expanded':''}`}
                    style={expiringStyle}
                    onClick={() => setExpandedIds(prev => { const n=new Set(prev); n.has(s.id)?n.delete(s.id):n.add(s.id); return n })}>
                    <div className="sub-row-logo">
                      {s.domain ? <img src={logoUrl(s.domain)} width={24} height={24} style={{borderRadius:6}} onError={e=>(e.target as any).style.display='none'} alt="" /> : <span style={{fontSize:18}}>{CATS[s.cat]?.icon||'📌'}</span>}
                    </div>
                    <span className="sub-row-name">{s.name||'(geen naam)'}</span>
                    <div className="sub-row-meta">
                      <span className="sub-row-price">{fmt(monthly)}/mnd</span>
                      <span className="sub-row-cycle">{s.cycle}</span>
                      {s.status==='opgezegd' ? <span className="badge badge-cancelled">Opgezegd</span>
                        : days!==null&&days<=7 ? <span className="badge badge-soon">over {days}d</span>
                        : days!==null&&days<=30 ? <span className="badge badge-ok">over {days}d</span> : null}
                    </div>
                    <span className={`expand-chevron${isExpanded?' open':''}`}>▶</span>
                    <button className="sub-del-sm" onClick={e=>{e.stopPropagation();deleteSub(s.id)}}>✕</button>
                  </div>

                  {isExpanded && (
                    <div className="sub-detail">
                      <div style={{display:'flex',gap:8,alignItems:'center',marginBottom:10}}>
                        <input className="field-input" style={{flex:1}} defaultValue={s.name} onBlur={e=>updateField(s,{name:e.target.value})} placeholder="Naam abonnement" />
                        <button className="ai-upload-btn" onClick={()=>openAi(s)}>🤖 AI</button>
                      </div>
                      <div className="sub-fields">
                        <div className="field-group">
                          <div className="field-label">Prijs (€)</div>
                          <input className="field-input" type="number" defaultValue={s.price} step={0.01} onBlur={e=>updateField(s,{price:parseFloat(e.target.value)||0})} />
                        </div>
                        <div className="field-group">
                          <div className="field-label">Cyclus</div>
                          <select className="field-input" defaultValue={s.cycle} onChange={e=>updateField(s,{cycle:e.target.value})}>
                            <option value="maand">maand</option><option value="kwartaal">kwartaal</option><option value="jaar">jaar</option>
                          </select>
                        </div>
                        <div className="field-group">
                          <div className="field-label">Verlengdatum</div>
                          <input className="field-input" type="date" defaultValue={s.renew_date||''} onBlur={e=>updateField(s,{renew_date:e.target.value||null})} />
                        </div>
                        <div className="field-group">
                          <div className="field-label">Betaling</div>
                          <select className="field-input" defaultValue={s.payment_method} onChange={e=>updateField(s,{payment_method:e.target.value})}>
                            <option value="">— kies —</option>
                            {PAYMENT_METHODS.map(m=><option key={m}>{m}</option>)}
                          </select>
                        </div>
                        <div className="field-group">
                          <div className="field-label">Categorie</div>
                          <select className="field-input" defaultValue={s.cat} onChange={e=>updateField(s,{cat:e.target.value})}>
                            {CAT_NAMES.map(c=><option key={c} value={c}>{CATS[c].icon} {c}</option>)}
                          </select>
                        </div>
                        <div className="field-group" style={{gridColumn:'1/-1'}}>
                          <div className="field-label">Status</div>
                          <div className="status-trio">
                            <button className={`status-btn${s.status==='actief'?' active green':''}`} onClick={()=>updateField(s,{status:'actief'})}>✓ Actief</button>
                            <button className="status-btn" onClick={()=>{setOverstapSub(s);setOverstapStep(1);setOverstapData({opzegDatum:'',nieuweNaam:'',nieuwePrijs:String(s.price),nieuweCyclus:s.cycle});setOverstapOpen(true)}}>🔄 Overstappen</button>
                            <button className={`status-btn${s.status==='opgezegd'?' active red':''}`} onClick={()=>updateField(s,{status:'opgezegd'})}>✕ Opgezegd</button>
                          </div>
                          {s.predecessor_id && <div style={{fontSize:11,color:'#7C3AED',marginTop:5}}>↩ Opvolger van {subs.find(x=>x.id===s.predecessor_id)?.name}</div>}
                          {s.status==='opgezegd'&&!s.successor_id && <div style={{fontSize:11,color:'var(--muted)',marginTop:5}}>Telt niet mee in totalen</div>}
                        </div>
                      </div>

                      <div className="accordion-section">
                        <button className="accordion-trigger" onClick={()=>{
                          if(!openAccordions.has(`k-${s.id}`)&&!(s.kenmerken||[]).some((k:any)=>k.value)){
                            const d=defaultKenmerken(s.cat)
                            if(d.length) updateField(s,{kenmerken:[...(s.kenmerken||[]),...d.filter((dk:any)=>!(s.kenmerken||[]).some((k:any)=>k.key.toLowerCase()===dk.key.toLowerCase()))]})
                          }
                          toggleAccordion(`k-${s.id}`)
                        }}>
                          <span className="accordion-trigger-left">📋 Kenmerken</span>
                          <span className="accordion-trigger-right">
                            <span className={`accordion-badge${(s.kenmerken||[]).filter((k:any)=>k.value).length>0?' filled':''}`}>{(s.kenmerken||[]).filter((k:any)=>k.value).length||'leeg'}</span>
                            <span className={`accordion-chevron${openAccordions.has(`k-${s.id}`)?' open':''}`}>▶</span>
                          </span>
                        </button>
                        {openAccordions.has(`k-${s.id}`) && <div className="accordion-body">
                          {(s.kenmerken||[]).map((kv:any,ki:number)=>(
                            <div key={ki} className="kenmerk-row">
                              <input className="kenmerk-key" defaultValue={kv.key} onBlur={e=>{const u=[...(s.kenmerken||[])];u[ki]={...u[ki],key:e.target.value};updateField(s,{kenmerken:u})}} />
                              <input className="kenmerk-val" defaultValue={kv.value} placeholder="Waarde" onBlur={e=>{const u=[...(s.kenmerken||[])];u[ki]={...u[ki],value:e.target.value};updateField(s,{kenmerken:u})}} />
                              <button className="kenmerk-del" onClick={()=>updateField(s,{kenmerken:(s.kenmerken||[]).filter((_:any,j:number)=>j!==ki)})}>✕</button>
                            </div>
                          ))}
                          <button className="kenmerk-add-btn" onClick={()=>updateField(s,{kenmerken:[...(s.kenmerken||[]),{key:'',value:''}]})}>+ Kenmerk toevoegen</button>
                        </div>}
                      </div>

                      <div className="accordion-section">
                        <button className="accordion-trigger" onClick={()=>toggleAccordion(`p-${s.id}`)}>
                          <span className="accordion-trigger-left">📈 Prijswijzigingen</span>
                          <span className="accordion-trigger-right">
                            <span className={`accordion-badge${(s.price_history||[]).length>0?' filled':''}`}>{(s.price_history||[]).length||'geen'}</span>
                            <span className={`accordion-chevron${openAccordions.has(`p-${s.id}`)?' open':''}`}>▶</span>
                          </span>
                        </button>
                        {openAccordions.has(`p-${s.id}`) && <div className="accordion-body">
                          <div className="prijshist-current">Nu: <strong>€ {parseFloat(s.price).toFixed(2).replace('.',',')} / {s.cycle}</strong></div>
                          {(s.price_history||[]).sort((a:any,b:any)=>a.valid_from.localeCompare(b.valid_from)).map((ph:any,pi:number)=>(
                            <div key={pi} className="prijshist-row">
                              <input className="prijshist-input" type="date" defaultValue={ph.valid_from} onBlur={e=>{const u=[...(s.price_history||[])];u[pi]={...u[pi],valid_from:e.target.value};updateField(s,{price_history:u})}} />
                              <input className="prijshist-input" type="number" defaultValue={ph.price} step={0.01} onBlur={e=>{const u=[...(s.price_history||[])];u[pi]={...u[pi],price:parseFloat(e.target.value)||0};updateField(s,{price_history:u})}} />
                              <input className="prijshist-note" defaultValue={ph.note||''} placeholder="Notitie" onBlur={e=>{const u=[...(s.price_history||[])];u[pi]={...u[pi],note:e.target.value};updateField(s,{price_history:u})}} />
                              <button className="prijshist-del" onClick={()=>updateField(s,{price_history:(s.price_history||[]).filter((_:any,j:number)=>j!==pi)})}>✕</button>
                            </div>
                          ))}
                          <button className="prijshist-add" onClick={()=>updateField(s,{price_history:[...(s.price_history||[]),{price:parseFloat(s.price)||0,valid_from:'',note:''}]})}>+ Geplande verhoging</button>
                        </div>}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
          <button className="add-btn" onClick={()=>{setAddForm({name:'',price:'',cycle:'maand',renew_date:'',payment_method:'',cat:'',domain:''});setAddOpen(true)}}>+ Abonnement toevoegen</button>
        </>}

        {/* ══════════════ OVERZICHT ══════════════ */}
        {panel === 'overzicht' && <>
          <div className="totals">
            <div className="total-card"><div className="lbl">Per maand</div><div className="val">{fmt(totalMonthly)}</div></div>
            <div className="total-card"><div className="lbl">Per jaar</div><div className="val">{fmt(totalMonthly*12)}</div></div>
            <div className="total-card"><div className="lbl">Abonnementen</div><div className="val">{activeSubs.length}</div></div>
          </div>
          <div style={{display:'flex',gap:8,marginBottom:16,flexWrap:'wrap'}}>
            <button className="export-btn" onClick={exportCSV}>📄 Export CSV</button>
            <button className="export-btn" onClick={()=>window.print()}>🖨️ Print / PDF</button>
          </div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16,marginBottom:20}} className="chart-grid-2">
            {/* Donut */}
            <div style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:'var(--radius)',padding:16,boxShadow:'var(--shadow)'}}>
              <div style={{fontSize:13,fontWeight:500,marginBottom:2}}>Per categorie</div>
              <div style={{fontSize:12,color:'var(--muted)',marginBottom:14}}>{fmt(totalMonthly)} per maand</div>
              <DonutChart data={catBreakdown.map(c=>({label:c.cat,value:c.total}))} colors={COLORS} />
              <div style={{display:'flex',flexWrap:'wrap',gap:'6px 12px',marginTop:12}}>
                {catBreakdown.map((c,i)=>(
                  <span key={c.cat} style={{display:'flex',alignItems:'center',gap:4,fontSize:11,color:'var(--muted)'}}>
                    <span style={{width:8,height:8,borderRadius:2,background:COLORS[i%COLORS.length],display:'inline-block'}}/>
                    {c.cat}
                  </span>
                ))}
              </div>
            </div>
            {/* Bar breakdown */}
            <div style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:'var(--radius)',padding:16,boxShadow:'var(--shadow)'}}>
              <div style={{fontSize:13,fontWeight:500,marginBottom:2}}>Verdeling</div>
              <div style={{fontSize:12,color:'var(--muted)',marginBottom:14}}>maandelijks per categorie</div>
              {catBreakdown.map((c,i)=>{
                const pct=totalMonthly>0?(c.total/totalMonthly*100):0
                return <div key={c.cat} style={{paddingBottom:9,borderBottom:'1px solid #F7F7F5',marginBottom:9}}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',fontSize:13}}>
                    <div style={{display:'flex',alignItems:'center',gap:6}}>
                      <span style={{width:8,height:8,borderRadius:'50%',background:COLORS[i%COLORS.length],flexShrink:0,display:'inline-block'}}/>
                      <span>{CATS[c.cat]?.icon} {c.cat} <span style={{color:'var(--muted)',fontSize:11}}>({c.subs.length})</span></span>
                    </div>
                    <div style={{textAlign:'right',fontFamily:'monospace',fontSize:12,color:'var(--muted)'}}>
                      <div>{fmt(c.total)}/mnd</div>
                      <div style={{fontSize:10,color:'var(--subtle)'}}>{pct.toFixed(0)}% · {fmt(c.total*12)}/jr</div>
                    </div>
                  </div>
                  <div style={{height:3,background:'var(--border)',borderRadius:99,marginTop:5,overflow:'hidden'}}>
                    <div style={{height:3,borderRadius:99,background:COLORS[i%COLORS.length],width:`${pct.toFixed(1)}%`}}/>
                  </div>
                </div>
              })}
            </div>
          </div>
        </>}

        {/* ══════════════ INZICHTEN ══════════════ */}
        {panel === 'inzichten' && <>
          <div className="totals">
            <div className="total-card"><div className="lbl">Per maand</div><div className="val">{fmt(totalMonthly)}</div></div>
            <div className="total-card"><div className="lbl">Per jaar</div><div className="val">{fmt(totalMonthly*12)}</div></div>
            {savedMonthly>0.01&&<div className="total-card"><div className="lbl">Bespaard</div><div className="val" style={{color:'var(--green)'}}>{fmt(savedMonthly)}/mnd</div></div>}
          </div>
          {activeSubs.filter(s=>s.status==='actief'&&s.cat==='Streaming').length>=2&&(
            <div style={{padding:'14px 16px',background:'var(--surface)',border:'1px solid var(--border)',borderRadius:'var(--radius-sm)',marginBottom:8,display:'flex',gap:12}}>
              <div style={{fontSize:18}}>⚠</div>
              <div><div style={{fontWeight:500,fontSize:13,marginBottom:4}}>{activeSubs.filter(s=>s.cat==='Streaming').length} streamingdiensten</div>
              <div style={{fontSize:12,color:'var(--muted)'}}>{activeSubs.filter(s=>s.cat==='Streaming').map(s=>s.name).join(', ')} — mogelijk overlap.</div></div>
            </div>
          )}
          {(()=>{const introSubs=activeSubs.filter(s=>s.intro_price&&s.intro_until&&(daysUntil(s.intro_until)??-1)>=0&&(daysUntil(s.intro_until)??999)<=90);return introSubs.length>0&&(
            <div style={{padding:'14px 16px',background:'var(--surface)',border:'1px solid var(--border)',borderRadius:'var(--radius-sm)',marginBottom:8,display:'flex',gap:12}}>
              <div style={{fontSize:18}}>⚠</div>
              <div><div style={{fontWeight:500,fontSize:13,marginBottom:4}}>{introSubs.length} introductieprijs loopt binnen 90 dagen af</div>
              <div style={{fontSize:12,color:'var(--muted)'}}>{introSubs.map(s=>`${s.name}: nog ${daysUntil(s.intro_until)}d, daarna ${fmt(parseFloat(s.price))}/${s.cycle}`).join(' · ')}</div></div>
            </div>
          )})()}
          {activeSubs.filter(s=>{const d=daysUntil(s.renew_date);return d!==null&&d>=0&&d<=14}).length>0&&(
            <div style={{padding:'14px 16px',background:'var(--surface)',border:'1px solid var(--border)',borderRadius:'var(--radius-sm)',marginBottom:8,display:'flex',gap:12}}>
              <div style={{fontSize:18}}>⏰</div>
              <div><div style={{fontWeight:500,fontSize:13,marginBottom:4}}>Binnenkort verlengd</div>
              <div style={{fontSize:12,color:'var(--muted)'}}>{activeSubs.filter(s=>{const d=daysUntil(s.renew_date);return d!==null&&d>=0&&d<=14}).map(s=>`${s.name} (over ${daysUntil(s.renew_date)}d)`).join(', ')}</div></div>
            </div>
          )}
          {savedMonthly>0.01&&(
            <div style={{padding:'14px 16px',background:'var(--green-bg)',border:'1px solid #b5d97a',borderRadius:'var(--radius-sm)',marginBottom:8,display:'flex',gap:12}}>
              <div style={{fontSize:18}}>✓</div>
              <div><div style={{fontWeight:500,fontSize:13,marginBottom:4}}>Bespaard: {fmt(savedMonthly)}/mnd · {fmt(savedMonthly*12)}/jaar</div>
              <div style={{fontSize:12,color:'var(--green)'}}>Door opzeggen of overstappen.</div></div>
            </div>
          )}
          <div style={{padding:'14px 16px',background:'var(--surface)',border:'1px solid var(--border)',borderRadius:'var(--radius-sm)',marginBottom:8,display:'flex',gap:12}}>
            <div style={{fontSize:18}}>€</div>
            <div><div style={{fontWeight:500,fontSize:13,marginBottom:4}}>Totaal: {fmt(totalMonthly*12)}/jaar</div>
            <div style={{fontSize:12,color:'var(--muted)'}}>{fmt(totalMonthly)}/mnd · {totalMonthly<180?'Onder':'Boven'} het NL gemiddelde van €\u00a0180/mnd.</div></div>
          </div>
          {activeSubs.length===0&&<div style={{fontSize:13,color:'var(--muted)',padding:'20px 0'}}>Voeg abonnementen toe voor inzichten.</div>}
        </>}

        {/* ══════════════ PROGNOSE ══════════════ */}
        {panel === 'prognose' && (()=>{
          const months = prognoseMonths
          const flatNow = months[0]?.total||0, flatEnd = months[23]?.total||0
          const delta = flatEnd-flatNow
          const peakM = months.reduce((b,m)=>m.total>b.total?m:b, months[0]||{total:0,label:''})
          const changeEvents = months.flatMap((m,mi)=>m.events
            .filter((e:any)=>e.type==='price-change'||e.type==='intro-end')
            .map((ev:any)=>({...ev,monthsAway:mi,dateLabel:new Date(m.yr,m.mo,1).toLocaleDateString('nl-NL',{month:'long',year:'numeric'})}))
          )
          const annualEvents = months.flatMap((m,mi)=>m.events
            .filter((e:any)=>e.type==='annual')
            .map((ev:any)=>({...ev,monthsAway:mi,dateLabel:new Date(m.yr,m.mo,1).toLocaleDateString('nl-NL',{month:'long',year:'numeric'})}))
          )
          const tableMonths = progTableExpanded ? months : months.slice(0,6)
          return <>
            <div className="totals">
              <div className="total-card"><div className="lbl">Nu / maand</div><div className="val">{fmt(flatNow)}</div></div>
              <div className="total-card"><div className="lbl">Over 24 maanden</div><div className="val" style={{color:delta>0.5?'var(--red)':delta<-0.5?'var(--green)':'inherit'}}>{fmt(flatEnd)}</div></div>
              <div className="total-card"><div className="lbl">Piek · {peakM.label}</div><div className="val">{fmt(peakM.total)}</div></div>
            </div>
            <div className="prog-chart-card">
              <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',flexWrap:'wrap',gap:8,marginBottom:4}}>
                <div>
                  <div style={{fontSize:13,fontWeight:500,marginBottom:2}}>Geprognosticeerde maandkosten</div>
                  <div style={{fontSize:12,color:'var(--muted)'}}>komende 24 maanden · gebaseerd op ingevoerde prijswijzigingen</div>
                </div>
              </div>
              <div style={{position:'relative',height:240,marginTop:12}}>
                <LineChart months={months} />
              </div>

            </div>
            <div style={{display:'flex',gap:10,flexWrap:'wrap',marginTop:10,marginBottom:4}}>
              <span style={{display:'flex',alignItems:'center',gap:4,fontSize:11,color:'var(--muted)'}}><span style={{width:10,height:3,background:'#378ADD',display:'inline-block',borderRadius:2}}/>Stabiel</span>
              <span style={{display:'flex',alignItems:'center',gap:4,fontSize:11,color:'var(--muted)'}}><span style={{width:10,height:3,background:'#D85A30',display:'inline-block',borderRadius:2}}/>Stijging</span>
              <span style={{display:'flex',alignItems:'center',gap:4,fontSize:11,color:'var(--muted)'}}><span style={{width:10,height:3,background:'#1D9E75',display:'inline-block',borderRadius:2}}/>Daling</span>
            </div>
            <div style={{fontSize:11.5,color:'var(--muted)',marginBottom:16,lineHeight:1.6}}>
              💡 <strong>Dalingen in de grafiek</strong> ontstaan doordat jaarlijkse abonnementen in één maand doorlopen tot de volgende verlengdatum — daarna valt de kost terug. Dit is correct.
            </div>
            <div style={{marginBottom:20}}>
              <div className="section-lbl">Geplande prijswijzigingen</div>
              {changeEvents.length===0
                ?<div style={{fontSize:13,color:'var(--muted)',padding:'12px 0',lineHeight:1.6}}>
                    Nog geen prijswijzigingen ingevoerd. Open een abonnement en voeg een geplande wijziging toe via <strong>📈 Prijswijzigingen</strong>.
                  </div>
                :changeEvents.map((ev:any,i:number)=>{
                  const dir=ev.delta>0.05?'up':ev.delta<-0.05?'down':'neutral'
                  const icon=ev.type==='intro-end'?'⚠':ev.delta>0.05?'↑':ev.delta<-0.05?'↓':'📅'
                  const away=ev.monthsAway===0?'deze maand':`over ${ev.monthsAway} mnd`
                  return <div key={i} className={`prog-event ${dir}`}>
                    <div className="prog-event-icon">{icon}</div>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontWeight:500}}>{ev.name}</div>
                      <div className="prog-event-date">{ev.dateLabel} · {away}</div>
                      <div style={{fontSize:12,color:'var(--muted)',marginTop:2}}>{ev.detail}</div>
                    </div>
                    {Math.abs(ev.delta)>0.01&&<div className="prog-event-delta">{ev.delta>0?'+':''}{fmt(ev.delta)}/mnd</div>}
                  </div>
                })
              }
            </div>
            {annualEvents.length>0&&<div style={{marginBottom:20}}>
              <div className="section-lbl">Jaarlijkse verlengingen</div>
              {annualEvents.map((ev:any,i:number)=>(
                <div key={i} className="prog-event neutral">
                  <div className="prog-event-icon">📅</div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontWeight:500}}>{ev.name}</div>
                    <div className="prog-event-date">{ev.dateLabel} · {ev.monthsAway===0?'deze maand':`over ${ev.monthsAway} mnd`}</div>
                    <div style={{fontSize:12,color:'var(--muted)',marginTop:2}}>{ev.detail}</div>
                  </div>
                </div>
              ))}
            </div>}
            <div>
              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:10}}>
                <div className="section-lbl" style={{marginBottom:0}}>Maandoverzicht</div>
                <button onClick={()=>setProgTableExpanded(e=>!e)} style={{fontSize:12,color:'var(--muted)',background:'none',border:'1px solid var(--border)',borderRadius:'var(--radius-xs)',padding:'4px 10px'}}>
                  {progTableExpanded?'Toon minder':'Toon alle maanden'}
                </button>
              </div>
              <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(140px,1fr))',gap:6}}>
                {tableMonths.map((m:any,i:number)=>{
                  const diff=i>0?m.total-months[i-1].total:0
                  return <div key={i} style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:'var(--radius-sm)',padding:'10px 12px',boxShadow:'var(--shadow)'}}>
                    <div style={{fontSize:11,color:'var(--muted)',marginBottom:4}}>{m.label}</div>
                    <div style={{fontFamily:'monospace',fontWeight:500,fontSize:13}}>{fmt(m.total)}</div>
                    {i>0&&Math.abs(diff)>0.01&&<div style={{fontSize:10,color:diff>0?'var(--red)':'var(--green)',marginTop:2}}>{diff>0?'+':''}{fmt(diff)}/mnd</div>}
                    {m.events.length>0&&<div style={{fontSize:10,color:'var(--amber)',marginTop:3}}>● {m.events.length} wijziging{m.events.length>1?'en':''}</div>}
                  </div>
                })}
              </div>
            </div>
          </>
        })()}

        {/* ══════════════ DELEN ══════════════ */}
        {panel === 'delen' && (
          <div style={{display:'flex',justifyContent:'center',padding:'20px 0'}}>
            <div style={{background:'var(--surface)',border:'1px solid var(--border)',borderRadius:'var(--radius)',padding:28,maxWidth:480,width:'100%',boxShadow:'var(--shadow-md)'}}>
              <div style={{fontSize:22,marginBottom:12}}>👨‍👩‍👦</div>
              <div style={{fontSize:15,fontWeight:500,marginBottom:6}}>Data delen met je partner</div>
              <div style={{fontSize:13,color:'var(--muted)',marginBottom:20,lineHeight:1.6}}>Koppel jullie accounts zodat je samen één lijst bijhoudt. Je partner heeft een eigen account nodig op dezelfde app.</div>
              {familyId ? (<>
                <div style={{display:'inline-flex',alignItems:'center',gap:6,fontSize:13,fontWeight:500,padding:'5px 12px',borderRadius:99,background:'var(--green-bg)',color:'var(--green)',marginBottom:16}}>● Gekoppeld als gezinsgroep</div>
                <div style={{background:'var(--bg)',border:'1px solid var(--border)',borderRadius:'var(--radius-sm)',padding:14,marginBottom:14}}>
                  <div style={{fontSize:10,color:'var(--subtle)',textTransform:'uppercase',letterSpacing:'.06em',marginBottom:8}}>Gezinscode</div>
                  <div style={{display:'flex',gap:8,alignItems:'center',marginBottom:6}}>
                    <code style={{fontFamily:'monospace',fontSize:11,background:'var(--surface)',border:'1px solid var(--border)',borderRadius:'var(--radius-xs)',padding:'6px 10px',flex:1,wordBreak:'break-all',userSelect:'all'}}>{familyId}</code>
                    <button onClick={()=>{navigator.clipboard.writeText(familyId);setFamilyCopied(true);setTimeout(()=>setFamilyCopied(false),2000)}} style={{padding:'6px 14px',fontSize:12.5,fontWeight:500,background:'var(--accent)',color:'var(--accent-fg)',border:'none',borderRadius:'var(--radius-xs)',whiteSpace:'nowrap'}}>
                      {familyCopied?'✓ Gekopieerd':'Kopieer'}
                    </button>
                  </div>
                  <div style={{fontSize:12,color:'var(--muted)'}}>Stuur deze code naar je partner. Die voert hem in onder "Koppelen met code".</div>
                </div>
                <div style={{background:'var(--green-bg)',border:'1px solid #b5d97a',borderRadius:'var(--radius-sm)',padding:'10px 12px',marginBottom:12,fontSize:12,color:'var(--green)',lineHeight:1.6}}>
                  💡 <strong>Tip:</strong> deel de gezinscode via WhatsApp, niet als link — de app heeft nog geen e-mailinvite functie. Je partner moet zelf eerst inloggen via de app, daarna de code invullen.
                </div>
                <div style={{marginBottom:12}}>
                  <div style={{fontSize:12,color:'var(--muted)',marginBottom:8}}>📤 Exporteer je abonnementen</div>
                  <button onClick={exportCSV} className="export-btn">📄 Download CSV</button>
                </div>
                <button onClick={leaveFamily} style={{fontSize:12,padding:'7px 14px',border:'1px solid var(--red)',borderRadius:'var(--radius-sm)',background:'none',color:'var(--red)',width:'100%'}}>Gezinsgroep verlaten</button>
              </>) : (<>
                <div style={{display:'inline-flex',alignItems:'center',gap:6,fontSize:13,fontWeight:500,padding:'5px 12px',borderRadius:99,background:'#F0F0EE',color:'var(--muted)',marginBottom:16}}>○ Nog niet gekoppeld</div>
                <div style={{background:'var(--amber-bg)',border:'1px solid #F5D89A',borderRadius:'var(--radius-sm)',padding:'10px 12px',marginBottom:16,fontSize:12,color:'var(--amber)',lineHeight:1.6}}>
                  ⚠️ <strong>Nieuw op de app?</strong> Je partner moet eerst zelf inloggen op de app met zijn/haar eigen e-mailadres. Daarna kunnen jullie koppelen via een gezinscode.
                </div>
                <div style={{borderBottom:'1px solid var(--border)',paddingBottom:16,marginBottom:16}}>
                  <div style={{fontSize:13.5,fontWeight:500,marginBottom:4}}>Nieuwe gezinsgroep starten</div>
                  <div style={{fontSize:13,color:'var(--muted)',marginBottom:12,lineHeight:1.5}}>Jij maakt een code aan die je deelt met je partner (bijv. via WhatsApp).</div>
                  <button onClick={createFamily} style={{fontSize:13,padding:'8px 16px',background:'var(--accent)',color:'var(--accent-fg)',border:'none',borderRadius:'var(--radius-sm)'}}>+ Gezinsgroep aanmaken</button>
                </div>
                <div style={{textAlign:'center',fontSize:12,color:'var(--subtle)',marginBottom:16}}>of</div>
                <div style={{marginBottom:20}}>
                  <div style={{fontSize:13.5,fontWeight:500,marginBottom:4}}>Koppelen met bestaande code</div>
                  <div style={{fontSize:13,color:'var(--muted)',marginBottom:12,lineHeight:1.5}}>Voer de gezinscode in die je van je partner hebt gekregen.</div>
                  <div style={{display:'flex',gap:8}}>
                    <input style={{flex:1,fontSize:13,padding:'8px 10px',border:'1px solid var(--border)',borderRadius:'var(--radius-xs)',background:'#FAFAF8',color:'var(--text)',fontFamily:'inherit'}} placeholder="Plak hier de gezinscode..." value={familyInput} onChange={e=>setFamilyInput(e.target.value)} />
                    <button onClick={joinFamily} style={{fontSize:13,padding:'8px 14px',border:'1px solid var(--border)',borderRadius:'var(--radius-xs)',background:'var(--surface)',color:'var(--text)',whiteSpace:'nowrap'}}>Koppelen</button>
                  </div>
                </div>
                <div style={{paddingTop:16,borderTop:'1px solid var(--border)'}}>
                  <div style={{fontSize:12,color:'var(--muted)',marginBottom:8}}>📤 Exporteer je abonnementen</div>
                  <button onClick={exportCSV} className="export-btn">📄 Download CSV</button>
                </div>
              </>)}
            </div>
          </div>
        )}
      </div>

      {/* ══ ADD modal ══ */}
      {addOpen && (
        <div className="add-modal-overlay" onClick={e=>e.target===e.currentTarget&&setAddOpen(false)}>
          <div className="add-modal">
            <div className="add-modal-header"><span className="add-modal-title">Abonnement toevoegen</span><button className="ai-modal-close" onClick={()=>setAddOpen(false)}>✕</button></div>
            <div className="add-modal-body">
              <div className="add-manual-form">
                <div className="add-manual-field"><label className="add-manual-label">Naam</label><input className="add-manual-input" value={addForm.name} onChange={e=>setAddForm((f:any)=>({...f,name:e.target.value}))} placeholder="bijv. Netflix" /></div>
                <div className="add-manual-row">
                  <div className="add-manual-field"><label className="add-manual-label">Prijs (€)</label><input className="add-manual-input" type="number" value={addForm.price} step={0.01} onChange={e=>setAddForm((f:any)=>({...f,price:e.target.value}))} /></div>
                  <div className="add-manual-field"><label className="add-manual-label">Cyclus</label><select className="add-manual-input" value={addForm.cycle} onChange={e=>setAddForm((f:any)=>({...f,cycle:e.target.value}))}><option value="maand">Per maand</option><option value="kwartaal">Per kwartaal</option><option value="jaar">Per jaar</option></select></div>
                </div>
                <div className="add-manual-row">
                  <div className="add-manual-field"><label className="add-manual-label">Verlengdatum</label><input className="add-manual-input" type="date" value={addForm.renew_date} onChange={e=>setAddForm((f:any)=>({...f,renew_date:e.target.value}))} /></div>
                  <div className="add-manual-field"><label className="add-manual-label">Betaalrekening</label><select className="add-manual-input" value={addForm.payment_method} onChange={e=>setAddForm((f:any)=>({...f,payment_method:e.target.value}))}><option value="">— kies —</option>{PAYMENT_METHODS.map(m=><option key={m}>{m}</option>)}</select></div>
                </div>
                <div className="add-manual-field"><label className="add-manual-label">Categorie</label>
                  <select className="add-manual-input" value={addForm.cat} onChange={e=>setAddForm((f:any)=>({...f,cat:e.target.value}))}>
                    <option value="">— kies —</option>{CAT_NAMES.map(c=><option key={c} value={c}>{CATS[c].icon} {c}</option>)}
                  </select>
                </div>
              </div>
            </div>
            <div className="add-modal-footer">
              <button className="add-secondary-btn" onClick={()=>setAddOpen(false)}>Annuleren</button>
              <button className="add-primary-btn" onClick={()=>addSub({...addForm,price:parseFloat(addForm.price)||0,price_currency:'€',renew_date:addForm.renew_date||null,status:'actief',kenmerken:defaultKenmerken(addForm.cat)})}>Toevoegen</button>
            </div>
          </div>
        </div>
      )}

      {/* ══ OVERSTAP modal ══ */}
      {overstapOpen && overstapSub && (
        <div className="add-modal-overlay" onClick={e=>e.target===e.currentTarget&&setOverstapOpen(false)}>
          <div className="add-modal">
            <div className="add-modal-header"><span className="add-modal-title">{overstapSub.name} · Overstappen</span><button className="ai-modal-close" onClick={()=>setOverstapOpen(false)}>✕</button></div>
            <div className="add-modal-body">
              <div style={{display:'flex',justifyContent:'center',gap:5,marginBottom:16}}>
                {[1,2,3].map(n=><div key={n} style={{width:6,height:6,borderRadius:'50%',background:n===overstapStep?'var(--blue)':'var(--border)'}}/>)}
              </div>
              {overstapStep===1&&<div className="add-manual-form">
                <div style={{fontSize:13,color:'var(--muted)',marginBottom:8}}>Huidig: {overstapSub.name} · {fmt(effectiveMonthlyEUR(overstapSub))}/mnd</div>
                <div className="add-manual-field"><label className="add-manual-label">Opzegdatum (optioneel)</label><input className="add-manual-input" type="date" value={overstapData.opzegDatum} onChange={e=>setOverstapData(d=>({...d,opzegDatum:e.target.value}))} /></div>
              </div>}
              {overstapStep===2&&<div className="add-manual-form">
                <div className="add-manual-field"><label className="add-manual-label">Naam nieuwe aanbieder</label><input className="add-manual-input" value={overstapData.nieuweNaam} onChange={e=>setOverstapData(d=>({...d,nieuweNaam:e.target.value}))} placeholder="bijv. Youfone" /></div>
                <div className="add-manual-row">
                  <div className="add-manual-field"><label className="add-manual-label">Prijs (€)</label><input className="add-manual-input" type="number" value={overstapData.nieuwePrijs} step={0.01} onChange={e=>setOverstapData(d=>({...d,nieuwePrijs:e.target.value}))} /></div>
                  <div className="add-manual-field"><label className="add-manual-label">Cyclus</label><select className="add-manual-input" value={overstapData.nieuweCyclus} onChange={e=>setOverstapData(d=>({...d,nieuweCyclus:e.target.value}))}><option value="maand">Per maand</option><option value="kwartaal">Per kwartaal</option><option value="jaar">Per jaar</option></select></div>
                </div>
              </div>}
              {overstapStep===3&&(()=>{
                const oudMnd=effectiveMonthlyEUR(overstapSub)
                let nieuwMnd=parseFloat(overstapData.nieuwePrijs)||0
                if(overstapData.nieuweCyclus==='jaar')nieuwMnd/=12
                if(overstapData.nieuweCyclus==='kwartaal')nieuwMnd/=3
                const netto=oudMnd-nieuwMnd
                return <div style={{display:'flex',flexDirection:'column',gap:8}}>
                  <div style={{padding:12,background:'var(--bg)',border:'1px solid var(--border)',borderRadius:'var(--radius-sm)',fontSize:13}}><div style={{color:'var(--muted)',fontSize:11,marginBottom:4}}>OPGEZEGD</div><strong>{overstapSub.name}</strong> · {fmt(oudMnd)}/mnd</div>
                  <div style={{textAlign:'center',fontSize:18,color:'var(--muted)'}}>↓</div>
                  <div style={{padding:12,background:'var(--green-bg)',border:'1px solid #b5d97a',borderRadius:'var(--radius-sm)',fontSize:13}}><div style={{color:'var(--green)',fontSize:11,marginBottom:4}}>NIEUW</div><strong>{overstapData.nieuweNaam||'Nieuwe aanbieder'}</strong> · {fmt(nieuwMnd)}/mnd</div>
                  <div className={`overstap-netto${netto<=0?' cost':''}`}>{netto>0?`✓ Besparing: ${fmt(netto)}/mnd · ${fmt(netto*12)}/jaar`:`⚠ Meerkosten: ${fmt(Math.abs(netto))}/mnd`}</div>
                </div>
              })()}
            </div>
            <div className="add-modal-footer">
              <button className="add-secondary-btn" onClick={()=>overstapStep>1?setOverstapStep(s=>s-1):setOverstapOpen(false)}>← Terug</button>
              <button className="add-primary-btn" onClick={()=>overstapStep<3?setOverstapStep(s=>s+1):confirmOverstap()}>{overstapStep<3?'Volgende →':'✓ Verwerken'}</button>
            </div>
          </div>
        </div>
      )}

      {/* ══ AI UPLOAD modal ══ */}
      {aiOpen && (
        <div className="add-modal-overlay" onClick={e=>e.target===e.currentTarget&&(setAiOpen(false),setAiStep('upload'),setAiResult(null))}>
          <div className="add-modal">
            <div className="add-modal-header">
              <span className="add-modal-title">🤖 {aiSub?`${aiSub.name} · Contract scannen`:'Contract scannen'}</span>
              <button className="ai-modal-close" onClick={()=>{setAiOpen(false);setAiStep('upload');setAiResult(null);setAiError('')}}>✕</button>
            </div>
            <div className="add-modal-body">
              {aiStep==='upload'&&<>
                {aiLoading
                  ?<div style={{textAlign:'center',padding:'32px 0'}}><div style={{fontSize:32,marginBottom:12}}>🤖</div><div style={{fontSize:13,color:'var(--muted)'}}>AI analyseert je contract…</div></div>
                  :<>
                    <label className="drop-zone" onDrop={e=>{e.preventDefault();const f=e.dataTransfer.files[0];if(f)handleAiFile(f)}} onDragOver={e=>e.preventDefault()}>
                      <input ref={fileInputRef} type="file" accept="image/*,.pdf" style={{display:'none'}} onChange={e=>{const f=e.target.files?.[0];if(f)handleAiFile(f)}} />
                      <div className="drop-zone-icon">📄</div>
                      <div className="drop-zone-title">Sleep je contract hier</div>
                      <div className="drop-zone-sub">of klik om een bestand te kiezen · PDF of afbeelding</div>
                    </label>
                    {aiError&&<div className="ai-error" style={{marginTop:12}}>{aiError}</div>}
                    <div className="add-manual-link" onClick={()=>fileInputRef.current?.click()}>Bestand kiezen</div>
                  </>
                }
              </>}
              {aiStep==='result'&&aiResult&&<>
                <div className="ai-summary">✓ AI heeft je contract gelezen. Controleer en pas aan:</div>
                {aiResult.samenvatting&&<div style={{fontSize:12,color:'var(--muted)',background:'var(--bg)',border:'1px solid var(--border)',borderRadius:'var(--radius-xs)',padding:'8px 10px',lineHeight:1.6,marginBottom:14}}>{aiResult.samenvatting}</div>}
                <div className="add-manual-form">
                  <div className="add-manual-field"><label className="add-manual-label">Naam</label><input className="add-manual-input" value={aiForm.name} onChange={e=>setAiForm((f:any)=>({...f,name:e.target.value}))} /></div>
                  <div className="add-manual-row">
                    <div className="add-manual-field"><label className="add-manual-label">Prijs (€)</label><input className="add-manual-input" type="number" step={0.01} value={aiForm.price} onChange={e=>setAiForm((f:any)=>({...f,price:e.target.value}))} /></div>
                    <div className="add-manual-field"><label className="add-manual-label">Cyclus</label><select className="add-manual-input" value={aiForm.cycle} onChange={e=>setAiForm((f:any)=>({...f,cycle:e.target.value}))}><option value="maand">Per maand</option><option value="kwartaal">Per kwartaal</option><option value="jaar">Per jaar</option></select></div>
                  </div>
                  <div className="add-manual-row">
                    <div className="add-manual-field"><label className="add-manual-label">Verlengdatum</label><input className="add-manual-input" type="date" value={aiForm.renew_date||''} onChange={e=>setAiForm((f:any)=>({...f,renew_date:e.target.value}))} /></div>
                    <div className="add-manual-field"><label className="add-manual-label">Betaling</label><select className="add-manual-input" value={aiForm.payment_method} onChange={e=>setAiForm((f:any)=>({...f,payment_method:e.target.value}))}><option value="">— kies —</option>{PAYMENT_METHODS.map(m=><option key={m}>{m}</option>)}</select></div>
                  </div>
                </div>
              </>}
            </div>
            {aiStep==='result'&&<div className="add-modal-footer">
              <button className="add-secondary-btn" onClick={()=>setAiStep('upload')}>← Opnieuw</button>
              <button className="add-primary-btn" onClick={confirmAiUpdate}>{aiSub?'✓ Opslaan':'+ Toevoegen'}</button>
            </div>}
          </div>
        </div>
      )}
    </div>
  )
}
