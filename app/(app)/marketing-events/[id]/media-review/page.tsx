import { redirect } from 'next/navigation'

export default function EventMediaReviewPage({ params }: { params: { id: string } }) {
  redirect(`/media-bank?eventId=${encodeURIComponent(params.id)}`)
}
