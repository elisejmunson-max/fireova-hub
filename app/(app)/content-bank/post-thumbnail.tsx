export default function PostThumbnail({ thumbnailUrl }: { thumbnailUrl?: string | null }) {
  if (!thumbnailUrl) {
    return <div className="w-20 h-20 rounded-xl bg-stone-100 flex-shrink-0" />
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={thumbnailUrl}
      alt=""
      className="w-20 h-20 rounded-xl object-cover flex-shrink-0 border border-stone-200"
    />
  )
}
