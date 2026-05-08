'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createBrowserClient } from '@supabase/ssr'
import { CATS, PAYMENT_METHODS, fmt, daysUntil, logoUrl, defaultKenmerken, effectiveMonthlyEUR } from '@/lib/types'


const CAT_NAMES = Object.keys(CATS)

export default function Dashboard() {
  const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)
  const router = useRouter()
  const [subs, setSubs] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [panel, setPanel] = useState('beheer')
  const [activeCat, setActiveCat] = useState(CAT_NAMES[0])
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set())
  const [openAccordions, setOpenAccordions] = useState<Set<string>>(new Set())
  const [addOpen, setAddOpen] = useState(false)
  const [addForm, setAddForm] = useState<any>({ name: '', price: '', cyrenewcle: 'maand', _date: '', payment_method: '', cat: '', domain: '' })
  const [overstapOpen, setOverstapOpen] = useState(false)
  const [overstapSub, setOverstapSub] = useState<any>(null)
  const [overstapStep, setOverstapStep] = useState(1)
  const [overstapData, setOverstapData] = useState({ opzegDatum: '', nieuweNaam: '', nieuwePrijs: '', nieuweCyclus: 'maand' })

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) router.replace('/login')
      else fetchSubs()
    })
  }, [])

  async function fetchSubs() {
    const { data } = await supabase
      .from('subscriptions')
      .select('*, kenmerken(id, key, value, sort_order), price_history(id, price, valid_from, note)')
      .order('created_at', { ascending: true })
    setSubs(data || [])
    setLoading(false)
  }

  async function updateField(sub: any, fields: any) {
    const { kenmerken, price_history, ...rest } = fields
    if (Object.keys(rest).length) await supabase.from('subscriptions').update(rest).eq('id', sub.id)
    if (kenmerken !== undefined) {
      await supabase.from('kenmerken').delete().eq('subscription_id', sub.id)
      if (kenmerken.length) await supabase.from('kenmerken').insert(
        kenmerken.map((k: any, i: number) => ({ subscription_id: sub.id, user_id: sub.user_id, key: k.key, value: k.value || '', sort_order: i }))
      )
    }
    if (price_history !== undefined) {
      await supabase.from('price_history').delete().eq('subscription_id', sub.id)
      if (price_history.length) await supabase.from('price_history').insert(
        price_history.map((ph: any) => ({ subscription_id: sub.id, user_id: sub.user_id, price: ph.price, valid_from: ph.valid_from, note: ph.note || null }))
      )
    }
    fetchSubs()
  }

  async function addSub(data: any) {
    const { data: { user } } = await supabase.auth.getUser()
    const { kenmerken, ...rest } = data
    const { data: sub } = await supabase.from('subscriptions').insert({ ...rest, user_id: user!.id }).select().single()
    if (sub && kenmerken?.length) await supabase.from('kenmerken').insert(
      kenmerken.map((k: any, i: number) => ({ subscription_id: sub.id, user_id: user!.id, key: k.key, value: k.value || '', sort_order: i }))
    )
    setAddOpen(false)
    fetchSubs()
  }

  async function deleteSub(id: string) {
    await supabase.from('subscriptions').delete().eq('id', id)
    fetchSubs()
  }

  async function confirmOverstap() {
    if (!overstapSub) return
    const { data: { user } } = await supabase.auth.getUser()
    const { data: newSub } = await supabase.from('subscriptions').insert({
      name: overstapData.nieuweNaam, price: parseFloat(overstapData.nieuwePrijs) || 0,
      price_currency: overstapSub.price_currency, cycle: overstapData.nieuweCyclus,
      renew_date: '', cat: overstapSub.cat, payment_method: overstapSub.payment_method,
      domain: '', status: 'actief', predecessor_id: overstapSub.id, user_id: user!.id
    }).select().single()
    await supabase.from('subscriptions').update({ status: 'opgezegd', successor_id: newSub?.id, renew_date: overstapData.opzegDatum || overstapSub.renew_date }).eq('id', overstapSub.id)
    setOverstapOpen(false)
    fetchSubs()
  }

  async function handleLogout() {
    await supabase.auth.signOut()
    router.replace('/login')
  }

  function toggleAccordion(id: string) {
    setOpenAccordions(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  }

  const activeSubs = subs.filter(s => s.status === 'actief')
  const totalMonthly = activeSubs.reduce((t, s) => t + effectiveMonthlyEUR(s), 0)
  const cancelledSubs = subs.filter(s => s.status === 'opgezegd')
  const savedMonthly = cancelledSubs.reduce((t, s) => {
    if (s.successor_id) { const succ = subs.find(x => x.id === s.successor_id); return t + effectiveMonthlyEUR(s) - (succ ? effectiveMonthlyEUR(succ) : 0) }
    return t + effectiveMonthlyEUR(s)
  }, 0)

  if (loading) return <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh', color:'#8A8A8F' }}>Laden…</div>

  return (
    <div className="app-container">
      <nav className="nav">
        <div className="nav-tabs">
          {[['beheer','Abonnementen'],['overzicht','Overzicht'],['inzichten','Inzichten']].map(([p,l]) => (
            <button key={p} className={`tab${panel===p?' active':''}`} onClick={() => setPanel(p)}>{l}</button>
          ))}
          <button className="logout-btn" onClick={handleLogout} style={{marginLeft:'auto',alignSelf:'center'}}>Uitloggen</button>
        </div>
      </nav>

      <div className="panel">
        {/* ── BEHEER ── */}
        {panel === 'beheer' && <>
          <div className="totals">
            <div className="total-card"><div className="lbl">Per maand</div><div className="val">{fmt(totalMonthly)}</div></div>
            <div className="total-card"><div className="lbl">Per jaar</div><div className="val">{fmt(totalMonthly*12)}</div></div>
            {savedMonthly > 0.01 && <div className="total-card"><div className="lbl">Bespaard</div><div className="val" style={{color:'var(--green)'}}>{fmt(savedMonthly)}/mnd</div></div>}
          </div>

          <div className="cat-pills">
            {CAT_NAMES.map(c => <button key={c} className={`cat-pill${activeCat===c?' active':''}`} onClick={() => setActiveCat(c)}>{CATS[c].icon} {c}</button>)}
          </div>

          {CATS[activeCat]?.items.length > 0 && (
            <div className="suggestions-grid">
              {CATS[activeCat].items.map(item => {
                const exists = subs.some(s => s.name?.toLowerCase() === item.name.toLowerCase())
                return <button key={item.name} className={`suggestion-chip${exists?' active':''}`}
                  onClick={() => !exists && addSub({ name: item.name, price: item.price, price_currency:'€', cycle: item.cycle, renew_date:'', cat: activeCat, domain: item.domain, payment_method:'', status:'actief', kenmerken: defaultKenmerken(activeCat) })}>
                  {item.name}
                </button>
              })}
            </div>
          )}

          <div className="section-lbl">Mijn abonnementen</div>
          <div className="sub-list">
            {subs.map(s => {
              const isExpanded = expandedIds.has(s.id)
              const days = daysUntil(s.renew_date)
              const monthly = effectiveMonthlyEUR(s)
              return (
                <div key={s.id}>
                  <div className={`sub-row-collapsed${s.status==='opgezegd'?' cancelled':''}${isExpanded?' expanded':''}`}
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
                      <div className="sub-fields">
                        <div className="field-group" style={{gridColumn:'1/-1'}}>
                          <div className="field-label">Naam</div>
                          <input className="field-input" defaultValue={s.name} onBlur={e=>updateField(s,{name:e.target.value})} />
                        </div>
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
                          <input className="field-input" type="date" defaultValue={s.renew_date} onBlur={e=>updateField(s,{renew_date:e.target.value})} />
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
                            <button className={`status-btn`} onClick={()=>{setOverstapSub(s);setOverstapStep(1);setOverstapData({opzegDatum:'',nieuweNaam:'',nieuwePrijs:String(s.price),nieuweCyclus:s.cycle});setOverstapOpen(true)}}>🔄 Overstappen</button>
                            <button className={`status-btn${s.status==='opgezegd'?' active red':''}`} onClick={()=>updateField(s,{status:'opgezegd'})}>✕ Opgezegd</button>
                          </div>
                          {s.predecessor_id && <div style={{fontSize:11,color:'#7C3AED',marginTop:5}}>↩ Opvolger van {subs.find(x=>x.id===s.predecessor_id)?.name}</div>}
                          {s.status==='opgezegd'&&!s.successor_id && <div style={{fontSize:11,color:'var(--muted)',marginTop:5}}>Telt niet mee in totalen</div>}
                        </div>
                      </div>

                      {/* Kenmerken */}
                      <div className="accordion-section">
                        <button className="accordion-trigger" onClick={()=>{
                          if(!openAccordions.has(`k-${s.id}`)&&!(s.kenmerken||[]).some((k:any)=>k.value)){
                            const d=defaultKenmerken(s.cat);
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

                      {/* Prijswijzigingen */}
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

        {/* ── OVERZICHT ── */}
        {panel === 'overzicht' && <>
          <div className="totals">
            <div className="total-card"><div className="lbl">Per maand</div><div className="val">{fmt(totalMonthly)}</div></div>
            <div className="total-card"><div className="lbl">Per jaar</div><div className="val">{fmt(totalMonthly*12)}</div></div>
          </div>
          <div className="section-lbl">Per categorie</div>
          {CAT_NAMES.filter(c=>subs.some(s=>s.cat===c&&s.status==='actief')).map(c=>{
            const cs=subs.filter(s=>s.cat===c&&s.status==='actief')
            const ct=cs.reduce((t,s)=>t+effectiveMonthlyEUR(s),0)
            return <div key={c} style={{display:'flex',justifyContent:'space-between',padding:'10px 14px',background:'var(--surface)',border:'1px solid var(--border)',borderRadius:'var(--radius-sm)',marginBottom:6,fontSize:13}}>
              <span>{CATS[c].icon} {c} <span style={{color:'var(--muted)'}}>({cs.length})</span></span>
              <span style={{fontFamily:'monospace',fontWeight:500}}>{fmt(ct)}/mnd</span>
            </div>
          })}
        </>}

        {/* ── INZICHTEN ── */}
        {panel === 'inzichten' && <>
          {activeSubs.filter(s=>s.cat==='Streaming').length>=3 && (
            <div style={{padding:'14px 16px',background:'var(--surface)',border:'1px solid var(--border)',borderRadius:'var(--radius-sm)',marginBottom:8,display:'flex',gap:12}}>
              <div style={{fontSize:18}}>⚠</div>
              <div><div style={{fontWeight:500,fontSize:13,marginBottom:4}}>{activeSubs.filter(s=>s.cat==='Streaming').length} streamingdiensten</div>
              <div style={{fontSize:12,color:'var(--muted)'}}>{activeSubs.filter(s=>s.cat==='Streaming').map(s=>s.name).join(', ')} — mogelijk overlap.</div></div>
            </div>
          )}
          {activeSubs.filter(s=>{const d=daysUntil(s.renew_date);return d!==null&&d>=0&&d<=14}).length>0 && (
            <div style={{padding:'14px 16px',background:'var(--surface)',border:'1px solid var(--border)',borderRadius:'var(--radius-sm)',marginBottom:8,display:'flex',gap:12}}>
              <div style={{fontSize:18}}>⏰</div>
              <div><div style={{fontWeight:500,fontSize:13,marginBottom:4}}>Binnenkort verlengd</div>
              <div style={{fontSize:12,color:'var(--muted)'}}>{activeSubs.filter(s=>{const d=daysUntil(s.renew_date);return d!==null&&d>=0&&d<=14}).map(s=>`${s.name} (over ${daysUntil(s.renew_date)}d)`).join(', ')}</div></div>
            </div>
          )}
          {savedMonthly>0.01 && (
            <div style={{padding:'14px 16px',background:'var(--green-bg)',border:'1px solid #b5d97a',borderRadius:'var(--radius-sm)',marginBottom:8,display:'flex',gap:12}}>
              <div style={{fontSize:18}}>✓</div>
              <div><div style={{fontWeight:500,fontSize:13,marginBottom:4}}>Bespaard: {fmt(savedMonthly)}/mnd</div>
              <div style={{fontSize:12,color:'var(--green)'}}>Door opzeggen of overstappen.</div></div>
            </div>
          )}
        </>}
      </div>

      {/* ── ADD MODAL ── */}
      {addOpen && (
        <div className="add-modal-overlay" onClick={e=>e.target===e.currentTarget&&setAddOpen(false)}>
          <div className="add-modal">
            <div className="add-modal-header">
              <span className="add-modal-title">Abonnement toevoegen</span>
              <button className="ai-modal-close" onClick={()=>setAddOpen(false)}>✕</button>
            </div>
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
                    <option value="">— kies —</option>
                    {CAT_NAMES.map(c=><option key={c} value={c}>{CATS[c].icon} {c}</option>)}
                  </select>
                </div>
              </div>
            </div>
            <div className="add-modal-footer">
              <button className="add-secondary-btn" onClick={()=>setAddOpen(false)}>Annuleren</button>
              <button className="add-primary-btn" onClick={()=>addSub({...addForm,price:parseFloat(addForm.price)||0,price_currency:'€',status:'actief',kenmerken:defaultKenmerken(addForm.cat)})}>Toevoegen</button>
            </div>
          </div>
        </div>
      )}

      {/* ── OVERSTAP MODAL ── */}
      {overstapOpen && overstapSub && (
        <div className="add-modal-overlay" onClick={e=>e.target===e.currentTarget&&setOverstapOpen(false)}>
          <div className="add-modal">
            <div className="add-modal-header">
              <span className="add-modal-title">{overstapSub.name} · Overstappen</span>
              <button className="ai-modal-close" onClick={()=>setOverstapOpen(false)}>✕</button>
            </div>
            <div className="add-modal-body">
              <div style={{display:'flex',justifyContent:'center',gap:5,marginBottom:16}}>
                {[1,2,3].map(n=><div key={n} style={{width:6,height:6,borderRadius:'50%',background:n===overstapStep?'var(--blue)':'var(--border)'}}/>)}
              </div>
              {overstapStep===1 && <div className="add-manual-form">
                <div style={{fontSize:13,color:'var(--muted)',marginBottom:8}}>Huidig: {overstapSub.name} · {fmt(effectiveMonthlyEUR(overstapSub))}/mnd</div>
                <div className="add-manual-field"><label className="add-manual-label">Opzegdatum</label><input className="add-manual-input" type="date" value={overstapData.opzegDatum} onChange={e=>setOverstapData(d=>({...d,opzegDatum:e.target.value}))} /></div>
              </div>}
              {overstapStep===2 && <div className="add-manual-form">
                <div className="add-manual-field"><label className="add-manual-label">Naam nieuwe aanbieder</label><input className="add-manual-input" value={overstapData.nieuweNaam} onChange={e=>setOverstapData(d=>({...d,nieuweNaam:e.target.value}))} placeholder="bijv. Youfone" /></div>
                <div className="add-manual-row">
                  <div className="add-manual-field"><label className="add-manual-label">Prijs (€)</label><input className="add-manual-input" type="number" value={overstapData.nieuwePrijs} step={0.01} onChange={e=>setOverstapData(d=>({...d,nieuwePrijs:e.target.value}))} /></div>
                  <div className="add-manual-field"><label className="add-manual-label">Cyclus</label><select className="add-manual-input" value={overstapData.nieuweCyclus} onChange={e=>setOverstapData(d=>({...d,nieuweCyclus:e.target.value}))}><option value="maand">Per maand</option><option value="kwartaal">Per kwartaal</option><option value="jaar">Per jaar</option></select></div>
                </div>
              </div>}
              {overstapStep===3 && (()=>{
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
    </div>
  )
}
