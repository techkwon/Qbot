export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      chatbots: {
        Row: {
          allowed_classes: string[] | null
          created_at: string
          description: string | null
          id: string
          is_public: boolean
          max_attempts_per_class: Json | null
          model_config: Json | null
          name: string
          owner_id: string
          slug: string
          system_prompt: string | null
        }
        Insert: {
          allowed_classes?: string[] | null
          created_at?: string
          description?: string | null
          id?: string
          is_public?: boolean
          max_attempts_per_class?: Json | null
          model_config?: Json | null
          name: string
          owner_id: string
          slug: string
          system_prompt?: string | null
        }
        Update: {
          allowed_classes?: string[] | null
          created_at?: string
          description?: string | null
          id?: string
          is_public?: boolean
          max_attempts_per_class?: Json | null
          model_config?: Json | null
          name?: string
          owner_id?: string
          slug?: string
          system_prompt?: string | null
        }
        Relationships: []
      }
      classes: {
        Row: {
          created_at: string
          id: string
          name: string
          teacher_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          teacher_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          teacher_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "classes_teacher_id_fkey"
            columns: ["teacher_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      conversations: {
        Row: {
          chatbot_id: string
          created_at: string
          id: string
          last_message_at: string | null
          student_id: string
        }
        Insert: {
          chatbot_id: string
          created_at?: string
          id?: string
          last_message_at?: string | null
          student_id: string
        }
        Update: {
          chatbot_id?: string
          created_at?: string
          id?: string
          last_message_at?: string | null
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversations_chatbot_id_fkey"
            columns: ["chatbot_id"]
            isOneToOne: false
            referencedRelation: "chatbots"
            referencedColumns: ["id"]
          },
        ]
      }
      learning_goals: {
        Row: {
          chatbot_id: string
          created_at: string
          creator_user_id: string | null
          goal_text: string
          id: string
          updated_at: string
        }
        Insert: {
          chatbot_id: string
          created_at?: string
          creator_user_id?: string | null
          goal_text: string
          id?: string
          updated_at?: string
        }
        Update: {
          chatbot_id?: string
          created_at?: string
          creator_user_id?: string | null
          goal_text?: string
          id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "learning_goals_chatbot_id_fkey"
            columns: ["chatbot_id"]
            isOneToOne: false
            referencedRelation: "chatbots"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          content: string
          conversation_id: string
          created_at: string
          id: string
          metadata: Json | null
          sender_role: string
        }
        Insert: {
          content: string
          conversation_id: string
          created_at?: string
          id?: string
          metadata?: Json | null
          sender_role: string
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string
          id?: string
          metadata?: Json | null
          sender_role?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          class_id: string | null
          created_at: string
          full_name: string | null
          id: string
          password: string | null
          role: string
          student_id_number: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          class_id?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          password?: string | null
          role?: string
          student_id_number?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          class_id?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          password?: string | null
          role?: string
          student_id_number?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "classes"
            referencedColumns: ["id"]
          },
        ]
      }
      reference_files: {
        Row: {
          chatbot_id: string
          created_at: string
          file_name: string
          file_size: number | null
          file_type: string | null
          id: string
          is_public: boolean | null
          storage_path: string
          updated_at: string
          uploader_id: string
        }
        Insert: {
          chatbot_id: string
          created_at?: string
          file_name: string
          file_size?: number | null
          file_type?: string | null
          id?: string
          is_public?: boolean | null
          storage_path: string
          updated_at?: string
          uploader_id: string
        }
        Update: {
          chatbot_id?: string
          created_at?: string
          file_name?: string
          file_size?: number | null
          file_type?: string | null
          id?: string
          is_public?: boolean | null
          storage_path?: string
          updated_at?: string
          uploader_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reference_files_chatbot_id_fkey"
            columns: ["chatbot_id"]
            isOneToOne: false
            referencedRelation: "chatbots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reference_files_uploader_id_fkey"
            columns: ["uploader_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      student_goal_responses: {
        Row: {
          ai_evaluation: string | null
          conversation_id: string
          created_at: string
          evaluation_score: number | null
          goal_id: string
          id: string
          is_achieved: boolean | null
          response_text: string | null
          student_id: string
        }
        Insert: {
          ai_evaluation?: string | null
          conversation_id: string
          created_at?: string
          evaluation_score?: number | null
          goal_id: string
          id?: string
          is_achieved?: boolean | null
          response_text?: string | null
          student_id: string
        }
        Update: {
          ai_evaluation?: string | null
          conversation_id?: string
          created_at?: string
          evaluation_score?: number | null
          goal_id?: string
          id?: string
          is_achieved?: boolean | null
          response_text?: string | null
          student_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_goal_responses_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_goal_responses_goal_id_fkey"
            columns: ["goal_id"]
            isOneToOne: false
            referencedRelation: "learning_goals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_goal_responses_student_id_fkey"
            columns: ["student_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DefaultSchema = Database[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof (Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        Database[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof Database }
  ? (Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      Database[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
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
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof Database }
  ? Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
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
    | { schema: keyof Database },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof Database }
  ? Database[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
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
    | { schema: keyof Database },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof Database }
  ? Database[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof Database },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof Database
  }
    ? keyof Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof Database }
  ? Database[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
