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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      activities: {
        Row: {
          action: string
          actor_id: string
          created_at: string
          emergency: boolean | null
          entity: string
          entity_id: string | null
          id: string
          metadata: Json | null
          subject: string
          tenant_id: string
        }
        Insert: {
          action: string
          actor_id: string
          created_at?: string
          emergency?: boolean | null
          entity: string
          entity_id?: string | null
          id?: string
          metadata?: Json | null
          subject: string
          tenant_id: string
        }
        Update: {
          action?: string
          actor_id?: string
          created_at?: string
          emergency?: boolean | null
          entity?: string
          entity_id?: string | null
          id?: string
          metadata?: Json | null
          subject?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "activities_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      approval_requests: {
        Row: {
          applied_at: string | null
          batch_number: string | null
          branch_id: string | null
          created_at: string
          emergency: boolean | null
          emergency_reason: string | null
          expiry_date: string | null
          id: string
          member_data: Json | null
          note: string | null
          product_id: string | null
          quantity: number | null
          rejection_reason: string | null
          requested_at: string
          requested_by: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          tenant_id: string
          type: string
          updated_at: string
        }
        Insert: {
          applied_at?: string | null
          batch_number?: string | null
          branch_id?: string | null
          created_at?: string
          emergency?: boolean | null
          emergency_reason?: string | null
          expiry_date?: string | null
          id?: string
          member_data?: Json | null
          note?: string | null
          product_id?: string | null
          quantity?: number | null
          rejection_reason?: string | null
          requested_at: string
          requested_by: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          tenant_id: string
          type: string
          updated_at?: string
        }
        Update: {
          applied_at?: string | null
          batch_number?: string | null
          branch_id?: string | null
          created_at?: string
          emergency?: boolean | null
          emergency_reason?: string | null
          expiry_date?: string | null
          id?: string
          member_data?: Json | null
          note?: string | null
          product_id?: string | null
          quantity?: number | null
          rejection_reason?: string | null
          requested_at?: string
          requested_by?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          tenant_id?: string
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "approval_requests_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approval_requests_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approval_requests_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approval_requests_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approval_requests_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      branches: {
        Row: {
          address: string
          code: string
          created_at: string
          email: string
          id: string
          location: string
          manager_id: string | null
          name: string
          phone: string
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          address: string
          code: string
          created_at?: string
          email: string
          id?: string
          location: string
          manager_id?: string | null
          name: string
          phone: string
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          address?: string
          code?: string
          created_at?: string
          email?: string
          id?: string
          location?: string
          manager_id?: string | null
          name?: string
          phone?: string
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "branches_manager_fkey"
            columns: ["manager_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "branches_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_payments: {
        Row: {
          acknowledged_at: string | null
          acknowledged_by: string | null
          amount: number
          branch_id: string
          confirmed_at: string | null
          confirmed_by: string | null
          created_at: string
          customer_id: string
          decline_reason: string | null
          declined_at: string | null
          declined_by: string | null
          id: string
          manager_id: string
          method: string
          note: string | null
          order_id: string | null
          payment_date: string
          proof_name: string | null
          received_by: string
          reference: string | null
          status: string
          submitted_at: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          amount: number
          branch_id: string
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          customer_id: string
          decline_reason?: string | null
          declined_at?: string | null
          declined_by?: string | null
          id?: string
          manager_id: string
          method: string
          note?: string | null
          order_id?: string | null
          payment_date: string
          proof_name?: string | null
          received_by: string
          reference?: string | null
          status?: string
          submitted_at: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          amount?: number
          branch_id?: string
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          customer_id?: string
          decline_reason?: string | null
          declined_at?: string | null
          declined_by?: string | null
          id?: string
          manager_id?: string
          method?: string
          note?: string | null
          order_id?: string | null
          payment_date?: string
          proof_name?: string | null
          received_by?: string
          reference?: string | null
          status?: string
          submitted_at?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_payments_acknowledged_by_fkey"
            columns: ["acknowledged_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_payments_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_payments_confirmed_by_fkey"
            columns: ["confirmed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_payments_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_payments_declined_by_fkey"
            columns: ["declined_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_payments_manager_id_fkey"
            columns: ["manager_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_payments_received_by_fkey"
            columns: ["received_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_payments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          address: string
          branch_id: string | null
          contact_person: string
          created_at: string
          created_by: string
          credit_limit: number | null
          email: string | null
          id: string
          name: string
          phone: string
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          address: string
          branch_id?: string | null
          contact_person: string
          created_at?: string
          created_by: string
          credit_limit?: number | null
          email?: string | null
          id?: string
          name: string
          phone: string
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          address?: string
          branch_id?: string | null
          contact_person?: string
          created_at?: string
          created_by?: string
          credit_limit?: number | null
          email?: string | null
          id?: string
          name?: string
          phone?: string
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customers_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customers_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customers_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      expenses: {
        Row: {
          amount: number
          branch_id: string | null
          category: string
          created_at: string
          description: string
          expense_date: string
          id: string
          manager_id: string | null
          note: string | null
          owner_id: string | null
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          amount: number
          branch_id?: string | null
          category: string
          created_at?: string
          description: string
          expense_date: string
          id: string
          manager_id?: string | null
          note?: string | null
          owner_id?: string | null
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          amount?: number
          branch_id?: string | null
          category?: string
          created_at?: string
          description?: string
          expense_date?: string
          id?: string
          manager_id?: string | null
          note?: string | null
          owner_id?: string | null
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "expenses_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_manager_id_fkey"
            columns: ["manager_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_movements: {
        Row: {
          branch_id: string
          created_at: string
          id: string
          note: string | null
          performed_by: string
          product_id: string
          quantity: number
          reference_id: string | null
          reference_type: string | null
          tenant_id: string
          type: string
        }
        Insert: {
          branch_id: string
          created_at?: string
          id?: string
          note?: string | null
          performed_by: string
          product_id: string
          quantity: number
          reference_id?: string | null
          reference_type?: string | null
          tenant_id: string
          type: string
        }
        Update: {
          branch_id?: string
          created_at?: string
          id?: string
          note?: string | null
          performed_by?: string
          product_id?: string
          quantity?: number
          reference_id?: string | null
          reference_type?: string | null
          tenant_id?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_movements_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_movements_performed_by_fkey"
            columns: ["performed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_movements_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_movements_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_records: {
        Row: {
          branch_id: string
          id: string
          last_updated: string
          low_stock_threshold: number
          product_id: string
          quantity_on_hand: number
          quantity_reserved: number
          reorder_level: number
          tenant_id: string
        }
        Insert: {
          branch_id: string
          id?: string
          last_updated?: string
          low_stock_threshold?: number
          product_id: string
          quantity_on_hand?: number
          quantity_reserved?: number
          reorder_level?: number
          tenant_id: string
        }
        Update: {
          branch_id?: string
          id?: string
          last_updated?: string
          low_stock_threshold?: number
          product_id?: string
          quantity_on_hand?: number
          quantity_reserved?: number
          reorder_level?: number
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_records_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_records_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_records_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      manager_remittances: {
        Row: {
          branch_id: string
          cash_amount: number
          confirmed_at: string | null
          confirmed_by: string | null
          created_at: string
          decline_reason: string | null
          declined_at: string | null
          declined_by: string | null
          expense_amount: number
          expense_ids: Json
          id: string
          manager_id: string
          net_remittance_due: number
          note: string | null
          outstanding_amount: number
          payment_ids: Json
          period: string
          status: string
          submitted_at: string | null
          tenant_id: string
          total_received: number
          transfer_amount: number
          transfer_reference: string | null
          updated_at: string
        }
        Insert: {
          branch_id: string
          cash_amount?: number
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          decline_reason?: string | null
          declined_at?: string | null
          declined_by?: string | null
          expense_amount: number
          expense_ids?: Json
          id?: string
          manager_id: string
          net_remittance_due: number
          note?: string | null
          outstanding_amount?: number
          payment_ids?: Json
          period: string
          status?: string
          submitted_at?: string | null
          tenant_id: string
          total_received: number
          transfer_amount?: number
          transfer_reference?: string | null
          updated_at?: string
        }
        Update: {
          branch_id?: string
          cash_amount?: number
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          decline_reason?: string | null
          declined_at?: string | null
          declined_by?: string | null
          expense_amount?: number
          expense_ids?: Json
          id?: string
          manager_id?: string
          net_remittance_due?: number
          note?: string | null
          outstanding_amount?: number
          payment_ids?: Json
          period?: string
          status?: string
          submitted_at?: string | null
          tenant_id?: string
          total_received?: number
          transfer_amount?: number
          transfer_reference?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "manager_remittances_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "manager_remittances_confirmed_by_fkey"
            columns: ["confirmed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "manager_remittances_declined_by_fkey"
            columns: ["declined_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "manager_remittances_manager_id_fkey"
            columns: ["manager_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "manager_remittances_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          created_at: string
          entity_id: string
          entity_type: string
          id: string
          message: string
          read_at: string | null
          recipient_id: string
          tenant_id: string
          type: string
        }
        Insert: {
          created_at?: string
          entity_id: string
          entity_type: string
          id?: string
          message: string
          read_at?: string | null
          recipient_id: string
          tenant_id: string
          type: string
        }
        Update: {
          created_at?: string
          entity_id?: string
          entity_type?: string
          id?: string
          message?: string
          read_at?: string | null
          recipient_id?: string
          tenant_id?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      onboarding_files: {
        Row: {
          cloudinary_public_id: string
          cloudinary_url: string
          file_name: string
          file_size: number
          file_type: string
          id: string
          mime_type: string
          onboarding_id: string
          uploaded_at: string
        }
        Insert: {
          cloudinary_public_id: string
          cloudinary_url: string
          file_name: string
          file_size: number
          file_type: string
          id?: string
          mime_type: string
          onboarding_id: string
          uploaded_at?: string
        }
        Update: {
          cloudinary_public_id?: string
          cloudinary_url?: string
          file_name?: string
          file_size?: number
          file_type?: string
          id?: string
          mime_type?: string
          onboarding_id?: string
          uploaded_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "onboarding_files_onboarding_id_fkey"
            columns: ["onboarding_id"]
            isOneToOne: false
            referencedRelation: "onboardings"
            referencedColumns: ["id"]
          },
        ]
      }
      onboardings: {
        Row: {
          activated_at: string | null
          assigned_branch_id: string | null
          assigned_role: string | null
          correction_note: string | null
          created_at: string
          created_by: string | null
          data: Json
          department: string
          employee_id: string
          guarantor_decided_at: string | null
          guarantor_decision: string | null
          guarantor_decision_reason: string | null
          guarantor_response: Json | null
          guarantor_status: string
          guarantor_token: string | null
          id: string
          job_title: string
          rejection_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          start_date: string
          status: string
          step: number
          submitted_at: string | null
          submitter_email: string | null
          tenant_id: string
          token_expires_at: string
          token_hash: string
          token_revoked: boolean
          updated_at: string
          used_at: string | null
          user_id: string | null
        }
        Insert: {
          activated_at?: string | null
          assigned_branch_id?: string | null
          assigned_role?: string | null
          correction_note?: string | null
          created_at?: string
          created_by?: string | null
          data?: Json
          department: string
          employee_id: string
          guarantor_decided_at?: string | null
          guarantor_decision?: string | null
          guarantor_decision_reason?: string | null
          guarantor_response?: Json | null
          guarantor_status?: string
          guarantor_token?: string | null
          id?: string
          job_title: string
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          start_date: string
          status?: string
          step?: number
          submitted_at?: string | null
          submitter_email?: string | null
          tenant_id: string
          token_expires_at: string
          token_hash: string
          token_revoked?: boolean
          updated_at?: string
          used_at?: string | null
          user_id?: string | null
        }
        Update: {
          activated_at?: string | null
          assigned_branch_id?: string | null
          assigned_role?: string | null
          correction_note?: string | null
          created_at?: string
          created_by?: string | null
          data?: Json
          department?: string
          employee_id?: string
          guarantor_decided_at?: string | null
          guarantor_decision?: string | null
          guarantor_decision_reason?: string | null
          guarantor_response?: Json | null
          guarantor_status?: string
          guarantor_token?: string | null
          id?: string
          job_title?: string
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          start_date?: string
          status?: string
          step?: number
          submitted_at?: string | null
          submitter_email?: string | null
          tenant_id?: string
          token_expires_at?: string
          token_hash?: string
          token_revoked?: boolean
          updated_at?: string
          used_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "onboardings_assigned_branch_id_fkey"
            columns: ["assigned_branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "onboardings_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "onboardings_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "onboardings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "onboardings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      owner_remittances: {
        Row: {
          amount: number
          created_at: string
          created_by: string
          id: string
          note: string | null
          payee_name: string
          payee_type: string
          payment_method: string
          purpose: string
          reference: string | null
          remittance_date: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          amount: number
          created_at?: string
          created_by: string
          id: string
          note?: string | null
          payee_name: string
          payee_type: string
          payment_method: string
          purpose: string
          reference?: string | null
          remittance_date: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string
          id?: string
          note?: string | null
          payee_name?: string
          payee_type?: string
          payment_method?: string
          purpose?: string
          reference?: string | null
          remittance_date?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "owner_remittances_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "owner_remittances_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          acknowledged_at: string | null
          acknowledged_by: string | null
          branch_id: string
          cash_amount: number
          confirmed_at: string | null
          confirmed_by: string | null
          created_at: string
          decline_reason: string | null
          declined_at: string | null
          declined_by: string | null
          id: string
          manager_id: string
          note: string | null
          period: string
          proof_name: string | null
          sales_rep_id: string
          status: string
          submitted_at: string
          tenant_id: string
          transfer_amount: number
          transfer_reference: string | null
          updated_at: string
        }
        Insert: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          branch_id: string
          cash_amount?: number
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          decline_reason?: string | null
          declined_at?: string | null
          declined_by?: string | null
          id: string
          manager_id: string
          note?: string | null
          period: string
          proof_name?: string | null
          sales_rep_id: string
          status?: string
          submitted_at: string
          tenant_id: string
          transfer_amount?: number
          transfer_reference?: string | null
          updated_at?: string
        }
        Update: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          branch_id?: string
          cash_amount?: number
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          decline_reason?: string | null
          declined_at?: string | null
          declined_by?: string | null
          id?: string
          manager_id?: string
          note?: string | null
          period?: string
          proof_name?: string | null
          sales_rep_id?: string
          status?: string
          submitted_at?: string
          tenant_id?: string
          transfer_amount?: number
          transfer_reference?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_acknowledged_by_fkey"
            columns: ["acknowledged_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_confirmed_by_fkey"
            columns: ["confirmed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_declined_by_fkey"
            columns: ["declined_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_manager_id_fkey"
            columns: ["manager_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_sales_rep_id_fkey"
            columns: ["sales_rep_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          category: string
          created_at: string
          description: string | null
          id: string
          low_stock_threshold: number
          name: string
          sku: string
          status: string
          tenant_id: string
          unit: string
          unit_cost: number
          unit_price: number
          updated_at: string
        }
        Insert: {
          category: string
          created_at?: string
          description?: string | null
          id?: string
          low_stock_threshold?: number
          name: string
          sku: string
          status?: string
          tenant_id: string
          unit?: string
          unit_cost: number
          unit_price: number
          updated_at?: string
        }
        Update: {
          category?: string
          created_at?: string
          description?: string | null
          id?: string
          low_stock_threshold?: number
          name?: string
          sku?: string
          status?: string
          tenant_id?: string
          unit?: string
          unit_cost?: number
          unit_price?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      sales: {
        Row: {
          branch_id: string
          code: string
          created_at: string
          customer_id: string | null
          id: string
          order_id: string | null
          product_id: string
          quantity: number
          sale_date: string
          sales_rep_id: string
          status: string
          tenant_id: string
          unit_price: number
          updated_at: string
          walk_in_name: string | null
          walk_in_phone: string | null
        }
        Insert: {
          branch_id: string
          code: string
          created_at?: string
          customer_id?: string | null
          id?: string
          order_id?: string | null
          product_id: string
          quantity: number
          sale_date: string
          sales_rep_id: string
          status?: string
          tenant_id: string
          unit_price: number
          updated_at?: string
          walk_in_name?: string | null
          walk_in_phone?: string | null
        }
        Update: {
          branch_id?: string
          code?: string
          created_at?: string
          customer_id?: string | null
          id?: string
          order_id?: string | null
          product_id?: string
          quantity?: number
          sale_date?: string
          sales_rep_id?: string
          status?: string
          tenant_id?: string
          unit_price?: number
          updated_at?: string
          walk_in_name?: string | null
          walk_in_phone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sales_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_sales_rep_id_fkey"
            columns: ["sales_rep_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_batches: {
        Row: {
          batch_number: string
          branch_id: string
          expiry_date: string
          id: string
          product_id: string
          quantity_received: number
          quantity_remaining: number
          received_at: string
          tenant_id: string
        }
        Insert: {
          batch_number: string
          branch_id: string
          expiry_date: string
          id?: string
          product_id: string
          quantity_received: number
          quantity_remaining: number
          received_at?: string
          tenant_id: string
        }
        Update: {
          batch_number?: string
          branch_id?: string
          expiry_date?: string
          id?: string
          product_id?: string
          quantity_received?: number
          quantity_remaining?: number
          received_at?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_batches_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_batches_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_batches_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_requests: {
        Row: {
          acknowledged_at: string | null
          acknowledged_by: string | null
          approved_at: string | null
          approved_by: string | null
          batch_id: string | null
          branch_id: string
          created_at: string
          fulfilled_at: string | null
          fulfilled_by: string | null
          id: string
          note: string | null
          priority: string
          processed_by: string | null
          product_id: string
          quantity_approved: number | null
          quantity_fulfilled: number | null
          quantity_requested: number
          rejected_at: string | null
          rejection_reason: string | null
          rep_id: string
          requested_at: string
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          approved_at?: string | null
          approved_by?: string | null
          batch_id?: string | null
          branch_id: string
          created_at?: string
          fulfilled_at?: string | null
          fulfilled_by?: string | null
          id: string
          note?: string | null
          priority?: string
          processed_by?: string | null
          product_id: string
          quantity_approved?: number | null
          quantity_fulfilled?: number | null
          quantity_requested: number
          rejected_at?: string | null
          rejection_reason?: string | null
          rep_id: string
          requested_at: string
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          approved_at?: string | null
          approved_by?: string | null
          batch_id?: string | null
          branch_id?: string
          created_at?: string
          fulfilled_at?: string | null
          fulfilled_by?: string | null
          id?: string
          note?: string | null
          priority?: string
          processed_by?: string | null
          product_id?: string
          quantity_approved?: number | null
          quantity_fulfilled?: number | null
          quantity_requested?: number
          rejected_at?: string | null
          rejection_reason?: string | null
          rep_id?: string
          requested_at?: string
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_requests_acknowledged_by_fkey"
            columns: ["acknowledged_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_requests_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_requests_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_requests_fulfilled_by_fkey"
            columns: ["fulfilled_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_requests_processed_by_fkey"
            columns: ["processed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_requests_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_requests_rep_id_fkey"
            columns: ["rep_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_requests_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      targets: {
        Row: {
          amount: number
          branch_id: string
          created_at: string
          id: string
          month: string
          scope: string
          tenant_id: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          amount: number
          branch_id: string
          created_at?: string
          id?: string
          month: string
          scope: string
          tenant_id: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          amount?: number
          branch_id?: string
          created_at?: string
          id?: string
          month?: string
          scope?: string
          tenant_id?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "targets_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "targets_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "targets_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      tenants: {
        Row: {
          business_email: string
          created_at: string
          currency: string
          expiry_alert_months: number
          id: string
          legal_name: string
          name: string
          phone: string
          plan: string
          reference_date: string
          timezone: string
          updated_at: string
        }
        Insert: {
          business_email: string
          created_at?: string
          currency?: string
          expiry_alert_months?: number
          id?: string
          legal_name: string
          name: string
          phone: string
          plan?: string
          reference_date?: string
          timezone?: string
          updated_at?: string
        }
        Update: {
          business_email?: string
          created_at?: string
          currency?: string
          expiry_alert_months?: number
          id?: string
          legal_name?: string
          name?: string
          phone?: string
          plan?: string
          reference_date?: string
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
      user_preferences: {
        Row: {
          date_format: string
          default_report_period: string
          updated_at: string
          user_id: string
        }
        Insert: {
          date_format?: string
          default_report_period?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          date_format?: string
          default_report_period?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_preferences_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          branch_id: string | null
          created_at: string
          deactivated_at: string | null
          email: string
          first_name: string
          id: string
          joined_at: string
          last_name: string
          manager_id: string | null
          phone: string | null
          role: string | null
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          branch_id?: string | null
          created_at?: string
          deactivated_at?: string | null
          email: string
          first_name: string
          id: string
          joined_at?: string
          last_name: string
          manager_id?: string | null
          phone?: string | null
          role?: string | null
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          branch_id?: string | null
          created_at?: string
          deactivated_at?: string | null
          email?: string
          first_name?: string
          id?: string
          joined_at?: string
          last_name?: string
          manager_id?: string | null
          phone?: string | null
          role?: string | null
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "users_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "users_manager_id_fkey"
            columns: ["manager_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "users_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      expiring_stock: {
        Row: {
          batch_number: string | null
          branch_id: string | null
          branch_name: string | null
          days_until_expiry: number | null
          expiry_alert_months: number | null
          expiry_date: string | null
          id: string | null
          product_id: string | null
          product_name: string | null
          quantity_remaining: number | null
          received_at: string | null
          sku: string | null
          tenant_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stock_batches_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_batches_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_batches_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      low_stock_items: {
        Row: {
          available_quantity: number | null
          branch_id: string | null
          branch_name: string | null
          id: string | null
          last_updated: string | null
          low_stock_threshold: number | null
          product_id: string | null
          product_name: string | null
          quantity_on_hand: number | null
          quantity_reserved: number | null
          sku: string | null
          tenant_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_records_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_records_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_records_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      acknowledge_customer_payment: {
        Args: {
          p_payment_id: string
          p_proof_name: string
          p_transfer_reference: string
        }
        Returns: {
          acknowledged_at: string | null
          acknowledged_by: string | null
          amount: number
          branch_id: string
          confirmed_at: string | null
          confirmed_by: string | null
          created_at: string
          customer_id: string
          decline_reason: string | null
          declined_at: string | null
          declined_by: string | null
          id: string
          manager_id: string
          method: string
          note: string | null
          order_id: string | null
          payment_date: string
          proof_name: string | null
          received_by: string
          reference: string | null
          status: string
          submitted_at: string
          tenant_id: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "customer_payments"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      acknowledge_payment: {
        Args: {
          p_payment_id: string
          p_proof_name: string
          p_transfer_reference: string
        }
        Returns: {
          acknowledged_at: string | null
          acknowledged_by: string | null
          branch_id: string
          cash_amount: number
          confirmed_at: string | null
          confirmed_by: string | null
          created_at: string
          decline_reason: string | null
          declined_at: string | null
          declined_by: string | null
          id: string
          manager_id: string
          note: string | null
          period: string
          proof_name: string | null
          sales_rep_id: string
          status: string
          submitted_at: string
          tenant_id: string
          transfer_amount: number
          transfer_reference: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "payments"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      acknowledge_stock_request: {
        Args: { p_request_id: string }
        Returns: {
          acknowledged_at: string | null
          acknowledged_by: string | null
          approved_at: string | null
          approved_by: string | null
          batch_id: string | null
          branch_id: string
          created_at: string
          fulfilled_at: string | null
          fulfilled_by: string | null
          id: string
          note: string | null
          priority: string
          processed_by: string | null
          product_id: string
          quantity_approved: number | null
          quantity_fulfilled: number | null
          quantity_requested: number
          rejected_at: string | null
          rejection_reason: string | null
          rep_id: string
          requested_at: string
          status: string
          tenant_id: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "stock_requests"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      add_stock: {
        Args: {
          p_batch_number: string
          p_branch_id: string
          p_emergency: boolean
          p_emergency_reason: string
          p_expiry_date: string
          p_idempotency_key?: string
          p_note: string
          p_product_id: string
          p_quantity: number
        }
        Returns: {
          applied_at: string | null
          batch_number: string | null
          branch_id: string | null
          created_at: string
          emergency: boolean | null
          emergency_reason: string | null
          expiry_date: string | null
          id: string
          member_data: Json | null
          note: string | null
          product_id: string | null
          quantity: number | null
          rejection_reason: string | null
          requested_at: string
          requested_by: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          tenant_id: string
          type: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "approval_requests"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      adjust_stock: {
        Args: {
          p_counted_quantity: number
          p_inventory_id: string
          p_reason: string
        }
        Returns: {
          branch_id: string
          id: string
          last_updated: string
          low_stock_threshold: number
          product_id: string
          quantity_on_hand: number
          quantity_reserved: number
          reorder_level: number
          tenant_id: string
        }
        SetofOptions: {
          from: "*"
          to: "inventory_records"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      approve_onboarding: {
        Args: { p_branch_id: string; p_onboarding_id: string; p_role: string }
        Returns: {
          onboarding_id: string
          user_id: string
        }[]
      }
      approve_requests: {
        Args: { p_request_ids: string[] }
        Returns: {
          applied_at: string | null
          batch_number: string | null
          branch_id: string | null
          created_at: string
          emergency: boolean | null
          emergency_reason: string | null
          expiry_date: string | null
          id: string
          member_data: Json | null
          note: string | null
          product_id: string | null
          quantity: number | null
          rejection_reason: string | null
          requested_at: string
          requested_by: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          tenant_id: string
          type: string
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "approval_requests"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      approve_stock_request: {
        Args: { p_request_id: string }
        Returns: {
          acknowledged_at: string | null
          acknowledged_by: string | null
          approved_at: string | null
          approved_by: string | null
          batch_id: string | null
          branch_id: string
          created_at: string
          fulfilled_at: string | null
          fulfilled_by: string | null
          id: string
          note: string | null
          priority: string
          processed_by: string | null
          product_id: string
          quantity_approved: number | null
          quantity_fulfilled: number | null
          quantity_requested: number
          rejected_at: string | null
          rejection_reason: string | null
          rep_id: string
          requested_at: string
          status: string
          tenant_id: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "stock_requests"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      can_customer_order: {
        Args: { p_customer_id: string; p_order_amount: number }
        Returns: boolean
      }
      confirm_customer_payment: {
        Args: { p_payment_id: string }
        Returns: {
          acknowledged_at: string | null
          acknowledged_by: string | null
          amount: number
          branch_id: string
          confirmed_at: string | null
          confirmed_by: string | null
          created_at: string
          customer_id: string
          decline_reason: string | null
          declined_at: string | null
          declined_by: string | null
          id: string
          manager_id: string
          method: string
          note: string | null
          order_id: string | null
          payment_date: string
          proof_name: string | null
          received_by: string
          reference: string | null
          status: string
          submitted_at: string
          tenant_id: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "customer_payments"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      confirm_manager_remittance: {
        Args: { p_remittance_id: string }
        Returns: {
          branch_id: string
          cash_amount: number
          confirmed_at: string | null
          confirmed_by: string | null
          created_at: string
          decline_reason: string | null
          declined_at: string | null
          declined_by: string | null
          expense_amount: number
          expense_ids: Json
          id: string
          manager_id: string
          net_remittance_due: number
          note: string | null
          outstanding_amount: number
          payment_ids: Json
          period: string
          status: string
          submitted_at: string | null
          tenant_id: string
          total_received: number
          transfer_amount: number
          transfer_reference: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "manager_remittances"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      confirm_payment: {
        Args: { p_payment_id: string }
        Returns: {
          acknowledged_at: string | null
          acknowledged_by: string | null
          branch_id: string
          cash_amount: number
          confirmed_at: string | null
          confirmed_by: string | null
          created_at: string
          decline_reason: string | null
          declined_at: string | null
          declined_by: string | null
          id: string
          manager_id: string
          note: string | null
          period: string
          proof_name: string | null
          sales_rep_id: string
          status: string
          submitted_at: string
          tenant_id: string
          transfer_amount: number
          transfer_reference: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "payments"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_audit_log: {
        Args: {
          p_action: string
          p_actor_id: string
          p_emergency?: boolean
          p_entity: string
          p_entity_id?: string
          p_metadata?: Json
          p_subject: string
          p_tenant_id: string
        }
        Returns: string
      }
      create_customer: {
        Args: {
          p_address: string
          p_contact_person: string
          p_email: string
          p_name: string
          p_phone: string
        }
        Returns: {
          address: string
          branch_id: string | null
          contact_person: string
          created_at: string
          created_by: string
          credit_limit: number | null
          email: string | null
          id: string
          name: string
          phone: string
          status: string
          tenant_id: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "customers"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_expense: {
        Args: {
          p_amount: number
          p_branch_id: string
          p_category: string
          p_description: string
          p_expense_date: string
          p_idempotency_key?: string
          p_note: string
        }
        Returns: {
          amount: number
          branch_id: string | null
          category: string
          created_at: string
          description: string
          expense_date: string
          id: string
          manager_id: string | null
          note: string | null
          owner_id: string | null
          status: string
          tenant_id: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "expenses"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_notification: {
        Args: {
          p_entity_id: string
          p_entity_type: string
          p_message: string
          p_recipient_id: string
          p_tenant_id: string
          p_type: string
        }
        Returns: string
      }
      create_owner_remittance: {
        Args: {
          p_amount: number
          p_idempotency_key?: string
          p_note: string
          p_payee_name: string
          p_payee_type: string
          p_payment_method: string
          p_purpose: string
          p_reference: string
          p_remittance_date: string
        }
        Returns: {
          amount: number
          created_at: string
          created_by: string
          id: string
          note: string | null
          payee_name: string
          payee_type: string
          payment_method: string
          purpose: string
          reference: string | null
          remittance_date: string
          tenant_id: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "owner_remittances"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_product: {
        Args: {
          p_category: string
          p_description: string
          p_low_stock_threshold: number
          p_name: string
          p_sku: string
          p_unit: string
          p_unit_cost: number
          p_unit_price: number
        }
        Returns: {
          category: string
          created_at: string
          description: string | null
          id: string
          low_stock_threshold: number
          name: string
          sku: string
          status: string
          tenant_id: string
          unit: string
          unit_cost: number
          unit_price: number
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "products"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_stock_requests: {
        Args: {
          p_branch_id: string
          p_idempotency_key?: string
          p_items: Json
          p_note: string
        }
        Returns: {
          acknowledged_at: string | null
          acknowledged_by: string | null
          approved_at: string | null
          approved_by: string | null
          batch_id: string | null
          branch_id: string
          created_at: string
          fulfilled_at: string | null
          fulfilled_by: string | null
          id: string
          note: string | null
          priority: string
          processed_by: string | null
          product_id: string
          quantity_approved: number | null
          quantity_fulfilled: number | null
          quantity_requested: number
          rejected_at: string | null
          rejection_reason: string | null
          rep_id: string
          requested_at: string
          status: string
          tenant_id: string
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "stock_requests"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      create_branch_target: {
        Args: { p_amount: number; p_branch_id: string; p_month: string }
        Returns: {
          amount: number
          branch_id: string
          created_at: string
          id: string
          month: string
          scope: string
          tenant_id: string
          updated_at: string
          user_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "targets"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_target: {
        Args: { p_amount: number; p_month: string; p_rep_id: string }
        Returns: {
          amount: number
          branch_id: string
          created_at: string
          id: string
          month: string
          scope: string
          tenant_id: string
          updated_at: string
          user_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "targets"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      decline_customer_payment: {
        Args: { p_payment_id: string; p_reason: string }
        Returns: {
          acknowledged_at: string | null
          acknowledged_by: string | null
          amount: number
          branch_id: string
          confirmed_at: string | null
          confirmed_by: string | null
          created_at: string
          customer_id: string
          decline_reason: string | null
          declined_at: string | null
          declined_by: string | null
          id: string
          manager_id: string
          method: string
          note: string | null
          order_id: string | null
          payment_date: string
          proof_name: string | null
          received_by: string
          reference: string | null
          status: string
          submitted_at: string
          tenant_id: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "customer_payments"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      decline_manager_remittance: {
        Args: { p_reason: string; p_remittance_id: string }
        Returns: {
          branch_id: string
          cash_amount: number
          confirmed_at: string | null
          confirmed_by: string | null
          created_at: string
          decline_reason: string | null
          declined_at: string | null
          declined_by: string | null
          expense_amount: number
          expense_ids: Json
          id: string
          manager_id: string
          net_remittance_due: number
          note: string | null
          outstanding_amount: number
          payment_ids: Json
          period: string
          status: string
          submitted_at: string | null
          tenant_id: string
          total_received: number
          transfer_amount: number
          transfer_reference: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "manager_remittances"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      decline_payment: {
        Args: { p_payment_id: string; p_reason: string }
        Returns: {
          acknowledged_at: string | null
          acknowledged_by: string | null
          branch_id: string
          cash_amount: number
          confirmed_at: string | null
          confirmed_by: string | null
          created_at: string
          decline_reason: string | null
          declined_at: string | null
          declined_by: string | null
          id: string
          manager_id: string
          note: string | null
          period: string
          proof_name: string | null
          sales_rep_id: string
          status: string
          submitted_at: string
          tenant_id: string
          transfer_amount: number
          transfer_reference: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "payments"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      delete_onboarding_file: {
        Args: { p_file_id: string; p_token: string }
        Returns: undefined
      }
      fulfil_stock_request: {
        Args: { p_quantity: number; p_request_id: string }
        Returns: {
          acknowledged_at: string | null
          acknowledged_by: string | null
          approved_at: string | null
          approved_by: string | null
          batch_id: string | null
          branch_id: string
          created_at: string
          fulfilled_at: string | null
          fulfilled_by: string | null
          id: string
          note: string | null
          priority: string
          processed_by: string | null
          product_id: string
          quantity_approved: number | null
          quantity_fulfilled: number | null
          quantity_requested: number
          rejected_at: string | null
          rejection_reason: string | null
          rep_id: string
          requested_at: string
          status: string
          tenant_id: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "stock_requests"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      get_available_inventory: {
        Args: { p_branch_id: string; p_product_id: string }
        Returns: number
      }
      get_customer_balance: { Args: { p_customer_id: string }; Returns: number }
      get_onboarding_by_token: {
        Args: { p_token: string }
        Returns: {
          correction_note: string
          created_at: string
          data: Json
          department: string
          employee_id: string
          guarantor_status: string
          guarantor_token: string
          id: string
          job_title: string
          start_date: string
          status: string
          step: number
          submitted_at: string
          tenant_id: string
          token_expires_at: string
          token_revoked: boolean
          used_at: string
          user_id: string
        }[]
      }
      get_onboarding_for_guarantor: {
        Args: { p_guarantor_token: string }
        Returns: {
          employee_name: string
          guarantor_first_name: string
          guarantor_status: string
          guarantor_surname: string
          id: string
          job_title: string
        }[]
      }
      get_payment_outstanding: {
        Args: { p_period: string; p_rep_id: string }
        Returns: number
      }
      get_rep_total_sales: {
        Args: {
          p_include_customer_sales?: boolean
          p_period: string
          p_rep_id: string
        }
        Returns: number
      }
      get_target_achievement: { Args: { p_target_id: string }; Returns: number }
      get_tenant_reference_date: { Args: never; Returns: string }
      get_unread_notification_count: {
        Args: { p_user_id: string }
        Returns: number
      }
      get_user_branch_id: { Args: never; Returns: string }
      get_user_role: { Args: never; Returns: string }
      get_user_tenant_id: { Args: never; Returns: string }
      hash_token: { Args: { p_token: string }; Returns: string }
      import_products: {
        Args: {
          p_branch_id: string
          p_idempotency_key?: string
          p_mode: string
          p_rows: Json
        }
        Returns: Json
      }
      is_low_stock: {
        Args: { p_branch_id: string; p_product_id: string }
        Returns: boolean
      }
      list_onboarding_files: {
        Args: { p_token: string }
        Returns: {
          cloudinary_url: string
          file_name: string
          file_size: number
          file_type: string
          id: string
          mime_type: string
        }[]
      }
      mark_notification_read: {
        Args: { p_notification_id: string }
        Returns: undefined
      }
      owner_account_exists: { Args: never; Returns: boolean }
      record_customer_payment: {
        Args: {
          p_amount: number
          p_customer_id: string
          p_idempotency_key?: string
          p_method: string
          p_note: string
          p_order_id: string
          p_payment_date: string
          p_reference: string
        }
        Returns: {
          acknowledged_at: string | null
          acknowledged_by: string | null
          amount: number
          branch_id: string
          confirmed_at: string | null
          confirmed_by: string | null
          created_at: string
          customer_id: string
          decline_reason: string | null
          declined_at: string | null
          declined_by: string | null
          id: string
          manager_id: string
          method: string
          note: string | null
          order_id: string | null
          payment_date: string
          proof_name: string | null
          received_by: string
          reference: string | null
          status: string
          submitted_at: string
          tenant_id: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "customer_payments"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      register_onboarding_file: {
        Args: {
          p_file_name: string
          p_file_type: string
          p_mime: string
          p_size: number
          p_storage_path: string
          p_token: string
        }
        Returns: string
      }
      reject_onboarding: {
        Args: { p_onboarding_id: string; p_reason: string }
        Returns: {
          id: string
          status: string
        }[]
      }
      reject_request: {
        Args: { p_reason: string; p_request_id: string }
        Returns: {
          applied_at: string | null
          batch_number: string | null
          branch_id: string | null
          created_at: string
          emergency: boolean | null
          emergency_reason: string | null
          expiry_date: string | null
          id: string
          member_data: Json | null
          note: string | null
          product_id: string | null
          quantity: number | null
          rejection_reason: string | null
          requested_at: string
          requested_by: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          tenant_id: string
          type: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "approval_requests"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      reject_stock_request: {
        Args: { p_reason: string; p_request_id: string }
        Returns: {
          acknowledged_at: string | null
          acknowledged_by: string | null
          approved_at: string | null
          approved_by: string | null
          batch_id: string | null
          branch_id: string
          created_at: string
          fulfilled_at: string | null
          fulfilled_by: string | null
          id: string
          note: string | null
          priority: string
          processed_by: string | null
          product_id: string
          quantity_approved: number | null
          quantity_fulfilled: number | null
          quantity_requested: number
          rejected_at: string | null
          rejection_reason: string | null
          rep_id: string
          requested_at: string
          status: string
          tenant_id: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "stock_requests"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      request_product_deactivation: {
        Args: { p_product_id: string; p_reason: string }
        Returns: {
          applied_at: string | null
          batch_number: string | null
          branch_id: string | null
          created_at: string
          emergency: boolean | null
          emergency_reason: string | null
          expiry_date: string | null
          id: string
          member_data: Json | null
          note: string | null
          product_id: string | null
          quantity: number | null
          rejection_reason: string | null
          requested_at: string
          requested_by: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          tenant_id: string
          type: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "approval_requests"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      request_team_member: {
        Args: {
          p_branch_id: string
          p_email: string
          p_name: string
          p_role: string
        }
        Returns: {
          applied_at: string | null
          batch_number: string | null
          branch_id: string | null
          created_at: string
          emergency: boolean | null
          emergency_reason: string | null
          expiry_date: string | null
          id: string
          member_data: Json | null
          note: string | null
          product_id: string | null
          quantity: number | null
          rejection_reason: string | null
          requested_at: string
          requested_by: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          tenant_id: string
          type: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "approval_requests"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      request_onboarding_corrections: {
        Args: {
          p_note: string
          p_onboarding_id: string
          p_redo_guarantor?: boolean
        }
        Returns: string
      }
      review_guarantor: {
        Args: { p_decision: string; p_onboarding_id: string; p_reason: string }
        Returns: {
          guarantor_decision: string
          id: string
        }[]
      }
      save_onboarding_progress: {
        Args: {
          p_data: Json
          p_partial_files?: Json
          p_step: number
          p_token: string
        }
        Returns: {
          id: string
          status: string
          step: number
        }[]
      }
      send_guarantor_link: { Args: { p_token: string }; Returns: string }
      set_customer_credit_limit: {
        Args: { p_credit_limit: number; p_customer_id: string }
        Returns: {
          address: string
          branch_id: string | null
          contact_person: string
          created_at: string
          created_by: string
          credit_limit: number | null
          email: string | null
          id: string
          name: string
          phone: string
          status: string
          tenant_id: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "customers"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      set_customer_status: {
        Args: { p_customer_id: string; p_status: string }
        Returns: {
          address: string
          branch_id: string | null
          contact_person: string
          created_at: string
          created_by: string
          credit_limit: number | null
          email: string | null
          id: string
          name: string
          phone: string
          status: string
          tenant_id: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "customers"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      set_product_status: {
        Args: { p_product_id: string; p_status: string }
        Returns: {
          category: string
          created_at: string
          description: string | null
          id: string
          low_stock_threshold: number
          name: string
          sku: string
          status: string
          tenant_id: string
          unit: string
          unit_cost: number
          unit_price: number
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "products"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      set_team_member_status: {
        Args: { p_status: string; p_user_id: string }
        Returns: {
          branch_id: string | null
          created_at: string
          deactivated_at: string | null
          email: string
          first_name: string
          id: string
          joined_at: string
          last_name: string
          manager_id: string | null
          phone: string | null
          role: string | null
          status: string
          tenant_id: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "users"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      submit_guarantor: {
        Args: { p_guarantor_token: string; p_response: Json }
        Returns: {
          guarantor_status: string
          id: string
        }[]
      }
      submit_guarantor_on_behalf: {
        Args: { p_token: string; p_response: Json }
        Returns: {
          guarantor_status: string
          id: string
        }[]
      }
      submit_manager_remittance: {
        Args: {
          p_cash_amount: number
          p_note: string
          p_period: string
          p_transfer_amount: number
          p_transfer_reference: string
        }
        Returns: {
          branch_id: string
          cash_amount: number
          confirmed_at: string | null
          confirmed_by: string | null
          created_at: string
          decline_reason: string | null
          declined_at: string | null
          declined_by: string | null
          expense_amount: number
          expense_ids: Json
          id: string
          manager_id: string
          net_remittance_due: number
          note: string | null
          outstanding_amount: number
          payment_ids: Json
          period: string
          status: string
          submitted_at: string | null
          tenant_id: string
          total_received: number
          transfer_amount: number
          transfer_reference: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "manager_remittances"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      submit_onboarding: {
        Args: { p_data: Json; p_email: string; p_token: string }
        Returns: {
          id: string
          status: string
        }[]
      }
      submit_payment: {
        Args: {
          p_cash_amount: number
          p_idempotency_key?: string
          p_note: string
          p_period: string
          p_transfer_amount: number
          p_transfer_reference: string
        }
        Returns: {
          acknowledged_at: string | null
          acknowledged_by: string | null
          branch_id: string
          cash_amount: number
          confirmed_at: string | null
          confirmed_by: string | null
          created_at: string
          decline_reason: string | null
          declined_at: string | null
          declined_by: string | null
          id: string
          manager_id: string
          note: string | null
          period: string
          proof_name: string | null
          sales_rep_id: string
          status: string
          submitted_at: string
          tenant_id: string
          transfer_amount: number
          transfer_reference: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "payments"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      update_customer: {
        Args: {
          p_address: string
          p_contact_person: string
          p_customer_id: string
          p_email: string
          p_name: string
          p_phone: string
        }
        Returns: {
          address: string
          branch_id: string | null
          contact_person: string
          created_at: string
          created_by: string
          credit_limit: number | null
          email: string | null
          id: string
          name: string
          phone: string
          status: string
          tenant_id: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "customers"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      update_expense: {
        Args: {
          p_amount: number
          p_branch_id: string
          p_category: string
          p_description: string
          p_expense_date: string
          p_expense_id: string
          p_note: string
        }
        Returns: {
          amount: number
          branch_id: string | null
          category: string
          created_at: string
          description: string
          expense_date: string
          id: string
          manager_id: string | null
          note: string | null
          owner_id: string | null
          status: string
          tenant_id: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "expenses"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      update_preferences: {
        Args: { p_date_format: string; p_default_report_period: string }
        Returns: {
          date_format: string
          default_report_period: string
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "user_preferences"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      update_product: {
        Args: {
          p_category: string
          p_description: string
          p_low_stock_threshold: number
          p_name: string
          p_product_id: string
          p_sku: string
          p_unit: string
          p_unit_cost: number
          p_unit_price: number
        }
        Returns: {
          category: string
          created_at: string
          description: string | null
          id: string
          low_stock_threshold: number
          name: string
          sku: string
          status: string
          tenant_id: string
          unit: string
          unit_cost: number
          unit_price: number
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "products"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      update_target_amount: {
        Args: { p_amount: number; p_target_id: string }
        Returns: {
          amount: number
          branch_id: string
          created_at: string
          id: string
          month: string
          scope: string
          tenant_id: string
          updated_at: string
          user_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "targets"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      update_team_member: {
        Args: {
          p_branch_id: string
          p_first_name: string
          p_last_name: string
          p_role: string
          p_status: string
          p_user_id: string
        }
        Returns: {
          branch_id: string | null
          created_at: string
          deactivated_at: string | null
          email: string
          first_name: string
          id: string
          joined_at: string
          last_name: string
          manager_id: string | null
          phone: string | null
          role: string | null
          status: string
          tenant_id: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "users"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      update_tenant_settings: {
        Args: {
          p_business_email: string
          p_expiry_alert_months: number
          p_legal_name: string
          p_name: string
          p_phone: string
          p_timezone: string
        }
        Returns: {
          business_email: string
          created_at: string
          currency: string
          expiry_alert_months: number
          id: string
          legal_name: string
          name: string
          phone: string
          plan: string
          reference_date: string
          timezone: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "tenants"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      void_expense: {
        Args: { p_expense_id: string; p_reason: string }
        Returns: {
          amount: number
          branch_id: string | null
          category: string
          created_at: string
          description: string
          expense_date: string
          id: string
          manager_id: string | null
          note: string | null
          owner_id: string | null
          status: string
          tenant_id: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "expenses"
          isOneToOne: true
          isSetofReturn: false
        }
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  storage: {
    Tables: {
      buckets: {
        Row: {
          allowed_mime_types: string[] | null
          avif_autodetection: boolean | null
          created_at: string | null
          file_size_limit: number | null
          id: string
          lifecycle_configuration: Json | null
          lifecycle_configuration_generation: string | null
          name: string
          owner: string | null
          owner_id: string | null
          public: boolean | null
          type: Database["storage"]["Enums"]["buckettype"]
          updated_at: string | null
          versioning_status: string
        }
        Insert: {
          allowed_mime_types?: string[] | null
          avif_autodetection?: boolean | null
          created_at?: string | null
          file_size_limit?: number | null
          id: string
          lifecycle_configuration?: Json | null
          lifecycle_configuration_generation?: string | null
          name: string
          owner?: string | null
          owner_id?: string | null
          public?: boolean | null
          type?: Database["storage"]["Enums"]["buckettype"]
          updated_at?: string | null
          versioning_status?: string
        }
        Update: {
          allowed_mime_types?: string[] | null
          avif_autodetection?: boolean | null
          created_at?: string | null
          file_size_limit?: number | null
          id?: string
          lifecycle_configuration?: Json | null
          lifecycle_configuration_generation?: string | null
          name?: string
          owner?: string | null
          owner_id?: string | null
          public?: boolean | null
          type?: Database["storage"]["Enums"]["buckettype"]
          updated_at?: string | null
          versioning_status?: string
        }
        Relationships: []
      }
      buckets_analytics: {
        Row: {
          created_at: string
          deleted_at: string | null
          format: string
          id: string
          name: string
          type: Database["storage"]["Enums"]["buckettype"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          format?: string
          id?: string
          name: string
          type?: Database["storage"]["Enums"]["buckettype"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          format?: string
          id?: string
          name?: string
          type?: Database["storage"]["Enums"]["buckettype"]
          updated_at?: string
        }
        Relationships: []
      }
      buckets_vectors: {
        Row: {
          created_at: string
          id: string
          type: Database["storage"]["Enums"]["buckettype"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          id: string
          type?: Database["storage"]["Enums"]["buckettype"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          type?: Database["storage"]["Enums"]["buckettype"]
          updated_at?: string
        }
        Relationships: []
      }
      migrations: {
        Row: {
          executed_at: string | null
          hash: string
          id: number
          name: string
        }
        Insert: {
          executed_at?: string | null
          hash: string
          id: number
          name: string
        }
        Update: {
          executed_at?: string | null
          hash?: string
          id?: number
          name?: string
        }
        Relationships: []
      }
      objects: {
        Row: {
          archived_at: string | null
          bucket_id: string | null
          created_at: string | null
          id: string
          is_delete_marker: boolean
          is_versioned: boolean
          last_accessed_at: string | null
          metadata: Json | null
          name: string | null
          owner: string | null
          owner_id: string | null
          path_tokens: string[] | null
          updated_at: string | null
          user_metadata: Json | null
          version: string | null
        }
        Insert: {
          archived_at?: string | null
          bucket_id?: string | null
          created_at?: string | null
          id?: string
          is_delete_marker?: boolean
          is_versioned?: boolean
          last_accessed_at?: string | null
          metadata?: Json | null
          name?: string | null
          owner?: string | null
          owner_id?: string | null
          path_tokens?: string[] | null
          updated_at?: string | null
          user_metadata?: Json | null
          version?: string | null
        }
        Update: {
          archived_at?: string | null
          bucket_id?: string | null
          created_at?: string | null
          id?: string
          is_delete_marker?: boolean
          is_versioned?: boolean
          last_accessed_at?: string | null
          metadata?: Json | null
          name?: string | null
          owner?: string | null
          owner_id?: string | null
          path_tokens?: string[] | null
          updated_at?: string | null
          user_metadata?: Json | null
          version?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "objects_bucketId_fkey"
            columns: ["bucket_id"]
            isOneToOne: false
            referencedRelation: "buckets"
            referencedColumns: ["id"]
          },
        ]
      }
      s3_multipart_uploads: {
        Row: {
          bucket_id: string
          created_at: string
          id: string
          in_progress_size: number
          key: string
          metadata: Json | null
          owner_id: string | null
          upload_signature: string
          user_metadata: Json | null
          version: string
        }
        Insert: {
          bucket_id: string
          created_at?: string
          id: string
          in_progress_size?: number
          key: string
          metadata?: Json | null
          owner_id?: string | null
          upload_signature: string
          user_metadata?: Json | null
          version: string
        }
        Update: {
          bucket_id?: string
          created_at?: string
          id?: string
          in_progress_size?: number
          key?: string
          metadata?: Json | null
          owner_id?: string | null
          upload_signature?: string
          user_metadata?: Json | null
          version?: string
        }
        Relationships: [
          {
            foreignKeyName: "s3_multipart_uploads_bucket_id_fkey"
            columns: ["bucket_id"]
            isOneToOne: false
            referencedRelation: "buckets"
            referencedColumns: ["id"]
          },
        ]
      }
      s3_multipart_uploads_parts: {
        Row: {
          bucket_id: string
          created_at: string
          etag: string
          id: string
          key: string
          owner_id: string | null
          part_number: number
          size: number
          upload_id: string
          version: string
        }
        Insert: {
          bucket_id: string
          created_at?: string
          etag: string
          id?: string
          key: string
          owner_id?: string | null
          part_number: number
          size?: number
          upload_id: string
          version: string
        }
        Update: {
          bucket_id?: string
          created_at?: string
          etag?: string
          id?: string
          key?: string
          owner_id?: string | null
          part_number?: number
          size?: number
          upload_id?: string
          version?: string
        }
        Relationships: [
          {
            foreignKeyName: "s3_multipart_uploads_parts_bucket_id_fkey"
            columns: ["bucket_id"]
            isOneToOne: false
            referencedRelation: "buckets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "s3_multipart_uploads_parts_upload_id_fkey"
            columns: ["upload_id"]
            isOneToOne: false
            referencedRelation: "s3_multipart_uploads"
            referencedColumns: ["id"]
          },
        ]
      }
      vector_indexes: {
        Row: {
          bucket_id: string
          created_at: string
          data_type: string
          dimension: number
          distance_metric: string
          id: string
          metadata_configuration: Json | null
          name: string
          updated_at: string
        }
        Insert: {
          bucket_id: string
          created_at?: string
          data_type: string
          dimension: number
          distance_metric: string
          id?: string
          metadata_configuration?: Json | null
          name: string
          updated_at?: string
        }
        Update: {
          bucket_id?: string
          created_at?: string
          data_type?: string
          dimension?: number
          distance_metric?: string
          id?: string
          metadata_configuration?: Json | null
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "vector_indexes_bucket_id_fkey"
            columns: ["bucket_id"]
            isOneToOne: false
            referencedRelation: "buckets_vectors"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      allow_any_operation: {
        Args: { expected_operations: string[] }
        Returns: boolean
      }
      allow_only_operation: {
        Args: { expected_operation: string }
        Returns: boolean
      }
      can_insert_object: {
        Args: { bucketid: string; metadata: Json; name: string; owner: string }
        Returns: undefined
      }
      extension: { Args: { name: string }; Returns: string }
      filename: { Args: { name: string }; Returns: string }
      foldername: { Args: { name: string }; Returns: string[] }
      get_common_prefix: {
        Args: { p_delimiter: string; p_key: string; p_prefix: string }
        Returns: string
      }
      get_size_by_bucket: {
        Args: { delete_markers?: string; noncurrent_versions?: string }
        Returns: {
          bucket_id: string
          size: number
        }[]
      }
      list_multipart_uploads_with_delimiter: {
        Args: {
          bucket_id: string
          delimiter_param: string
          max_keys?: number
          next_key_token?: string
          next_upload_token?: string
          prefix_param: string
          raw_prefix_param?: string
        }
        Returns: {
          created_at: string
          id: string
          key: string
        }[]
      }
      list_objects_with_delimiter: {
        Args: {
          _bucket_id: string
          delete_markers?: string
          delimiter_param: string
          max_keys?: number
          next_token?: string
          next_token_archived_at?: string
          next_token_version?: string
          noncurrent_versions?: string
          prefix_param: string
          sort_order?: string
          start_after?: string
        }
        Returns: {
          archived_at: string
          created_at: string
          id: string
          is_delete_marker: boolean
          is_versioned: boolean
          last_accessed_at: string
          metadata: Json
          name: string
          updated_at: string
          version: string
        }[]
      }
      operation: { Args: never; Returns: string }
      search: {
        Args: {
          bucketname: string
          delete_markers?: string
          levels?: number
          limits?: number
          noncurrent_versions?: string
          offsets?: number
          prefix: string
          search?: string
          sortcolumn?: string
          sortorder?: string
        }
        Returns: {
          archived_at: string
          created_at: string
          id: string
          is_delete_marker: boolean
          is_versioned: boolean
          last_accessed_at: string
          metadata: Json
          name: string
          updated_at: string
          version: string
        }[]
      }
      search_by_timestamp: {
        Args: {
          delete_markers?: string
          noncurrent_versions?: string
          p_bucket_id: string
          p_level: number
          p_limit: number
          p_prefix: string
          p_sort_column: string
          p_sort_column_after: string
          p_sort_order: string
          p_start_after: string
          p_start_after_version?: string
        }
        Returns: {
          archived_at: string
          created_at: string
          id: string
          is_delete_marker: boolean
          is_versioned: boolean
          key: string
          last_accessed_at: string
          metadata: Json
          name: string
          updated_at: string
          version: string
        }[]
      }
      search_v2: {
        Args: {
          bucket_name: string
          delete_markers?: string
          levels?: number
          limits?: number
          noncurrent_versions?: string
          prefix: string
          sort_column?: string
          sort_column_after?: string
          sort_order?: string
          start_after?: string
          start_after_archived_at?: string
          start_after_is_continuation?: boolean
          start_after_version?: string
        }
        Returns: {
          archived_at: string
          created_at: string
          id: string
          is_delete_marker: boolean
          is_versioned: boolean
          key: string
          last_accessed_at: string
          metadata: Json
          name: string
          updated_at: string
          version: string
        }[]
      }
    }
    Enums: {
      buckettype: "STANDARD" | "ANALYTICS" | "VECTOR"
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
    Enums: {},
  },
  storage: {
    Enums: {
      buckettype: ["STANDARD", "ANALYTICS", "VECTOR"],
    },
  },
} as const
