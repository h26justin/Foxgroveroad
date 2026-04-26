import Link from 'next/link'
import { login } from './actions'

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>
}) {
  const params = await searchParams

  return (
    <div className="flex min-h-screen items-center justify-center px-6 py-12">
      <div className="w-full max-w-[420px]">
        {/* Logo / wordmark panel */}
        <div className="mb-6 rounded-2xl px-8 py-6 text-center">
          <h1 className="text-3xl font-bold tracking-tight">Foxgrove Road</h1>
          <p className="fg-mono mt-2 text-xs text-[color:var(--color-muted)]">
            House operations
          </p>
        </div>

        {/* Card */}
        <div className="fg-card-elevated">
          <div className="mb-1 flex items-center gap-2.5">
            <span
              className="block h-2 w-2 shrink-0 rounded-full"
              style={{ background: 'var(--color-green)' }}
              aria-hidden="true"
            />
            <h2 className="text-xl font-bold">Sign in to your account</h2>
          </div>
          <p className="fg-mono mb-6 text-xs text-[color:var(--color-muted)]">
            Welcome back.
          </p>

          <form action={login} className="space-y-5">
            {params.next && <input type="hidden" name="next" value={params.next} />}

            <div>
              <label htmlFor="email" className="fg-label">Email</label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                className="fg-input"
              />
            </div>

            <div>
              <label htmlFor="password" className="fg-label">Password</label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                className="fg-input"
              />
            </div>

            {params.error && (
              <div className="fg-msg-error">{params.error}</div>
            )}

            <button type="submit" className="fg-btn-primary">
              Sign in
            </button>
          </form>
        </div>

        <p className="fg-mono mt-5 text-center text-xs text-[color:var(--color-muted)]">
          New here?{' '}
          <Link
            href="/signup"
            className="font-semibold text-[color:var(--color-slate)] underline-offset-4 hover:underline"
          >
            Create one
          </Link>
        </p>
      </div>
    </div>
  )
}
