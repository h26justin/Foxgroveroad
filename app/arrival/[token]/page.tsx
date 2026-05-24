import { notFound } from 'next/navigation'
import { createAdminClient } from '@/lib/supabase/admin'
import { asSettingsMap } from '@/lib/house-settings'

/**
 * Public arrival packet for a guest. Reached via a per-booking opaque
 * token (set on the booking_requests row when it's approved). The token
 * IS the auth — anyone with the URL can read the page. Designed to be
 * shared by the admin via copy-paste.
 *
 * No cookies / no session. Service role client because the arrival
 * page is anonymous — calendar-app style.
 */
export const dynamic = 'force-dynamic'

export default async function ArrivalPacketPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params

  // Token shape: 48 hex chars (24 bytes). Reject anything else without
  // touching the DB.
  if (!/^[a-f0-9]{48}$/.test(token)) {
    notFound()
  }

  const admin = createAdminClient()

  const { data: booking } = await admin
    .from('booking_requests')
    .select(
      'id, check_in, check_out, adults, children, notes, requested_by, requester:profiles!booking_requests_requested_by_fkey(full_name)',
    )
    .eq('arrival_token', token)
    .eq('status', 'approved')
    .maybeSingle()

  if (!booking) notFound()
  const b = booking as any

  const [settingsRes, bedsRes] = await Promise.all([
    admin.from('house_settings').select('key, value'),
    admin
      .from('bookings')
      .select(
        'id, guest_name, beds:beds!bookings_bed_id_fkey(name, rooms:rooms!beds_room_id_fkey(name, floor))',
      )
      .eq('request_id', b.id)
      .eq('status', 'approved'),
  ])

  const settings = asSettingsMap((settingsRes.data as any[]) ?? [])
  const beds = (bedsRes.data as any[]) ?? []

  const requesterName: string =
    (b.requester as any)?.full_name?.split(' ')[0] ?? 'guest'

  const checkInDate = new Date(b.check_in + 'T00:00:00')
  const checkOutDate = new Date(b.check_out + 'T00:00:00')
  const formatDate = (d: Date) =>
    d.toLocaleDateString('en-GB', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    })

  return (
    <main
      style={{
        background: 'var(--color-cream, #f7f1e8)',
        // v44: 100dvh + safe-area-insets so iPhone home-indicator and
        // dynamic island don't clip the content. This is the page guests
        // open on their phone, so a clean mobile render matters.
        minHeight: '100dvh',
        padding:
          'max(40px, env(safe-area-inset-top)) 16px max(40px, env(safe-area-inset-bottom))',
      }}
    >
      <div
        style={{
          maxWidth: 560,
          margin: '0 auto',
          background: 'white',
          borderRadius: 20,
          padding: 32,
          boxShadow: '0 4px 32px rgba(0,0,0,0.06)',
        }}
      >
        <h1
          style={{
            fontFamily: 'var(--font-serif)',
            fontSize: 32,
            color: 'var(--color-ink, #2a261f)',
            marginBottom: 4,
          }}
        >
          Welcome, {requesterName}
        </h1>
        <p
          style={{
            color: 'var(--color-muted, #888)',
            fontSize: 14,
            marginBottom: 32,
          }}
        >
          Your stay at {settings.address || 'Foxgrove Road'} —{' '}
          {formatDate(checkInDate)} to {formatDate(checkOutDate)}
        </p>

        <Section title="Check-in">
          <Row label="Arrive after" value={settings.check_in_time || '3pm'} />
          <Row label="Leave by" value={settings.check_out_time || '11am'} />
          {settings.address && (
            <Row label="Address" value={settings.address} mono />
          )}
        </Section>

        {(settings.wifi_ssid || settings.wifi_password) && (
          <Section title="WiFi">
            {settings.wifi_ssid && (
              <Row label="Network" value={settings.wifi_ssid} mono />
            )}
            {settings.wifi_password && (
              <Row label="Password" value={settings.wifi_password} mono />
            )}
          </Section>
        )}

        {beds.length > 0 && (
          <Section title="Your rooms">
            {beds.map((bed: any) => {
              const roomName = bed.beds?.rooms?.name ?? 'Room'
              const bedName = bed.beds?.name ?? 'bed'
              return (
                <Row
                  key={bed.id}
                  label={bed.guest_name ?? 'Guest'}
                  value={`${roomName} — ${bedName}`}
                />
              )
            })}
          </Section>
        )}

        {settings.fridge_notes && (
          <Section title="In the kitchen">
            <Paragraph>{settings.fridge_notes}</Paragraph>
          </Section>
        )}

        {settings.arrival_notes && (
          <Section title="A few more things">
            <Paragraph>{settings.arrival_notes}</Paragraph>
          </Section>
        )}

        <p
          style={{
            marginTop: 32,
            color: 'var(--color-muted, #888)',
            fontSize: 12,
            textAlign: 'center',
          }}
        >
          Questions? Just reply to the message you got with this link.
        </p>
      </div>
    </main>
  )
}

function Section({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  return (
    <section style={{ marginBottom: 28 }}>
      <h2
        style={{
          fontSize: 11,
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          color: 'var(--color-muted, #888)',
          marginBottom: 12,
          fontWeight: 600,
        }}
      >
        {title}
      </h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {children}
      </div>
    </section>
  )
}

function Row({
  label,
  value,
  mono = false,
}: {
  label: string
  value: string
  mono?: boolean
}) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        gap: 12,
        alignItems: 'baseline',
        borderBottom: '1px solid rgba(0,0,0,0.06)',
        paddingBottom: 8,
      }}
    >
      <span style={{ color: 'var(--color-muted, #888)', fontSize: 13 }}>
        {label}
      </span>
      <span
        style={{
          color: 'var(--color-ink, #2a261f)',
          fontSize: 14,
          textAlign: 'right',
          fontFamily: mono ? 'ui-monospace, monospace' : 'inherit',
          wordBreak: 'break-all',
        }}
      >
        {value}
      </span>
    </div>
  )
}

function Paragraph({ children }: { children: React.ReactNode }) {
  return (
    <p
      style={{
        color: 'var(--color-ink, #2a261f)',
        fontSize: 14,
        lineHeight: 1.55,
        whiteSpace: 'pre-wrap',
      }}
    >
      {children}
    </p>
  )
}
