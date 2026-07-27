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
        Relationships: []
      }
      event_projects: {
        Row: {
          id: string
          user_id: string
          data: Json
          created_at: string
          updated_at: string
          deleted_at: string | null
        }
        Insert: {
          id: string
          user_id: string
          data: Json
          created_at?: string
          updated_at?: string
          deleted_at?: string | null
        }
        Update: {
          data?: Json
          updated_at?: string
          deleted_at?: string | null
        }
        Relationships: []
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
          caption_option3: string | null
          hashtags: string[]
          shot_ideas: string[]
          status: 'draft' | 'scheduled' | 'published'
          scheduled_date: string | null
          notes: string | null
          thumbnail_url: string | null
          approved: boolean
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
          caption_option3?: string | null
          hashtags?: string[]
          shot_ideas?: string[]
          status?: 'draft' | 'scheduled' | 'published'
          scheduled_date?: string | null
          notes?: string | null
          thumbnail_url?: string | null
          approved?: boolean
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
          caption_option3?: string | null
          hashtags?: string[]
          shot_ideas?: string[]
          status?: 'draft' | 'scheduled' | 'published'
          scheduled_date?: string | null
          notes?: string | null
          thumbnail_url?: string | null
          approved?: boolean
          updated_at?: string
        }
        Relationships: []
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
          folder_id: string | null
          photographer: string | null
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
          folder_id?: string | null
          photographer?: string | null
        }
        Update: {
          filename?: string
          tags?: string[]
          notes?: string | null
          folder_id?: string | null
          photographer?: string | null
        }
        Relationships: []
      }
      content_bank_items: {
        Row: {
          id: string
          user_id: string
          storage_path: string
          data: Json
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          user_id: string
          storage_path: string
          data: Json
          created_at?: string
          updated_at?: string
        }
        Update: {
          storage_path?: string
          data?: Json
          updated_at?: string
        }
        Relationships: []
      }
      post_media: {
        Row: {
          id: string
          post_id: string
          asset_id: string
          display_order: number
          created_at: string
        }
        Insert: {
          id?: string
          post_id: string
          asset_id: string
          display_order?: number
          created_at?: string
        }
        Update: {
          display_order?: number
        }
        Relationships: []
      }
      user_settings: {
        Row: {
          id: string
          user_id: string
          key: string
          value: Json
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          key: string
          value: Json
          updated_at?: string
        }
        Update: {
          value?: Json
          updated_at?: string
        }
        Relationships: []
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
        Relationships: []
      }
      folders: {
        Row: {
          id: string
          name: string
          parent_id: string | null
          user_id: string
          created_at: string
        }
        Insert: {
          id: string
          name: string
          parent_id?: string | null
          user_id: string
          created_at?: string
        }
        Update: {
          name?: string
          parent_id?: string | null
        }
        Relationships: []
      }
      approved_captions: {
        Row: {
          id: string
          user_id: string
          caption: string
          pillar: string | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          caption: string
          pillar?: string | null
          created_at?: string
        }
        Update: {
          caption?: string
          pillar?: string | null
        }
        Relationships: []
      }
      recipes: {
        Row: {
          id: string
          user_id: string
          name: string
          category: 'Pizza' | 'Salads' | 'Small Bites' | 'Sides' | 'Other' | 'Sweets' | 'Sauces' | 'Dough'
          description: string
          yield_amount: string
          oven_temp: string
          cook_time: string
          ingredients: Array<{ amount: string; item: string }>
          steps: string[]
          notes: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          name: string
          category?: 'Pizza' | 'Salads' | 'Small Bites' | 'Sides' | 'Other' | 'Sweets' | 'Sauces' | 'Dough'
          description?: string
          yield_amount?: string
          oven_temp?: string
          cook_time?: string
          ingredients?: Array<{ amount: string; item: string }>
          steps?: string[]
          notes?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          name?: string
          category?: 'Pizza' | 'Salads' | 'Small Bites' | 'Sides' | 'Other' | 'Sweets' | 'Sauces' | 'Dough'
          description?: string
          yield_amount?: string
          oven_temp?: string
          cook_time?: string
          ingredients?: Array<{ amount: string; item: string }>
          steps?: string[]
          notes?: string
          updated_at?: string
        }
        Relationships: []
      }
      training_manuals: {
        Row: {
          id: string
          user_id: string
          title: string
          category: 'Catering Coordinator' | 'Oven/Driver' | 'Pizza Cook' | 'Prep'
          sections: Array<{ heading: string; body: string }>
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          title: string
          category?: 'Catering Coordinator' | 'Oven/Driver' | 'Pizza Cook' | 'Prep'
          sections?: Array<{ heading: string; body: string }>
          created_at?: string
          updated_at?: string
        }
        Update: {
          title?: string
          category?: 'Catering Coordinator' | 'Oven/Driver' | 'Pizza Cook' | 'Prep'
          sections?: Array<{ heading: string; body: string }>
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
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
