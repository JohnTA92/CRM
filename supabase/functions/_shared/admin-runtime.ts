import {createClient} from 'npm:@supabase/supabase-js@2.110.0';
import {createAdminHandler} from './admin-handler.ts';
export function serveAdmin(area:string){
 Deno.serve(createAdminHandler(area,{
  user:Authorization=>createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_ANON_KEY')!,{global:{headers:{Authorization}},auth:{persistSession:false,autoRefreshToken:false}}).auth.getUser(),
  rpc:(p_actor,p_area,p_body)=>createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}}).rpc('admin_operation',{p_actor,p_area,p_body}),
 }));
}
