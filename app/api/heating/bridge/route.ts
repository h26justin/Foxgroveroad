import 'server-only'
import {
  bearerMatches,
  ingestBridgeReport,
  parseBridgeReport,
} from '@/lib/heating'

/**
 * Heatmiser bridge check-in.
 *
 * The bridge in the house (bridge/heatmiser/) POSTs the neoHub's live
 * data here about once a minute, plus the results of any commands it
 * ran, and gets back the commands queued since. Auth is a shared secret
 * in HEATING_BRIDGE_TOKEN (Vercel env + the bridge's .env), sent as
 * `Authorization: Bearer <token>`.
 */
export const dynamic = 'force-dynamic'

const MAX_BODY_BYTES = 100_000

export async function POST(request: Request) {
  if (!bearerMatches(request, 'HEATING_BRIDGE_TOKEN')) {
    return Response.json({ error: 'Unauthorised' }, { status: 401 })
  }

  const raw = await request.text()
  if (raw.length > MAX_BODY_BYTES) {
    return Response.json({ error: 'Too large' }, { status: 413 })
  }

  let body: unknown
  try {
    body = JSON.parse(raw)
  } catch {
    return Response.json({ error: 'Bad JSON' }, { status: 400 })
  }

  const report = parseBridgeReport(body)
  if (!report) {
    return Response.json({ error: 'Bad report' }, { status: 400 })
  }

  try {
    const commands = await ingestBridgeReport(report)
    return Response.json({ commands })
  } catch (err: any) {
    console.error('[heating] ingest failed:', err?.message ?? err)
    return Response.json({ error: 'Ingest failed' }, { status: 500 })
  }
}
