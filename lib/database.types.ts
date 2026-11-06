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
    PostgrestVersion: "14.17"
  }
  public: {
    Tables: {
      drivers: {
        Row: {
          created_at: string
          fleet_id: string
          full_name: string
          id: string
          license_class: string | null
          license_expires_at: string | null
          license_number: string | null
          phone: string | null
          status: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          fleet_id: string
          full_name: string
          id?: string
          license_class?: string | null
          license_expires_at?: string | null
          license_number?: string | null
          phone?: string | null
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          fleet_id?: string
          full_name?: string
          id?: string
          license_class?: string | null
          license_expires_at?: string | null
          license_number?: string | null
          phone?: string | null
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "drivers_fleet_id_fkey"
            columns: ["fleet_id"]
            isOneToOne: false
            referencedRelation: "fleets"
            referencedColumns: ["id"]
          },
        ]
      }
      fleet_members: {
        Row: {
          created_at: string
          fleet_id: string
          role: string
          user_id: string
        }
        Insert: {
          created_at?: string
          fleet_id: string
          role?: string
          user_id: string
        }
        Update: {
          created_at?: string
          fleet_id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fleet_members_fleet_id_fkey"
            columns: ["fleet_id"]
            isOneToOne: false
            referencedRelation: "fleets"
            referencedColumns: ["id"]
          },
        ]
      }
      fleets: {
        Row: {
          created_at: string
          id: string
          name: string
          owner_user_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          owner_user_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          owner_user_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      incidents: {
        Row: {
          created_at: string
          created_by: string | null
          description: string
          driver_id: string | null
          fleet_id: string
          id: string
          incident_type: string
          latitude: number | null
          location_text: string | null
          longitude: number | null
          photo_path: string | null
          reported_at: string
          resolved_at: string | null
          severity: string
          status: string
          trip_id: string | null
          updated_at: string
          vehicle_id: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description: string
          driver_id?: string | null
          fleet_id: string
          id?: string
          incident_type: string
          latitude?: number | null
          location_text?: string | null
          longitude?: number | null
          photo_path?: string | null
          reported_at?: string
          resolved_at?: string | null
          severity?: string
          status?: string
          trip_id?: string | null
          updated_at?: string
          vehicle_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string
          driver_id?: string | null
          fleet_id?: string
          id?: string
          incident_type?: string
          latitude?: number | null
          location_text?: string | null
          longitude?: number | null
          photo_path?: string | null
          reported_at?: string
          resolved_at?: string | null
          severity?: string
          status?: string
          trip_id?: string | null
          updated_at?: string
          vehicle_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "incidents_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incidents_fleet_id_fkey"
            columns: ["fleet_id"]
            isOneToOne: false
            referencedRelation: "fleets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incidents_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incidents_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      inspections: {
        Row: {
          checklist: Json
          created_at: string
          defects: string | null
          driver_id: string
          fleet_id: string
          id: string
          inspected_at: string
          inspection_type: string
          passed: boolean
          trip_id: string | null
          vehicle_id: string
        }
        Insert: {
          checklist?: Json
          created_at?: string
          defects?: string | null
          driver_id: string
          fleet_id: string
          id?: string
          inspected_at?: string
          inspection_type?: string
          passed?: boolean
          trip_id?: string | null
          vehicle_id: string
        }
        Update: {
          checklist?: Json
          created_at?: string
          defects?: string | null
          driver_id?: string
          fleet_id?: string
          id?: string
          inspected_at?: string
          inspection_type?: string
          passed?: boolean
          trip_id?: string | null
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inspections_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inspections_fleet_id_fkey"
            columns: ["fleet_id"]
            isOneToOne: false
            referencedRelation: "fleets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inspections_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inspections_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      maintenance_records: {
        Row: {
          completed_at: string | null
          cost: number | null
          created_at: string
          description: string | null
          fleet_id: string
          id: string
          incident_id: string | null
          maintenance_type: string
          odometer_km: number | null
          scheduled_at: string | null
          status: string
          updated_at: string
          vehicle_id: string
        }
        Insert: {
          completed_at?: string | null
          cost?: number | null
          created_at?: string
          description?: string | null
          fleet_id: string
          id?: string
          incident_id?: string | null
          maintenance_type: string
          odometer_km?: number | null
          scheduled_at?: string | null
          status?: string
          updated_at?: string
          vehicle_id: string
        }
        Update: {
          completed_at?: string | null
          cost?: number | null
          created_at?: string
          description?: string | null
          fleet_id?: string
          id?: string
          incident_id?: string | null
          maintenance_type?: string
          odometer_km?: number | null
          scheduled_at?: string | null
          status?: string
          updated_at?: string
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "maintenance_records_fleet_id_fkey"
            columns: ["fleet_id"]
            isOneToOne: false
            referencedRelation: "fleets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maintenance_records_incident_id_fkey"
            columns: ["incident_id"]
            isOneToOne: false
            referencedRelation: "incidents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maintenance_records_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          full_name: string | null
          id: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          full_name?: string | null
          id: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          full_name?: string | null
          id?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      road_restrictions: {
        Row: {
          active_from: string | null
          active_until: string | null
          created_at: string
          created_by: string | null
          direction: string | null
          fleet_id: string
          id: string
          is_active: boolean
          max_height_m: number | null
          max_length_m: number | null
          max_weight_t: number | null
          max_width_m: number | null
          notes: string | null
          restriction_type: string
          road_name: string
          updated_at: string
          valid_from: string | null
          valid_until: string | null
        }
        Insert: {
          active_from?: string | null
          active_until?: string | null
          created_at?: string
          created_by?: string | null
          direction?: string | null
          fleet_id: string
          id?: string
          is_active?: boolean
          max_height_m?: number | null
          max_length_m?: number | null
          max_weight_t?: number | null
          max_width_m?: number | null
          notes?: string | null
          restriction_type: string
          road_name: string
          updated_at?: string
          valid_from?: string | null
          valid_until?: string | null
        }
        Update: {
          active_from?: string | null
          active_until?: string | null
          created_at?: string
          created_by?: string | null
          direction?: string | null
          fleet_id?: string
          id?: string
          is_active?: boolean
          max_height_m?: number | null
          max_length_m?: number | null
          max_weight_t?: number | null
          max_width_m?: number | null
          notes?: string | null
          restriction_type?: string
          road_name?: string
          updated_at?: string
          valid_from?: string | null
          valid_until?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "road_restrictions_fleet_id_fkey"
            columns: ["fleet_id"]
            isOneToOne: false
            referencedRelation: "fleets"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          assigned_driver_id: string | null
          assigned_vehicle_id: string | null
          created_at: string
          created_by: string | null
          delivery_address: string | null
          description: string | null
          fleet_id: string
          id: string
          pickup_address: string | null
          reference_code: string | null
          scheduled_at: string | null
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          assigned_driver_id?: string | null
          assigned_vehicle_id?: string | null
          created_at?: string
          created_by?: string | null
          delivery_address?: string | null
          description?: string | null
          fleet_id: string
          id?: string
          pickup_address?: string | null
          reference_code?: string | null
          scheduled_at?: string | null
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          assigned_driver_id?: string | null
          assigned_vehicle_id?: string | null
          created_at?: string
          created_by?: string | null
          delivery_address?: string | null
          description?: string | null
          fleet_id?: string
          id?: string
          pickup_address?: string | null
          reference_code?: string | null
          scheduled_at?: string | null
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_assigned_driver_id_fkey"
            columns: ["assigned_driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_assigned_vehicle_id_fkey"
            columns: ["assigned_vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_fleet_id_fkey"
            columns: ["fleet_id"]
            isOneToOne: false
            referencedRelation: "fleets"
            referencedColumns: ["id"]
          },
        ]
      }
      trip_locations: {
        Row: {
          driver_id: string
          heading_degrees: number | null
          id: number
          latitude: number
          longitude: number
          recorded_at: string
          speed_kmh: number | null
          trip_id: string
        }
        Insert: {
          driver_id: string
          heading_degrees?: number | null
          id?: never
          latitude: number
          longitude: number
          recorded_at?: string
          speed_kmh?: number | null
          trip_id: string
        }
        Update: {
          driver_id?: string
          heading_degrees?: number | null
          id?: never
          latitude?: number
          longitude?: number
          recorded_at?: string
          speed_kmh?: number | null
          trip_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trip_locations_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trip_locations_trip_id_fkey"
            columns: ["trip_id"]
            isOneToOne: false
            referencedRelation: "trips"
            referencedColumns: ["id"]
          },
        ]
      }
      trips: {
        Row: {
          created_at: string
          destination_address: string | null
          driver_id: string
          end_lat: number | null
          end_lng: number | null
          ended_at: string | null
          fleet_id: string
          id: string
          origin_address: string | null
          start_lat: number | null
          start_lng: number | null
          started_at: string | null
          status: string
          task_id: string | null
          updated_at: string
          vehicle_id: string
        }
        Insert: {
          created_at?: string
          destination_address?: string | null
          driver_id: string
          end_lat?: number | null
          end_lng?: number | null
          ended_at?: string | null
          fleet_id: string
          id?: string
          origin_address?: string | null
          start_lat?: number | null
          start_lng?: number | null
          started_at?: string | null
          status?: string
          task_id?: string | null
          updated_at?: string
          vehicle_id: string
        }
        Update: {
          created_at?: string
          destination_address?: string | null
          driver_id?: string
          end_lat?: number | null
          end_lng?: number | null
          ended_at?: string | null
          fleet_id?: string
          id?: string
          origin_address?: string | null
          start_lat?: number | null
          start_lng?: number | null
          started_at?: string | null
          status?: string
          task_id?: string | null
          updated_at?: string
          vehicle_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "trips_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trips_fleet_id_fkey"
            columns: ["fleet_id"]
            isOneToOne: false
            referencedRelation: "fleets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trips_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trips_vehicle_id_fkey"
            columns: ["vehicle_id"]
            isOneToOne: false
            referencedRelation: "vehicles"
            referencedColumns: ["id"]
          },
        ]
      }
      vehicles: {
        Row: {
          assigned_driver_id: string | null
          capacity_kg: number | null
          created_at: string
          fleet_id: string
          id: string
          insurance_due_at: string | null
          make: string | null
          model: string | null
          next_service_at: string | null
          notes: string | null
          odometer_km: number | null
          registration_due_at: string | null
          registration_number: string
          status: string
          test_due_at: string | null
          updated_at: string
          vehicle_type: string
          year: number | null
        }
        Insert: {
          assigned_driver_id?: string | null
          capacity_kg?: number | null
          created_at?: string
          fleet_id: string
          id?: string
          insurance_due_at?: string | null
          make?: string | null
          model?: string | null
          next_service_at?: string | null
          notes?: string | null
          odometer_km?: number | null
          registration_due_at?: string | null
          registration_number: string
          status?: string
          test_due_at?: string | null
          updated_at?: string
          vehicle_type?: string
          year?: number | null
        }
        Update: {
          assigned_driver_id?: string | null
          capacity_kg?: number | null
          created_at?: string
          fleet_id?: string
          id?: string
          insurance_due_at?: string | null
          make?: string | null
          model?: string | null
          next_service_at?: string | null
          notes?: string | null
          odometer_km?: number | null
          registration_due_at?: string | null
          registration_number?: string
          status?: string
          test_due_at?: string | null
          updated_at?: string
          vehicle_type?: string
          year?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "vehicles_assigned_driver_same_fleet_fkey"
            columns: ["fleet_id", "assigned_driver_id"]
            isOneToOne: false
            referencedRelation: "drivers"
            referencedColumns: ["fleet_id", "id"]
          },
          {
            foreignKeyName: "vehicles_fleet_id_fkey"
            columns: ["fleet_id"]
            isOneToOne: false
            referencedRelation: "fleets"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      finish_trip: {
        Args: { p_fleet_id: string; p_trip_id: string }
        Returns: undefined
      }
      start_trip_with_inspection: {
        Args: {
          p_checklist: Json
          p_destination_address: string
          p_driver_id: string
          p_fleet_id: string
          p_origin_address: string
          p_task_id: string
          p_vehicle_id: string
        }
        Returns: string
      }
    }
    Enums: {
      [_ in never]: never
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
} as const
