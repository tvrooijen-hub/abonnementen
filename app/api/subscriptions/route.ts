import { createClient } from '@supabase/supabase-js'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'

async function getUser() {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet) {
          try { cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) } catch {}
        },
      },
    }
  )
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
)

export async function GET() {
  const user = await getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await admin
    .from('subscriptions')
    .select(`*, kenmerken ( id, key, value, sort_order ), price_history ( id, price, valid_from, note )`)
    .eq('user_id', user.id)
    .order('created_at', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}

export async function POST(req: NextRequest) {
  const user = await getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { kenmerken, price_history, ...subData } = body

  const { data: sub, error } = await admin
    .from('subscriptions')
    .insert({ ...subData, user_id: user.id })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (kenmerken?.length) {
    await admin.from('kenmerken').insert(
      kenmerken.map((k: any, i: number) => ({
        subscription_id: sub.id, user_id: user.id, key: k.key, value: k.value || '', sort_order: i,
      }))
    )
  }

  return NextResponse.json(sub, { status: 201 })
}

export async function PATCH(req: NextRequest) {
  const user = await getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { id, kenmerken, price_history, ...subData } = body
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  const { data: sub, error } = await admin
    .from('subscriptions')
    .update(subData)
    .eq('id', id)
    .eq('user_id', user.id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (kenmerken !== undefined) {
    await admin.from('kenmerken').delete().eq('subscription_id', id)
    if (kenmerken.length) {
      await admin.from('kenmerken').insert(
        kenmerken.map((k: any, i: number) => ({
          subscription_id: id, user_id: user.id, key: k.key, value: k.value || '', sort_order: i,
        }))
      )
    }
  }

  if (price_history !== undefined) {
    await admin.from('price_history').delete().eq('subscription_id', id)
    if (price_history.length) {
      await admin.from('price_history').insert(
        price_history.map((ph: any) => ({
          subscription_id: id, user_id: user.id, price: ph.price, valid_from: ph.valid_from, note: ph.note || null,
        }))
      )
    }
  }

  return NextResponse.json(sub)
}

export async function DELETE(req: NextRequest) {
  const user = await getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  const { error } = await admin.from('subscriptions').delete().eq('id', id).eq('user_id', user.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
