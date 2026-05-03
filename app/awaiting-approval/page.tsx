import { redirect } from 'next/navigation'
import { getCurrentProfile } from '@/lib/auth'
import { landingPathFor } from '@/lib/landing'
import LogoutButton from './LogoutButton'

/**
 * Holding page shown to users with role='pending'. Self-signups land
 * here until an admin approves them on the Team page (sets their role
 * to family/cleaner/admin) or rejects them (soft-deletes their account
 * via the v29 deleteUser flow).
 *
 * Anyone NOT pending who lands here is redirected to their normal
 * landing page — saves them a confusing detour if they bookmark this
 * URL or visit it after being approved.
 */
export default async function AwaitingApprovalPage() {
  const profile = await getCurrentProfile()
  if (!profile) redirect('/login')
  if (profile.role !== 'pending') redirect(landingPathFor(profile.role))

  return (
    <div
      className="flex min-h-screen items-center justify-center px-6 py-12"
      style={{ background: 'var(--color-cream)' }}
    >
      <div className="w-full max-w-[460px]">
        <div className="mb-6 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/logo-foxgrove.png"
            alt="Foxgrove Road"
            className="mx-auto"
            style={{ width: 200, height: 'auto', display: 'block' }}
          />
        </div>

        <div className="fg-card-elevated p-6">
          <h1
            className="text-2xl mb-3"
            style={{
              fontFamily: 'var(--font-serif)',
              color: 'var(--color-ink)',
            }}
          >
            Awaiting approval
          </h1>
          <p
            className="text-sm fg-mono mb-4"
            style={{ color: 'var(--color-ink)' }}
          >
            Thanks for signing up, {profile.full_name?.split(' ')[0] ?? 'there'}.
            An admin needs to approve your account before you can access the
            house calendar and bookings.
          </p>
          <p
            className="text-sm fg-mono mb-6"
            style={{ color: 'var(--color-muted)' }}
          >
            You'll get an email once you're in — just sign back in any time
            and you'll be let through.
          </p>

          <LogoutButton />
        </div>
      </div>
    </div>
  )
}
