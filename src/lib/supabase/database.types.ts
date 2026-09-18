// GERADO pelo Supabase a partir do banco. Não edite à mão.
//
// Regenere no mesmo commit de toda migration (ver supabase/migrations/README.md).
// Coluna renomeada no banco vira erro de compilação aqui, em vez de tela vazia.

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      activities: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          occurred_at: string
          opportunity_id: string | null
          organization_id: string
          person_id: string
          type: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          occurred_at?: string
          opportunity_id?: string | null
          organization_id: string
          person_id: string
          type: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          occurred_at?: string
          opportunity_id?: string | null
          organization_id?: string
          person_id?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "activities_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_person_same_org"
            columns: ["person_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      document_files: {
        Row: {
          file_name: string
          id: string
          mime_type: string | null
          organization_id: string
          project_document_id: string
          project_id: string
          rejection_reason: string | null
          review_status: string
          reviewed_at: string | null
          reviewed_by: string | null
          size_bytes: number | null
          storage_path: string
          uploaded_at: string
          uploaded_by: string | null
        }
        Insert: {
          file_name: string
          id?: string
          mime_type?: string | null
          organization_id: string
          project_document_id: string
          project_id: string
          rejection_reason?: string | null
          review_status?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          size_bytes?: number | null
          storage_path: string
          uploaded_at?: string
          uploaded_by?: string | null
        }
        Update: {
          file_name?: string
          id?: string
          mime_type?: string | null
          organization_id?: string
          project_document_id?: string
          project_id?: string
          rejection_reason?: string | null
          review_status?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          size_bytes?: number | null
          storage_path?: string
          uploaded_at?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "document_files_folder_same_project"
            columns: ["project_document_id", "project_id"]
            isOneToOne: false
            referencedRelation: "project_documents"
            referencedColumns: ["id", "project_id"]
          },
          {
            foreignKeyName: "document_files_project_same_org"
            columns: ["project_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "document_files_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_files_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      document_types: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          organization_id: string
          parent_id: string | null
          position: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          organization_id: string
          parent_id?: string | null
          position?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          organization_id?: string
          parent_id?: string | null
          position?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "document_types_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "document_types_parent_same_org"
            columns: ["parent_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "document_types"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      files: {
        Row: {
          bucket: string
          created_at: string
          filename: string
          id: string
          mime_type: string | null
          opportunity_id: string | null
          organization_id: string
          path: string
          person_id: string
          size_bytes: number | null
          uploaded_by: string | null
        }
        Insert: {
          bucket: string
          created_at?: string
          filename: string
          id?: string
          mime_type?: string | null
          opportunity_id?: string | null
          organization_id: string
          path: string
          person_id: string
          size_bytes?: number | null
          uploaded_by?: string | null
        }
        Update: {
          bucket?: string
          created_at?: string
          filename?: string
          id?: string
          mime_type?: string | null
          opportunity_id?: string | null
          organization_id?: string
          path?: string
          person_id?: string
          size_bytes?: number | null
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "files_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "files_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "files_person_same_org"
            columns: ["person_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "files_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notes: {
        Row: {
          body: string
          created_at: string
          created_by: string | null
          id: string
          opportunity_id: string | null
          organization_id: string
          person_id: string
          updated_at: string
        }
        Insert: {
          body: string
          created_at?: string
          created_by?: string | null
          id?: string
          opportunity_id?: string | null
          organization_id: string
          person_id: string
          updated_at?: string
        }
        Update: {
          body?: string
          created_at?: string
          created_by?: string | null
          id?: string
          opportunity_id?: string | null
          organization_id?: string
          person_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "notes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notes_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notes_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notes_person_same_org"
            columns: ["person_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      opportunities: {
        Row: {
          closed_at: string | null
          created_at: string
          created_by: string | null
          currency: string
          expected_close_date: string | null
          id: string
          lost_reason: string | null
          organization_id: string
          owner_id: string | null
          person_id: string
          pipeline_id: string
          probability: number | null
          source: string | null
          stage_id: string
          status: Database["public"]["Enums"]["opportunity_status"]
          title: string
          updated_at: string
          value: number | null
        }
        Insert: {
          closed_at?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          expected_close_date?: string | null
          id?: string
          lost_reason?: string | null
          organization_id: string
          owner_id?: string | null
          person_id: string
          pipeline_id: string
          probability?: number | null
          source?: string | null
          stage_id: string
          status?: Database["public"]["Enums"]["opportunity_status"]
          title: string
          updated_at?: string
          value?: number | null
        }
        Update: {
          closed_at?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          expected_close_date?: string | null
          id?: string
          lost_reason?: string | null
          organization_id?: string
          owner_id?: string | null
          person_id?: string
          pipeline_id?: string
          probability?: number | null
          source?: string | null
          stage_id?: string
          status?: Database["public"]["Enums"]["opportunity_status"]
          title?: string
          updated_at?: string
          value?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "opportunities_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunities_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunities_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunities_person_same_org"
            columns: ["person_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "opportunities_pipeline_same_org"
            columns: ["pipeline_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "pipelines"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "opportunities_stage_same_pipeline"
            columns: ["stage_id", "pipeline_id"]
            isOneToOne: false
            referencedRelation: "pipeline_stages"
            referencedColumns: ["id", "pipeline_id"]
          },
        ]
      }
      opportunity_products: {
        Row: {
          created_at: string
          currency: string
          id: string
          opportunity_id: string
          product_id: string
          quantity: number
          unit_price: number
        }
        Insert: {
          created_at?: string
          currency?: string
          id?: string
          opportunity_id: string
          product_id: string
          quantity?: number
          unit_price: number
        }
        Update: {
          created_at?: string
          currency?: string
          id?: string
          opportunity_id?: string
          product_id?: string
          quantity?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "opportunity_products_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunity_products_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_members: {
        Row: {
          created_at: string
          id: string
          organization_id: string
          role: Database["public"]["Enums"]["member_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          organization_id: string
          role?: Database["public"]["Enums"]["member_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          organization_id?: string
          role?: Database["public"]["Enums"]["member_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_members_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "organization_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          created_at: string
          email: string | null
          id: string
          legal_name: string | null
          logo_url: string | null
          name: string
          phone: string | null
          primary_color: string | null
          secondary_color: string | null
          slug: string
          tax_id: string | null
          type: Database["public"]["Enums"]["organization_type"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          id?: string
          legal_name?: string | null
          logo_url?: string | null
          name: string
          phone?: string | null
          primary_color?: string | null
          secondary_color?: string | null
          slug: string
          tax_id?: string | null
          type?: Database["public"]["Enums"]["organization_type"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          legal_name?: string | null
          logo_url?: string | null
          name?: string
          phone?: string | null
          primary_color?: string | null
          secondary_color?: string | null
          slug?: string
          tax_id?: string | null
          type?: Database["public"]["Enums"]["organization_type"]
          updated_at?: string
        }
        Relationships: []
      }
      people: {
        Row: {
          address_city: string | null
          address_complement: string | null
          address_country: string | null
          address_district: string | null
          address_number: string | null
          address_postal_code: string | null
          address_state: string | null
          address_street: string | null
          assigned_organization_id: string | null
          birth_date: string | null
          birthplace: string | null
          company: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          email: string | null
          extra_phones: Json
          full_name: string
          gender: string | null
          id: string
          job_title: string | null
          legacy_id: string | null
          lifecycle_stage: Database["public"]["Enums"]["person_lifecycle_stage"]
          marital_status: string | null
          national_id: string | null
          national_id_issuer: string | null
          nationality: string | null
          notes: string | null
          organization_id: string
          phone: string | null
          phone_country_code: string | null
          tax_id: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          address_city?: string | null
          address_complement?: string | null
          address_country?: string | null
          address_district?: string | null
          address_number?: string | null
          address_postal_code?: string | null
          address_state?: string | null
          address_street?: string | null
          assigned_organization_id?: string | null
          birth_date?: string | null
          birthplace?: string | null
          company?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          email?: string | null
          extra_phones?: Json
          full_name: string
          gender?: string | null
          id?: string
          job_title?: string | null
          legacy_id?: string | null
          lifecycle_stage?: Database["public"]["Enums"]["person_lifecycle_stage"]
          marital_status?: string | null
          national_id?: string | null
          national_id_issuer?: string | null
          nationality?: string | null
          notes?: string | null
          organization_id: string
          phone?: string | null
          phone_country_code?: string | null
          tax_id?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          address_city?: string | null
          address_complement?: string | null
          address_country?: string | null
          address_district?: string | null
          address_number?: string | null
          address_postal_code?: string | null
          address_state?: string | null
          address_street?: string | null
          assigned_organization_id?: string | null
          birth_date?: string | null
          birthplace?: string | null
          company?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          email?: string | null
          extra_phones?: Json
          full_name?: string
          gender?: string | null
          id?: string
          job_title?: string | null
          legacy_id?: string | null
          lifecycle_stage?: Database["public"]["Enums"]["person_lifecycle_stage"]
          marital_status?: string | null
          national_id?: string | null
          national_id_issuer?: string | null
          nationality?: string | null
          notes?: string | null
          organization_id?: string
          phone?: string | null
          phone_country_code?: string | null
          tax_id?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "people_assigned_organization_id_fkey"
            columns: ["assigned_organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "people_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "people_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "people_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      person_tags: {
        Row: {
          created_at: string
          organization_id: string
          person_id: string
          tag_id: string
        }
        Insert: {
          created_at?: string
          organization_id: string
          person_id: string
          tag_id: string
        }
        Update: {
          created_at?: string
          organization_id?: string
          person_id?: string
          tag_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "person_tags_person_same_org"
            columns: ["person_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "person_tags_tag_same_org"
            columns: ["tag_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      pipeline_stages: {
        Row: {
          created_at: string
          id: string
          is_lost: boolean
          is_won: boolean
          name: string
          pipeline_id: string
          position: number
          probability: number | null
        }
        Insert: {
          created_at?: string
          id?: string
          is_lost?: boolean
          is_won?: boolean
          name: string
          pipeline_id: string
          position?: number
          probability?: number | null
        }
        Update: {
          created_at?: string
          id?: string
          is_lost?: boolean
          is_won?: boolean
          name?: string
          pipeline_id?: string
          position?: number
          probability?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "pipeline_stages_pipeline_id_fkey"
            columns: ["pipeline_id"]
            isOneToOne: false
            referencedRelation: "pipelines"
            referencedColumns: ["id"]
          },
        ]
      }
      pipelines: {
        Row: {
          created_at: string
          id: string
          is_default: boolean
          name: string
          organization_id: string
          position: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_default?: boolean
          name: string
          organization_id: string
          position?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_default?: boolean
          name?: string
          organization_id?: string
          position?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pipelines_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          created_at: string
          currency: string
          default_price: number | null
          description: string | null
          id: string
          is_active: boolean
          name: string
          organization_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          currency?: string
          default_price?: number | null
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          organization_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          currency?: string
          default_price?: number | null
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          organization_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_organization_id_fkey"
            columns: ["organization_id"]
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
          email: string
          full_name: string | null
          id: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email: string
          full_name?: string | null
          id: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string
          full_name?: string | null
          id?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      project_documents: {
        Row: {
          created_at: string
          deadline_on: string | null
          id: string
          is_required: boolean
          name: string
          organization_id: string
          parent_id: string | null
          position: number
          project_id: string
          resolved_at: string | null
          resolved_by: string | null
          source_document_type_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          deadline_on?: string | null
          id?: string
          is_required?: boolean
          name: string
          organization_id: string
          parent_id?: string | null
          position?: number
          project_id: string
          resolved_at?: string | null
          resolved_by?: string | null
          source_document_type_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          deadline_on?: string | null
          id?: string
          is_required?: boolean
          name?: string
          organization_id?: string
          parent_id?: string | null
          position?: number
          project_id?: string
          resolved_at?: string | null
          resolved_by?: string | null
          source_document_type_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_documents_parent_same_project"
            columns: ["parent_id", "project_id"]
            isOneToOne: false
            referencedRelation: "project_documents"
            referencedColumns: ["id", "project_id"]
          },
          {
            foreignKeyName: "project_documents_project_same_org"
            columns: ["project_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "project_documents_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_documents_source_document_type_id_fkey"
            columns: ["source_document_type_id"]
            isOneToOne: false
            referencedRelation: "document_types"
            referencedColumns: ["id"]
          },
        ]
      }
      project_stages: {
        Row: {
          completed_on: string | null
          created_at: string
          estimated_days: number | null
          id: string
          is_required: boolean
          name: string
          organization_id: string
          parent_id: string | null
          position: number
          project_id: string
          source_stage_id: string | null
          started_on: string | null
          status_id: string
          updated_at: string
        }
        Insert: {
          completed_on?: string | null
          created_at?: string
          estimated_days?: number | null
          id?: string
          is_required?: boolean
          name: string
          organization_id: string
          parent_id?: string | null
          position?: number
          project_id: string
          source_stage_id?: string | null
          started_on?: string | null
          status_id: string
          updated_at?: string
        }
        Update: {
          completed_on?: string | null
          created_at?: string
          estimated_days?: number | null
          id?: string
          is_required?: boolean
          name?: string
          organization_id?: string
          parent_id?: string | null
          position?: number
          project_id?: string
          source_stage_id?: string | null
          started_on?: string | null
          status_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_stages_parent_same_project"
            columns: ["parent_id", "project_id"]
            isOneToOne: false
            referencedRelation: "project_stages"
            referencedColumns: ["id", "project_id"]
          },
          {
            foreignKeyName: "project_stages_project_same_org"
            columns: ["project_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "project_stages_source_stage_id_fkey"
            columns: ["source_stage_id"]
            isOneToOne: false
            referencedRelation: "visa_stages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_stages_status_same_org"
            columns: ["status_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "stage_statuses"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      projects: {
        Row: {
          created_at: string
          created_by: string | null
          decided_on: string | null
          expected_on: string | null
          filed_on: string | null
          id: string
          opportunity_id: string | null
          organization_id: string
          person_id: string
          priority_date: string | null
          rfe_due_on: string | null
          rfe_received_on: string | null
          started_on: string
          status: string
          title: string
          updated_at: string
          uscis_receipt_number: string | null
          visa_type_id: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          decided_on?: string | null
          expected_on?: string | null
          filed_on?: string | null
          id?: string
          opportunity_id?: string | null
          organization_id: string
          person_id: string
          priority_date?: string | null
          rfe_due_on?: string | null
          rfe_received_on?: string | null
          started_on?: string
          status?: string
          title: string
          updated_at?: string
          uscis_receipt_number?: string | null
          visa_type_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          decided_on?: string | null
          expected_on?: string | null
          filed_on?: string | null
          id?: string
          opportunity_id?: string | null
          organization_id?: string
          person_id?: string
          priority_date?: string | null
          rfe_due_on?: string | null
          rfe_received_on?: string | null
          started_on?: string
          status?: string
          title?: string
          updated_at?: string
          uscis_receipt_number?: string | null
          visa_type_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "projects_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_opportunity_same_org"
            columns: ["opportunity_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "projects_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_person_same_org"
            columns: ["person_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "people"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "projects_visa_same_org"
            columns: ["visa_type_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "visa_types"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      stage_statuses: {
        Row: {
          code: string
          color: string | null
          created_at: string
          id: string
          is_default: boolean
          is_done: boolean
          is_system: boolean
          label: string
          organization_id: string
          position: number
          updated_at: string
        }
        Insert: {
          code: string
          color?: string | null
          created_at?: string
          id?: string
          is_default?: boolean
          is_done?: boolean
          is_system?: boolean
          label: string
          organization_id: string
          position?: number
          updated_at?: string
        }
        Update: {
          code?: string
          color?: string | null
          created_at?: string
          id?: string
          is_default?: boolean
          is_done?: boolean
          is_system?: boolean
          label?: string
          organization_id?: string
          position?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "stage_statuses_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      tags: {
        Row: {
          color: string | null
          created_at: string
          id: string
          name: string
          organization_id: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          id?: string
          name: string
          organization_id: string
        }
        Update: {
          color?: string | null
          created_at?: string
          id?: string
          name?: string
          organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tags_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      visa_stages: {
        Row: {
          created_at: string
          description: string | null
          estimated_days: number | null
          id: string
          is_required: boolean
          name: string
          parent_id: string | null
          position: number
          updated_at: string
          visa_type_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          estimated_days?: number | null
          id?: string
          is_required?: boolean
          name: string
          parent_id?: string | null
          position?: number
          updated_at?: string
          visa_type_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          estimated_days?: number | null
          id?: string
          is_required?: boolean
          name?: string
          parent_id?: string | null
          position?: number
          updated_at?: string
          visa_type_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "visa_stages_parent_same_type"
            columns: ["parent_id", "visa_type_id"]
            isOneToOne: false
            referencedRelation: "visa_stages"
            referencedColumns: ["id", "visa_type_id"]
          },
          {
            foreignKeyName: "visa_stages_visa_type_id_fkey"
            columns: ["visa_type_id"]
            isOneToOne: false
            referencedRelation: "visa_types"
            referencedColumns: ["id"]
          },
        ]
      }
      visa_type_documents: {
        Row: {
          created_at: string
          deadline_days: number | null
          document_type_id: string
          id: string
          is_required: boolean
          organization_id: string
          position: number
          visa_type_id: string
        }
        Insert: {
          created_at?: string
          deadline_days?: number | null
          document_type_id: string
          id?: string
          is_required?: boolean
          organization_id: string
          position?: number
          visa_type_id: string
        }
        Update: {
          created_at?: string
          deadline_days?: number | null
          document_type_id?: string
          id?: string
          is_required?: boolean
          organization_id?: string
          position?: number
          visa_type_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "visa_type_documents_doc_same_org"
            columns: ["document_type_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "document_types"
            referencedColumns: ["id", "organization_id"]
          },
          {
            foreignKeyName: "visa_type_documents_visa_same_org"
            columns: ["visa_type_id", "organization_id"]
            isOneToOne: false
            referencedRelation: "visa_types"
            referencedColumns: ["id", "organization_id"]
          },
        ]
      }
      visa_types: {
        Row: {
          base_price: number | null
          created_at: string
          currency: string
          description: string | null
          estimated_days: number | null
          id: string
          is_active: boolean
          name: string
          organization_id: string
          position: number
          updated_at: string
        }
        Insert: {
          base_price?: number | null
          created_at?: string
          currency?: string
          description?: string | null
          estimated_days?: number | null
          id?: string
          is_active?: boolean
          name: string
          organization_id: string
          position?: number
          updated_at?: string
        }
        Update: {
          base_price?: number | null
          created_at?: string
          currency?: string
          description?: string | null
          estimated_days?: number | null
          id?: string
          is_active?: boolean
          name?: string
          organization_id?: string
          position?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "visa_types_organization_id_fkey"
            columns: ["organization_id"]
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
      criar_processo: {
        Args: {
          p_opportunity?: string
          p_person: string
          p_title: string
          p_visa_type: string
        }
        Returns: string
      }
      set_default_stage_status: { Args: { p_id: string }; Returns: undefined }
      swap_positions: {
        Args: { p_a: string; p_b: string; p_tabela: string }
        Returns: undefined
      }
    }
    Enums: {
      member_role: "owner" | "admin" | "staff"
      opportunity_status: "open" | "won" | "lost"
      organization_type: "root" | "partner"
      person_lifecycle_stage: "contact" | "opportunity" | "client"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      member_role: ["owner", "admin", "staff"],
      opportunity_status: ["open", "won", "lost"],
      organization_type: ["root", "partner"],
      person_lifecycle_stage: ["contact", "opportunity", "client"],
    },
  },
} as const
