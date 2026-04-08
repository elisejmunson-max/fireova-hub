export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          email: string
          full_name: string | null
          business_name: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          email: string
          full_name?: string | null
          business_name?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          full_name?: string | null
          business_name?: string | null
          updated_at?: string
        }
      }
      posts: {
        Row: {
          id: string
          user_id: string
          title: string
          pillar: string
          topic: string | null
          format: 'Reel' | 'Carousel' | 'Photo'
          caption_option1: string | null
          caption_option2: string | null
          hashtags: string[]
          shot_ideas: string[]
          status: 'draft' | 'scheduled' | 'published'
          scheduled_date: string | null
          notes: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          title: string
          pillar: string
          topic?: string | null
          format: 'Reel' | 'Carousel' | 'Photo'
          caption_option1?: string | null
          caption_option2?: string | null
          hashtags?: string[]
          shot_ideas?: string[]
          status?: 'draft' | 'scheduled' | 'published'
          scheduled_date?: string | null
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          title?: string
          pillar?: string
          topic?: string | null
          format?: 'Reel' | 'Carousel' | 'Photo'
          caption_option1?: string | null
          caption_option2?: string | null
          hashtags?: string[]
          shot_ideas?: string[]
          status?: 'draft' | 'scheduled' | 'published'
          scheduled_date?: string | null
          notes?: string | null
          updated_at?: string
        }
      }
      media_assets: {
        Row: {
          id: string
          user_id: string
          filename: string
          storage_path: string
          file_type: string
          size_bytes: number
          tags: string[]
          notes: string | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          filename: string
          storage_path: string
          file_type: string
          size_bytes: number
          tags?: string[]
          notes?: string | null
          created_at?: string
        }
        Update: {
          filename?: string
          tags?: string[]
          notes?: string | null
        }
      }
      caption_templates: {
        Row: {
          id: string
          user_id: string
          name: string
          pillar: string
          option1: string | null
          option2: string | null
          hashtags: string[]
          notes: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          name: string
          pillar: string
          option1?: string | null
          option2?: string | null
          hashtags?: string[]
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          name?: string
          pillar?: string
          option1?: string | null
          option2?: string | null
          hashtags?: string[]
          notes?: string | null
          updated_at?: string
        }
      }
    }
  }
}

// Convenience row types
export type Profile = Database['public']['Tables']['profiles']['Row']
export type Post = Database['public']['Tables']['posts']['Row']
export type MediaAsset = Database['public']['Tables']['media_assets']['Row']
export type CaptionTemplate = Database['public']['Tables']['caption_templates']['Row']

export type PostInsert = Database['public']['Tables']['posts']['Insert']
export type PostUpdate = Database['public']['Tables']['posts']['Update']
export type CaptionTemplateInsert = Database['public']['Tables']['caption_templates']['Insert']
