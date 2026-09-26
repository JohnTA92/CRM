const CORS = {'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type','Access-Control-Allow-Methods':'POST, OPTIONS'};
export function createAdminHandler(area: string, deps: {user: (authorization:string)=>Promise<any>; rpc:(actor:string,area:string,body:Record<string,unknown>)=>Promise<any>}) {
 const reply=(status:number,body:unknown)=>new Response(JSON.stringify(body),{status,headers:{...CORS,'Content-Type':'application/json'}});
 return async (req:Request)=>{
  if(req.method==='OPTIONS') return new Response('ok',{headers:CORS});
  if(req.method!=='POST') return reply(405,{error:'Method not allowed'});
  try {
   const authorization=req.headers.get('Authorization');
   if(!authorization?.startsWith('Bearer ')) return reply(401,{error:'Not authenticated'});
   const {data,error}=await deps.user(authorization);
   if(error||!data?.user) return reply(401,{error:'Not authenticated'});
   const text=await req.text();
   if(text.length>16000) return reply(413,{error:'Request too large'});
   let body; try{body=text?JSON.parse(text):{};}catch{return reply(400,{error:'Invalid JSON'});}
   if(!body||Array.isArray(body)||typeof body!=='object') return reply(400,{error:'Invalid request'});
   if(area==='log') return reply(410,{error:'Audit records are now recorded by the server with each change.'});
   const result=await deps.rpc(data.user.id,area,body);
   if(result.error){
    const code=result.error.code;
    const status=code==='42501'?403:code==='28000'?401:code==='P0002'?404:['22023','22P02','22007','22008','23514'].includes(code)?400:500;
    return reply(status,{error:status===500?'The admin operation could not be completed. Please retry.':result.error.message});
   }
   return reply(200,result.data);
  }catch{return reply(500,{error:'The admin service could not be reached. Please retry.'});}
 };
}
