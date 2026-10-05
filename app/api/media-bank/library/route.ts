import { createClient } from "@/lib/supabase/server";
import { mediaLibraryResponse } from "@/lib/media-bank-library";

export async function GET(request: Request) {
  return mediaLibraryResponse(request, createClient);
}
