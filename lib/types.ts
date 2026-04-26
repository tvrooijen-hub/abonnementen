export type Subscription = {
  id?: string
  user_id?: string
  name: string
  price: number | string
  cycle: 'maand' | 'kwartaal' | 'jaar'
  renew_date: string
  cat: string
  promo_price: number | string
  promo_until: string
  payment_method: string
  created_at?: string
}

export const PAYMENT_METHODS = [
  'Persoonlijke rekening',
  'Gezamenlijke rekening',
  'Rekening vrouw',
  'Creditcard',
  'Anders',
]

export const CATS: Record<string, { icon: string; items: { name: string; price: number; cycle: 'maand' | 'jaar' }[] }> = {
  'Streaming': { icon: '🎬', items: [
    { name: 'Netflix', price: 17.99, cycle: 'maand' },
    { name: 'Videoland', price: 7.99, cycle: 'maand' },
    { name: 'Disney+', price: 13.99, cycle: 'maand' },
    { name: 'Apple TV+', price: 9.99, cycle: 'maand' },
    { name: 'HBO Max', price: 9.99, cycle: 'maand' },
    { name: 'Amazon Prime', price: 8.99, cycle: 'maand' },
    { name: 'Pathé Thuis', price: 7.99, cycle: 'maand' },
  ]},
  'Muziek': { icon: '🎵', items: [
    { name: 'Spotify', price: 10.99, cycle: 'maand' },
    { name: 'Apple Music', price: 10.99, cycle: 'maand' },
    { name: 'Tidal', price: 9.99, cycle: 'maand' },
  ]},
  'AI': { icon: '🤖', items: [
    { name: 'ChatGPT Plus', price: 22.99, cycle: 'maand' },
    { name: 'Claude Pro', price: 18.00, cycle: 'maand' },
    { name: 'Copilot Pro', price: 22.00, cycle: 'maand' },
    { name: 'Midjourney', price: 10.00, cycle: 'maand' },
    { name: 'Perplexity Pro', price: 20.00, cycle: 'maand' },
  ]},
  'Beveiliging': { icon: '🔒', items: [
    { name: '1Password', price: 3.99, cycle: 'maand' },
    { name: 'Norton', price: 4.99, cycle: 'maand' },
    { name: 'VPN', price: 3.99, cycle: 'maand' },
    { name: 'Bitdefender', price: 2.99, cycle: 'maand' },
  ]},
  'Cloud & Tech': { icon: '☁️', items: [
    { name: 'iCloud+', price: 0.99, cycle: 'maand' },
    { name: 'Google One', price: 1.99, cycle: 'maand' },
    { name: 'Microsoft 365', price: 99.00, cycle: 'jaar' },
    { name: 'Domeinnaam', price: 12.00, cycle: 'jaar' },
    { name: 'Dropbox', price: 9.99, cycle: 'maand' },
  ]},
  'Nieuws & Games': { icon: '📰', items: [
    { name: 'NRC', price: 17.50, cycle: 'maand' },
    { name: 'De Volkskrant', price: 13.99, cycle: 'maand' },
    { name: 'AD Digitaal', price: 9.99, cycle: 'maand' },
    { name: 'Xbox Game Pass', price: 14.99, cycle: 'maand' },
    { name: 'PlayStation Plus', price: 8.99, cycle: 'maand' },
    { name: 'Nintendo Online', price: 19.99, cycle: 'jaar' },
  ]},
  'Energie & Wonen': { icon: '⚡', items: [
    { name: 'Gas', price: 80.00, cycle: 'maand' },
    { name: 'Elektriciteit', price: 100.00, cycle: 'maand' },
    { name: 'Water', price: 25.00, cycle: 'maand' },
    { name: 'Internet', price: 45.00, cycle: 'maand' },
    { name: 'Mobiel abonnement', price: 25.00, cycle: 'maand' },
    { name: 'TV pakket', price: 19.00, cycle: 'maand' },
    { name: 'VvE bijdrage', price: 75.00, cycle: 'maand' },
  ]},
  'Verzekering': { icon: '🏥', items: [
    { name: 'Zorgverzekering', price: 135.00, cycle: 'maand' },
    { name: 'Aanvullende zorg', price: 25.00, cycle: 'maand' },
    { name: 'Inboedelverzekering', price: 15.00, cycle: 'maand' },
    { name: 'Autoverzekering', price: 60.00, cycle: 'maand' },
    { name: 'Rechtsbijstand', price: 16.00, cycle: 'maand' },
  ]},
  'Sport & Fitness': { icon: '💪', items: [
    { name: 'Sportschool', price: 30.00, cycle: 'maand' },
    { name: 'Strava', price: 6.99, cycle: 'maand' },
    { name: 'Zwembad', price: 22.00, cycle: 'maand' },
    { name: 'Sportclub', price: 18.00, cycle: 'maand' },
  ]},
  'Overig': { icon: '📌', items: [] },
}

export function toMonthly(price: number | string, cycle: string): number {
  const p = parseFloat(String(price)) || 0
  if (cycle === 'jaar') return p / 12
  if (cycle === 'kwartaal') return p / 3
  return p
}

export function daysUntil(dateStr: string): number | null {
  if (!dateStr) return null
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const d = new Date(dateStr); d.setHours(0, 0, 0, 0)
  return Math.round((d.getTime() - today.getTime()) / 86400000)
}

export function promoActive(s: Subscription): boolean {
  if (!s.promo_price || !s.promo_until) return false
  const days = daysUntil(s.promo_until)
  return days !== null && days >= 0
}

export function effectiveMonthly(s: Subscription): number {
  const price = promoActive(s) ? s.promo_price : s.price
  return toMonthly(price, s.cycle)
}

export function fmt(n: number): string {
  return '€\u00a0' + n.toFixed(2).replace('.', ',')
}