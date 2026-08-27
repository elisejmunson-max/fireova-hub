import { redirect } from 'next/navigation'

export default function LegacyEventDetailRedirect({ params }: { params: { id: string } }) {
  redirect(`/marketing-events/${params.id}`)
}
