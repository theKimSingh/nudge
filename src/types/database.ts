export type TaskCategory =
  | 'meal'
  | 'exercise'
  | 'work'
  | 'study'
  | 'sleep'
  | 'selfcare'
  | 'errand'
  | 'social'
  | 'health'
  | 'other';

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          name: string;
          goal: 'work' | 'study' | 'balance' | null;
          onboarded: boolean;
          // Added in 20260514130000_profile_meal_defaults; integer minutes
          // from midnight (0..1439). Defaults: 480 / 750 / 1110.
          breakfast_time_minutes: number;
          lunch_time_minutes: number;
          dinner_time_minutes: number;
          // Added in 20260517120000_profile_section_anchors; integer minutes
          // from midnight (0..1439). Defaults: 420 / 780 / 1080.
          morning_start_minutes: number;
          afternoon_start_minutes: number;
          evening_start_minutes: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          name?: string;
          goal?: 'work' | 'study' | 'balance' | null;
          onboarded?: boolean;
          breakfast_time_minutes?: number;
          lunch_time_minutes?: number;
          dinner_time_minutes?: number;
          morning_start_minutes?: number;
          afternoon_start_minutes?: number;
          evening_start_minutes?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          goal?: 'work' | 'study' | 'balance' | null;
          onboarded?: boolean;
          breakfast_time_minutes?: number;
          lunch_time_minutes?: number;
          dinner_time_minutes?: number;
          morning_start_minutes?: number;
          afternoon_start_minutes?: number;
          evening_start_minutes?: number;
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
          category: TaskCategory;
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
          category?: TaskCategory;
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
          category?: TaskCategory;
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
