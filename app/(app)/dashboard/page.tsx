import { requireUser } from '@/lib/auth'

export default async function DashboardPage() {
  const user = await requireUser()

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-2xl font-semibold tracking-tight">
        Welcome, {user.full_name.split(' ')[0]}
      </h1>
      <p className="mt-1 text-sm text-stone-500">
        You're signed in as <span className="font-medium">{user.role}</span>.
      </p>

      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        {user.role === 'admin' && <AdminCards />}
        {user.role === 'cleaner' && <CleanerCards />}
        {user.role === 'family' && <FamilyCards />}
      </div>

      <div className="mt-10 rounded-2xl border border-dashed border-stone-300 bg-white p-6 text-sm text-stone-500">
        <p className="font-medium text-stone-700">Plumbing complete ✓</p>
        <p className="mt-1">
          Auth, layout, env, and roles are all working. Next pass we'll build the
          family booking form and the house map drag-and-drop view.
        </p>
      </div>
    </div>
  )
}

function Card({
  title,
  body,
}: {
  title: string
  body: string
}) {
  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-5">
      <h3 className="font-medium">{title}</h3>
      <p className="mt-1 text-sm text-stone-500">{body}</p>
    </div>
  )
}

function AdminCards() {
  return (
    <>
      <Card title="House map" body="Drag pending bookings onto beds. Coming next." />
      <Card title="Pending requests" body="Review and approve family booking requests. Coming next." />
      <Card title="Today's cleaning" body="See who's working and what's outstanding. Coming next." />
      <Card title="Linen levels" body="Track sheets, duvets and towels. Coming next." />
    </>
  )
}

function CleanerCards() {
  return (
    <>
      <Card title="Today" body="Your tasks for today, with checklists. Coming next." />
      <Card title="Upcoming shifts" body="Your schedule for the week. Coming next." />
    </>
  )
}

function FamilyCards() {
  return (
    <>
      <Card title="Book a room" body="Request a room and dates. Coming next." />
      <Card title="My stays" body="See your upcoming and past stays. Coming next." />
    </>
  )
}
