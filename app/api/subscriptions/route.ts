import { createServerSupabase } from '@/lib/supabase-server'
import { NextRequest, NextResponse } from 'next/server'

export async function GET() {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('subscriptions')
    .select(`*, kenmerken ( id, key, value, sort_order ), price_history ( id, price, valid_from, note )`)
    .eq('user_id', user.id)
    .order('created_at', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { kenmerken, price_history, ...subData } = body

  const { data: sub, error } = await supabase
    .from('subscriptions')
    .insert({ ...subData, user_id: user.id })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (kenmerken?.length) {
    await supabase.from('kenmerken').insert(
      kenmerken.map((k: { key: string; value: string }, i: number) => ({
        subscription_id: sub.id, user_id: user.id, key: k.key, value: k.value || '', sort_order: i,
      }))
    )
  }

  if (price_history?.length) {
    await supabase.from('price_history').insert(
      price_history.map((ph: { price: number; valid_from: string; note?: string }) => ({
        subscription_id: sub.id, user_id: user.id, price: ph.price, valid_from: ph.valid_from, note: ph.note || null,
      }))
    )
  }

  return NextResponse.json(sub, { status: 201 })
}

export async function PATCH(req: NextRequest) {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { id, kenmerken, price_history, ...subData } = body
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  const { data: sub, error } = await supabase
    .from('subscriptions')
    .update(subData)
    .eq('id', id)
    .eq('user_id', user.id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (kenmerken !== undefined) {
    await supabase.from('kenmerken').delete().eq('subscription_id', id)
    if (kenmerken.length) {
      await supabase.from('kenmerken').insert(
        kenmerken.map((k: { key: string; value: string }, i: number) => ({
          subscription_id: id, user_id: user.id, key: k.key, value: k.value || '', sort_order: i,
        }))
      )
    }
  }

  if (price_history !== undefined) {
    await supabase.from('price_history').delete().eq('subscription_id', id)
    if (price_history.length) {
      await supabase.from('price_history').insert(
        price_history.map((ph: { price: number; valid_from: string; note?: string }) => ({
          subscription_id: id, user_id: user.id, price: ph.price, valid_from: ph.valid_from, note: ph.note || null,
        }))
      )
    }
  }

  return NextResponse.json(sub)
}

export async function DELETE(req: NextRequest) {
  const supabase = await createServerSupabase()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  const { error } = await supabase.from('subscriptions').delete().eq('id', id).eq('user_id', user.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
