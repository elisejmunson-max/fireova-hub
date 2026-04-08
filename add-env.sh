#!/bin/bash
cd "/Users/elisemunson/Desktop/Claude Code"

printf '%s' 'https://ybmotfemgmmdhcijewxd.supabase.co' | vercel env add NEXT_PUBLIC_SUPABASE_URL production --force
printf '%s' 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlibW90ZmVtZ21tZGhjaWpld3hkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUwNzgxOTIsImV4cCI6MjA5MDY1NDE5Mn0.-A_9XdgAjPhxqB4dneygqQClTN2NN8K8SlvPuMy_7P8' | vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY production --force
printf '%s' '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' | vercel env add ANTHROPIC_API_KEY production --force

echo "Done adding environment variables!"
