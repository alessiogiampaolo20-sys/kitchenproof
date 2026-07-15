export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      audit_log: {
        Row: {
          action: string
          actor_id: string
          actor_role: string
          after_hash: string | null
          before_hash: string | null
          client_created_at: string | null
          created_at: string
          diff: Json | null
          entity_id: string | null
          entity_table: string
          id: string
          impersonated_by: string | null
          ip: unknown
          org_id: string
          prev_hash: string | null
          site_id: string | null
          user_agent: string | null
        }
        Insert: {
          action: string
          actor_id: string
          actor_role: string
          after_hash?: string | null
          before_hash?: string | null
          client_created_at?: string | null
          created_at?: string
          diff?: Json | null
          entity_id?: string | null
          entity_table: string
          id?: string
          impersonated_by?: string | null
          ip?: unknown
          org_id: string
          prev_hash?: string | null
          site_id?: string | null
          user_agent?: string | null
        }
        Update: {
          action?: string
          actor_id?: string
          actor_role?: string
          after_hash?: string | null
          before_hash?: string | null
          client_created_at?: string | null
          created_at?: string
          diff?: Json | null
          entity_id?: string | null
          entity_table?: string
          id?: string
          impersonated_by?: string | null
          ip?: unknown
          org_id?: string
          prev_hash?: string | null
          site_id?: string | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_log_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      device_sessions: {
        Row: {
          created_at: string
          device_name: string
          id: string
          last_seen_at: string
          registered_by: string
          revoked_at: string | null
          site_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          device_name: string
          id?: string
          last_seen_at?: string
          registered_by: string
          revoked_at?: string | null
          site_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          device_name?: string
          id?: string
          last_seen_at?: string
          registered_by?: string
          revoked_at?: string | null
          site_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "device_sessions_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      inspector_links: {
        Row: {
          created_at: string
          created_by: string
          expires_at: string
          id: string
          site_id: string
          token_hash: string
          updated_at: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          created_by: string
          expires_at: string
          id?: string
          site_id: string
          token_hash: string
          updated_at?: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string
          expires_at?: string
          id?: string
          site_id?: string
          token_hash?: string
          updated_at?: string
          used_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inspector_links_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
        ]
      }
      membership_pins: {
        Row: {
          created_at: string
          failed_attempts: number
          locked_at: string | null
          membership_id: string
          pin_hash: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          failed_attempts?: number
          locked_at?: string | null
          membership_id: string
          pin_hash: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          failed_attempts?: number
          locked_at?: string | null
          membership_id?: string
          pin_hash?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "membership_pins_membership_id_fkey"
            columns: ["membership_id"]
            isOneToOne: true
            referencedRelation: "memberships"
            referencedColumns: ["id"]
          },
        ]
      }
      memberships: {
        Row: {
          accepted_at: string | null
          created_at: string
          expires_at: string | null
          id: string
          invite_expires_at: string | null
          invite_token_hash: string | null
          invited_by: string | null
          invited_email: string | null
          org_id: string
          role: Database["public"]["Enums"]["org_role"]
          site_ids: string[] | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          invite_expires_at?: string | null
          invite_token_hash?: string | null
          invited_by?: string | null
          invited_email?: string | null
          org_id: string
          role: Database["public"]["Enums"]["org_role"]
          site_ids?: string[] | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          expires_at?: string | null
          id?: string
          invite_expires_at?: string | null
          invite_token_hash?: string | null
          invited_by?: string | null
          invited_email?: string | null
          org_id?: string
          role?: Database["public"]["Enums"]["org_role"]
          site_ids?: string[] | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "memberships_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "memberships_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          billing_email: string | null
          country_code: string
          created_at: string
          created_by: string
          default_locale: string
          id: string
          name: string
          plan: string
          status: string
          updated_at: string
          vat_number: string | null
        }
        Insert: {
          billing_email?: string | null
          country_code?: string
          created_at?: string
          created_by: string
          default_locale?: string
          id?: string
          name: string
          plan?: string
          status?: string
          updated_at?: string
          vat_number?: string | null
        }
        Update: {
          billing_email?: string | null
          country_code?: string
          created_at?: string
          created_by?: string
          default_locale?: string
          id?: string
          name?: string
          plan?: string
          status?: string
          updated_at?: string
          vat_number?: string | null
        }
        Relationships: []
      }
      platform_roles: {
        Row: {
          created_at: string
          granted_by: string | null
          role: Database["public"]["Enums"]["platform_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          granted_by?: string | null
          role: Database["public"]["Enums"]["platform_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          granted_by?: string | null
          role?: Database["public"]["Enums"]["platform_role"]
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          full_name: string
          id: string
          locale: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string
          id: string
          locale?: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string
          id?: string
          locale?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      sites: {
        Row: {
          activity_type: Database["public"]["Enums"]["activity_type"]
          address: string | null
          city: string | null
          compliance_pack: string
          country_code: string
          created_at: string
          cvr_p_number: string | null
          id: string
          name: string
          org_id: string
          pack_version_pinned: string | null
          postal_code: string | null
          smiley_url: string | null
          status: Database["public"]["Enums"]["site_status"]
          timezone: string
          updated_at: string
        }
        Insert: {
          activity_type: Database["public"]["Enums"]["activity_type"]
          address?: string | null
          city?: string | null
          compliance_pack?: string
          country_code?: string
          created_at?: string
          cvr_p_number?: string | null
          id?: string
          name: string
          org_id: string
          pack_version_pinned?: string | null
          postal_code?: string | null
          smiley_url?: string | null
          status?: Database["public"]["Enums"]["site_status"]
          timezone?: string
          updated_at?: string
        }
        Update: {
          activity_type?: Database["public"]["Enums"]["activity_type"]
          address?: string | null
          city?: string | null
          compliance_pack?: string
          country_code?: string
          created_at?: string
          cvr_p_number?: string | null
          id?: string
          name?: string
          org_id?: string
          pack_version_pinned?: string | null
          postal_code?: string | null
          smiley_url?: string | null
          status?: Database["public"]["Enums"]["site_status"]
          timezone?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sites_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_invite: { Args: { p_token: string }; Returns: string }
      create_invite: {
        Args: {
          p_email: string
          p_expires_at?: string
          p_org_id: string
          p_role: Database["public"]["Enums"]["org_role"]
          p_site_ids?: string[]
        }
        Returns: string
      }
      create_organization: {
        Args: {
          p_country_code?: string
          p_default_locale?: string
          p_name: string
        }
        Returns: string
      }
      get_invite_preview: {
        Args: { p_token: string }
        Returns: {
          invite_role: Database["public"]["Enums"]["org_role"]
          invited_email: string
          org_id: string
          org_name: string
        }[]
      }
      get_pin_verification_data: {
        Args: { p_membership_id: string }
        Returns: {
          failed_attempts: number
          locked: boolean
          pin_hash: string
        }[]
      }
      record_pin_attempt: {
        Args: { p_membership_id: string; p_success: boolean }
        Returns: {
          locked: boolean
          remaining_attempts: number
        }[]
      }
      set_member_pin: {
        Args: { p_membership_id: string; p_pin_hash: string }
        Returns: undefined
      }
      site_pin_status: {
        Args: { p_site_id: string }
        Returns: {
          has_pin: boolean
          locked: boolean
          membership_id: string
        }[]
      }
      unlock_member_pin: {
        Args: { p_membership_id: string }
        Returns: undefined
      }
      uuid_v7: { Args: never; Returns: string }
    }
    Enums: {
      activity_type:
        | "restaurant"
        | "cafe"
        | "takeaway"
        | "canteen"
        | "bakery"
        | "butcher"
        | "catering"
        | "foodtruck"
        | "retail_kiosk"
        | "hotel_breakfast"
        | "small_producer"
        | "wholesale_small"
      org_role:
        | "org_owner"
        | "org_admin"
        | "consultant"
        | "site_manager"
        | "operator"
      platform_role: "platform_admin" | "platform_support"
      site_status: "active" | "paused" | "archived"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      activity_type: [
        "restaurant",
        "cafe",
        "takeaway",
        "canteen",
        "bakery",
        "butcher",
        "catering",
        "foodtruck",
        "retail_kiosk",
        "hotel_breakfast",
        "small_producer",
        "wholesale_small",
      ],
      org_role: [
        "org_owner",
        "org_admin",
        "consultant",
        "site_manager",
        "operator",
      ],
      platform_role: ["platform_admin", "platform_support"],
      site_status: ["active", "paused", "archived"],
    },
  },
} as const

