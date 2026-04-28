export type Currency = '€' | '$'
export type SubStatus = 'actief' | 'opgezegd'

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
  status: SubStatus
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
    { name: 'HBO Max', price: 9.99, cycle: 'maand', domain: 'max.com' },
    { name: 'Amazon Prime', price: 8.99, cycle: 'maand', domain: 'amazon.com' },
    { name: 'Apple TV+', price: 9.99, cycle: 'maand', domain: 'apple.com' },
    { name: 'Pathé Thuis', price: 7.99, cycle: 'maand', domain: 'pathe.nl' },
    { name: 'Viaplay', price: 13.99, cycle: 'maand', domain: 'viaplay.com' },
    { name: 'Spotify', price: 10.99, cycle: 'maand', domain: 'spotify.com' },
    { name: 'Apple Music', price: 10.99, cycle: 'maand', domain: 'apple.com' },
    { name: 'YouTube Premium', price: 13.99, cycle: 'maand', domain: 'youtube.com' },
  ]},
  'AI': { icon: '🤖', items: [
    { name: 'ChatGPT Plus', price: 22.99, cycle: 'maand', domain: 'openai.com' },
    { name: 'Claude Pro', price: 18.00, cycle: 'maand', domain: 'anthropic.com' },
    { name: 'Copilot Pro', price: 22.00, cycle: 'maand', domain: 'microsoft.com' },
    { name: 'Perplexity Pro', price: 20.00, cycle: 'maand', domain: 'perplexity.ai' },
    { name: 'Gemini Advanced', price: 21.99, cycle: 'maand', domain: 'google.com' },
    { name: 'Midjourney', price: 10.00, cycle: 'maand', domain: 'midjourney.com' },
  ]},
  'Software': { icon: '💻', items: [
    { name: 'Microsoft 365', price: 99.00, cycle: 'jaar', domain: 'microsoft.com' },
    { name: 'Adobe Creative', price: 59.99, cycle: 'maand', domain: 'adobe.com' },
    { name: 'Notion', price: 10.00, cycle: 'maand', domain: 'notion.so' },
    { name: 'Canva Pro', price: 12.99, cycle: 'maand', domain: 'canva.com' },
    { name: 'Figma', price: 15.00, cycle: 'maand', domain: 'figma.com' },
    { name: 'Todoist', price: 4.00, cycle: 'maand', domain: 'todoist.com' },
  ]},
  'Cloud & Opslag': { icon: '☁️', items: [
    { name: 'iCloud+', price: 0.99, cycle: 'maand', domain: 'apple.com' },
    { name: 'Google One', price: 1.99, cycle: 'maand', domain: 'google.com' },
    { name: 'Dropbox', price: 9.99, cycle: 'maand', domain: 'dropbox.com' },
    { name: 'OneDrive', price: 2.00, cycle: 'maand', domain: 'microsoft.com' },
    { name: 'Domeinnaam', price: 12.00, cycle: 'jaar', domain: 'transip.nl' },
    { name: 'Hosting', price: 5.00, cycle: 'maand', domain: 'transip.nl' },
  ]},
  'Beveiliging': { icon: '🔒', items: [
    { name: '1Password', price: 3.99, cycle: 'maand', domain: '1password.com' },
    { name: 'Bitwarden', price: 1.00, cycle: 'maand', domain: 'bitwarden.com' },
    { name: 'NordVPN', price: 3.99, cycle: 'maand', domain: 'nordvpn.com' },
    { name: 'ExpressVPN', price: 8.32, cycle: 'maand', domain: 'expressvpn.com' },
    { name: 'Bitdefender', price: 2.99, cycle: 'maand', domain: 'bitdefender.com' },
    { name: 'Norton', price: 4.99, cycle: 'maand', domain: 'norton.com' },
  ]},
  'Mobiel & Internet': { icon: '📡', items: [
    { name: 'Ziggo Internet', price: 45.00, cycle: 'maand', domain: 'ziggo.nl' },
    { name: 'KPN Internet', price: 42.00, cycle: 'maand', domain: 'kpn.com' },
    { name: 'T-Mobile Thuis', price: 38.00, cycle: 'maand', domain: 't-mobile.nl' },
    { name: 'KPN Mobiel', price: 25.00, cycle: 'maand', domain: 'kpn.com' },
    { name: 'Vodafone Mobiel', price: 22.00, cycle: 'maand', domain: 'vodafone.nl' },
    { name: 'Odido Mobiel', price: 18.00, cycle: 'maand', domain: 'odido.nl' },
    { name: 'Ziggo TV', price: 19.00, cycle: 'maand', domain: 'ziggo.nl' },
    { name: 'NPO Plus', price: 5.99, cycle: 'maand', domain: 'npoplus.nl' },
  ]},
  'Energie': { icon: '⚡', items: [
    { name: 'Gas', price: 80.00, cycle: 'maand', domain: 'vattenfall.nl' },
    { name: 'Elektriciteit', price: 100.00, cycle: 'maand', domain: 'vattenfall.nl' },
    { name: 'Energie combi', price: 170.00, cycle: 'maand', domain: 'vattenfall.nl' },
    { name: 'Water', price: 25.00, cycle: 'maand', domain: 'waternet.nl' },
    { name: 'Gemeentelijke heffingen', price: 35.00, cycle: 'maand', domain: '' },
  ]},
  'Wonen': { icon: '🏠', items: [
    { name: 'Huur', price: 900.00, cycle: 'maand', domain: '' },
    { name: 'VvE bijdrage', price: 75.00, cycle: 'maand', domain: '' },
    { name: 'Inboedelverzekering', price: 15.00, cycle: 'maand', domain: 'centraal-beheer.nl' },
    { name: 'Opstalverzekering', price: 12.00, cycle: 'maand', domain: 'centraal-beheer.nl' },
  ]},
  'Verzekeringen': { icon: '🛡️', items: [
    { name: 'Zorgverzekering', price: 135.00, cycle: 'maand', domain: 'menzis.nl' },
    { name: 'Aanvullende zorg', price: 25.00, cycle: 'maand', domain: 'menzis.nl' },
    { name: 'Tandartsverzekering', price: 15.00, cycle: 'maand', domain: 'centraal-beheer.nl' },
    { name: 'Autoverzekering', price: 60.00, cycle: 'maand', domain: 'centraal-beheer.nl' },
    { name: 'Fietsverzekering', price: 8.00, cycle: 'maand', domain: 'centraal-beheer.nl' },
    { name: 'Aansprakelijkheid', price: 5.00, cycle: 'maand', domain: 'centraal-beheer.nl' },
    { name: 'Rechtsbijstand', price: 16.00, cycle: 'maand', domain: 'arag.nl' },
    { name: 'OV-abonnement', price: 40.00, cycle: 'maand', domain: 'ns.nl' },
  ]},
  'Nieuws & Kennis': { icon: '📰', items: [
    { name: 'NRC', price: 17.50, cycle: 'maand', domain: 'nrc.nl' },
    { name: 'De Volkskrant', price: 13.99, cycle: 'maand', domain: 'volkskrant.nl' },
    { name: 'AD Digitaal', price: 9.99, cycle: 'maand', domain: 'ad.nl' },
    { name: 'FD', price: 22.95, cycle: 'maand', domain: 'fd.nl' },
    { name: 'Duolingo Plus', price: 6.99, cycle: 'maand', domain: 'duolingo.com' },
    { name: 'Coursera', price: 43.00, cycle: 'maand', domain: 'coursera.org' },
    { name: 'Blinkist', price: 12.99, cycle: 'maand', domain: 'blinkist.com' },
  ]},
  'Games': { icon: '🎮', items: [
    { name: 'PlayStation Plus', price: 8.99, cycle: 'maand', domain: 'playstation.com' },
    { name: 'Xbox Game Pass', price: 14.99, cycle: 'maand', domain: 'xbox.com' },
    { name: 'Nintendo Online', price: 19.99, cycle: 'jaar', domain: 'nintendo.com' },
    { name: 'EA Play', price: 4.99, cycle: 'maand', domain: 'ea.com' },
    { name: 'Ubisoft+', price: 14.99, cycle: 'maand', domain: 'ubisoft.com' },
  ]},
  'Sport & Fitness': { icon: '💪', items: [
    { name: 'Basic-Fit', price: 25.99, cycle: 'maand', domain: 'basic-fit.com' },
    { name: 'Sportschool', price: 35.00, cycle: 'maand', domain: '' },
    { name: 'Zwembad', price: 22.00, cycle: 'maand', domain: '' },
    { name: 'Strava', price: 6.99, cycle: 'maand', domain: 'strava.com' },
    { name: 'Garmin Connect', price: 6.99, cycle: 'maand', domain: 'garmin.com' },
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

export function fmt(n: number): string {
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
