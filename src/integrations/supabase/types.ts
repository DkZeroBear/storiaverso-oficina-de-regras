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
      facilitator_notes: {
        Row: {
          decisao_final: string
          field_id: string
          sintese: string
          status: string
        }
        Insert: {
          decisao_final?: string
          field_id: string
          sintese?: string
          status?: string
        }
        Update: {
          decisao_final?: string
          field_id?: string
          sintese?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "facilitator_notes_field_id_fkey"
            columns: ["field_id"]
            isOneToOne: true
            referencedRelation: "form_fields"
            referencedColumns: ["id"]
          },
        ]
      }
      form_fields: {
        Row: {
          bloco: string
          chave: string
          comparativo: Json
          definicao_atual: string | null
          essencial: boolean
          exemplo: string
          form_id: string
          id: string
          nome: string
          o_que_e: string
          ordem: number
          pergunta: string
          status: string
        }
        Insert: {
          bloco: string
          chave: string
          comparativo?: Json
          definicao_atual?: string | null
          essencial?: boolean
          exemplo?: string
          form_id: string
          id?: string
          nome: string
          o_que_e?: string
          ordem: number
          pergunta?: string
          status: string
        }
        Update: {
          bloco?: string
          chave?: string
          comparativo?: Json
          definicao_atual?: string | null
          essencial?: boolean
          exemplo?: string
          form_id?: string
          id?: string
          nome?: string
          o_que_e?: string
          ordem?: number
          pergunta?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "form_fields_form_id_fkey"
            columns: ["form_id"]
            isOneToOne: false
            referencedRelation: "forms"
            referencedColumns: ["id"]
          },
        ]
      }
      form_roster: {
        Row: {
          form_id: string
          id: string
          nome: string
        }
        Insert: {
          form_id: string
          id?: string
          nome: string
        }
        Update: {
          form_id?: string
          id?: string
          nome?: string
        }
        Relationships: [
          {
            foreignKeyName: "form_roster_form_id_fkey"
            columns: ["form_id"]
            isOneToOne: false
            referencedRelation: "forms"
            referencedColumns: ["id"]
          },
        ]
      }
      forms: {
        Row: {
          ativo: boolean
          created_at: string
          id: string
          introducao: string
          mostrar_respostas: boolean
          prazo: string | null
          slug: string
          titulo: string
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          id?: string
          introducao?: string
          mostrar_respostas?: boolean
          prazo?: string | null
          slug: string
          titulo: string
        }
        Update: {
          ativo?: boolean
          created_at?: string
          id?: string
          introducao?: string
          mostrar_respostas?: boolean
          prazo?: string | null
          slug?: string
          titulo?: string
        }
        Relationships: []
      }
      participants: {
        Row: {
          atualizado_em: string
          enviado_em: string | null
          form_id: string
          id: string
          nome: string
          pin_criado_em: string | null
          pin_hash: string
          pin_salt: string
          reset_code_expira: string | null
          reset_code_hash: string
          reset_code_salt: string
          sessao_versao: number
          status: string
          ultimo_campo: number
        }
        Insert: {
          atualizado_em?: string
          enviado_em?: string | null
          form_id: string
          id?: string
          nome: string
          pin_criado_em?: string | null
          pin_hash: string
          pin_salt: string
          reset_code_expira?: string | null
          reset_code_hash?: string
          reset_code_salt?: string
          sessao_versao?: number
          status?: string
          ultimo_campo?: number
        }
        Update: {
          atualizado_em?: string
          enviado_em?: string | null
          form_id?: string
          id?: string
          nome?: string
          pin_criado_em?: string | null
          pin_hash?: string
          pin_salt?: string
          reset_code_expira?: string | null
          reset_code_hash?: string
          reset_code_salt?: string
          sessao_versao?: number
          status?: string
          ultimo_campo?: number
        }
        Relationships: [
          {
            foreignKeyName: "participants_form_id_fkey"
            columns: ["form_id"]
            isOneToOne: false
            referencedRelation: "forms"
            referencedColumns: ["id"]
          },
        ]
      }
      pin_attempts: {
        Row: {
          form_id: string
          id: string
          nome: string
          sucesso: boolean
          tentado_em: string
        }
        Insert: {
          form_id: string
          id?: string
          nome: string
          sucesso: boolean
          tentado_em?: string
        }
        Update: {
          form_id?: string
          id?: string
          nome?: string
          sucesso?: boolean
          tentado_em?: string
        }
        Relationships: [
          {
            foreignKeyName: "pin_attempts_form_id_fkey"
            columns: ["form_id"]
            isOneToOne: false
            referencedRelation: "forms"
            referencedColumns: ["id"]
          },
        ]
      }
      responses: {
        Row: {
          atualizado_em: string
          concordancia: string | null
          field_id: string
          id: string
          participant_id: string
          pulou: boolean
          referencia: string
          texto: string
        }
        Insert: {
          atualizado_em?: string
          concordancia?: string | null
          field_id: string
          id?: string
          participant_id: string
          pulou?: boolean
          referencia?: string
          texto?: string
        }
        Update: {
          atualizado_em?: string
          concordancia?: string | null
          field_id?: string
          id?: string
          participant_id?: string
          pulou?: boolean
          referencia?: string
          texto?: string
        }
        Relationships: [
          {
            foreignKeyName: "responses_field_id_fkey"
            columns: ["field_id"]
            isOneToOne: false
            referencedRelation: "form_fields"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "responses_participant_id_fkey"
            columns: ["participant_id"]
            isOneToOne: false
            referencedRelation: "participants"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_delete_participant: {
        Args: { _participant_id: string }
        Returns: undefined
      }
      admin_reset_pin: { Args: { _participant_id: string }; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      pin_attempt_gate: {
        Args: { _form: string; _nome: string }
        Returns: string
      }
      save_response: {
        Args: {
          _concordancia: string
          _field: string
          _form?: string
          _pid: string
          _pulou: boolean
          _referencia: string
          _texto: string
          _ultimo_campo: number
          _versao: number
        }
        Returns: string
      }
    }
    Enums: {
      app_role: "admin"
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
      app_role: ["admin"],
    },
  },
} as const
