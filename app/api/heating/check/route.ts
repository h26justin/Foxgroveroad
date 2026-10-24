import 'server-only'
import { bearerMatches, runHeatingChecks } from '@/lib/heating'

/**
 * Heating watchdog. Called every 10 minutes by Supabase pg_cron
 * (db/13_heating_watchdog.sql) with `Authorization: Bearer $CRON_SECRET`.
 * Bridge check-ins already run the checks; this is what notices when
 * the bridge itself has gone quiet.
 */
export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  if (!bearerMatches(request, 'CRON_SECRET')) {
    return Response.json({ error: 'Unauthorised' }, { status: 401 })
  }
  try {
    const result = await runHeatingChecks({ now: new Date() })
    return Response.json(result)
  } catch (err: any) {
    console.error('[heating] check failed:', err?.message ?? err)
    return Response.json({ error: 'Check failed' }, { status: 500 })
  }
}

// Vercel Cron sends GET; accept it too in case a Vercel cron is used instead.
export const GET = POST
