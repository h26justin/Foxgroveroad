import Link from 'next/link'
import { signup } from './actions'

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const params = await searchParams

  return (
    <div className="flex min-h-screen items-center justify-center px-6 py-12">
      <div className="w-full max-w-[420px]">
        {/* Logo / wordmark panel — gold tinted for signup */}
        <div
          className="mb-6 rounded-2xl border px-8 py-6 text-center transition"
          style={{
            background: 'rgba(200, 168, 75, 0.13)',
            borderColor: 'rgba(200, 168, 75, 0.27)',
          }}
        >
          <h1 className="text-3xl font-bold tracking-tight">Foxgrove Road</h1>
          <p
            className="fg-mono mt-2 text-[11px] font-semibold tracking-wider"
            style={{ color: '#8A6A00' }}
          >
            ✨ Welcome — set up your account
          </p>
        </div>

        {/* Card with gold border */}
        <div
          className="rounded-[20px] bg-white p-8"
          style={{
            border: '1.5px solid rgba(200, 168, 75, 0.4)',
            boxShadow: '0 4px 32px rgba(200, 168, 75, 0.15)',
          }}
        >
          <div className="mb-1 flex items-center gap-2.5">
            <span
              className="block h-2 w-2 shrink-0 rounded-full"
              style={{ background: 'var(--color-gold-soft)' }}
              aria-hidden="true"
            />
            <h2 className="text-xl font-bold">Create your account</h2>
          </div>
          <p className="fg-mono mb-6 text-xs text-[color:var(--color-muted)]">
            You'll be able to request rooms and see who's staying.
          </p>

          <form action={signup} className="space-y-5">
            <div>
              <label htmlFor="full_name" className="fg-label">Full name</label>
              <input
                id="full_name"
                name="full_name"
                type="text"
                autoComplete="name"
                required
                className="fg-input"
              />
            </div>

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
                autoComplete="new-password"
                minLength={6}
                required
                className="fg-input"
              />
              <p className="fg-helptext">At least 6 characters.</p>
            </div>

            {params.error && (
              <div className="fg-msg-error">{params.error}</div>
            )}

            <button type="submit" className="fg-btn-primary">
              Create account
            </button>
          </form>
        </div>

        <p className="fg-mono mt-5 text-center text-xs text-[color:var(--color-muted)]">
          Already have an account?{' '}
          <Link
            href="/login"
            className="font-semibold text-[color:var(--color-slate)] underline-offset-4 hover:underline"
          >
            Sign in
          </Link>
        </p>
      </div>
    </div>
  )
}
