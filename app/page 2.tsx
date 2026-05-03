import { redirect } from 'next/navigation'
import { getCurrentProfile } from '@/lib/auth'
import { landingPathFor } from '@/lib/landing'

export default async function HomePage() {
  const profile = await getCurrentProfile()
  if (!profile) redirect('/login')
  redirect(landingPathFor(profile.role))
}
