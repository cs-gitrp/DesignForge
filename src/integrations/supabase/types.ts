export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5";
  };
  public: {
    Tables: {
      attempts: {
        Row: {
          attempt_number: number;
          created_at: string;
          id: string;
          learner_id: string;
          problem_id: string;
          status: string;
          submitted_at: string | null;
        };
        Insert: {
          attempt_number?: number;
          created_at?: string;
          id?: string;
          learner_id: string;
          problem_id: string;
          status?: string;
          submitted_at?: string | null;
        };
        Update: {
          attempt_number?: number;
          created_at?: string;
          id?: string;
          learner_id?: string;
          problem_id?: string;
          status?: string;
          submitted_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "attempts_problem_id_fkey";
            columns: ["problem_id"];
            isOneToOne: false;
            referencedRelation: "problems";
            referencedColumns: ["id"];
          },
        ];
      };
      evaluations: {
        Row: {
          completed_at: string | null;
          created_at: string;
          error_message: string | null;
          evaluator_type: string;
          id: string;
          improvement_areas: string[];
          overall_score: number | null;
          status: string;
          strengths: string[];
          submission_id: string;
        };
        Insert: {
          completed_at?: string | null;
          created_at?: string;
          error_message?: string | null;
          evaluator_type: string;
          id?: string;
          improvement_areas?: string[];
          overall_score?: number | null;
          status?: string;
          strengths?: string[];
          submission_id: string;
        };
        Update: {
          completed_at?: string | null;
          created_at?: string;
          error_message?: string | null;
          evaluator_type?: string;
          id?: string;
          improvement_areas?: string[];
          overall_score?: number | null;
          status?: string;
          strengths?: string[];
          submission_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "evaluations_submission_id_fkey";
            columns: ["submission_id"];
            isOneToOne: false;
            referencedRelation: "submissions";
            referencedColumns: ["id"];
          },
        ];
      };
      feedback: {
        Row: {
          concern: string;
          confidence: number;
          created_at: string;
          criterion: string;
          evaluation_id: string;
          evidence: string;
          id: string;
          position: number;
          score: number;
          suggestion: string;
        };
        Insert: {
          concern?: string;
          confidence?: number;
          created_at?: string;
          criterion: string;
          evaluation_id: string;
          evidence?: string;
          id?: string;
          position?: number;
          score: number;
          suggestion?: string;
        };
        Update: {
          concern?: string;
          confidence?: number;
          created_at?: string;
          criterion?: string;
          evaluation_id?: string;
          evidence?: string;
          id?: string;
          position?: number;
          score?: number;
          suggestion?: string;
        };
        Relationships: [
          {
            foreignKeyName: "feedback_evaluation_id_fkey";
            columns: ["evaluation_id"];
            isOneToOne: false;
            referencedRelation: "evaluations";
            referencedColumns: ["id"];
          },
        ];
      };
      problems: {
        Row: {
          created_at: string;
          description: string;
          difficulty: string;
          id: string;
          requirements: string[];
          slug: string;
          think_about: string[];
          title: string;
        };
        Insert: {
          created_at?: string;
          description: string;
          difficulty: string;
          id?: string;
          requirements?: string[];
          slug: string;
          think_about?: string[];
          title: string;
        };
        Update: {
          created_at?: string;
          description?: string;
          difficulty?: string;
          id?: string;
          requirements?: string[];
          slug?: string;
          think_about?: string[];
          title?: string;
        };
        Relationships: [];
      };
      submissions: {
        Row: {
          assumptions: string;
          attempt_id: string;
          classes_responsibilities: string;
          created_at: string;
          design_decisions: string;
          edge_cases: string;
          id: string;
          relationships: string;
          submission_type: string;
          updated_at: string;
        };
        Insert: {
          assumptions?: string;
          attempt_id: string;
          classes_responsibilities?: string;
          created_at?: string;
          design_decisions?: string;
          edge_cases?: string;
          id?: string;
          relationships?: string;
          submission_type?: string;
          updated_at?: string;
        };
        Update: {
          assumptions?: string;
          attempt_id?: string;
          classes_responsibilities?: string;
          created_at?: string;
          design_decisions?: string;
          edge_cases?: string;
          id?: string;
          relationships?: string;
          submission_type?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "submissions_attempt_id_fkey";
            columns: ["attempt_id"];
            isOneToOne: true;
            referencedRelation: "attempts";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      current_learner_id: { Args: never; Returns: string };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {},
  },
} as const;
