'use client'
import { useState } from 'react'
import { createClient } from '@/lib/supabase'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/dashboard` },
    })
    if (error) setError(error.message)
    else setSent(true)
    setLoading(false)
  }

  return (
    <div className="login-wrap">
      <div className="login-card">
        <h1>Abonnementen</h1>
        <p>Vul je e-mailadres in om in te loggen.</p>
        {!sent ? (
          <form onSubmit={handleLogin}>
            <input
              type="email"
              placeholder="jouw@email.nl"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              autoFocus
            />
            <button className="submit-btn" disabled={loading}>
              {loading ? 'Bezig...' : 'Stuur inloglink →'}
            </button>
            {error && <div className="error-msg">{error}</div>}
          </form>
        ) : (
          <div className="success-msg">
            ✓ Check je inbox! We hebben een inloglink gestuurd naar <strong>{email}</strong>.
          </div>
        )}
      </div>
    </div>
  )
}