import { redirect } from 'next/navigation'

export default async function AdminBookingsRedirect({
  searchParams,
}: {
  searchParams: Promise<{ start?: string }>
}) {
  const sp = await searchParams
  if (sp.start) {
    redirect(`/house?start=${sp.start}`)
  }
  redirect('/house')
}
