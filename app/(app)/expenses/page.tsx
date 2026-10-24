import { requireProfile } from '@/lib/auth'
import { todayISO, addDaysISO } from '@/lib/dates'
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

  const today = todayISO()
  const yearAgoISO = addDaysISO(today, -365)

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

  const rows = (expensesRes.data ?? []).map((r) => ({
    id: r.id,
    date: r.date,
    amount_pence: Number(r.amount_pence),
    currency: r.currency,
    category: r.category,
    description: r.description,
    paid_by: r.paid_by ?? null,
    payer_name: r.payer?.full_name ?? 'Someone',
    creator_id: r.created_by ?? null,
    created_at: r.created_at,
  }))

  const payers = (payersRes.data ?? []).map((p) => ({
    id: p.id,
    full_name: p.full_name,
  }))

  return (
    <ExpensesClient
      expenses={rows}
      payers={payers}
      currentUserId={profile.id}
      currentUserName={profile.full_name}
      isAdmin={profile.role === 'admin'}
      todayISO={today}
      categoryLabels={CATEGORY_LABEL}
    />
  )
}
