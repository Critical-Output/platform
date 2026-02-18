export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

type GenericRelationship = {
  foreignKeyName: string;
  columns: string[];
  referencedRelation: string;
  referencedColumns: string[];
};

type GenericTable = {
  Row: Record<string, unknown>;
  Insert: Record<string, unknown>;
  Update: Record<string, unknown>;
  Relationships: GenericRelationship[];
};

type GenericFunction = {
  Args: Record<string, unknown>;
  Returns: unknown;
};

// Loose Database shape used until generated Supabase types are added.
export type Database = {
  public: {
    Tables: Record<string, GenericTable>;
    Views: Record<string, never>;
    Functions: Record<string, GenericFunction>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
