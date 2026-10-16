/**
 * Supabase Database Types
 * Generated from database schema
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
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          created_at?: string
          updated_at?: string
        }
      }
      branches: {
        Row: {
          id: string
          tenant_id: string
          name: string
          code: string
          location: string
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
          location?: string
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
          branch_id: string | null
          auth_id: string | null
          first_name: string
          last_name: string
          email: string | null
          phone: string | null
          role: 'owner' | 'manager' | 'storekeeper' | 'sales_rep'
          status: 'active' | 'inactive' | 'pending'
          joined_at: string
          deactivated_at: string | null
        }
        Insert: {
          id?: string
          tenant_id: string
          branch_id?: string | null
          auth_id?: string | null
          first_name: string
          last_name: string
          email?: string | null
          phone?: string | null
          role: 'owner' | 'manager' | 'storekeeper' | 'sales_rep'
          status?: 'active' | 'inactive' | 'pending'
          joined_at?: string
          deactivated_at?: string | null
        }
        Update: {
          id?: string
          tenant_id?: string
          branch_id?: string | null
          auth_id?: string | null
          first_name?: string
          last_name?: string
          email?: string | null
          phone?: string | null
          role?: 'owner' | 'manager' | 'storekeeper' | 'sales_rep'
          status?: 'active' | 'inactive' | 'pending'
          joined_at?: string
          deactivated_at?: string | null
        }
      }
      user_preferences: {
        Row: {
          id: string
          user_id: string
          date_format: 'DD/MM/YYYY' | 'MM/DD/YYYY' | 'YYYY-MM-DD'
          report_period: 'month' | 'quarter' | 'year'
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          date_format?: 'DD/MM/YYYY' | 'MM/DD/YYYY' | 'YYYY-MM-DD'
          report_period?: 'month' | 'quarter' | 'year'
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          date_format?: 'DD/MM/YYYY' | 'MM/DD/YYYY' | 'YYYY-MM-DD'
          report_period?: 'month' | 'quarter' | 'year'
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
          status: 'active' | 'inactive'
          low_stock_threshold: number
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
          status?: 'active' | 'inactive'
          low_stock_threshold?: number
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
          status?: 'active' | 'inactive'
          low_stock_threshold?: number
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
          reserved_quantity: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          tenant_id: string
          branch_id: string
          product_id: string
          quantity_on_hand?: number
          reserved_quantity?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          tenant_id?: string
          branch_id?: string
          product_id?: string
          quantity_on_hand?: number
          reserved_quantity?: number
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
          movement_type: 'sale' | 'stock_issue' | 'addition' | 'adjustment'
          quantity: number
          reference_id: string | null
          reference_type: string | null
          notes: string | null
          created_by: string
          created_at: string
        }
        Insert: {
          id?: string
          tenant_id: string
          branch_id: string
          product_id: string
          movement_type: 'sale' | 'stock_issue' | 'addition' | 'adjustment'
          quantity: number
          reference_id?: string | null
          reference_type?: string | null
          notes?: string | null
          created_by: string
          created_at?: string
        }
        Update: {
          id?: string
          tenant_id?: string
          branch_id?: string
          product_id?: string
          movement_type?: 'sale' | 'stock_issue' | 'addition' | 'adjustment'
          quantity?: number
          reference_id?: string | null
          reference_type?: string | null
          notes?: string | null
          created_by?: string
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
          quantity: number
          expiry_date: string | null
          cost_per_unit: number
          added_by: string
          created_at: string
        }
        Insert: {
          id?: string
          tenant_id: string
          branch_id: string
          product_id: string
          batch_number: string
          quantity: number
          expiry_date?: string | null
          cost_per_unit: number
          added_by: string
          created_at?: string
        }
        Update: {
          id?: string
          tenant_id?: string
          branch_id?: string
          product_id?: string
          batch_number?: string
          quantity?: number
          expiry_date?: string | null
          cost_per_unit?: number
          added_by?: string
          created_at?: string
        }
      }
      customers: {
        Row: {
          id: string
          tenant_id: string
          branch_id: string
          name: string
          phone: string
          address: string | null
          credit_limit: number
          status: 'active' | 'inactive' | 'suspended'
          created_by: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          tenant_id: string
          branch_id: string
          name: string
          phone: string
          address?: string | null
          credit_limit?: number
          status?: 'active' | 'inactive' | 'suspended'
          created_by: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          tenant_id?: string
          branch_id?: string
          name?: string
          phone?: string
          address?: string | null
          credit_limit?: number
          status?: 'active' | 'inactive' | 'suspended'
          created_by?: string
          created_at?: string
          updated_at?: string
        }
      }
      sales: {
        Row: {
          id: string
          tenant_id: string
          branch_id: string
          sales_rep_id: string
          customer_id: string | null
          product_id: string
          quantity: number
          unit_price: number
          total_amount: number
          sale_date: string
          notes: string | null
          created_at: string
        }
        Insert: {
          id?: string
          tenant_id: string
          branch_id: string
          sales_rep_id: string
          customer_id?: string | null
          product_id: string
          quantity: number
          unit_price: number
          total_amount: number
          sale_date: string
          notes?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          tenant_id?: string
          branch_id?: string
          sales_rep_id?: string
          customer_id?: string | null
          product_id?: string
          quantity?: number
          unit_price?: number
          total_amount?: number
          sale_date?: string
          notes?: string | null
          created_at?: string
        }
      }
      customer_payments: {
        Row: {
          id: string
          tenant_id: string
          branch_id: string
          customer_id: string
          amount: number
          payment_method: 'cash' | 'bank_transfer' | 'mobile_money'
          payment_date: string
          reference_number: string | null
          received_by: string
          notes: string | null
          created_at: string
        }
        Insert: {
          id?: string
          tenant_id: string
          branch_id: string
          customer_id: string
          amount: number
          payment_method: 'cash' | 'bank_transfer' | 'mobile_money'
          payment_date: string
          reference_number?: string | null
          received_by: string
          notes?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          tenant_id?: string
          branch_id?: string
          customer_id?: string
          amount?: number
          payment_method?: 'cash' | 'bank_transfer' | 'mobile_money'
          payment_date?: string
          reference_number?: string | null
          received_by?: string
          notes?: string | null
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
          cash_amount: number
          transfer_amount: number
          transfer_reference: string | null
          status: 'pending' | 'acknowledged' | 'confirmed' | 'rejected'
          submitted_at: string
          acknowledged_at: string | null
          acknowledged_by: string | null
          confirmed_at: string | null
          confirmed_by: string | null
          rejection_reason: string | null
          notes: string | null
        }
        Insert: {
          id?: string
          tenant_id: string
          branch_id: string
          sales_rep_id: string
          period: string
          cash_amount: number
          transfer_amount: number
          transfer_reference?: string | null
          status?: 'pending' | 'acknowledged' | 'confirmed' | 'rejected'
          submitted_at?: string
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          confirmed_at?: string | null
          confirmed_by?: string | null
          rejection_reason?: string | null
          notes?: string | null
        }
        Update: {
          id?: string
          tenant_id?: string
          branch_id?: string
          sales_rep_id?: string
          period?: string
          cash_amount?: number
          transfer_amount?: number
          transfer_reference?: string | null
          status?: 'pending' | 'acknowledged' | 'confirmed' | 'rejected'
          submitted_at?: string
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          confirmed_at?: string | null
          confirmed_by?: string | null
          rejection_reason?: string | null
          notes?: string | null
        }
      }
      expenses: {
        Row: {
          id: string
          tenant_id: string
          branch_id: string
          category: string
          amount: number
          expense_date: string
          description: string
          receipt_url: string | null
          submitted_by: string
          approved_by: string | null
          status: 'pending' | 'approved' | 'rejected'
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          tenant_id: string
          branch_id: string
          category: string
          amount: number
          expense_date: string
          description: string
          receipt_url?: string | null
          submitted_by: string
          approved_by?: string | null
          status?: 'pending' | 'approved' | 'rejected'
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          tenant_id?: string
          branch_id?: string
          category?: string
          amount?: number
          expense_date?: string
          description?: string
          receipt_url?: string | null
          submitted_by?: string
          approved_by?: string | null
          status?: 'pending' | 'approved' | 'rejected'
          created_at?: string
          updated_at?: string
        }
      }
      manager_remittances: {
        Row: {
          id: string
          tenant_id: string
          branch_id: string
          manager_id: string
          period: string
          total_sales: number
          total_expenses: number
          payments_received: number
          net_amount: number
          status: 'pending' | 'submitted' | 'approved' | 'rejected'
          submitted_at: string | null
          approved_at: string | null
          approved_by: string | null
          notes: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          tenant_id: string
          branch_id: string
          manager_id: string
          period: string
          total_sales: number
          total_expenses: number
          payments_received: number
          net_amount: number
          status?: 'pending' | 'submitted' | 'approved' | 'rejected'
          submitted_at?: string | null
          approved_at?: string | null
          approved_by?: string | null
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          tenant_id?: string
          branch_id?: string
          manager_id?: string
          period?: string
          total_sales?: number
          total_expenses?: number
          payments_received?: number
          net_amount?: number
          status?: 'pending' | 'submitted' | 'approved' | 'rejected'
          submitted_at?: string | null
          approved_at?: string | null
          approved_by?: string | null
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      owner_remittances: {
        Row: {
          id: string
          tenant_id: string
          payee_type: 'manager' | 'storekeeper' | 'supplier' | 'other'
          payee_id: string | null
          amount: number
          payment_method: 'cash' | 'bank_transfer' | 'cheque' | 'mobile_money'
          payment_date: string
          reference_number: string | null
          description: string
          paid_by: string
          created_at: string
        }
        Insert: {
          id?: string
          tenant_id: string
          payee_type: 'manager' | 'storekeeper' | 'supplier' | 'other'
          payee_id?: string | null
          amount: number
          payment_method: 'cash' | 'bank_transfer' | 'cheque' | 'mobile_money'
          payment_date: string
          reference_number?: string | null
          description: string
          paid_by: string
          created_at?: string
        }
        Update: {
          id?: string
          tenant_id?: string
          payee_type?: 'manager' | 'storekeeper' | 'supplier' | 'other'
          payee_id?: string | null
          amount?: number
          payment_method?: 'cash' | 'bank_transfer' | 'cheque' | 'mobile_money'
          payment_date?: string
          reference_number?: string | null
          description?: string
          paid_by?: string
          created_at?: string
        }
      }
      stock_requests: {
        Row: {
          id: string
          tenant_id: string
          branch_id: string
          product_id: string
          requested_by: string
          quantity: number
          status: 'pending' | 'approved' | 'rejected' | 'fulfilled' | 'partially_fulfilled'
          approved_quantity: number | null
          fulfilled_quantity: number
          requested_at: string
          reviewed_at: string | null
          reviewed_by: string | null
          fulfilled_at: string | null
          fulfilled_by: string | null
          rejection_reason: string | null
          notes: string | null
        }
        Insert: {
          id?: string
          tenant_id: string
          branch_id: string
          product_id: string
          requested_by: string
          quantity: number
          status?: 'pending' | 'approved' | 'rejected' | 'fulfilled' | 'partially_fulfilled'
          approved_quantity?: number | null
          fulfilled_quantity?: number
          requested_at?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          fulfilled_at?: string | null
          fulfilled_by?: string | null
          rejection_reason?: string | null
          notes?: string | null
        }
        Update: {
          id?: string
          tenant_id?: string
          branch_id?: string
          product_id?: string
          requested_by?: string
          quantity?: number
          status?: 'pending' | 'approved' | 'rejected' | 'fulfilled' | 'partially_fulfilled'
          approved_quantity?: number | null
          fulfilled_quantity?: number
          requested_at?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          fulfilled_at?: string | null
          fulfilled_by?: string | null
          rejection_reason?: string | null
          notes?: string | null
        }
      }
      targets: {
        Row: {
          id: string
          tenant_id: string
          branch_id: string
          user_id: string
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
          branch_id: string
          user_id: string
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
          branch_id?: string
          user_id?: string
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
          request_type: string
          requested_by: string
          reviewed_by: string | null
          status: 'pending' | 'approved' | 'rejected'
          request_data: Json
          rejection_reason: string | null
          created_at: string
          reviewed_at: string | null
        }
        Insert: {
          id?: string
          tenant_id: string
          branch_id: string
          request_type: string
          requested_by: string
          reviewed_by?: string | null
          status?: 'pending' | 'approved' | 'rejected'
          request_data: Json
          rejection_reason?: string | null
          created_at?: string
          reviewed_at?: string | null
        }
        Update: {
          id?: string
          tenant_id?: string
          branch_id?: string
          request_type?: string
          requested_by?: string
          reviewed_by?: string | null
          status?: 'pending' | 'approved' | 'rejected'
          request_data?: Json
          rejection_reason?: string | null
          created_at?: string
          reviewed_at?: string | null
        }
      }
      onboardings: {
        Row: {
          id: string
          tenant_id: string
          branch_id: string
          token: string
          first_name: string
          last_name: string
          phone: string
          role: 'manager' | 'storekeeper' | 'sales_rep'
          status: 'pending' | 'completed' | 'expired'
          created_by: string
          completed_at: string | null
          expires_at: string
          created_at: string
        }
        Insert: {
          id?: string
          tenant_id: string
          branch_id: string
          token: string
          first_name: string
          last_name: string
          phone: string
          role: 'manager' | 'storekeeper' | 'sales_rep'
          status?: 'pending' | 'completed' | 'expired'
          created_by: string
          completed_at?: string | null
          expires_at: string
          created_at?: string
        }
        Update: {
          id?: string
          tenant_id?: string
          branch_id?: string
          token?: string
          first_name?: string
          last_name?: string
          phone?: string
          role?: 'manager' | 'storekeeper' | 'sales_rep'
          status?: 'pending' | 'completed' | 'expired'
          created_by?: string
          completed_at?: string | null
          expires_at?: string
          created_at?: string
        }
      }
      onboarding_files: {
        Row: {
          id: string
          onboarding_id: string
          file_type: string
          file_url: string
          uploaded_at: string
        }
        Insert: {
          id?: string
          onboarding_id: string
          file_type: string
          file_url: string
          uploaded_at?: string
        }
        Update: {
          id?: string
          onboarding_id?: string
          file_type?: string
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
          type: string
          title: string
          message: string
          link: string | null
          read: boolean
          created_at: string
        }
        Insert: {
          id?: string
          tenant_id: string
          user_id: string
          type: string
          title: string
          message: string
          link?: string | null
          read?: boolean
          created_at?: string
        }
        Update: {
          id?: string
          tenant_id?: string
          user_id?: string
          type?: string
          title?: string
          message?: string
          link?: string | null
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
        Returns: string | null
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
          p_link?: string
        }
        Returns: void
      }
    }
    Enums: {
      [_ in never]: never
    }
  }
}
