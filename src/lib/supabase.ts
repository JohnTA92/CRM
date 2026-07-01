import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://ekfnjswozausgebvbwew.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_3H-md-bm1IObwrJeS1XkSg_UjbHl8TO";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
