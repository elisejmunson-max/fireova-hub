import { NextRequest } from 'next/server';
import { createClient } from '@/lib/supabase/server';

const ACTIONS=new Set(['approve','approve_edited','decline_caption','decline_post']);

export async function POST(req:NextRequest){
  try{
    const body=await req.json();
    const action=String(body.action||'');
    if(!ACTIONS.has(action))return Response.json({error:'Invalid feedback action'},{status:400});
    const assetIds=Array.isArray(body.assetIds)?body.assetIds.map(String):[];
    const sb=createClient()as any;
    const {data:{user}}=await sb.auth.getUser();
    if(!user)return Response.json({error:'Unauthorized'},{status:401});
    const {error}=await sb.from('review_feedback').insert({
      user_id:user.id,
      action,
      asset_ids:assetIds,
      format:body.format?String(body.format):null,
      ai_caption:body.aiCaption?String(body.aiCaption):null,
      final_caption:body.finalCaption?String(body.finalCaption):null,
    });
    if(error)throw error;
    return Response.json({ok:true});
  }catch(error){
    return Response.json({error:error instanceof Error?error.message:'Could not save feedback'},{status:500});
  }
}
