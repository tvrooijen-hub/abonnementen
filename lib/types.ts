export type Currency = '€' | '$'

export type Subscription = {
  id?: string
  user_id?: string
  family_id?: string
  name: string
  price: number | string
  price_currency: '€' | '$'
  cycle: 'maand' | 'kwartaal' | 'jaar'
  renew_date: string
  cat: string
  intro_price: number | string | null
  intro_until: string | null
  payment_method: string
  domain: string
  created_at?: string
}

export const PAYMENT_METHODS = [
  'Persoonlijke rekening',
  'Gezamenlijke rekening',
  'Rekening vrouw',
  'Creditcard',
  'Anders',
]

export const CATS: Record<string, { icon: string; items: { name: string; price: number; cycle: 'maand' | 'jaar'; domain: string }[] }> = {
  'Streaming': { icon: '🎬', items: [
    { name: 'Netflix', price: 17.99, cycle: 'maand', domain: 'netflix.com' },
    { name: 'Videoland', price: 7.99, cycle: 'maand', domain: 'videoland.com' },
    { name: 'Disney+', price: 13.99, cycle: 'maand', domain: 'disneyplus.com' },
    { name: 'Apple TV+', price: 9.99, cycle: 'maand', domain: 'apple.com' },
    { name: 'HBO Max', price: 9.99, cycle: 'maand', domain: 'max.com' },
    { name: 'Amazon Prime', price: 8.99, cycle: 'maand', domain: 'amazon.com' },
    { name: 'Pathé Thuis', price: 7.99, cycle: 'maand', domain: 'pathe.nl' },
  ]},
  'Muziek': { icon: '🎵', items: [
    { name: 'Spotify', price: 10.99, cycle: 'maand', domain: 'spotify.com' },
    { name: 'Apple Music', price: 10.99, cycle: 'maand', domain: 'apple.com' },
    { name: 'Tidal', price: 9.99, cycle: 'maand', domain: 'tidal.com' },
  ]},
  'AI': { icon: '🤖', items: [
    { name: 'ChatGPT Plus', price: 22.99, cycle: 'maand', domain: 'openai.com' },
    { name: 'Claude Pro', price: 18.00, cycle: 'maand', domain: 'anthropic.com' },
    { name: 'Copilot Pro', price: 22.00, cycle: 'maand', domain: 'microsoft.com' },
    { name: 'Midjourney', price: 10.00, cycle: 'maand', domain: 'midjourney.com' },
    { name: 'Perplexity Pro', price: 20.00, cycle: 'maand', domain: 'perplexity.ai' },
  ]},
  'Beveiliging': { icon: '🔒', items: [
    { name: '1Password', price: 3.99, cycle: 'maand', domain: '1password.com' },
    { name: 'NordVPN', price: 3.99, cycle: 'maand', domain: 'nordvpn.com' },
    { name: 'Bitdefender', price: 2.99, cycle: 'maand', domain: 'bitdefender.com' },
  ]},
  'Cloud & Tech': { icon: '☁️', items: [
    { name: 'iCloud+', price: 0.99, cycle: 'maand', domain: 'apple.com' },
    { name: 'Google One', price: 1.99, cycle: 'maand', domain: 'google.com' },
    { name: 'Microsoft 365', price: 99.00, cycle: 'jaar', domain: 'microsoft.com' },
    { name: 'Domeinnaam', price: 12.00, cycle: 'jaar', domain: 'transip.nl' },
    { name: 'Dropbox', price: 9.99, cycle: 'maand', domain: 'dropbox.com' },
  ]},
  'Nieuws & Games': { icon: '📰', items: [
    { name: 'NRC', price: 17.50, cycle: 'maand', domain: 'nrc.nl' },
    { name: 'De Volkskrant', price: 13.99, cycle: 'maand', domain: 'volkskrant.nl' },
    { name: 'AD Digitaal', price: 9.99, cycle: 'maand', domain: 'ad.nl' },
    { name: 'Xbox Game Pass', price: 14.99, cycle: 'maand', domain: 'xbox.com' },
    { name: 'PlayStation Plus', price: 8.99, cycle: 'maand', domain: 'playstation.com' },
    { name: 'Nintendo Online', price: 19.99, cycle: 'jaar', domain: 'nintendo.com' },
  ]},
  'Energie & Wonen': { icon: '⚡', items: [
    { name: 'Gas', price: 80.00, cycle: 'maand', domain: 'vattenfall.nl' },
    { name: 'Elektriciteit', price: 100.00, cycle: 'maand', domain: 'vattenfall.nl' },
    { name: 'Water', price: 25.00, cycle: 'maand', domain: 'waternet.nl' },
    { name: 'Internet', price: 45.00, cycle: 'maand', domain: 'ziggo.nl' },
    { name: 'Mobiel abonnement', price: 25.00, cycle: 'maand', domain: 'kpn.com' },
    { name: 'TV pakket', price: 19.00, cycle: 'maand', domain: 'ziggo.nl' },
    { name: 'VvE bijdrage', price: 75.00, cycle: 'maand', domain: '' },
  ]},
  'Verzekering': { icon: '🏥', items: [
    { name: 'Zorgverzekering', price: 135.00, cycle: 'maand', domain: 'menzis.nl' },
    { name: 'Aanvullende zorg', price: 25.00, cycle: 'maand', domain: 'menzis.nl' },
    { name: 'Inboedelverzekering', price: 15.00, cycle: 'maand', domain: 'centraal-beheer.nl' },
    { name: 'Autoverzekering', price: 60.00, cycle: 'maand', domain: 'centraal-beheer.nl' },
    { name: 'Rechtsbijstand', price: 16.00, cycle: 'maand', domain: 'arag.nl' },
  ]},
  'Sport & Fitness': { icon: '💪', items: [
    { name: 'Sportschool', price: 30.00, cycle: 'maand', domain: 'basicfit.com' },
    { name: 'Strava', price: 6.99, cycle: 'maand', domain: 'strava.com' },
    { name: 'Zwembad', price: 22.00, cycle: 'maand', domain: '' },
    { name: 'Sportclub', price: 18.00, cycle: 'maand', domain: '' },
  ]},
  'Overig': { icon: '📌', items: [] },
}

export const USD_RATE = 1.08

export function logoUrl(domain: string): string {
  if (!domain) return ''
  return `https://www.google.com/s2/favicons?domain=${domain}&sz=64`
}

export function toMonthly(price: number | string, cycle: string): number {
  const p = parseFloat(String(price)) || 0
  if (cycle === 'jaar') return p / 12
  if (cycle === 'kwartaal') return p / 3
  return p
}

export function daysUntil(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const d = new Date(dateStr); d.setHours(0, 0, 0, 0)
  return Math.round((d.getTime() - today.getTime()) / 86400000)
}

export function introActive(s: Subscription): boolean {
  if (!s.intro_price || !s.intro_until) return false
  const days = daysUntil(s.intro_until)
  return days !== null && days >= 0
}

export function effectivePrice(s: Subscription): number {
  if (introActive(s)) return parseFloat(String(s.intro_price)) || 0
  return parseFloat(String(s.price)) || 0
}

export function effectiveMonthlyEUR(s: Subscription): number {
  let p = effectivePrice(s)
  if (s.price_currency === '$') p = p / USD_RATE
  return toMonthly(p, s.cycle)
}

export function normalMonthlyEUR(s: Subscription): number {
  let p = parseFloat(String(s.price)) || 0
  if (s.price_currency === '$') p = p / USD_RATE
  return toMonthly(p, s.cycle)
}

export function fmt(n: number, currency: Currency = '€'): string {
  if (currency === '$') {
    return '$\u00a0' + (n * USD_RATE).toFixed(2).replace('.', ',')
  }
  return '€\u00a0' + n.toFixed(2).replace('.', ',')
}

export function nextRenewDate(dateStr: string, cycle: 'maand' | 'kwartaal' | 'jaar'): string {
  if (!dateStr) return dateStr
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const d = new Date(dateStr); d.setHours(0, 0, 0, 0)
  if (d >= today) return dateStr
  while (d < today) {
    if (cycle === 'maand') d.setMonth(d.getMonth() + 1)
    else if (cycle === 'kwartaal') d.setMonth(d.getMonth() + 3)
    else d.setFullYear(d.getFullYear() + 1)
  }
  return d.toISOString().slice(0, 10)
}
