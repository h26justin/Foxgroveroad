'use client'

/**
 * The /logout route is a POST endpoint, so we render a real form here
 * (not a Link). Wrapped in its own client component so the parent page
 * can stay as a server component.
 */
export default function LogoutButton() {
  return (
    <form action="/logout" method="POST">
      <button type="submit" className="fg-btn-ghost text-xs">
        Sign out
      </button>
    </form>
  )
}
