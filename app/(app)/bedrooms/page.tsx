import { redirect } from 'next/navigation'

/**
 * Old /bedrooms page is now folded into the unified /house page.
 * Redirect with the request param so the panel auto-opens for the
 * caller's selected request.
 */
export default async function BedroomsRedirect({
  searchParams,
}: {
  searchParams: Promise<{ request?: string }>
}) {
  const sp = await searchParams
  if (sp.request) {
    redirect(`/house?request=${sp.request}`)
  }
  redirect('/house')
}
