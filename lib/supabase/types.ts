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
          purchased_credits: number;
          purchased_credits_expires_at: string | null;
          credits_reset_date: string | null;
          stripe_customer_id: string | null;
          stripe_subscription_id: string | null;
          onboarding_completed: boolean;
          onboarding_step: number;
          team_id: string | null;
          payment_failed: boolean;
          // Added in 014 (code) and 023 (referred_by + auto-generation).
          referral_code: string | null;
          referred_by: string | null;
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
          purchased_credits?: number;
          purchased_credits_expires_at?: string | null;
          credits_reset_date?: string | null;
          stripe_customer_id?: string | null;
          stripe_subscription_id?: string | null;
          onboarding_completed?: boolean;
          onboarding_step?: number;
          payment_failed?: boolean;
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
          purchased_credits?: number;
          purchased_credits_expires_at?: string | null;
          credits_reset_date?: string | null;
          stripe_customer_id?: string | null;
          stripe_subscription_id?: string | null;
          onboarding_completed?: boolean;
          onboarding_step?: number;
          payment_failed?: boolean;
          updated_at?: string;
        };
        Relationships: [];
      };
      webhook_events: {
        Row: {
          event_id: string;
          event_type: string;
          processed: boolean;
          processed_at: string;
        };
        Insert: {
          event_id: string;
          event_type: string;
          processed?: boolean;
          processed_at?: string;
        };
        Update: {
          event_id?: string;
          event_type?: string;
          processed?: boolean;
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
          status: 'pending' | 'processing' | 'completed' | 'failed';
          error: string | null;
          // Added by migration 011 — links a generation to its client workspace.
          project_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          project_id?: string | null;
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
      // Migration 023. Writes go exclusively through the claim_referral RPC —
      // INSERT/UPDATE/DELETE are revoked for anon and authenticated.
      referrals: {
        Row: {
          id: string;
          referrer_id: string;
          referee_id: string;
          code_used: string;
          credits_each: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          referrer_id: string;
          referee_id: string;
          code_used: string;
          credits_each: number;
          created_at?: string;
        };
        Update: {
          credits_each?: number;
        };
        Relationships: [];
      };
      credit_transactions: {
        Row: {
          id: string;
          user_id: string;
          amount: number;
          // 'referral' and 'admin_adjustment' allowed by migration 023.
          type: 'subscription' | 'topup' | 'usage' | 'refund' | 'reset' | 'referral' | 'admin_adjustment';
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
          type: 'image' | 'video' | 'audio';
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
      teams: {
        Row: {
          id: string;
          owner_id: string;
          name: string;
          slug: string | null;
          logo_url: string | null;
          plan_id: string;
          credits_balance: number;
          max_members: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          owner_id: string;
          name: string;
          slug?: string | null;
          logo_url?: string | null;
          plan_id?: string;
          credits_balance?: number;
          max_members?: number;
        };
        Update: {
          name?: string;
          slug?: string | null;
          logo_url?: string | null;
          plan_id?: string;
          credits_balance?: number;
          max_members?: number;
        };
        Relationships: [];
      };
      team_members: {
        Row: {
          id: string;
          team_id: string;
          user_id: string;
          role: 'owner' | 'admin' | 'member';
          invited_by: string | null;
          invited_email: string | null;
          invite_token: string | null;
          joined_at: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          team_id: string;
          user_id: string;
          role?: string;
          invited_by?: string | null;
          invited_email?: string | null;
          invite_token?: string | null;
        };
        Update: {
          role?: string;
          joined_at?: string;
        };
        Relationships: [];
      };
      projects: {
        Row: {
          id: string;
          user_id: string;
          team_id: string | null;
          name: string;
          brand_kit_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          team_id?: string | null;
          name: string;
          brand_kit_id?: string | null;
        };
        Update: {
          name?: string;
          team_id?: string | null;
          brand_kit_id?: string | null;
        };
        Relationships: [];
      };
      subscription_events: {
        Row: {
          id: string;
          user_id: string;
          event_type: string;
          from_plan: string | null;
          to_plan: string | null;
          stripe_subscription_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          event_type: string;
          from_plan?: string | null;
          to_plan?: string | null;
          stripe_subscription_id?: string | null;
          created_at?: string;
        };
        Update: {
          event_type?: string;
          from_plan?: string | null;
          to_plan?: string | null;
        };
        Relationships: [];
      };
      user_events: {
        Row: {
          id: string;
          user_id: string;
          event_type: string;
          metadata: Record<string, unknown>;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          event_type: string;
          metadata?: Record<string, unknown>;
          created_at?: string;
        };
        Update: {
          event_type?: string;
          metadata?: Record<string, unknown>;
        };
        Relationships: [];
      };
      daily_metrics: {
        Row: {
          date: string;
          total_users: number;
          new_signups: number;
          active_users: number;
          paying_users: number;
          churned_users: number;
          mrr_cents: number;
          revenue_cents: number;
          total_generations: number;
          failed_generations: number;
          credits_consumed: number;
          credits_purchased: number;
          created_at: string;
        };
        Insert: {
          date: string;
          total_users?: number;
          new_signups?: number;
          active_users?: number;
          paying_users?: number;
          churned_users?: number;
          mrr_cents?: number;
          revenue_cents?: number;
          total_generations?: number;
          failed_generations?: number;
          credits_consumed?: number;
          credits_purchased?: number;
        };
        Update: {
          total_users?: number;
          new_signups?: number;
          active_users?: number;
          paying_users?: number;
          mrr_cents?: number;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      // Migration 025. Atomic: locks the caller's profile row, re-counts, then
      // inserts — so concurrent creates cannot both pass the quota check.
      // service_role only; the caller supplies p_user_id and p_limit.
      create_project: {
        Args: {
          p_user_id: string;
          p_name: string;
          p_brand_kit_id: string | null;
          p_limit: number;
        };
        Returns: {
          id: string;
          user_id: string;
          team_id: string | null;
          name: string;
          brand_kit_id: string | null;
          created_at: string;
          updated_at: string;
        };
      };
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
      reserve_credits: {
        Args: {
          p_user_id: string;
          p_amount: number;
          p_studio: string;
          p_description: string;
          p_generation_id?: string;
        };
        Returns: Record<string, unknown>;
      };
      refund_credits: {
        Args: {
          p_user_id: string;
          p_amount: number;
          p_description: string;
          p_generation_id?: string;
        };
        Returns: Record<string, unknown>;
      };
      // Migration 023. SECURITY DEFINER, EXECUTE granted to service_role only —
      // must be called with createServiceRoleClient(), never the user client.
      claim_referral: {
        Args: {
          p_referee_id: string;
          p_code: string;
          p_credits?: number;
        };
        Returns: Record<string, unknown>;
      };
      // Migration 027. SECURITY DEFINER, EXECUTE granted to service_role only —
      // must be called with createServiceRoleClient(), never the user client.
      grant_onboarding_bonus: {
        Args: {
          p_user_id: string;
          p_credits: number;
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
export type Team = Database['public']['Tables']['teams']['Row'];
export type TeamMember = Database['public']['Tables']['team_members']['Row'];
export type Project = Database['public']['Tables']['projects']['Row'];
