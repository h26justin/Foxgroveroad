'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createExpense, deleteExpense } from './actions'

type Expense = {
  id: string
  date: string
  amount_pence: number
  currency: string
  category: string
  description: string
  paid_by: string | null
  payer_name: string
  creator_id: string | null
}

type Payer = { id: string; full_name: string }

const CATEGORY_OPTIONS = [
  { value: 'utilities', label: 'Utilities' },
  { value: 'repairs', label: 'Repairs' },
  { value: 'supplies', label: 'Supplies' },
  { value: 'council_tax', label: 'Council tax' },
  { value: 'insurance', label: 'Insurance' },
  { value: 'cleaning_supply', label: 'Cleaning supplies' },
  { value: 'other', label: 'Other' },
]

const CATEGORY_ICON: Record<string, string> = {
  utilities: '⚡',
  repairs: '🛠',
  supplies: '🛒',
  council_tax: '🏛',
  insurance: '🛡',
  cleaning_supply: '🧴',
  other: '📌',
}

function formatGBP(pence: number): string {
  return `£${(pence / 100).toFixed(2)}`
}

function formatDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00Z')
  return d.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

function monthKey(iso: string): string {
  return iso.slice(0, 7) // YYYY-MM
}

function monthLabel(key: string): string {
  const [y, m] = key.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-GB', {
    month: 'long',
    year: 'numeric',
  })
}

export default function ExpensesClient({
  expenses,
  payers,
  currentUserId,
  currentUserName,
  isAdmin,
  todayISO,
  categoryLabels,
}: {
  expenses: Expense[]
  payers: Payer[]
  currentUserId: string
  currentUserName: string
  isAdmin: boolean
  todayISO: string
  categoryLabels: Record<string, string>
}) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [adding, setAdding] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [categoryFilter, setCategoryFilter] = useState<string>('all')

  const now = new Date()
  const thisMonth = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`
  const lastMonthDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1))
  const lastMonth = `${lastMonthDate.getUTCFullYear()}-${String(lastMonthDate.getUTCMonth() + 1).padStart(2, '0')}`

  const filtered = useMemo(() => {
    if (categoryFilter === 'all') return expenses
    return expenses.filter((e) => e.category === categoryFilter)
  }, [expenses, categoryFilter])

  const summary = useMemo(() => {
    let thisMonthSum = 0
    let lastMonthSum = 0
    let ytd = 0
    const yearNow = new Date().getUTCFullYear()
    for (const e of expenses) {
      if (monthKey(e.date) === thisMonth) thisMonthSum += e.amount_pence
      if (monthKey(e.date) === lastMonth) lastMonthSum += e.amount_pence
      if (new Date(e.date + 'T00:00:00Z').getUTCFullYear() === yearNow) {
        ytd += e.amount_pence
      }
    }
    return { thisMonth: thisMonthSum, lastMonth: lastMonthSum, ytd }
  }, [expenses, thisMonth, lastMonth])

  // Group filtered list by month for the display
  const grouped = useMemo(() => {
    const map = new Map<string, Expense[]>()
    for (const e of filtered) {
      const k = monthKey(e.date)
      if (!map.has(k)) map.set(k, [])
      map.get(k)!.push(e)
    }
    return Array.from(map.entries()).sort((a, b) => b[0].localeCompare(a[0]))
  }, [filtered])

  return (
    <div>
      <div className="flex items-baseline justify-between mb-6 gap-4 flex-wrap">
        <div>
          <h1
            className="text-3xl mb-1"
            style={{
              fontFamily: 'var(--font-serif)',
              color: 'var(--color-ink)',
            }}
          >
            Expenses
          </h1>
          <p
            className="text-sm fg-mono"
            style={{ color: 'var(--color-muted)' }}
          >
            House costs ledger — utilities, repairs, supplies.
          </p>
        </div>
        {!adding && (
          <button
            type="button"
            onClick={() => {
              setAdding(true)
              setError(null)
            }}
            className="fg-btn-gold text-xs"
            style={{ width: 'auto', padding: '8px 14px' }}
          >
            + Log expense
          </button>
        )}
      </div>

      {/* Summary chips */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
        <SummaryChip label="This month" amount={summary.thisMonth} />
        <SummaryChip label="Last month" amount={summary.lastMonth} />
        <SummaryChip label="Year to date" amount={summary.ytd} />
      </div>

      {error && <div className="fg-msg-error mb-4">{error}</div>}

      {adding && (
        <form
          className="fg-card p-5 mb-6 space-y-3"
          onSubmit={(e) => {
            e.preventDefault()
            const fd = new FormData(e.currentTarget)
            setBusy(true)
            setError(null)
            startTransition(async () => {
              const r = await createExpense(fd)
              setBusy(false)
              if (r.error) {
                setError(r.error)
                return
              }
              setAdding(false)
              router.refresh()
            })
          }}
        >
          <h2 className="fg-section-label" style={{ marginBottom: 0 }}>
            New expense
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="fg-label">Date</label>
              <input
                name="date"
                type="date"
                required
                defaultValue={todayISO}
                className="fg-input"
                autoFocus
              />
            </div>
            <div>
              <label className="fg-label">Amount (£)</label>
              <input
                name="amount"
                type="number"
                step="0.01"
                min="0"
                required
                placeholder="42.50"
                className="fg-input"
              />
            </div>
            <div>
              <label className="fg-label">Category</label>
              <select
                name="category"
                defaultValue="utilities"
                className="fg-input"
              >
                {CATEGORY_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="fg-label">Paid by</label>
              <select
                name="paid_by"
                defaultValue={currentUserId}
                className="fg-input"
              >
                {payers.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.full_name}
                    {p.id === currentUserId ? ' (you)' : ''}
                  </option>
                ))}
                {!payers.some((p) => p.id === currentUserId) && (
                  <option value={currentUserId}>
                    {currentUserName} (you)
                  </option>
                )}
              </select>
            </div>
          </div>
          <div>
            <label className="fg-label">Description</label>
            <input
              name="description"
              type="text"
              required
              maxLength={500}
              placeholder="British Gas — May bill"
              className="fg-input"
            />
          </div>
          <div className="flex gap-2 pt-2">
            <button
              type="submit"
              disabled={busy}
              className="fg-btn-primary"
              style={{ width: 'auto', padding: '8px 18px' }}
            >
              {busy ? 'Saving…' : 'Log expense'}
            </button>
            <button
              type="button"
              onClick={() => {
                setAdding(false)
                setError(null)
              }}
              disabled={busy}
              className="fg-btn-ghost"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      <div className="mb-4 flex items-center gap-2 flex-wrap">
        <label className="text-xs fg-mono" style={{ color: 'var(--color-muted)' }}>
          Filter:
        </label>
        <select
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
          className="fg-input"
          style={{ width: 'auto', minWidth: 160 }}
        >
          <option value="all">All categories</option>
          {CATEGORY_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      {filtered.length === 0 ? (
        <div
          className="fg-card p-8 text-center"
          style={{ color: 'var(--color-muted)' }}
        >
          {expenses.length === 0
            ? 'No expenses logged yet.'
            : 'No expenses match that filter.'}
        </div>
      ) : (
        <div className="space-y-6">
          {grouped.map(([k, list]) => {
            const monthTotal = list.reduce((a, e) => a + e.amount_pence, 0)
            return (
              <div key={k}>
                <div
                  className="flex items-baseline justify-between mb-2 px-1"
                >
                  <h3
                    className="fg-section-label"
                    style={{ marginBottom: 0 }}
                  >
                    {monthLabel(k)}
                  </h3>
                  <span
                    className="text-xs fg-mono"
                    style={{ color: 'var(--color-muted)' }}
                  >
                    {formatGBP(monthTotal)}
                  </span>
                </div>
                <div className="space-y-2">
                  {list.map((e) => (
                    <ExpenseRow
                      key={e.id}
                      expense={e}
                      label={categoryLabels[e.category] ?? e.category}
                      canDelete={isAdmin || e.creator_id === currentUserId}
                      onDelete={() => {
                        setBusy(true)
                        startTransition(async () => {
                          const r = await deleteExpense(e.id)
                          setBusy(false)
                          if (r.error) {
                            setError(r.error)
                            return
                          }
                          router.refresh()
                        })
                      }}
                    />
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function SummaryChip({ label, amount }: { label: string; amount: number }) {
  return (
    <div
      className="fg-card p-3"
      style={{
        borderLeft: '4px solid var(--color-gold)',
      }}
    >
      <div
        className="text-xs fg-mono"
        style={{ color: 'var(--color-muted)' }}
      >
        {label}
      </div>
      <div
        className="text-2xl"
        style={{
          fontFamily: 'var(--font-serif)',
          color: 'var(--color-ink)',
        }}
      >
        {formatGBP(amount)}
      </div>
    </div>
  )
}

function ExpenseRow({
  expense,
  label,
  canDelete,
  onDelete,
}: {
  expense: Expense
  label: string
  canDelete: boolean
  onDelete: () => void
}) {
  return (
    <div className="fg-card p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0 flex-1">
          <span aria-hidden style={{ fontSize: 18, marginTop: 2 }}>
            {CATEGORY_ICON[expense.category] ?? '📌'}
          </span>
          <div className="min-w-0 flex-1">
            <div
              className="text-sm"
              style={{ color: 'var(--color-ink)' }}
            >
              {expense.description}
            </div>
            <div
              className="text-xs fg-mono mt-1"
              style={{ color: 'var(--color-muted)' }}
            >
              {formatDate(expense.date)} · {label} · paid by{' '}
              {expense.payer_name}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span
            className="text-base"
            style={{
              fontFamily: 'var(--font-serif)',
              color: 'var(--color-ink)',
            }}
          >
            {formatGBP(expense.amount_pence)}
          </span>
          {canDelete && (
            <button
              type="button"
              onClick={onDelete}
              className="text-xs fg-mono"
              style={{
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--color-red)',
                padding: '4px 8px',
              }}
              aria-label="Delete expense"
            >
              ✕
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
