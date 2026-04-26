import Link from 'next/link'
import { login } from './actions'

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>
}) {
  const params = await searchParams

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">Foxgrove Road</h1>
          <p className="mt-1 text-sm text-stone-500">Sign in to continue</p>
        </div>

        <form action={login} className="space-y-4 rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
          {params.next && <input type="hidden" name="next" value={params.next} />}

          <div>
            <label htmlFor="email" className="mb-1 block text-sm font-medium">
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm outline-none focus:border-stone-900"
            />
          </div>

          <div>
            <label htmlFor="password" className="mb-1 block text-sm font-medium">
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm outline-none focus:border-stone-900"
            />
          </div>

          {params.error && (
            <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
              {params.error}
            </p>
          )}

          <button
            type="submit"
            className="w-full rounded-lg bg-stone-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-stone-800"
          >
            Sign in
          </button>
        </form>

        <p className="mt-4 text-center text-sm text-stone-500">
          New here?{' '}
          <Link href="/signup" className="font-medium text-stone-900 underline-offset-4 hover:underline">
            Create one
          </Link>
        </p>
      </div>
    </div>
  )
}
