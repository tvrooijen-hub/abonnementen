import { createServerSupabase } from '@/lib/supabase-server'
import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const SYSTEM_PROMPT = `Je analyseert contracten voor een Nederlandse abonnementenbeheer-app.
Retourneer ALLEEN geldige JSON, geen uitleg of markdown.
Schema: {"naam":string|null,"prijs":number|null,"cyclus":"maand"|"kwartaal"|"jaar"|null,"verlengdatum":"YYYY-MM-DD"|null,"samenvatting":string,"kenmerken":[{"key":string,"value":string}]}
Voor kenmerken: 3-6 relevante eigenschappen. Mobiel: Data/Bellen/SMS/Netwerk. Verzekering: Dekking/Eigen risico/Type. Streaming: Schermen/Kwaliteit/Offline.`

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { base64, mediaType, subName, cat } = await req.json()
  if (!base64 || !mediaType) return NextResponse.json({ error: 'Missing fields' }, { status: 400 })

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })
  const isImage = mediaType.startsWith('image/')

  const content = isImage
    ? [{ type: 'image' as const, source: { type: 'base64' as const, media_type: mediaType, data: base64 } },
       { type: 'text' as const, text: `Analyseer dit contract${subName ? ` voor ${subName}` : ''}${cat ? ` (categorie: ${cat})` : ''}.` }]
    : [{ type: 'document' as const, source: { type: 'base64' as const, media_type: 'application/pdf' as const, data: base64 } },
       { type: 'text' as const, text: `Analyseer dit contract${subName ? ` voor ${subName}` : ''}${cat ? ` (categorie: ${cat})` : ''}.` }]

  try {
    const msg = await client.messages.create({ model: 'claude-sonnet-4-20250514', max_tokens: 1024, system: SYSTEM_PROMPT, messages: [{ role: 'user', content }] })
    const text = msg.content.filter(b => b.type === 'text').map(b => (b as {type:'text';text:string}).text).join('').replace(/```json|```/g, '').trim()
    return NextResponse.json(JSON.parse(text))
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'AI fout' }, { status: 500 })
  }
}
