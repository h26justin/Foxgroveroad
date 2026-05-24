import { requireProfile } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { getUserPrefs } from '@/lib/user-prefs'
import { redirect } from 'next/navigation'
import ExpensesClient from './ExpensesClient'

export const revalidate = 30

const CATEGORY_LABEL: Record<string, string> = {
  utilities: 'Utilities',
  repairs: 'Repairs',
  supplies: 'Supplies',
  council_tax: 'Council tax',
  insurance: 'Insurance',
  cleaning_supply: 'Cleaning supplies',
  other: 'Other',
}

export default async function ExpensesPage() {
  const [profile, supabase] = await Promise.all([
    requireProfile(),
    createClient(),
  ])

  const prefs = await getUserPrefs(profile.id)
  if (!prefs.show_expenses) redirect('/dashboard')

  const today = new Date()
  const yearAgoISO = (() => {
    const d = new Date()
    d.setUTCFullYear(d.getUTCFullYear() - 1)
    return d.toISOString().slice(0, 10)
  })()

  const [expensesRes, payersRes] = await Promise.all([
    supabase
      .from('expenses')
      .select(
        'id, date, amount_pence, currency, category, description, paid_by, booking_request_id, created_by, created_at, payer:profiles!expenses_paid_by_fkey(full_name), creator:profiles!expenses_created_by_fkey(full_name)',
      )
      .gte('date', yearAgoISO)
      .order('date', { ascending: false })
      .limit(500),
    supabase
      .from('profiles')
      .select('id, full_name')
      .in('role', ['admin', 'family'])
      .eq('is_deleted', false)
      .order('full_name'),
  ])

  const rows = ((expensesRes.data as any[]) ?? []).map((r) => ({
    id: r.id as string,
    date: r.date as string,
    amount_pence: Number(r.amount_pence),
    currency: r.currency as string,
    category: r.category as string,
    description: r.description as string,
    paid_by: (r.paid_by as string | null) ?? null,
    payer_name: (r.payer as any)?.full_name ?? 'Someone',
    creator_id: (r.created_by as string | null) ?? null,
    created_at: r.created_at as string,
  }))

  const payers = ((payersRes.data as any[]) ?? []).map((p) => ({
    id: p.id as string,
    full_name: p.full_name as string,
  }))

  return (
    <ExpensesClient
      expenses={rows}
      payers={payers}
      currentUserId={profile.id}
      currentUserName={profile.full_name}
      isAdmin={profile.role === 'admin'}
      todayISO={today.toISOString().slice(0, 10)}
      categoryLabels={CATEGORY_LABEL}
    />
  )
}
