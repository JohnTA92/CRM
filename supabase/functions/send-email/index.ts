import { createClient } from 'npm:@supabase/supabase-js@2.110.0';
import { createHandler } from './handler.ts';
// Release gate: keep off until sender verification and an authorized delivery test.
const DELIVERY_RELEASED = false;
Deno.serve(createHandler({
 env:key=>key === 'CUSTOMER_EMAIL_ENABLED' && !DELIVERY_RELEASED ? 'false' : Deno.env.get(key), fetch,
 client:Authorization=>createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_ANON_KEY')!,{global:{headers:{Authorization}},auth:{persistSession:false,autoRefreshToken:false}}),
 admin:()=>createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}}),
}));
