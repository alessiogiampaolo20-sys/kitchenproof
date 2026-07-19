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
      ai_runs: {
        Row: {
          accepted: boolean | null
          confidence: number | null
          created_at: string
          edited: boolean | null
          error: string | null
          feature: string
          id: string
          input_ref: string | null
          latency_ms: number | null
          model: string
          org_id: string
          output_ref: string | null
          prompt_version: string
          site_id: string | null
          tokens_in: number | null
          tokens_out: number | null
        }
        Insert: {
          accepted?: boolean | null
          confidence?: number | null
          created_at?: string
          edited?: boolean | null
          error?: string | null
          feature: string
          id?: string
          input_ref?: string | null
          latency_ms?: number | null
          model: string
          org_id: string
          output_ref?: string | null
          prompt_version: string
          site_id?: string | null
          tokens_in?: number | null
          tokens_out?: number | null
        }
        Update: {
          accepted?: boolean | null
          confidence?: number | null
          created_at?: string
          edited?: boolean | null
          error?: string | null
          feature?: string
          id?: string
          input_ref?: string | null
          latency_ms?: number | null
          model?: string
          org_id?: string
          output_ref?: string | null
          prompt_version?: string
          site_id?: string | null
          tokens_in?: number | null
          tokens_out?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_runs_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_runs_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_runs_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "v_site_compliance_today"
            referencedColumns: ["site_id"]
          },
        ]
      }
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
      b2b_customers: {
        Row: {
          address: string | null
          created_at: string
          cvr: string | null
          email: string | null
          id: string
          name: string
          org_id: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          created_at?: string
          cvr?: string | null
          email?: string | null
          id?: string
          name: string
          org_id: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          created_at?: string
          cvr?: string | null
          email?: string | null
          id?: string
          name?: string
          org_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "b2b_customers_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      batches: {
        Row: {
          created_at: string
          expiry_date: string | null
          expiry_kind: Database["public"]["Enums"]["batch_expiry_kind"] | null
          goods_receipt_id: string | null
          id: string
          label_printed: boolean
          lot_code: string
          origin: Database["public"]["Enums"]["batch_origin"]
          parent_batch_ids: string[] | null
          product_id: string
          quantity: number
          remaining: number
          site_id: string
          status: Database["public"]["Enums"]["batch_status"]
          unit: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          expiry_date?: string | null
          expiry_kind?: Database["public"]["Enums"]["batch_expiry_kind"] | null
          goods_receipt_id?: string | null
          id?: string
          label_printed?: boolean
          lot_code: string
          origin?: Database["public"]["Enums"]["batch_origin"]
          parent_batch_ids?: string[] | null
          product_id: string
          quantity: number
          remaining: number
          site_id: string
          status?: Database["public"]["Enums"]["batch_status"]
          unit: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          expiry_date?: string | null
          expiry_kind?: Database["public"]["Enums"]["batch_expiry_kind"] | null
          goods_receipt_id?: string | null
          id?: string
          label_printed?: boolean
          lot_code?: string
          origin?: Database["public"]["Enums"]["batch_origin"]
          parent_batch_ids?: string[] | null
          product_id?: string
          quantity?: number
          remaining?: number
          site_id?: string
          status?: Database["public"]["Enums"]["batch_status"]
          unit?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "batches_goods_receipt_id_fkey"
            columns: ["goods_receipt_id"]
            isOneToOne: false
            referencedRelation: "goods_receipts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "batches_goods_receipt_id_fkey"
            columns: ["goods_receipt_id"]
            isOneToOne: false
            referencedRelation: "v_traceability_lookup"
            referencedColumns: ["goods_receipt_id"]
          },
          {
            foreignKeyName: "batches_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "batches_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_traceability_lookup"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "batches_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "batches_site_id_fkey"
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
      goods_receipts: {
        Row: {
          created_at: string
          id: string
          invoice_id: string | null
          note: string | null
          packaging_ok: boolean | null
          photo_paths: string[]
          received_at: string
          received_by: string
          site_id: string
          supplier_id: string | null
          temp_reading: number | null
          transport_temp_ok: boolean | null
        }
        Insert: {
          created_at?: string
          id?: string
          invoice_id?: string | null
          note?: string | null
          packaging_ok?: boolean | null
          photo_paths?: string[]
          received_at?: string
          received_by: string
          site_id: string
          supplier_id?: string | null
          temp_reading?: number | null
          transport_temp_ok?: boolean | null
        }
        Update: {
          created_at?: string
          id?: string
          invoice_id?: string | null
          note?: string | null
          packaging_ok?: boolean | null
          photo_paths?: string[]
          received_at?: string
          received_by?: string
          site_id?: string
          supplier_id?: string | null
          temp_reading?: number | null
          transport_temp_ok?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "goods_receipts_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goods_receipts_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "v_traceability_lookup"
            referencedColumns: ["invoice_id"]
          },
          {
            foreignKeyName: "goods_receipts_received_by_fkey"
            columns: ["received_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goods_receipts_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goods_receipts_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "v_site_compliance_today"
            referencedColumns: ["site_id"]
          },
          {
            foreignKeyName: "goods_receipts_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "goods_receipts_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "v_traceability_lookup"
            referencedColumns: ["supplier_id"]
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
      inventory_moves: {
        Row: {
          b2b_customer_id: string | null
          batch_id: string
          created_at: string
          id: string
          kind: Database["public"]["Enums"]["move_kind"]
          leftover_session_id: string | null
          moved_at: string
          moved_by: string
          note: string | null
          quantity: number
          reason: Database["public"]["Enums"]["waste_reason"] | null
          site_id: string
        }
        Insert: {
          b2b_customer_id?: string | null
          batch_id: string
          created_at?: string
          id?: string
          kind: Database["public"]["Enums"]["move_kind"]
          leftover_session_id?: string | null
          moved_at?: string
          moved_by: string
          note?: string | null
          quantity: number
          reason?: Database["public"]["Enums"]["waste_reason"] | null
          site_id: string
        }
        Update: {
          b2b_customer_id?: string | null
          batch_id?: string
          created_at?: string
          id?: string
          kind?: Database["public"]["Enums"]["move_kind"]
          leftover_session_id?: string | null
          moved_at?: string
          moved_by?: string
          note?: string | null
          quantity?: number
          reason?: Database["public"]["Enums"]["waste_reason"] | null
          site_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_moves_b2b_customer_id_fkey"
            columns: ["b2b_customer_id"]
            isOneToOne: false
            referencedRelation: "b2b_customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_moves_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_moves_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "v_expiring_batches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_moves_batch_id_fkey"
            columns: ["batch_id"]
            isOneToOne: false
            referencedRelation: "v_traceability_lookup"
            referencedColumns: ["batch_id"]
          },
          {
            foreignKeyName: "inventory_moves_leftover_session_id_fkey"
            columns: ["leftover_session_id"]
            isOneToOne: false
            referencedRelation: "leftover_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_moves_moved_by_fkey"
            columns: ["moved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_moves_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_moves_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "v_site_compliance_today"
            referencedColumns: ["site_id"]
          },
        ]
      }
      invoice_lines: {
        Row: {
          created_at: string
          description: string
          gtin: string | null
          id: string
          invoice_id: string
          is_food: boolean
          line_no: number
          lot_code: string | null
          match_confidence: number | null
          needs_review: boolean
          page: number | null
          product_id: string | null
          quantity: number | null
          raw_text: string
          unit: string | null
          unit_price: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          description: string
          gtin?: string | null
          id?: string
          invoice_id: string
          is_food?: boolean
          line_no: number
          lot_code?: string | null
          match_confidence?: number | null
          needs_review?: boolean
          page?: number | null
          product_id?: string | null
          quantity?: number | null
          raw_text: string
          unit?: string | null
          unit_price?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string
          gtin?: string | null
          id?: string
          invoice_id?: string
          is_food?: boolean
          line_no?: number
          lot_code?: string | null
          match_confidence?: number | null
          needs_review?: boolean
          page?: number | null
          product_id?: string | null
          quantity?: number | null
          raw_text?: string
          unit?: string | null
          unit_price?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoice_lines_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_lines_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "v_traceability_lookup"
            referencedColumns: ["invoice_id"]
          },
          {
            foreignKeyName: "invoice_lines_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_lines_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_traceability_lookup"
            referencedColumns: ["product_id"]
          },
        ]
      }
      invoices: {
        Row: {
          confirmed_at: string | null
          confirmed_by: string | null
          created_at: string
          currency: string | null
          duplicate_of_id: string | null
          extraction_json: Json | null
          file_paths: string[]
          id: string
          invoice_date: string | null
          invoice_number: string | null
          kind: Database["public"]["Enums"]["invoice_kind"]
          page_count: number
          site_id: string
          status: Database["public"]["Enums"]["invoice_status"]
          supplier_id: string | null
          total_amount: number | null
          updated_at: string
        }
        Insert: {
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          currency?: string | null
          duplicate_of_id?: string | null
          extraction_json?: Json | null
          file_paths: string[]
          id?: string
          invoice_date?: string | null
          invoice_number?: string | null
          kind?: Database["public"]["Enums"]["invoice_kind"]
          page_count?: number
          site_id: string
          status?: Database["public"]["Enums"]["invoice_status"]
          supplier_id?: string | null
          total_amount?: number | null
          updated_at?: string
        }
        Update: {
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          currency?: string | null
          duplicate_of_id?: string | null
          extraction_json?: Json | null
          file_paths?: string[]
          id?: string
          invoice_date?: string | null
          invoice_number?: string | null
          kind?: Database["public"]["Enums"]["invoice_kind"]
          page_count?: number
          site_id?: string
          status?: Database["public"]["Enums"]["invoice_status"]
          supplier_id?: string | null
          total_amount?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoices_confirmed_by_fkey"
            columns: ["confirmed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_duplicate_of_id_fkey"
            columns: ["duplicate_of_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_duplicate_of_id_fkey"
            columns: ["duplicate_of_id"]
            isOneToOne: false
            referencedRelation: "v_traceability_lookup"
            referencedColumns: ["invoice_id"]
          },
          {
            foreignKeyName: "invoices_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "v_site_compliance_today"
            referencedColumns: ["site_id"]
          },
          {
            foreignKeyName: "invoices_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "v_traceability_lookup"
            referencedColumns: ["supplier_id"]
          },
        ]
      }
      leftover_sessions: {
        Row: {
          completed_at: string | null
          created_at: string
          discarded_count: number
          id: string
          items_count: number
          service_label: string
          site_id: string
          started_at: string
          started_by: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          discarded_count?: number
          id?: string
          items_count?: number
          service_label: string
          site_id: string
          started_at?: string
          started_by: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          discarded_count?: number
          id?: string
          items_count?: number
          service_label?: string
          site_id?: string
          started_at?: string
          started_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "leftover_sessions_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leftover_sessions_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "v_site_compliance_today"
            referencedColumns: ["site_id"]
          },
          {
            foreignKeyName: "leftover_sessions_started_by_fkey"
            columns: ["started_by"]
            isOneToOne: false
            referencedRelation: "profiles"
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
      org_programme_templates: {
        Row: {
          content: Json
          created_at: string
          created_by: string
          id: string
          name: string
          org_id: string
          source_site_id: string | null
          updated_at: string
        }
        Insert: {
          content: Json
          created_at?: string
          created_by: string
          id?: string
          name: string
          org_id: string
          source_site_id?: string | null
          updated_at?: string
        }
        Update: {
          content?: Json
          created_at?: string
          created_by?: string
          id?: string
          name?: string
          org_id?: string
          source_site_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_programme_templates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_programme_templates_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_programme_templates_source_site_id_fkey"
            columns: ["source_site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_programme_templates_source_site_id_fkey"
            columns: ["source_site_id"]
            isOneToOne: false
            referencedRelation: "v_site_compliance_today"
            referencedColumns: ["site_id"]
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
      products: {
        Row: {
          ai_created: boolean
          allergens: string[]
          allergens_ai_suggested: boolean
          category: Database["public"]["Enums"]["product_category"]
          created_at: string
          default_shelf_life_days: number | null
          favourite: boolean
          gtin: string | null
          id: string
          is_food: boolean
          merged_into_id: string | null
          name: string
          normalized_name: string
          org_id: string
          storage_type: Database["public"]["Enums"]["storage_type"]
          unit_default: string
          updated_at: string
        }
        Insert: {
          ai_created?: boolean
          allergens?: string[]
          allergens_ai_suggested?: boolean
          category?: Database["public"]["Enums"]["product_category"]
          created_at?: string
          default_shelf_life_days?: number | null
          favourite?: boolean
          gtin?: string | null
          id?: string
          is_food?: boolean
          merged_into_id?: string | null
          name: string
          normalized_name: string
          org_id: string
          storage_type?: Database["public"]["Enums"]["storage_type"]
          unit_default?: string
          updated_at?: string
        }
        Update: {
          ai_created?: boolean
          allergens?: string[]
          allergens_ai_suggested?: boolean
          category?: Database["public"]["Enums"]["product_category"]
          created_at?: string
          default_shelf_life_days?: number | null
          favourite?: boolean
          gtin?: string | null
          id?: string
          is_food?: boolean
          merged_into_id?: string | null
          name?: string
          normalized_name?: string
          org_id?: string
          storage_type?: Database["public"]["Enums"]["storage_type"]
          unit_default?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_merged_into_id_fkey"
            columns: ["merged_into_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_merged_into_id_fkey"
            columns: ["merged_into_id"]
            isOneToOne: false
            referencedRelation: "v_traceability_lookup"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "products_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
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
      programme_change_proposals: {
        Row: {
          created_at: string
          decided_at: string | null
          decided_by: string | null
          diff_json: Json
          id: string
          justification: string | null
          proposed_by: string
          site_id: string
          status: Database["public"]["Enums"]["proposal_status"]
          template_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          diff_json: Json
          id?: string
          justification?: string | null
          proposed_by: string
          site_id: string
          status?: Database["public"]["Enums"]["proposal_status"]
          template_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          diff_json?: Json
          id?: string
          justification?: string | null
          proposed_by?: string
          site_id?: string
          status?: Database["public"]["Enums"]["proposal_status"]
          template_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "programme_change_proposals_decided_by_fkey"
            columns: ["decided_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "programme_change_proposals_proposed_by_fkey"
            columns: ["proposed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "programme_change_proposals_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "programme_change_proposals_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "v_site_compliance_today"
            referencedColumns: ["site_id"]
          },
          {
            foreignKeyName: "programme_change_proposals_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "org_programme_templates"
            referencedColumns: ["id"]
          },
        ]
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
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          id: string
          p256dh: string
          site_id: string | null
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          id?: string
          p256dh: string
          site_id?: string | null
          user_id: string
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          id?: string
          p256dh?: string
          site_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_subscriptions_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "push_subscriptions_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "v_site_compliance_today"
            referencedColumns: ["site_id"]
          },
          {
            foreignKeyName: "push_subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
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
      ra_imports: {
        Row: {
          confirmed_at: string | null
          confirmed_by: string | null
          created_at: string
          extraction_json: Json | null
          file_paths: string[]
          gap_report_json: Json | null
          id: string
          kind: Database["public"]["Enums"]["ra_import_kind"]
          risk_analysis_id: string | null
          site_id: string
          status: Database["public"]["Enums"]["ra_import_status"]
          updated_at: string
        }
        Insert: {
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          extraction_json?: Json | null
          file_paths: string[]
          gap_report_json?: Json | null
          id?: string
          kind: Database["public"]["Enums"]["ra_import_kind"]
          risk_analysis_id?: string | null
          site_id: string
          status?: Database["public"]["Enums"]["ra_import_status"]
          updated_at?: string
        }
        Update: {
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          extraction_json?: Json | null
          file_paths?: string[]
          gap_report_json?: Json | null
          id?: string
          kind?: Database["public"]["Enums"]["ra_import_kind"]
          risk_analysis_id?: string | null
          site_id?: string
          status?: Database["public"]["Enums"]["ra_import_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ra_imports_confirmed_by_fkey"
            columns: ["confirmed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ra_imports_risk_analysis_id_fkey"
            columns: ["risk_analysis_id"]
            isOneToOne: false
            referencedRelation: "risk_analyses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ra_imports_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ra_imports_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "v_site_compliance_today"
            referencedColumns: ["site_id"]
          },
        ]
      }
      recall_events: {
        Row: {
          created_at: string
          id: string
          initiated_at: string
          initiated_by: string
          org_id: string
          reason: string
          report_pdf_path: string | null
          scope_json: Json
        }
        Insert: {
          created_at?: string
          id?: string
          initiated_at?: string
          initiated_by: string
          org_id: string
          reason: string
          report_pdf_path?: string | null
          scope_json: Json
        }
        Update: {
          created_at?: string
          id?: string
          initiated_at?: string
          initiated_by?: string
          org_id?: string
          reason?: string
          report_pdf_path?: string | null
          scope_json?: Json
        }
        Relationships: [
          {
            foreignKeyName: "recall_events_initiated_by_fkey"
            columns: ["initiated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "recall_events_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      regulatory_updates: {
        Row: {
          created_at: string
          from_version: string
          id: string
          pack_code: string
          summary_i18n: Json
          to_version: string
        }
        Insert: {
          created_at?: string
          from_version: string
          id?: string
          pack_code: string
          summary_i18n: Json
          to_version: string
        }
        Update: {
          created_at?: string
          from_version?: string
          id?: string
          pack_code?: string
          summary_i18n?: Json
          to_version?: string
        }
        Relationships: [
          {
            foreignKeyName: "regulatory_updates_pack_code_fkey"
            columns: ["pack_code"]
            isOneToOne: false
            referencedRelation: "compliance_packs"
            referencedColumns: ["code"]
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
            foreignKeyName: "risk_analyses_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
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
      site_documents: {
        Row: {
          created_at: string
          file_path: string
          id: string
          kind: Database["public"]["Enums"]["site_document_kind"]
          site_id: string
          title: string
          updated_at: string
          uploaded_by: string
          valid_until: string | null
        }
        Insert: {
          created_at?: string
          file_path: string
          id?: string
          kind?: Database["public"]["Enums"]["site_document_kind"]
          site_id: string
          title: string
          updated_at?: string
          uploaded_by: string
          valid_until?: string | null
        }
        Update: {
          created_at?: string
          file_path?: string
          id?: string
          kind?: Database["public"]["Enums"]["site_document_kind"]
          site_id?: string
          title?: string
          updated_at?: string
          uploaded_by?: string
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "site_documents_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "site_documents_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "v_site_compliance_today"
            referencedColumns: ["site_id"]
          },
          {
            foreignKeyName: "site_documents_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      site_review_tasks: {
        Row: {
          created_at: string
          diff_json: Json | null
          due_at: string | null
          id: string
          regulatory_update_id: string | null
          resolved_at: string | null
          resolved_by: string | null
          site_id: string
          status: Database["public"]["Enums"]["review_status"]
          trigger: Database["public"]["Enums"]["review_trigger"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          diff_json?: Json | null
          due_at?: string | null
          id?: string
          regulatory_update_id?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          site_id: string
          status?: Database["public"]["Enums"]["review_status"]
          trigger: Database["public"]["Enums"]["review_trigger"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          diff_json?: Json | null
          due_at?: string | null
          id?: string
          regulatory_update_id?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          site_id?: string
          status?: Database["public"]["Enums"]["review_status"]
          trigger?: Database["public"]["Enums"]["review_trigger"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "site_review_tasks_regulatory_update_id_fkey"
            columns: ["regulatory_update_id"]
            isOneToOne: false
            referencedRelation: "regulatory_updates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "site_review_tasks_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "site_review_tasks_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "site_review_tasks_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "v_site_compliance_today"
            referencedColumns: ["site_id"]
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
      smiley_inspections: {
        Row: {
          created_at: string
          id: string
          inspected_on: string
          note: string | null
          recorded_by: string
          result: number
          site_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          inspected_on: string
          note?: string | null
          recorded_by: string
          result: number
          site_id: string
        }
        Update: {
          created_at?: string
          id?: string
          inspected_on?: string
          note?: string | null
          recorded_by?: string
          result?: number
          site_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "smiley_inspections_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "smiley_inspections_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "smiley_inspections_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "v_site_compliance_today"
            referencedColumns: ["site_id"]
          },
        ]
      }
      suppliers: {
        Row: {
          address: string | null
          ai_created: boolean
          approved: boolean
          city: string | null
          country: string
          created_at: string
          cvr: string | null
          email: string | null
          id: string
          name: string
          org_id: string
          phone: string | null
          postal_code: string | null
          site_id: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          ai_created?: boolean
          approved?: boolean
          city?: string | null
          country?: string
          created_at?: string
          cvr?: string | null
          email?: string | null
          id?: string
          name: string
          org_id: string
          phone?: string | null
          postal_code?: string | null
          site_id?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          ai_created?: boolean
          approved?: boolean
          city?: string | null
          country?: string
          created_at?: string
          cvr?: string | null
          email?: string | null
          id?: string
          name?: string
          org_id?: string
          phone?: string | null
          postal_code?: string | null
          site_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "suppliers_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "suppliers_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "suppliers_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "v_site_compliance_today"
            referencedColumns: ["site_id"]
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
      training_records: {
        Row: {
          certificate_path: string | null
          course: string
          created_at: string
          id: string
          person_name: string
          recorded_by: string
          site_id: string
          trained_on: string
        }
        Insert: {
          certificate_path?: string | null
          course: string
          created_at?: string
          id?: string
          person_name: string
          recorded_by: string
          site_id: string
          trained_on: string
        }
        Update: {
          certificate_path?: string | null
          course?: string
          created_at?: string
          id?: string
          person_name?: string
          recorded_by?: string
          site_id?: string
          trained_on?: string
        }
        Relationships: [
          {
            foreignKeyName: "training_records_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "training_records_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "training_records_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "v_site_compliance_today"
            referencedColumns: ["site_id"]
          },
        ]
      }
    }
    Views: {
      v_expiring_batches: {
        Row: {
          created_at: string | null
          expiry_date: string | null
          expiry_kind: Database["public"]["Enums"]["batch_expiry_kind"] | null
          goods_receipt_id: string | null
          id: string | null
          label_printed: boolean | null
          lot_code: string | null
          origin: Database["public"]["Enums"]["batch_origin"] | null
          parent_batch_ids: string[] | null
          product_id: string | null
          product_name: string | null
          quantity: number | null
          remaining: number | null
          site_id: string | null
          status: Database["public"]["Enums"]["batch_status"] | null
          storage_type: Database["public"]["Enums"]["storage_type"] | null
          unit: string | null
          updated_at: string | null
        }
        Relationships: [
          {
            foreignKeyName: "batches_goods_receipt_id_fkey"
            columns: ["goods_receipt_id"]
            isOneToOne: false
            referencedRelation: "goods_receipts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "batches_goods_receipt_id_fkey"
            columns: ["goods_receipt_id"]
            isOneToOne: false
            referencedRelation: "v_traceability_lookup"
            referencedColumns: ["goods_receipt_id"]
          },
          {
            foreignKeyName: "batches_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "batches_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "v_traceability_lookup"
            referencedColumns: ["product_id"]
          },
          {
            foreignKeyName: "batches_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "batches_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "v_site_compliance_today"
            referencedColumns: ["site_id"]
          },
        ]
      }
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
      v_traceability_lookup: {
        Row: {
          allergens: string[] | null
          batch_created_at: string | null
          batch_id: string | null
          expiry_date: string | null
          goods_receipt_id: string | null
          invoice_date: string | null
          invoice_id: string | null
          invoice_number: string | null
          lot_code: string | null
          origin: Database["public"]["Enums"]["batch_origin"] | null
          parent_batch_ids: string[] | null
          product_id: string | null
          product_name: string | null
          quantity: number | null
          received_at: string | null
          remaining: number | null
          site_id: string | null
          status: Database["public"]["Enums"]["batch_status"] | null
          supplier_cvr: string | null
          supplier_id: string | null
          supplier_name: string | null
          unit: string | null
        }
        Relationships: [
          {
            foreignKeyName: "batches_site_id_fkey"
            columns: ["site_id"]
            isOneToOne: false
            referencedRelation: "sites"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "batches_site_id_fkey"
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
      resolve_inspector_link: {
        Args: { p_token: string }
        Returns: {
          expires_at: string
          site_id: string
          site_name: string
        }[]
      }
      set_member_pin: {
        Args: { p_membership_id: string; p_pin_hash: string }
        Returns: undefined
      }
      site_has_manager_pin: { Args: { p_site_id: string }; Returns: boolean }
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
      batch_expiry_kind: "use_by" | "best_before" | "internal"
      batch_origin: "received" | "produced" | "leftover"
      batch_status: "active" | "finished" | "discarded" | "recalled"
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
      invoice_kind: "invoice" | "delivery_note" | "credit_note" | "receipt"
      invoice_status:
        | "uploaded"
        | "extracting"
        | "needs_review"
        | "confirmed"
        | "failed"
      move_kind:
        | "receive"
        | "use"
        | "waste"
        | "leftover_in"
        | "transfer_out"
        | "sale_b2b"
        | "correction"
      org_role:
        | "org_owner"
        | "org_admin"
        | "consultant"
        | "site_manager"
        | "operator"
      platform_role: "platform_admin" | "platform_support"
      product_category:
        | "meat"
        | "fish"
        | "dairy"
        | "produce"
        | "dry"
        | "frozen"
        | "beverage"
        | "bakery"
        | "packaging"
        | "nonfood"
        | "other"
      proposal_status: "pending" | "applied" | "rejected"
      ra_import_kind: "photo_set" | "pdf" | "docx" | "xlsx" | "paper_scan"
      ra_import_status:
        | "uploaded"
        | "extracting"
        | "mapped"
        | "needs_review"
        | "confirmed"
        | "failed"
      ra_status: "draft" | "in_review" | "approved" | "superseded"
      review_status: "open" | "resolved" | "dismissed"
      review_trigger:
        | "pack_update"
        | "repeated_deviation"
        | "activity_change"
        | "annual"
      site_document_kind:
        | "pest_control"
        | "training_certificate"
        | "water_test"
        | "smiley_report"
        | "other"
      site_status: "active" | "paused" | "archived"
      storage_type: "fridge" | "freezer" | "dry" | "ambient"
      task_status: "pending" | "done" | "missed" | "skipped_justified"
      waste_reason:
        | "expired"
        | "dropped"
        | "overproduction"
        | "deviation"
        | "other"
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
      batch_expiry_kind: ["use_by", "best_before", "internal"],
      batch_origin: ["received", "produced", "leftover"],
      batch_status: ["active", "finished", "discarded", "recalled"],
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
      invoice_kind: ["invoice", "delivery_note", "credit_note", "receipt"],
      invoice_status: [
        "uploaded",
        "extracting",
        "needs_review",
        "confirmed",
        "failed",
      ],
      move_kind: [
        "receive",
        "use",
        "waste",
        "leftover_in",
        "transfer_out",
        "sale_b2b",
        "correction",
      ],
      org_role: [
        "org_owner",
        "org_admin",
        "consultant",
        "site_manager",
        "operator",
      ],
      platform_role: ["platform_admin", "platform_support"],
      product_category: [
        "meat",
        "fish",
        "dairy",
        "produce",
        "dry",
        "frozen",
        "beverage",
        "bakery",
        "packaging",
        "nonfood",
        "other",
      ],
      proposal_status: ["pending", "applied", "rejected"],
      ra_import_kind: ["photo_set", "pdf", "docx", "xlsx", "paper_scan"],
      ra_import_status: [
        "uploaded",
        "extracting",
        "mapped",
        "needs_review",
        "confirmed",
        "failed",
      ],
      ra_status: ["draft", "in_review", "approved", "superseded"],
      review_status: ["open", "resolved", "dismissed"],
      review_trigger: [
        "pack_update",
        "repeated_deviation",
        "activity_change",
        "annual",
      ],
      site_document_kind: [
        "pest_control",
        "training_certificate",
        "water_test",
        "smiley_report",
        "other",
      ],
      site_status: ["active", "paused", "archived"],
      storage_type: ["fridge", "freezer", "dry", "ambient"],
      task_status: ["pending", "done", "missed", "skipped_justified"],
      waste_reason: [
        "expired",
        "dropped",
        "overproduction",
        "deviation",
        "other",
      ],
    },
  },
} as const

