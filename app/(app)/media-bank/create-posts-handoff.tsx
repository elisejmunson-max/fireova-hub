'use client'

import { useRouter } from 'next/navigation'

export default function CreatePostsHandoff({eventId,readyCount}:{eventId:string;readyCount:number}){
 const router=useRouter()
 if(readyCount<1)return null
 return <div className="mt-6 flex items-center justify-between gap-4 rounded-2xl border border-orange-200 bg-orange-50 p-5">
  <div><p className="text-sm font-semibold text-stone-900">Media review is ready to move forward</p><p className="mt-1 text-sm text-stone-600">{readyCount} usable {readyCount===1?'item':'items'} can move into post creation.</p></div>
  <button className="btn-primary shrink-0" onClick={()=>router.push(`/quick-post?eventId=${encodeURIComponent(eventId)}`)}>Continue to Create Posts →</button>
 </div>
}
