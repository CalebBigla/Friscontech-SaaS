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
          location: string | null
          status: 'active' | 'inactive'
          manager_id: string | null
          created_at: string
          deactivated_at: string | null
        }
        Insert: {
          id?: string
          tenant_id: string
          name: string
          code: string
          location?: string | null
          status?: 'active' | 'inactive'
          manager_id?: string | null
          created_at?: string
          deactivated_at?: string | null
        }
        Update: {
          id?: string
          tenant_id?: string
          name?: string
          code?: string
          location?: string | null
          status?: 'active' | 'inactive'
          manager_id?: string | null
          created_at?: string
          deactivated_at?: string | null
        }
      }
      users: {
        Row: {
          id: string
          tenant_id: string
          branch_id: string | null
          first_name: string
          last_name: string
          email: string | null
          phone: string | null
          role: 'owner' | 'manager' | 'storekeeper' | 'sales_rep'
          status: 'active' | 'inactive' | 'pending'
          joined_at: string
          deactivated_at: string | null
          auth_id: string | null
        }
        Insert: {
          id?: string
          tenant_id: string
          branch_id?: string | null
          first_name: string
          last_name: string
          email?: string | null
          phone?: string | null
          role: 'owner' | 'manager' | 'storekeeper' | 'sales_rep'
          status?: 'active' | 'inactive' | 'pending'
          joined_at?: string
          deactivated_at?: string | null
          auth_id?: string | null
        }
        Update: {
          id?: string
          tenant_id?: string
          branch_id?: string | null
          first_name?: string
          last_name?: string
          email?: string | null
          phone?: string | null
          role?: 'owner' | 'manager' | 'storekeeper' | 'sales_rep'
          status?: 'active' | 'inactive' | 'pending'
          joined_at?: string
          deactivated_at?: string | null
          auth_id?: string | null
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
          image_url: string | null
          created_at: string
          deactivated_at: string | null
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
          image_url?: string | null
          created_at?: string
          deactivated_at?: string | null
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
          image_url?: string | null
          created_at?: string
          deactivated_at?: string | null
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
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          tenant_id: string
          branch_id: string
          product_id: string
          quantity_on_hand?: number
          quantity_reserved?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          tenant_id?: string
          branch_id?: string
          product_id?: string
          quantity_on_hand?: number
          quantity_reserved?: number
          created_at?: string
          updated_at?: string
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
          branch_id: string
          name: string
          email: string | null
          phone: string | null
          address: string | null
          business_name: string | null
          credit_limit: number
          status: 'active' | 'inactive' | 'suspended'
          created_by: string
          created_at: string
          deactivated_at: string | null
        }
        Insert: {
          id?: string
          tenant_id: string
          branch_id: string
          name: string
          email?: string | null
          phone?: string | null
          address?: string | null
          business_name?: string | null
          credit_limit?: number
          status?: 'active' | 'inactive' | 'suspended'
          created_by: string
          created_at?: string
          deactivated_at?: string | null
        }
        Update: {
          id?: string
          tenant_id?: string
          branch_id?: string
          name?: string
          email?: string | null
          phone?: string | null
          address?: string | null
          business_name?: string | null
          credit_limit?: number
          status?: 'active' | 'inactive' | 'suspended'
          created_by?: string
          created_at?: string
          deactivated_at?: string | null
        }
      }
      sales: {
        Row: {
          id: string
          tenant_id: string
          branch_id: string
          customer_id: string | null
          sales_rep_id: string
          product_id: string
          quantity: number
          unit_price: number
          total_amount: number
          sale_date: string
          created_at: string
        }
        Insert: {
          id?: string
          tenant_id: string
          branch_id: string
          customer_id?: string | null
          sales_rep_id: string
          product_id: string
          quantity: number
          unit_price: number
          total_amount: number
          sale_date: string
          created_at?: string
        }
        Update: {
          id?: string
          tenant_id?: string
          branch_id?: string
          customer_id?: string | null
          sales_rep_id?: string
          product_id?: string
          quantity?: number
          unit_price?: number
          total_amount?: number
          sale_date?: string
          created_at?: string
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
          branch_id: string | null
          user_id: string | null
          product_id: string | null
          month: string
          target_amount: number
          created_by: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          tenant_id: string
          branch_id?: string | null
          user_id?: string | null
          product_id?: string | null
          month: string
          target_amount: number
          created_by: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          tenant_id?: string
          branch_id?: string | null
          user_id?: string | null
          product_id?: string | null
          month?: string
          target_amount?: number
          created_by?: string
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
          token: string
          first_name: string
          last_name: string
          phone: string
          branch_id: string
          role: 'manager' | 'storekeeper' | 'sales_rep'
          created_by: string
          completed: boolean
          completed_at: string | null
          expires_at: string
          created_at: string
        }
        Insert: {
          id?: string
          tenant_id: string
          token: string
          first_name: string
          last_name: string
          phone: string
          branch_id: string
          role: 'manager' | 'storekeeper' | 'sales_rep'
          created_by: string
          completed?: boolean
          completed_at?: string | null
          expires_at: string
          created_at?: string
        }
        Update: {
          id?: string
          tenant_id?: string
          token?: string
          first_name?: string
          last_name?: string
          phone?: string
          branch_id?: string
          role?: 'manager' | 'storekeeper' | 'sales_rep'
          created_by?: string
          completed?: boolean
          completed_at?: string | null
          expires_at?: string
          created_at?: string
        }
      }
      onboarding_files: {
        Row: {
          id: string
          onboarding_id: string
          file_type: 'id_card' | 'photo' | 'guarantor_id' | 'address_proof' | 'other'
          file_url: string
          uploaded_at: string
        }
        Insert: {
          id?: string
          onboarding_id: string
          file_type: 'id_card' | 'photo' | 'guarantor_id' | 'address_proof' | 'other'
          file_url: string
          uploaded_at?: string
        }
        Update: {
          id?: string
          onboarding_id?: string
          file_type?: 'id_card' | 'photo' | 'guarantor_id' | 'address_proof' | 'other'
          file_url?: string
          uploaded_at?: string
        }
      }
      activities: {
        Row: {
          id: string
          tenant_id: string
          user_id: string
          action_type: string
          description: string
          entity_type: string | null
          entity_id: string | null
          metadata: Json | null
          created_at: string
        }
        Insert: {
          id?: string
          tenant_id: string
          user_id: string
          action_type: string
          description: string
          entity_type?: string | null
          entity_id?: string | null
          metadata?: Json | null
          created_at?: string
        }
        Update: {
          id?: string
          tenant_id?: string
          user_id?: string
          action_type?: string
          description?: string
          entity_type?: string | null
          entity_id?: string | null
          metadata?: Json | null
          created_at?: string
        }
      }
      notifications: {
        Row: {
          id: string
          tenant_id: string
          user_id: string
          type: 'payment_pending' | 'payment_confirmed' | 'stock_low' | 'approval_needed' | 'general'
          title: string
          message: string
          action_url: string | null
          read: boolean
          created_at: string
        }
        Insert: {
          id?: string
          tenant_id: string
          user_id: string
          type: 'payment_pending' | 'payment_confirmed' | 'stock_low' | 'approval_needed' | 'general'
          title: string
          message: string
          action_url?: string | null
          read?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          tenant_id?: string
          user_id?: string
          type?: 'payment_pending' | 'payment_confirmed' | 'stock_low' | 'approval_needed' | 'general'
          title?: string
          message?: string
          action_url?: string | null
          read?: boolean
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
          p_user_id: string
          p_action_type: string
          p_description: string
          p_entity_type?: string
          p_entity_id?: string
          p_metadata?: Json
        }
        Returns: void
      }
      create_notification: {
        Args: {
          p_user_id: string
          p_type: string
          p_title: string
          p_message: string
          p_action_url?: string
        }
        Returns: void
      }
    }
    Enums: {
      [_ in never]: never
    }
  }
}
