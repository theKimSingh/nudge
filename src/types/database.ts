export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          name: string;
          goal: 'work' | 'study' | 'balance' | null;
          onboarded: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          name?: string;
          goal?: 'work' | 'study' | 'balance' | null;
          onboarded?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          goal?: 'work' | 'study' | 'balance' | null;
          onboarded?: boolean;
          created_at?: string;
          updated_at?: string;
        };
      };
      tasks: {
        Row: {
          id: string;
          user_id: string;
          title: string;
          description: string | null;
          date: string;
          time_minutes: number;
          duration_minutes: number;
          repeat_rule: 'none' | 'daily' | 'weekdays' | 'weekly';
          series_id: string | null;
          done: boolean;
          color: string | null;
          source: 'todo_list' | 'calendar_import';
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id: string;
          title: string;
          description?: string | null;
          date: string;
          time_minutes: number;
          duration_minutes: number;
          repeat_rule?: 'none' | 'daily' | 'weekdays' | 'weekly';
          series_id?: string | null;
          done?: boolean;
          color?: string | null;
          source?: 'todo_list' | 'calendar_import';
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          title?: string;
          description?: string | null;
          date?: string;
          time_minutes?: number;
          duration_minutes?: number;
          repeat_rule?: 'none' | 'daily' | 'weekdays' | 'weekly';
          series_id?: string | null;
          done?: boolean;
          color?: string | null;
          source?: 'todo_list' | 'calendar_import';
          created_at?: string;
          updated_at?: string;
        };
      };
    };
    Views: {};
    Functions: {};
    Enums: {};
  };
};
