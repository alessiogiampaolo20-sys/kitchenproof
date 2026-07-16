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
          {
            foreignKeyName: "audit_log_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "v_site_compliance_today"
            referencedColumns: ["site_id"]
          },
        ]
      }
      cleaning_areas: {
        Row: {
          active: boolean
          created_at: string
          frequency_json: Json | null
          id: string
          instructions_i18n: Json | null
          name_i18n: Json
          position: number
          site_id: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          frequency_json?: Json | null
          id?: string
          instructions_i18n?: Json | null
          name_i18n: Json
          position?: number
          site_id: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          frequency_json?: Json | null
          id?: string
          instructions_i18n?: Json | null
          name_i18n?: Json
          position?: number
          site_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cleaning_areas_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cleaning_areas_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "v_site_compliance_today"
            referencedColumns: ["site_id"]
          },
        ]
      }
      compliance_packs: {
        Row: {
          authority_json: Json
          code: string
          created_at: string
          name: string
          updated_at: string
        }
        Insert: {
          authority_json?: Json
          code: string
          created_at?: string
          name: string
          updated_at?: string
        }
        Update: {
          authority_json?: Json
          code?: string
          created_at?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      control_points: {
        Row: {
          active: boolean
          area_i18n: Json | null
          category: Database["public"]["Enums"]["cp_category"]
          corrective_guidance_i18n: Json | null
          created_at: string
          equipment_id: string | null
          frequency_json: Json
          hazard_id: string | null
          id: string
          instructions_i18n: Json | null
          limit_json: Json | null
          limit_justification: string | null
          limit_loosened: boolean
          monitoring_method: string
          name_i18n: Json
          responsible_role: string | null
          risk_analysis_id: string
          site_id: string
          source_ref: Json | null
          target_kind: Database["public"]["Enums"]["cp_target_kind"]
          template_key: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          area_i18n?: Json | null
          category: Database["public"]["Enums"]["cp_category"]
          corrective_guidance_i18n?: Json | null
          created_at?: string
          equipment_id?: string | null
          frequency_json: Json
          hazard_id?: string | null
          id?: string
          instructions_i18n?: Json | null
          limit_json?: Json | null
          limit_justification?: string | null
          limit_loosened?: boolean
          monitoring_method: string
          name_i18n: Json
          responsible_role?: string | null
          risk_analysis_id: string
          site_id: string
          source_ref?: Json | null
          target_kind: Database["public"]["Enums"]["cp_target_kind"]
          template_key?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          area_i18n?: Json | null
          category?: Database["public"]["Enums"]["cp_category"]
          corrective_guidance_i18n?: Json | null
          created_at?: string
          equipment_id?: string | null
          frequency_json?: Json
          hazard_id?: string | null
          id?: string
          instructions_i18n?: Json | null
          limit_json?: Json | null
          limit_justification?: string | null
          limit_loosened?: boolean
          monitoring_method?: string
          name_i18n?: Json
          responsible_role?: string | null
          risk_analysis_id?: string
          site_id?: string
          source_ref?: Json | null
          target_kind?: Database["public"]["Enums"]["cp_target_kind"]
          template_key?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "control_points_equipment_id_fkey"
            columns: ["equipment_id"]
            isOneToOne: false
            referencedRelation: "equipment"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "control_points_hazard_id_fkey"
            columns: ["hazard_id"]
            isOneToOne: false
            referencedRelation: "hazards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "control_points_risk_analysis_id_fkey"
            columns: ["risk_analysis_id"]
            isOneToOne: false
            referencedRelation: "risk_analyses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "control_points_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "control_points_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "v_site_compliance_today"
            referencedColumns: ["site_id"]
          },
        ]
      }
      corpus_chunks: {
        Row: {
          content: string
          created_at: string
          doc_id: string
          embedding: string | null
          id: string
          page_from: number
          page_to: number
          section: string | null
          tsv: unknown
        }
        Insert: {
          content: string
          created_at?: string
          doc_id: string
          embedding?: string | null
          id?: string
          page_from: number
          page_to: number
          section?: string | null
          tsv?: unknown
        }
        Update: {
          content?: string
          created_at?: string
          doc_id?: string
          embedding?: string | null
          id?: string
          page_from?: number
          page_to?: number
          section?: string | null
          tsv?: unknown
        }
        Relationships: [
          {
            foreignKeyName: "corpus_chunks_doc_id_fkey"
            columns: ["doc_id"]
            isOneToOne: false
            referencedRelation: "corpus_documents"
            referencedColumns: ["doc_id"]
          },
        ]
      }
      corpus_documents: {
        Row: {
          created_at: string
          doc_id: string
          file_path: string
          lang: string
          pack_code: string
          pages: number | null
          title: string
          version_date: string | null
        }
        Insert: {
          created_at?: string
          doc_id: string
          file_path: string
          lang?: string
          pack_code: string
          pages?: number | null
          title: string
          version_date?: string | null
        }
        Update: {
          created_at?: string
          doc_id?: string
          file_path?: string
          lang?: string
          pack_code?: string
          pages?: number | null
          title?: string
          version_date?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "corpus_documents_pack_code_fkey"
            columns: ["pack_code"]
            isOneToOne: false
            referencedRelation: "compliance_packs"
            referencedColumns: ["code"]
          },
        ]
      }
      deviations: {
        Row: {
          control_point_id: string | null
          corrective_action_at: string | null
          corrective_action_by: string | null
          corrective_action_text: string | null
          created_at: string
          description: string
          detected_at: string
          detected_by: string
          food_assessment: Database["public"]["Enums"]["food_assessment"] | null
          id: string
          photo_paths: string[]
          severity: Database["public"]["Enums"]["deviation_severity"]
          site_id: string
          source: Database["public"]["Enums"]["deviation_source"]
          status: Database["public"]["Enums"]["deviation_status"]
          updated_at: string
          verification_text: string | null
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          control_point_id?: string | null
          corrective_action_at?: string | null
          corrective_action_by?: string | null
          corrective_action_text?: string | null
          created_at?: string
          description: string
          detected_at?: string
          detected_by: string
          food_assessment?:
            | Database["public"]["Enums"]["food_assessment"]
            | null
          id?: string
          photo_paths?: string[]
          severity: Database["public"]["Enums"]["deviation_severity"]
          site_id: string
          source: Database["public"]["Enums"]["deviation_source"]
          status?: Database["public"]["Enums"]["deviation_status"]
          updated_at?: string
          verification_text?: string | null
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          control_point_id?: string | null
          corrective_action_at?: string | null
          corrective_action_by?: string | null
          corrective_action_text?: string | null
          created_at?: string
          description?: string
          detected_at?: string
          detected_by?: string
          food_assessment?:
            | Database["public"]["Enums"]["food_assessment"]
            | null
          id?: string
          photo_paths?: string[]
          severity?: Database["public"]["Enums"]["deviation_severity"]
          site_id?: string
          source?: Database["public"]["Enums"]["deviation_source"]
          status?: Database["public"]["Enums"]["deviation_status"]
          updated_at?: string
          verification_text?: string | null
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "deviations_control_point_id_fkey"
            columns: ["control_point_id"]
            isOneToOne: false
            referencedRelation: "control_points"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deviations_corrective_action_by_fkey"
            columns: ["corrective_action_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deviations_detected_by_fkey"
            columns: ["detected_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deviations_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deviations_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "v_site_compliance_today"
            referencedColumns: ["site_id"]
          },
          {
            foreignKeyName: "deviations_verified_by_fkey"
            columns: ["verified_by"]
            isOneToOne: false
            referencedRelation: "profiles"
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
          {
            foreignKeyName: "device_sessions_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "v_site_compliance_today"
            referencedColumns: ["site_id"]
          },
        ]
      }
      equipment: {
        Row: {
          active: boolean
          brand_model: string | null
          created_at: string
          id: string
          kind: Database["public"]["Enums"]["equipment_kind"]
          location_note: string | null
          name: string
          nfc_tag_id: string | null
          photo_path: string | null
          qr_code_token: string
          retired_at: string | null
          site_id: string
          target_limit_json: Json | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          brand_model?: string | null
          created_at?: string
          id?: string
          kind: Database["public"]["Enums"]["equipment_kind"]
          location_note?: string | null
          name: string
          nfc_tag_id?: string | null
          photo_path?: string | null
          qr_code_token?: string
          retired_at?: string | null
          site_id: string
          target_limit_json?: Json | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          brand_model?: string | null
          created_at?: string
          id?: string
          kind?: Database["public"]["Enums"]["equipment_kind"]
          location_note?: string | null
          name?: string
          nfc_tag_id?: string | null
          photo_path?: string | null
          qr_code_token?: string
          retired_at?: string | null
          site_id?: string
          target_limit_json?: Json | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "equipment_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipment_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "v_site_compliance_today"
            referencedColumns: ["site_id"]
          },
        ]
      }
      hazards: {
        Row: {
          ai_suggested: boolean
          category: Database["public"]["Enums"]["hazard_category"]
          control_measure_i18n: Json | null
          created_at: string
          description_i18n: Json
          human_edited: boolean
          id: string
          is_ccp: boolean
          is_oprp: boolean
          justification_i18n: Json | null
          likelihood: number | null
          process_step_id: string
          ra_row_id: string | null
          severity: number | null
          updated_at: string
        }
        Insert: {
          ai_suggested?: boolean
          category: Database["public"]["Enums"]["hazard_category"]
          control_measure_i18n?: Json | null
          created_at?: string
          description_i18n: Json
          human_edited?: boolean
          id?: string
          is_ccp?: boolean
          is_oprp?: boolean
          justification_i18n?: Json | null
          likelihood?: number | null
          process_step_id: string
          ra_row_id?: string | null
          severity?: number | null
          updated_at?: string
        }
        Update: {
          ai_suggested?: boolean
          category?: Database["public"]["Enums"]["hazard_category"]
          control_measure_i18n?: Json | null
          created_at?: string
          description_i18n?: Json
          human_edited?: boolean
          id?: string
          is_ccp?: boolean
          is_oprp?: boolean
          justification_i18n?: Json | null
          likelihood?: number | null
          process_step_id?: string
          ra_row_id?: string | null
          severity?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "hazards_process_step_id_fkey"
            columns: ["process_step_id"]
            isOneToOne: false
            referencedRelation: "process_steps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hazards_ra_row_id_fkey"
            columns: ["ra_row_id"]
            isOneToOne: false
            referencedRelation: "ra_activity_rows"
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
          {
            foreignKeyName: "inspector_links_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "v_site_compliance_today"
            referencedColumns: ["site_id"]
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
      notifications: {
        Row: {
          channels: string[]
          created_at: string
          id: string
          kind: string
          payload: Json
          read_at: string | null
          site_id: string | null
          user_id: string | null
        }
        Insert: {
          channels?: string[]
          created_at?: string
          id?: string
          kind: string
          payload?: Json
          read_at?: string | null
          site_id?: string | null
          user_id?: string | null
        }
        Update: {
          channels?: string[]
          created_at?: string
          id?: string
          kind?: string
          payload?: Json
          read_at?: string | null
          site_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "notifications_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "v_site_compliance_today"
            referencedColumns: ["site_id"]
          },
          {
            foreignKeyName: "notifications_user_id_fkey"
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
      pack_versions: {
        Row: {
          changelog: string | null
          content: Json
          created_at: string
          id: string
          pack_code: string
          published_at: string
          published_by: string | null
          version: string
        }
        Insert: {
          changelog?: string | null
          content: Json
          created_at?: string
          id?: string
          pack_code: string
          published_at?: string
          published_by?: string | null
          version: string
        }
        Update: {
          changelog?: string | null
          content?: Json
          created_at?: string
          id?: string
          pack_code?: string
          published_at?: string
          published_by?: string | null
          version?: string
        }
        Relationships: [
          {
            foreignKeyName: "pack_versions_pack_code_fkey"
            columns: ["pack_code"]
            isOneToOne: false
            referencedRelation: "compliance_packs"
            referencedColumns: ["code"]
          },
        ]
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
      process_steps: {
        Row: {
          created_at: string
          description_i18n: Json | null
          id: string
          key: string
          name_i18n: Json
          position: number
          risk_analysis_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description_i18n?: Json | null
          id?: string
          key: string
          name_i18n: Json
          position: number
          risk_analysis_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description_i18n?: Json | null
          id?: string
          key?: string
          name_i18n?: Json
          position?: number
          risk_analysis_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "process_steps_risk_analysis_id_fkey"
            columns: ["risk_analysis_id"]
            isOneToOne: false
            referencedRelation: "risk_analyses"
            referencedColumns: ["id"]
          },
        ]
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
      programme_documents: {
        Row: {
          created_at: string
          generated_at: string
          id: string
          kind: string
          pdf_path: string | null
          risk_analysis_id: string
          site_id: string
        }
        Insert: {
          created_at?: string
          generated_at?: string
          id?: string
          kind: string
          pdf_path?: string | null
          risk_analysis_id: string
          site_id: string
        }
        Update: {
          created_at?: string
          generated_at?: string
          id?: string
          kind?: string
          pdf_path?: string | null
          risk_analysis_id?: string
          site_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "programme_documents_risk_analysis_id_fkey"
            columns: ["risk_analysis_id"]
            isOneToOne: false
            referencedRelation: "risk_analyses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "programme_documents_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "programme_documents_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "v_site_compliance_today"
            referencedColumns: ["site_id"]
          },
        ]
      }
      ra_activity_rows: {
        Row: {
          activity_key: string
          ai_suggested: boolean
          applies: boolean
          control_measures_i18n: Json | null
          created_at: string
          human_edited: boolean
          id: string
          if_it_goes_wrong_i18n: Json | null
          is_critical: boolean
          position: number
          process_step_id: string
          risk_analysis_id: string
          source_import_id: string | null
          source_page: number | null
          source_region: Json | null
          updated_at: string
          what_can_go_wrong_i18n: Json | null
          what_you_do_i18n: Json | null
        }
        Insert: {
          activity_key: string
          ai_suggested?: boolean
          applies?: boolean
          control_measures_i18n?: Json | null
          created_at?: string
          human_edited?: boolean
          id?: string
          if_it_goes_wrong_i18n?: Json | null
          is_critical?: boolean
          position: number
          process_step_id: string
          risk_analysis_id: string
          source_import_id?: string | null
          source_page?: number | null
          source_region?: Json | null
          updated_at?: string
          what_can_go_wrong_i18n?: Json | null
          what_you_do_i18n?: Json | null
        }
        Update: {
          activity_key?: string
          ai_suggested?: boolean
          applies?: boolean
          control_measures_i18n?: Json | null
          created_at?: string
          human_edited?: boolean
          id?: string
          if_it_goes_wrong_i18n?: Json | null
          is_critical?: boolean
          position?: number
          process_step_id?: string
          risk_analysis_id?: string
          source_import_id?: string | null
          source_page?: number | null
          source_region?: Json | null
          updated_at?: string
          what_can_go_wrong_i18n?: Json | null
          what_you_do_i18n?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "ra_activity_rows_process_step_id_fkey"
            columns: ["process_step_id"]
            isOneToOne: false
            referencedRelation: "process_steps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ra_activity_rows_risk_analysis_id_fkey"
            columns: ["risk_analysis_id"]
            isOneToOne: false
            referencedRelation: "risk_analyses"
            referencedColumns: ["id"]
          },
        ]
      }
      risk_analyses: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          created_at: string
          id: string
          site_id: string
          status: Database["public"]["Enums"]["ra_status"]
          supersedes_id: string | null
          updated_at: string
          version: number
          wizard_transcript: Json | null
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          id?: string
          site_id: string
          status?: Database["public"]["Enums"]["ra_status"]
          supersedes_id?: string | null
          updated_at?: string
          version?: number
          wizard_transcript?: Json | null
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          created_at?: string
          id?: string
          site_id?: string
          status?: Database["public"]["Enums"]["ra_status"]
          supersedes_id?: string | null
          updated_at?: string
          version?: number
          wizard_transcript?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "risk_analyses_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "risk_analyses_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "v_site_compliance_today"
            referencedColumns: ["site_id"]
          },
          {
            foreignKeyName: "risk_analyses_supersedes_id_fkey"
            columns: ["supersedes_id"]
            isOneToOne: false
            referencedRelation: "risk_analyses"
            referencedColumns: ["id"]
          },
        ]
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
      task_completions: {
        Row: {
          client_created_at: string | null
          client_uuid: string
          control_point_id: string | null
          corrects_id: string | null
          created_at: string
          deviation_id: string | null
          equipment_id: string | null
          id: string
          is_late: boolean
          note: string | null
          passed: boolean | null
          performed_by: string
          photo_ai_reading: Json | null
          photo_paths: string[]
          server_received_at: string
          site_id: string
          task_id: string | null
          value_json: Json
        }
        Insert: {
          client_created_at?: string | null
          client_uuid?: string
          control_point_id?: string | null
          corrects_id?: string | null
          created_at?: string
          deviation_id?: string | null
          equipment_id?: string | null
          id?: string
          is_late?: boolean
          note?: string | null
          passed?: boolean | null
          performed_by: string
          photo_ai_reading?: Json | null
          photo_paths?: string[]
          server_received_at?: string
          site_id: string
          task_id?: string | null
          value_json: Json
        }
        Update: {
          client_created_at?: string | null
          client_uuid?: string
          control_point_id?: string | null
          corrects_id?: string | null
          created_at?: string
          deviation_id?: string | null
          equipment_id?: string | null
          id?: string
          is_late?: boolean
          note?: string | null
          passed?: boolean | null
          performed_by?: string
          photo_ai_reading?: Json | null
          photo_paths?: string[]
          server_received_at?: string
          site_id?: string
          task_id?: string | null
          value_json?: Json
        }
        Relationships: [
          {
            foreignKeyName: "task_completions_control_point_id_fkey"
            columns: ["control_point_id"]
            isOneToOne: false
            referencedRelation: "control_points"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_completions_corrects_id_fkey"
            columns: ["corrects_id"]
            isOneToOne: false
            referencedRelation: "task_completions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_completions_corrects_id_fkey"
            columns: ["corrects_id"]
            isOneToOne: false
            referencedRelation: "v_temperature_history"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_completions_deviation_id_fkey"
            columns: ["deviation_id"]
            isOneToOne: false
            referencedRelation: "deviations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_completions_equipment_id_fkey"
            columns: ["equipment_id"]
            isOneToOne: false
            referencedRelation: "equipment"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_completions_performed_by_fkey"
            columns: ["performed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_completions_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_completions_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "v_site_compliance_today"
            referencedColumns: ["site_id"]
          },
          {
            foreignKeyName: "task_completions_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          assigned_role: string | null
          control_point_id: string
          created_at: string
          due_at: string
          due_window_minutes: number
          id: string
          site_id: string
          status: Database["public"]["Enums"]["task_status"]
          updated_at: string
          verifies_deviation_id: string | null
        }
        Insert: {
          assigned_role?: string | null
          control_point_id: string
          created_at?: string
          due_at: string
          due_window_minutes?: number
          id?: string
          site_id: string
          status?: Database["public"]["Enums"]["task_status"]
          updated_at?: string
          verifies_deviation_id?: string | null
        }
        Update: {
          assigned_role?: string | null
          control_point_id?: string
          created_at?: string
          due_at?: string
          due_window_minutes?: number
          id?: string
          site_id?: string
          status?: Database["public"]["Enums"]["task_status"]
          updated_at?: string
          verifies_deviation_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tasks_control_point_id_fkey"
            columns: ["control_point_id"]
            isOneToOne: false
            referencedRelation: "control_points"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "v_site_compliance_today"
            referencedColumns: ["site_id"]
          },
          {
            foreignKeyName: "tasks_verifies_deviation_id_fkey"
            columns: ["verifies_deviation_id"]
            isOneToOne: false
            referencedRelation: "deviations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      v_site_compliance_today: {
        Row: {
          done_today: number | null
          due_today: number | null
          missed_total: number | null
          open_deviations: number | null
          site_id: string | null
        }
        Relationships: []
      }
      v_temperature_history: {
        Row: {
          control_point_id: string | null
          equipment_id: string | null
          equipment_name: string | null
          id: string | null
          passed: boolean | null
          performed_by: string | null
          server_received_at: string | null
          site_id: string | null
          temp_c: number | null
        }
        Relationships: [
          {
            foreignKeyName: "task_completions_control_point_id_fkey"
            columns: ["control_point_id"]
            isOneToOne: false
            referencedRelation: "control_points"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_completions_equipment_id_fkey"
            columns: ["equipment_id"]
            isOneToOne: false
            referencedRelation: "equipment"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_completions_performed_by_fkey"
            columns: ["performed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_completions_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_completions_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "v_site_compliance_today"
            referencedColumns: ["site_id"]
          },
        ]
      }
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
      cp_category:
        | "temperature"
        | "cleaning"
        | "receiving"
        | "pest"
        | "hygiene"
        | "other"
      cp_target_kind: "equipment" | "area" | "process" | "supplier"
      deviation_severity: "minor" | "major" | "critical"
      deviation_source: "task" | "receiving" | "adhoc" | "ai_flag"
      deviation_status: "open" | "corrected" | "verified" | "closed"
      equipment_kind:
        | "fridge"
        | "freezer"
        | "hot_holding"
        | "dishwasher"
        | "probe"
        | "oven"
        | "blast_chiller"
        | "other"
      food_assessment: "kept" | "moved" | "discarded" | "recalled" | "na"
      hazard_category: "micro" | "chemical" | "physical" | "allergen"
      org_role:
        | "org_owner"
        | "org_admin"
        | "consultant"
        | "site_manager"
        | "operator"
      platform_role: "platform_admin" | "platform_support"
      ra_status: "draft" | "in_review" | "approved" | "superseded"
      site_status: "active" | "paused" | "archived"
      task_status: "pending" | "done" | "missed" | "skipped_justified"
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
      cp_category: [
        "temperature",
        "cleaning",
        "receiving",
        "pest",
        "hygiene",
        "other",
      ],
      cp_target_kind: ["equipment", "area", "process", "supplier"],
      deviation_severity: ["minor", "major", "critical"],
      deviation_source: ["task", "receiving", "adhoc", "ai_flag"],
      deviation_status: ["open", "corrected", "verified", "closed"],
      equipment_kind: [
        "fridge",
        "freezer",
        "hot_holding",
        "dishwasher",
        "probe",
        "oven",
        "blast_chiller",
        "other",
      ],
      food_assessment: ["kept", "moved", "discarded", "recalled", "na"],
      hazard_category: ["micro", "chemical", "physical", "allergen"],
      org_role: [
        "org_owner",
        "org_admin",
        "consultant",
        "site_manager",
        "operator",
      ],
      platform_role: ["platform_admin", "platform_support"],
      ra_status: ["draft", "in_review", "approved", "superseded"],
      site_status: ["active", "paused", "archived"],
      task_status: ["pending", "done", "missed", "skipped_justified"],
    },
  },
} as const

