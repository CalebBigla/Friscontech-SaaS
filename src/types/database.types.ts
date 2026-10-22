/**
 * Database TypeScript types generated from Supabase schema
 * Based on migrations in supabase/migrations/
 * 
 * This file maps PostgreSQL types to TypeScript for type-safe queries
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      tenants: {
        Row: {
          id: string
          name: string
          created_at: string
        }
        Insert: {
          id?: string
          name: string
          created_at?: string
        }
        Update: {
          id?: string
          name?: string
          created_at?: string
        }
      }
      branches: {
        Row: {
          id: string
          tenant_id: string
          name: string
          code: string
          location: string
          address: string
          phone: string
          email: string
          status: 'active' | 'inactive'
          manager_id: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          tenant_id: string
          name: string
          code: string
          location: string
          address: string
          phone: string
          email: string
          status?: 'active' | 'inactive'
          manager_id?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          tenant_id?: string
          name?: string
          code?: string
          location?: string | null
          address?: string
          phone?: string
          email?: string
          status?: 'active' | 'inactive'
          manager_id?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      users: {
        Row: {
          id: string
          tenant_id: string
          first_name: string
          last_name: string
          email: string
          phone: string | null
          role: 'owner' | 'manager' | 'storekeeper' | 'sales_rep' | null
          branch_id: string | null
          manager_id: string | null
          status: 'active' | 'inactive' | 'pending' | 'rejected' | 'suspended'
          joined_at: string
          deactivated_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          tenant_id: string
          first_name: string
          last_name: string
          email?: string
          phone?: string | null
          role?: 'owner' | 'manager' | 'storekeeper' | 'sales_rep' | null
          branch_id?: string | null
          manager_id?: string | null
          status?: 'active' | 'inactive' | 'pending' | 'rejected' | 'suspended'
          joined_at?: string
          deactivated_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          tenant_id?: string
          first_name?: string
          last_name?: string
          email?: string
          phone?: string | null
          role?: 'owner' | 'manager' | 'storekeeper' | 'sales_rep' | null
          branch_id?: string | null
          manager_id?: string | null
          status?: 'active' | 'inactive' | 'pending' | 'rejected' | 'suspended'
          joined_at?: string
          deactivated_at?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      user_preferences: {
        Row: {
          user_id: string
          date_format: 'MM/DD/YYYY' | 'DD/MM/YYYY' | 'YYYY-MM-DD'
          report_period: 'current_month' | 'last_month' | 'custom'
          created_at: string
          updated_at: string
        }
        Insert: {
          user_id: string
          date_format?: 'MM/DD/YYYY' | 'DD/MM/YYYY' | 'YYYY-MM-DD'
          report_period?: 'current_month' | 'last_month' | 'custom'
          created_at?: string
          updated_at?: string
        }
        Update: {
          user_id?: string
          date_format?: 'MM/DD/YYYY' | 'DD/MM/YYYY' | 'YYYY-MM-DD'
          report_period?: 'current_month' | 'last_month' | 'custom'
          created_at?: string
          updated_at?: string
        }
      }
      products: {
        Row: {
          id: string
          tenant_id: string
          name: string
          sku: string
          category: string
          unit: string
          unit_cost: number
          unit_price: number
          status: 'active' | 'inactive'
          low_stock_threshold: number | null
          description: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          tenant_id: string
          name: string
          sku: string
          category: string
          unit: string
          unit_cost: number
          unit_price: number
          status?: 'active' | 'inactive'
          low_stock_threshold?: number | null
          description?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          tenant_id?: string
          name?: string
          sku?: string
          category?: string
          unit?: string
          unit_cost?: number
          unit_price?: number
          status?: 'active' | 'inactive'
          low_stock_threshold?: number | null
          description?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      inventory_records: {
        Row: {
          id: string
          tenant_id: string
          branch_id: string
          product_id: string
          quantity_on_hand: number
          quantity_reserved: number
          low_stock_threshold: number
          reorder_level: number
          last_updated: string
        }
        Insert: {
          id?: string
          tenant_id: string
          branch_id: string
          product_id: string
          quantity_on_hand?: number
          quantity_reserved?: number
          low_stock_threshold?: number
          reorder_level?: number
          last_updated?: string
        }
        Update: {
          id?: string
          tenant_id?: string
          branch_id?: string
          product_id?: string
          quantity_on_hand?: number
          quantity_reserved?: number
          low_stock_threshold?: number
          reorder_level?: number
          last_updated?: string
        }
      }
      inventory_movements: {
        Row: {
          id: string
          tenant_id: string
          branch_id: string
          product_id: string
          movement_type: 'addition' | 'sale' | 'adjustment' | 'stock_issue' | 'return'
          quantity: number
          reference_type: 'sale' | 'stock_request' | 'manual' | 'other'
          reference_id: string | null
          performed_by: string
          note: string | null
          created_at: string
        }
        Insert: {
          id?: string
          tenant_id: string
          branch_id: string
          product_id: string
          movement_type: 'addition' | 'sale' | 'adjustment' | 'stock_issue' | 'return'
          quantity: number
          reference_type: 'sale' | 'stock_request' | 'manual' | 'other'
          reference_id?: string | null
          performed_by: string
          note?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          tenant_id?: string
          branch_id?: string
          product_id?: string
          movement_type?: 'addition' | 'sale' | 'adjustment' | 'stock_issue' | 'return'
          quantity?: number
          reference_type?: 'sale' | 'stock_request' | 'manual' | 'other'
          reference_id?: string | null
          performed_by?: string
          note?: string | null
          created_at?: string
        }
      }
      stock_batches: {
        Row: {
          id: string
          tenant_id: string
          branch_id: string
          product_id: string
          batch_number: string
          quantity_received: number
          quantity_remaining: number
          expiry_date: string | null
          received_at: string
          created_at: string
        }
        Insert: {
          id?: string
          tenant_id: string
          branch_id: string
          product_id: string
          batch_number: string
          quantity_received: number
          quantity_remaining: number
          expiry_date?: string | null
          received_at: string
          created_at?: string
        }
        Update: {
          id?: string
          tenant_id?: string
          branch_id?: string
          product_id?: string
          batch_number?: string
          quantity_received?: number
          quantity_remaining?: number
          expiry_date?: string | null
          received_at?: string
          created_at?: string
        }
      }
      customers: {
        Row: {
          id: string
          tenant_id: string
          branch_id: string | null
          name: string
          contact_person: string
          email: string | null
          phone: string | null
          address: string | null
          credit_limit: number | null
          status: 'active' | 'inactive'
          created_by: string
          created_at: string
        }
        Insert: {
          id?: string
          tenant_id: string
          branch_id?: string | null
          name: string
          contact_person: string
          email?: string | null
          phone?: string | null
          address?: string | null
          credit_limit?: number | null
          status?: 'active' | 'inactive'
          created_by: string
          created_at?: string
        }
        Update: {
          id?: string
          tenant_id?: string
          branch_id?: string | null
          name?: string
          contact_person?: string
          email?: string | null
          phone?: string | null
          address?: string | null
          credit_limit?: number | null
          status?: 'active' | 'inactive'
          created_by?: string
          created_at?: string
        }
      }
      sales: {
        Row: {
          id: string
          tenant_id: string
          code: string
          branch_id: string
          customer_id: string | null
          order_id: string | null
          sales_rep_id: string
          product_id: string
          quantity: number
          unit_price: number
          sale_date: string
          walk_in_name: string | null
          walk_in_phone: string | null
          status: 'completed' | 'pending' | 'voided'
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          tenant_id: string
          code: string
          branch_id: string
          customer_id?: string | null
          order_id?: string | null
          sales_rep_id: string
          product_id: string
          quantity: number
          unit_price: number
          sale_date: string
          walk_in_name?: string | null
          walk_in_phone?: string | null
          status?: 'completed' | 'pending' | 'voided'
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          tenant_id?: string
          code?: string
          branch_id?: string
          customer_id?: string | null
          order_id?: string | null
          sales_rep_id?: string
          product_id?: string
          quantity?: number
          unit_price?: number
          sale_date?: string
          walk_in_name?: string | null
          walk_in_phone?: string | null
          status?: 'completed' | 'pending' | 'voided'
          created_at?: string
          updated_at?: string
        }
      }
      customer_payments: {
        Row: {
          id: string
          tenant_id: string
          branch_id: string
          customer_id: string
          sales_rep_id: string
          amount: number
          payment_method: 'cash' | 'transfer' | 'check' | 'other'
          reference_number: string | null
          note: string | null
          payment_date: string
          created_at: string
        }
        Insert: {
          id?: string
          tenant_id: string
          branch_id: string
          customer_id: string
          sales_rep_id: string
          amount: number
          payment_method: 'cash' | 'transfer' | 'check' | 'other'
          reference_number?: string | null
          note?: string | null
          payment_date: string
          created_at?: string
        }
        Update: {
          id?: string
          tenant_id?: string
          branch_id?: string
          customer_id?: string
          sales_rep_id?: string
          amount?: number
          payment_method?: 'cash' | 'transfer' | 'check' | 'other'
          reference_number?: string | null
          note?: string | null
          payment_date?: string
          created_at?: string
        }
      }
      payments: {
        Row: {
          id: string
          tenant_id: string
          branch_id: string
          sales_rep_id: string
          period: string
          total_sales: number
          cash_amount: number
          transfer_amount: number
          transfer_reference: string | null
          submitted_at: string
          acknowledged_by: string | null
          acknowledged_at: string | null
          confirmed_by: string | null
          confirmed_at: string | null
          status: 'submitted' | 'acknowledged' | 'confirmed' | 'declined'
          decline_reason: string | null
          created_at: string
        }
        Insert: {
          id?: string
          tenant_id: string
          branch_id: string
          sales_rep_id: string
          period: string
          total_sales: number
          cash_amount: number
          transfer_amount: number
          transfer_reference?: string | null
          submitted_at: string
          acknowledged_by?: string | null
          acknowledged_at?: string | null
          confirmed_by?: string | null
          confirmed_at?: string | null
          status?: 'submitted' | 'acknowledged' | 'confirmed' | 'declined'
          decline_reason?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          tenant_id?: string
          branch_id?: string
          sales_rep_id?: string
          period?: string
          total_sales?: number
          cash_amount?: number
          transfer_amount?: number
          transfer_reference?: string | null
          submitted_at?: string
          acknowledged_by?: string | null
          acknowledged_at?: string | null
          confirmed_by?: string | null
          confirmed_at?: string | null
          status?: 'submitted' | 'acknowledged' | 'confirmed' | 'declined'
          decline_reason?: string | null
          created_at?: string
        }
      }
      expenses: {
        Row: {
          id: string
          tenant_id: string
          branch_id: string
          manager_id: string
          category: string
          amount: number
          description: string | null
          receipt_url: string | null
          expense_date: string
          created_at: string
        }
        Insert: {
          id?: string
          tenant_id: string
          branch_id: string
          manager_id: string
          category: string
          amount: number
          description?: string | null
          receipt_url?: string | null
          expense_date: string
          created_at?: string
        }
        Update: {
          id?: string
          tenant_id?: string
          branch_id?: string
          manager_id?: string
          category?: string
          amount?: number
          description?: string | null
          receipt_url?: string | null
          expense_date?: string
          created_at?: string
        }
      }
      manager_remittances: {
        Row: {
          id: string
          tenant_id: string
          branch_id: string
          manager_id: string
          period: string
          total_received: number
          total_expenses: number
          net_remittance: number
          cash_amount: number
          transfer_amount: number
          transfer_reference: string | null
          submitted_at: string
          reviewed_by: string | null
          reviewed_at: string | null
          status: 'submitted' | 'approved' | 'rejected'
          reject_reason: string | null
          created_at: string
        }
        Insert: {
          id?: string
          tenant_id: string
          branch_id: string
          manager_id: string
          period: string
          total_received: number
          total_expenses: number
          net_remittance: number
          cash_amount: number
          transfer_amount: number
          transfer_reference?: string | null
          submitted_at: string
          reviewed_by?: string | null
          reviewed_at?: string | null
          status?: 'submitted' | 'approved' | 'rejected'
          reject_reason?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          tenant_id?: string
          branch_id?: string
          manager_id?: string
          period?: string
          total_received?: number
          total_expenses?: number
          net_remittance?: number
          cash_amount?: number
          transfer_amount?: number
          transfer_reference?: string | null
          submitted_at?: string
          reviewed_by?: string | null
          reviewed_at?: string | null
          status?: 'submitted' | 'approved' | 'rejected'
          reject_reason?: string | null
          created_at?: string
        }
      }
      owner_remittances: {
        Row: {
          id: string
          tenant_id: string
          payee_type: 'supplier' | 'employee' | 'utility' | 'tax' | 'other'
          payee_name: string
          amount: number
          payment_method: 'cash' | 'transfer' | 'check' | 'other'
          reference_number: string | null
          description: string | null
          payment_date: string
          created_by: string
          created_at: string
        }
        Insert: {
          id?: string
          tenant_id: string
          payee_type: 'supplier' | 'employee' | 'utility' | 'tax' | 'other'
          payee_name: string
          amount: number
          payment_method: 'cash' | 'transfer' | 'check' | 'other'
          reference_number?: string | null
          description?: string | null
          payment_date: string
          created_by: string
          created_at?: string
        }
        Update: {
          id?: string
          tenant_id?: string
          payee_type?: 'supplier' | 'employee' | 'utility' | 'tax' | 'other'
          payee_name?: string
          amount?: number
          payment_method?: 'cash' | 'transfer' | 'check' | 'other'
          reference_number?: string | null
          description?: string | null
          payment_date?: string
          created_by?: string
          created_at?: string
        }
      }
      stock_requests: {
        Row: {
          id: string
          tenant_id: string
          branch_id: string
          requester_id: string
          product_id: string
          quantity_requested: number
          quantity_approved: number | null
          quantity_issued: number | null
          request_reason: string | null
          status: 'pending' | 'approved' | 'rejected' | 'fulfilled' | 'partially_fulfilled' | 'cancelled'
          reviewed_by: string | null
          reviewed_at: string | null
          fulfilled_by: string | null
          fulfilled_at: string | null
          rejection_reason: string | null
          created_at: string
        }
        Insert: {
          id?: string
          tenant_id: string
          branch_id: string
          requester_id: string
          product_id: string
          quantity_requested: number
          quantity_approved?: number | null
          quantity_issued?: number | null
          request_reason?: string | null
          status?: 'pending' | 'approved' | 'rejected' | 'fulfilled' | 'partially_fulfilled' | 'cancelled'
          reviewed_by?: string | null
          reviewed_at?: string | null
          fulfilled_by?: string | null
          fulfilled_at?: string | null
          rejection_reason?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          tenant_id?: string
          branch_id?: string
          requester_id?: string
          product_id?: string
          quantity_requested?: number
          quantity_approved?: number | null
          quantity_issued?: number | null
          request_reason?: string | null
          status?: 'pending' | 'approved' | 'rejected' | 'fulfilled' | 'partially_fulfilled' | 'cancelled'
          reviewed_by?: string | null
          reviewed_at?: string | null
          fulfilled_by?: string | null
          fulfilled_at?: string | null
          rejection_reason?: string | null
          created_at?: string
        }
      }
      targets: {
        Row: {
          id: string
          tenant_id: string
          scope: 'branch' | 'rep'
          branch_id: string
          user_id: string | null
          month: string
          amount: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          tenant_id: string
          scope: 'branch' | 'rep'
          branch_id: string
          user_id?: string | null
          month: string
          amount: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          tenant_id?: string
          scope?: 'branch' | 'rep'
          branch_id?: string
          user_id?: string | null
          month?: string
          amount?: number
          created_at?: string
          updated_at?: string
        }
      }
      approval_requests: {
        Row: {
          id: string
          tenant_id: string
          branch_id: string
          requester_id: string
          request_type: 'product_deactivation' | 'stock_addition' | 'team_member'
          reference_id: string
          reason: string | null
          status: 'pending' | 'approved' | 'rejected'
          reviewed_by: string | null
          reviewed_at: string | null
          rejection_reason: string | null
          created_at: string
        }
        Insert: {
          id?: string
          tenant_id: string
          branch_id: string
          requester_id: string
          request_type: 'product_deactivation' | 'stock_addition' | 'team_member'
          reference_id: string
          reason?: string | null
          status?: 'pending' | 'approved' | 'rejected'
          reviewed_by?: string | null
          reviewed_at?: string | null
          rejection_reason?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          tenant_id?: string
          branch_id?: string
          requester_id?: string
          request_type?: 'product_deactivation' | 'stock_addition' | 'team_member'
          reference_id?: string
          reason?: string | null
          status?: 'pending' | 'approved' | 'rejected'
          reviewed_by?: string | null
          reviewed_at?: string | null
          rejection_reason?: string | null
          created_at?: string
        }
      }
      onboardings: {
        Row: {
          id: string
          tenant_id: string
          user_id: string | null
          created_by: string | null
          employee_id: string
          job_title: string
          department: string
          start_date: string
          status: 'invited' | 'in_progress' | 'submitted' | 'approved' | 'rejected'
          token_hash: string
          token_expires_at: string
          token_revoked: boolean
          used_at: string | null
          step: number
          data: Json
          correction_note: string | null
          submitter_email: string | null
          guarantor_status: 'not_sent' | 'sent' | 'completed'
          guarantor_token: string | null
          guarantor_response: Json | null
          guarantor_decision: 'accepted' | 'declined' | null
          guarantor_decision_reason: string | null
          guarantor_decided_at: string | null
          reviewed_by: string | null
          reviewed_at: string | null
          rejection_reason: string | null
          assigned_role: 'owner' | 'manager' | 'storekeeper' | 'sales_rep' | null
          assigned_branch_id: string | null
          submitted_at: string | null
          activated_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          tenant_id: string
          user_id?: string | null
          created_by?: string | null
          employee_id: string
          job_title: string
          department: string
          start_date: string
          status?: 'invited' | 'in_progress' | 'submitted' | 'approved' | 'rejected'
          token_hash: string
          token_expires_at: string
          token_revoked?: boolean
          used_at?: string | null
          step?: number
          data?: Json
          correction_note?: string | null
          submitter_email?: string | null
          guarantor_status?: 'not_sent' | 'sent' | 'completed'
          guarantor_token?: string | null
          guarantor_response?: Json | null
          guarantor_decision?: 'accepted' | 'declined' | null
          guarantor_decision_reason?: string | null
          guarantor_decided_at?: string | null
          reviewed_by?: string | null
          reviewed_at?: string | null
          rejection_reason?: string | null
          assigned_role?: 'owner' | 'manager' | 'storekeeper' | 'sales_rep' | null
          assigned_branch_id?: string | null
          submitted_at?: string | null
          activated_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          tenant_id?: string
          user_id?: string | null
          created_by?: string | null
          employee_id?: string
          job_title?: string
          department?: string
          start_date?: string
          status?: 'invited' | 'in_progress' | 'submitted' | 'approved' | 'rejected'
          token_hash?: string
          token_expires_at?: string
          token_revoked?: boolean
          used_at?: string | null
          step?: number
          data?: Json
          correction_note?: string | null
          submitter_email?: string | null
          guarantor_status?: 'not_sent' | 'sent' | 'completed'
          guarantor_token?: string | null
          guarantor_response?: Json | null
          guarantor_decision?: 'accepted' | 'declined' | null
          guarantor_decision_reason?: string | null
          guarantor_decided_at?: string | null
          reviewed_by?: string | null
          reviewed_at?: string | null
          rejection_reason?: string | null
          assigned_role?: 'owner' | 'manager' | 'storekeeper' | 'sales_rep' | null
          assigned_branch_id?: string | null
          submitted_at?: string | null
          activated_at?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      onboarding_files: {
        Row: {
          id: string
          onboarding_id: string
          file_type: 'photo' | 'credential'
          file_name: string
          cloudinary_public_id: string
          cloudinary_url: string
          file_size: number
          mime_type: string
          uploaded_at: string
        }
        Insert: {
          id?: string
          onboarding_id: string
          file_type: 'photo' | 'credential'
          file_name: string
          cloudinary_public_id: string
          cloudinary_url: string
          file_size: number
          mime_type: string
          uploaded_at?: string
        }
        Update: {
          id?: string
          onboarding_id?: string
          file_type?: 'photo' | 'credential'
          file_name?: string
          cloudinary_public_id?: string
          cloudinary_url?: string
          file_size?: number
          mime_type?: string
          uploaded_at?: string
        }
      }
      activities: {
        Row: {
          id: string
          tenant_id: string
          action: string
          subject: string
          actor_id: string
          entity: 'product' | 'sale' | 'payment' | 'expense' | 'remittance' | 'stock_request' | 'target' | 'team_member' | 'branch' | 'inventory' | 'settings' | 'session' | 'customer'
          entity_id: string | null
          emergency: boolean | null
          metadata: Json | null
          created_at: string
        }
        Insert: {
          id?: string
          tenant_id: string
          action: string
          subject: string
          actor_id: string
          entity: 'product' | 'sale' | 'payment' | 'expense' | 'remittance' | 'stock_request' | 'target' | 'team_member' | 'branch' | 'inventory' | 'settings' | 'session' | 'customer'
          entity_id?: string | null
          emergency?: boolean | null
          metadata?: Json | null
          created_at?: string
        }
        Update: {
          id?: string
          tenant_id?: string
          action?: string
          subject?: string
          actor_id?: string
          entity?: 'product' | 'sale' | 'payment' | 'expense' | 'remittance' | 'stock_request' | 'target' | 'team_member' | 'branch' | 'inventory' | 'settings' | 'session' | 'customer'
          entity_id?: string | null
          emergency?: boolean | null
          metadata?: Json | null
          created_at?: string
        }
      }
      notifications: {
        Row: {
          id: string
          tenant_id: string
          recipient_id: string
          type: 'payment_awaiting_acknowledgement' | 'payment_awaiting_confirmation' | 'payment_confirmed' | 'payment_declined' | 'onboarding_submitted' | 'onboarding_approved' | 'onboarding_rejected' | 'guarantor_completed' | 'stock_request_submitted' | 'stock_request_approved' | 'stock_request_rejected' | 'stock_request_fulfilled'
          entity_type: 'payment' | 'customer_payment' | 'onboarding' | 'stock_request'
          entity_id: string
          message: string
          read_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          tenant_id: string
          recipient_id: string
          type: 'payment_awaiting_acknowledgement' | 'payment_awaiting_confirmation' | 'payment_confirmed' | 'payment_declined' | 'onboarding_submitted' | 'onboarding_approved' | 'onboarding_rejected' | 'guarantor_completed' | 'stock_request_submitted' | 'stock_request_approved' | 'stock_request_rejected' | 'stock_request_fulfilled'
          entity_type: 'payment' | 'customer_payment' | 'onboarding' | 'stock_request'
          entity_id: string
          message: string
          read_at?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          tenant_id?: string
          recipient_id?: string
          type?: 'payment_awaiting_acknowledgement' | 'payment_awaiting_confirmation' | 'payment_confirmed' | 'payment_declined' | 'onboarding_submitted' | 'onboarding_approved' | 'onboarding_rejected' | 'guarantor_completed' | 'stock_request_submitted' | 'stock_request_approved' | 'stock_request_rejected' | 'stock_request_fulfilled'
          entity_type?: 'payment' | 'customer_payment' | 'onboarding' | 'stock_request'
          entity_id?: string
          message?: string
          read_at?: string | null
          created_at?: string
        }
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_user_tenant_id: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
      get_user_role: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
      get_user_branch_id: {
        Args: Record<PropertyKey, never>
        Returns: string
      }
      get_customer_balance: {
        Args: { p_customer_id: string }
        Returns: number
      }
      can_customer_order: {
        Args: { p_customer_id: string; p_order_amount: number }
        Returns: boolean
      }
      get_rep_total_sales: {
        Args: { p_rep_id: string; p_start_date: string; p_end_date: string }
        Returns: number
      }
      get_target_achievement: {
        Args: { p_target_id: string }
        Returns: number
      }
      create_audit_log: {
        Args: {
          p_tenant_id: string
          p_actor_id: string
          p_action: string
          p_subject: string
          p_entity: string
          p_entity_id?: string
          p_emergency?: boolean
          p_metadata?: Json
        }
        Returns: string
      }
      create_notification: {
        Args: {
          p_tenant_id: string
          p_recipient_id: string
          p_type: string
          p_entity_type: string
          p_entity_id: string
          p_message: string
        }
        Returns: string
      }
      mark_notification_read: {
        Args: { p_notification_id: string }
        Returns: void
      }
      get_unread_notification_count: {
        Args: { p_user_id: string }
        Returns: number
      }
      handle_new_user: {
        Args: Record<PropertyKey, never>
        Returns: void
      }
      hash_token: {
        Args: { p_token: string }
        Returns: string
      }
      get_onboarding_by_token: {
        Args: { p_token: string }
        Returns: {
          id: string
          tenant_id: string
          user_id: string | null
          employee_id: string
          job_title: string
          department: string
          start_date: string
          status: string
          step: number
          data: Json
          correction_note: string | null
          guarantor_status: string
          guarantor_token: string | null
          token_expires_at: string
          token_revoked: boolean
          used_at: string | null
          submitted_at: string | null
          created_at: string
        }[]
      }
      save_onboarding_progress: {
        Args: { p_token: string; p_data: Json; p_step: number; p_partial_files?: Json }
        Returns: { id: string; status: string; step: number }[]
      }
      submit_onboarding: {
        Args: { p_token: string; p_data: Json; p_email: string }
        Returns: { id: string; status: string }[]
      }
      send_guarantor_link: {
        Args: { p_token: string }
        Returns: string
      }
      submit_guarantor: {
        Args: { p_guarantor_token: string; p_response: Json }
        Returns: { id: string; guarantor_status: string }[]
      }
      register_onboarding_file: {
        Args: {
          p_token: string
          p_file_type: string
          p_file_name: string
          p_storage_path: string
          p_size: number
          p_mime: string
        }
        Returns: string
      }
      list_onboarding_files: {
        Args: { p_token: string }
        Returns: {
          id: string
          file_type: string
          file_name: string
          cloudinary_url: string
          file_size: number
          mime_type: string
        }[]
      }
      delete_onboarding_file: {
        Args: { p_token: string; p_file_id: string }
        Returns: void
      }
      review_guarantor: {
        Args: { p_onboarding_id: string; p_decision: string; p_reason: string }
        Returns: { id: string; guarantor_decision: string }[]
      }
      approve_onboarding: {
        Args: { p_onboarding_id: string; p_role: string; p_branch_id: string | null }
        Returns: { user_id: string; onboarding_id: string }[]
      }
      reject_onboarding: {
        Args: { p_onboarding_id: string; p_reason: string }
        Returns: { id: string; status: string }[]
      }
    }
    Enums: {
      [_ in never]: never
    }
  }
}
