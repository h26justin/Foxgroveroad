'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { createContact, updateContact, deleteContact } from './actions'

type Contact = {
  id: string
  name: string
  kind: string
  phone: string | null
  email: string | null
  notes: string | null
  is_pinned: boolean
}

const KIND_OPTIONS = [
  { value: 'plumber', label: 'Plumber' },
  { value: 'electrician', label: 'Electrician' },
  { value: 'locksmith', label: 'Locksmith' },
  { value: 'neighbour', label: 'Neighbour' },
  { value: 'gp', label: 'GP / Doctor' },
  { value: 'cleaner', label: 'Cleaner' },
  { value: 'gardener', label: 'Gardener' },
  { value: 'handyman', label: 'Handyman' },
  { value: 'other', label: 'Other' },
]

const KIND_ICON: Record<string, string> = {
  plumber: '🔧',
  electrician: '⚡',
  locksmith: '🔑',
  neighbour: '🏡',
  gp: '🩺',
  cleaner: '🧹',
  gardener: '🌿',
  handyman: '🛠',
  other: '📒',
}

export default function ContactsClient({
  contacts,
  isAdmin,
  kindLabels,
}: {
  contacts: Contact[]
  isAdmin: boolean
  kindLabels: Record<string, string>
}) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState<Contact | null>(null)
  const [adding, setAdding] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return contacts
    return contacts.filter((c) => {
      return (
        c.name.toLowerCase().includes(q) ||
        c.kind.toLowerCase().includes(q) ||
        (kindLabels[c.kind] ?? '').toLowerCase().includes(q) ||
        c.phone?.toLowerCase().includes(q) ||
        c.email?.toLowerCase().includes(q) ||
        c.notes?.toLowerCase().includes(q)
      )
    })
  }, [contacts, search, kindLabels])

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
            Contacts
          </h1>
          <p
            className="text-sm fg-mono"
            style={{ color: 'var(--color-muted)' }}
          >
            Plumber, electrician, neighbour — the people you'll want at
            9pm when something breaks.
          </p>
        </div>
        {isAdmin && !adding && !editing && (
          <button
            type="button"
            onClick={() => {
              setAdding(true)
              setError(null)
            }}
            className="fg-btn-gold text-xs"
            style={{ width: 'auto', padding: '8px 14px' }}
          >
            + New contact
          </button>
        )}
      </div>

      {error && <div className="fg-msg-error mb-4">{error}</div>}

      {(adding || editing) && isAdmin && (
        <ContactForm
          initial={editing}
          busy={busy}
          onCancel={() => {
            setAdding(false)
            setEditing(null)
            setError(null)
          }}
          onSubmit={(fd, isUpdate) => {
            setBusy(true)
            setError(null)
            startTransition(async () => {
              const r = isUpdate
                ? await updateContact(fd)
                : await createContact(fd)
              setBusy(false)
              if (r.error) {
                setError(r.error)
                return
              }
              setAdding(false)
              setEditing(null)
              router.refresh()
            })
          }}
        />
      )}

      <div className="mb-4">
        <input
          type="search"
          placeholder="Search contacts…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="fg-input"
          style={{ maxWidth: 360 }}
        />
      </div>

      {filtered.length === 0 ? (
        <div
          className="fg-card p-8 text-center"
          style={{ color: 'var(--color-muted)' }}
        >
          {contacts.length === 0
            ? isAdmin
              ? 'No contacts yet. Click "+ New contact" to add the first one.'
              : 'No contacts saved yet. Ask the admin to add some.'
            : 'No contacts match that search.'}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((c) => (
            <ContactCard
              key={c.id}
              contact={c}
              kindLabel={kindLabels[c.kind] ?? c.kind}
              isAdmin={isAdmin}
              onEdit={() => {
                setEditing(c)
                setAdding(false)
                setError(null)
              }}
              onDelete={() => {
                setBusy(true)
                startTransition(async () => {
                  const r = await deleteContact(c.id)
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
      )}
    </div>
  )
}

function ContactCard({
  contact,
  kindLabel,
  isAdmin,
  onEdit,
  onDelete,
}: {
  contact: Contact
  kindLabel: string
  isAdmin: boolean
  onEdit: () => void
  onDelete: () => void
}) {
  return (
    <div
      className="fg-card p-4"
      style={
        contact.is_pinned
          ? {
              borderLeftWidth: 4,
              borderLeftStyle: 'solid',
              borderLeftColor: 'var(--color-gold)',
            }
          : undefined
      }
    >
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-start gap-3 min-w-0">
          <span
            aria-hidden
            style={{ fontSize: 20, lineHeight: 1, marginTop: 2 }}
          >
            {KIND_ICON[contact.kind] ?? '📒'}
          </span>
          <div className="min-w-0">
            <div
              className="text-base"
              style={{
                fontFamily: 'var(--font-serif)',
                color: 'var(--color-ink)',
              }}
            >
              {contact.name}
              {contact.is_pinned && (
                <span
                  style={{
                    fontSize: 11,
                    color: 'var(--color-gold)',
                    marginLeft: 6,
                  }}
                  title="Pinned"
                >
                  ★
                </span>
              )}
            </div>
            <div
              className="text-xs fg-mono"
              style={{ color: 'var(--color-muted)' }}
            >
              {kindLabel}
            </div>
            <div
              className="mt-2 flex flex-col gap-1 text-sm"
              style={{ color: 'var(--color-ink)' }}
            >
              {contact.phone && (
                <a
                  href={`tel:${contact.phone}`}
                  className="underline"
                  style={{ color: 'var(--color-blue, #1e40af)' }}
                >
                  📞 {contact.phone}
                </a>
              )}
              {contact.email && (
                <a
                  href={`mailto:${contact.email}`}
                  className="underline"
                  style={{ color: 'var(--color-blue, #1e40af)' }}
                >
                  ✉️ {contact.email}
                </a>
              )}
              {contact.notes && (
                <div
                  className="text-sm mt-1 italic"
                  style={{ color: 'var(--color-muted)' }}
                >
                  {contact.notes}
                </div>
              )}
            </div>
          </div>
        </div>

        {isAdmin && (
          <div className="flex gap-2 shrink-0">
            <button
              type="button"
              onClick={onEdit}
              className="fg-btn-ghost text-xs"
              style={{ width: 'auto', padding: '6px 12px' }}
            >
              Edit
            </button>
            <button
              type="button"
              onClick={onDelete}
              className="fg-btn-ghost text-xs"
              style={{
                width: 'auto',
                padding: '6px 12px',
                color: 'var(--color-red)',
              }}
            >
              Delete
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function ContactForm({
  initial,
  busy,
  onSubmit,
  onCancel,
}: {
  initial: Contact | null
  busy: boolean
  onSubmit: (fd: FormData, isUpdate: boolean) => void
  onCancel: () => void
}) {
  const isUpdate = !!initial

  return (
    <form
      className="fg-card p-5 mb-6 space-y-3"
      onSubmit={(e) => {
        e.preventDefault()
        const fd = new FormData(e.currentTarget)
        if (initial) fd.set('id', initial.id)
        onSubmit(fd, isUpdate)
      }}
    >
      <h2 className="fg-section-label" style={{ marginBottom: 0 }}>
        {isUpdate ? 'Edit contact' : 'New contact'}
      </h2>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="fg-label">Name</label>
          <input
            name="name"
            type="text"
            required
            maxLength={200}
            defaultValue={initial?.name ?? ''}
            className="fg-input"
            autoFocus
          />
        </div>
        <div>
          <label className="fg-label">Type</label>
          <select
            name="kind"
            defaultValue={initial?.kind ?? 'plumber'}
            className="fg-input"
          >
            {KIND_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="fg-label">Phone</label>
          <input
            name="phone"
            type="tel"
            defaultValue={initial?.phone ?? ''}
            className="fg-input"
            placeholder="+44 ..."
          />
        </div>
        <div>
          <label className="fg-label">Email</label>
          <input
            name="email"
            type="email"
            defaultValue={initial?.email ?? ''}
            className="fg-input"
          />
        </div>
      </div>

      <div>
        <label className="fg-label">Notes (optional)</label>
        <textarea
          name="notes"
          rows={2}
          defaultValue={initial?.notes ?? ''}
          className="fg-input"
          placeholder="When to call, what they're good at, etc."
          maxLength={1000}
        />
      </div>

      <label
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '6px 0',
        }}
      >
        <input
          type="checkbox"
          name="is_pinned"
          value="1"
          defaultChecked={initial?.is_pinned ?? false}
        />
        <span className="text-sm">Pin to top (frequently used)</span>
      </label>

      <div className="flex gap-2 pt-2">
        <button
          type="submit"
          disabled={busy}
          className="fg-btn-primary"
          style={{ width: 'auto', padding: '8px 18px' }}
        >
          {busy ? 'Saving…' : isUpdate ? 'Save changes' : 'Add contact'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          className="fg-btn-ghost"
        >
          Cancel
        </button>
      </div>
    </form>
  )
}
