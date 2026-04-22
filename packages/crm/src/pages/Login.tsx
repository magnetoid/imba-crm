import { useEffect, useState } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { Loader2, Users } from 'lucide-react'
import { supabase } from '@imba/shared/supabase'
import { useSession } from '@imba/shared/auth'
import { Button } from '@imba/shared/ui/button'
import { Input } from '@imba/shared/ui/input'
import { Label } from '@imba/shared/ui/label'
import { Card, CardHeader, CardTitle, CardContent } from '@imba/shared/ui/card'

export default function Login() {
  const { loading, session } = useSession()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loginError, setLoginError] = useState('')
  const [signingIn, setSigningIn] = useState(false)

  useEffect(() => {
    document.body.classList.add('admin-shell')
    return () => { document.body.classList.remove('admin-shell') }
  }, [])

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoginError('')
    setSigningIn(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) setLoginError(error.message)
    setSigningIn(false)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (session) {
    const from = (location.state as { from?: string } | null)?.from
    return <Navigate to={from && from !== '/' ? from : '/pipeline'} replace />
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-6">
      <Card className="w-full max-w-sm">
        <CardHeader className="space-y-3 pb-4">
          <div className="w-11 h-11 rounded-lg flex items-center justify-center"
            style={{ background: 'rgba(201,169,110,0.1)', border: '1px solid rgba(201,169,110,0.2)' }}>
            <Users className="h-5 w-5" style={{ color: '#C9A96E' }} />
          </div>
          <div className="text-2xl font-semibold text-foreground">
            imba<span className="italic" style={{ color: '#C9A96E' }}>.</span>crm
          </div>
          <CardTitle className="text-base text-muted-foreground font-normal">
            Sign in to your CRM workspace
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" placeholder="you@imba.com"
                value={email} onChange={e => setEmail(e.target.value)} required autoFocus />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" placeholder="••••••••"
                value={password} onChange={e => setPassword(e.target.value)} required />
            </div>
            {loginError && <p className="text-destructive text-sm">{loginError}</p>}
            <Button type="submit" disabled={signingIn} className="w-full"
              style={{ background: '#C9A96E', color: '#0a0a0a' }}>
              {signingIn ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Signing in…</> : 'Sign in'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
