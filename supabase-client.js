// Shared Supabase client, imported by script.js, admin/admin.js, and portal/portal.js.
//
// The URL and anon key below are meant to be public -- they are safe to commit
// as long as Row Level Security is enabled on every table (it is; see
// supabase/schema.sql). The service_role key must NEVER be placed in this
// file or anywhere else in this repo.
//
// Fill these in from: Supabase dashboard -> Project Settings -> API.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = "REPLACE_WITH_PROJECT_URL";
const SUPABASE_ANON_KEY = "REPLACE_WITH_ANON_PUBLIC_KEY";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
