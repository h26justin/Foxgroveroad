'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { requireProfile } from '@/lib/auth'

const CATEGORIES = [
  'utilities',
  'repairs',
  'supplies',
  'council_tax',
  'insurance',
  'cleaning_supply',
  'other',
] as const

function isWriter(role: string) {
  return role === 'admin' || role === 'family'
}

export async function createExpense(
  formData: FormData,
): Promise<{ ok?: true; error?: string }> {
  const profile = await requireProfile()
  if (!isWriter(profile.role)) {
    return { error: 'Only admin/family can log expenses.' }
  }

  const dateStr = String(formData.get('date') ?? '').trim()
  const amountStr = String(formData.get('amount') ?? '').trim()
  const category = String(formData.get('category') ?? '').trim()
  const description = String(formData.get('description') ?? '').trim()
  const paidById = String(formData.get('paid_by') ?? '').trim() || profile.id
  const bookingRequestId = String(formData.get('booking_request_id') ?? '').trim() || null

  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return { error: 'Invalid date' }
  if (!(CATEGORIES as readonly string[]).includes(category)) {
    return { error: 'Pick a category' }
  }
  if (!description) return { error: 'Description is required' }
  if (description.length > 500) return { error: 'Description is too long' }

  const amount = Number(amountStr)
  if (!Number.isFinite(amount) || amount < 0) {
    return { error: 'Amount must be a non-negative number' }
  }
  // Store as integer pence to avoid float math drift later.
  const amount_pence = Math.round(amount * 100)

  const supabase = await createClient()
  const { error } = await supabase.from('expenses').insert({
    date: dateStr,
    amount_pence,
    currency: 'GBP',
    category,
    description,
    paid_by: paidById,
    booking_request_id: bookingRequestId,
    created_by: profile.id,
  } as any)
  if (error) return { error: error.message }

  revalidatePath('/expenses')
  return { ok: true }
}

export async function deleteExpense(
  id: string,
): Promise<{ ok?: true; error?: string }> {
  const profile = await requireProfile()
  if (!id) return { error: 'Missing id' }
  const supabase = await createClient()
  // RLS will gate to admin OR own row
  const { error } = await supabase.from('expenses').delete().eq('id', id)
  if (error) return { error: error.message }
  void profile // for lint; profile is used implicitly by RLS via auth.uid()
  revalidatePath('/expenses')
  return { ok: true }
}
