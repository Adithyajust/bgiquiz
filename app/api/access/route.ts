import { database, identity, authenticate, authMode } from "@quiz-runtime";
import { isOwner } from "@/lib/store";
export async function POST(request:Request){try{
 if(request.headers.get("sec-fetch-site")==="cross-site")return Response.json({error:"Permintaan ditolak."},{status:403});
 let userId=await identity(request),cookie:string|null=null;
 if(!userId&&authMode==="password"&&request.headers.get("content-type")?.includes("application/json")){
   const body=await request.json() as {password?:string};cookie=await authenticate(request,typeof body.password==="string"?body.password:"");
   if(!cookie)return Response.json({error:"Kata sandi penyelenggara tidak sesuai."},{status:403});
   const copy=new Request(request.url,{headers:new Headers(request.headers)});copy.headers.set("cookie",cookie.split(";")[0]);userId=await identity(copy);
 }
 const admin=await isOwner(await database(),userId,true);
 return Response.json({admin,signedIn:!!userId,authMode},{headers:{"Cache-Control":"no-store",...(cookie?{"Set-Cookie":cookie}:{})}});
 }catch(e){console.error("Access failed",e instanceof Error?e.message:e);return Response.json({error:"Akses database belum tersedia. Silakan coba kembali."},{status:503});}}
