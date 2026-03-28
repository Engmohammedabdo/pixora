export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          name: string;
          email: string;
          avatar_url: string | null;
          locale: string;
          plan_id: string;
          credits_balance: number;
          credits_reset_date: string | null;
          stripe_customer_id: string | null;
          stripe_subscription_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          name?: string;
          email?: string;
          avatar_url?: string | null;
          locale?: string;
          plan_id?: string;
          credits_balance?: number;
          credits_reset_date?: string | null;
          stripe_customer_id?: string | null;
          stripe_subscription_id?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          email?: string;
          avatar_url?: string | null;
          locale?: string;
          plan_id?: string;
          credits_balance?: number;
          credits_reset_date?: string | null;
          stripe_customer_id?: string | null;
          stripe_subscription_id?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      brand_kits: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          logo_url: string | null;
          primary_color: string;
          secondary_color: string;
          accent_color: string;
          font_primary: string;
          font_secondary: string;
          brand_voice: string | null;
          is_default: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          name: string;
          logo_url?: string | null;
          primary_color?: string;
          secondary_color?: string;
          accent_color?: string;
          font_primary?: string;
          font_secondary?: string;
          brand_voice?: string | null;
          is_default?: boolean;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          name?: string;
          logo_url?: string | null;
          primary_color?: string;
          secondary_color?: string;
          accent_color?: string;
          font_primary?: string;
          font_secondary?: string;
          brand_voice?: string | null;
          is_default?: boolean;
        };
        Relationships: [];
      };
      generations: {
        Row: {
          id: string;
          user_id: string;
          studio: string;
          model: string;
          input: Record<string, unknown>;
          output: Record<string, unknown> | null;
          credits_used: number;
          status: string;
          error: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          studio: string;
          model: string;
          input: Record<string, unknown>;
          output?: Record<string, unknown> | null;
          credits_used?: number;
          status?: string;
          error?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          studio?: string;
          model?: string;
          input?: Record<string, unknown>;
          output?: Record<string, unknown> | null;
          credits_used?: number;
          status?: string;
          error?: string | null;
        };
        Relationships: [];
      };
      credit_transactions: {
        Row: {
          id: string;
          user_id: string;
          amount: number;
          type: string;
          description: string | null;
          generation_id: string | null;
          stripe_payment_intent_id: string | null;
          balance_after: number | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          amount: number;
          type: string;
          description?: string | null;
          generation_id?: string | null;
          stripe_payment_intent_id?: string | null;
          balance_after?: number | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          amount?: number;
          type?: string;
          description?: string | null;
          balance_after?: number | null;
        };
        Relationships: [];
      };
      assets: {
        Row: {
          id: string;
          user_id: string;
          generation_id: string | null;
          type: string;
          url: string;
          thumbnail_url: string | null;
          format: string | null;
          width: number | null;
          height: number | null;
          size_bytes: number | null;
          metadata: Record<string, unknown>;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          generation_id?: string | null;
          type: string;
          url: string;
          thumbnail_url?: string | null;
          format?: string | null;
          width?: number | null;
          height?: number | null;
          size_bytes?: number | null;
          metadata?: Record<string, unknown>;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          generation_id?: string | null;
          type?: string;
          url?: string;
          thumbnail_url?: string | null;
          metadata?: Record<string, unknown>;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      deduct_credits: {
        Args: {
          p_user_id: string;
          p_amount: number;
          p_studio: string;
          p_description: string;
          p_generation_id?: string;
        };
        Returns: Record<string, unknown>;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}

export type Profile = Database['public']['Tables']['profiles']['Row'];
export type BrandKit = Database['public']['Tables']['brand_kits']['Row'];
export type Generation = Database['public']['Tables']['generations']['Row'];
export type CreditTransaction = Database['public']['Tables']['credit_transactions']['Row'];
export type Asset = Database['public']['Tables']['assets']['Row'];
