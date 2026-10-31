import { database, identity } from "@quiz-runtime";
import { isOwner, mutate, snapshot } from "@/lib/store";
import { QuizError, type Action } from "@/lib/engine";
export const dynamic="force-dynamic";
const headers={"Cache-Control":"no-store, no-cache, must-revalidate","Content-Type":"application/json; charset=utf-8"};

function fail(e:unknown){if(e instanceof QuizError)return Response.json({error:e.message},{status:e.status,headers});console.error("Quiz request failed",e instanceof Error?e.message:e);return Response.json({error:"Koneksi database terputus. Silakan coba kembali."},{status:503,headers});}
export async function GET(request:Request){try{const db=await database();const userId=await identity(request);const admin=new URL(request.url).searchParams.get("admin")==="1";
  if(admin&&!await isOwner(db,userId))return Response.json({error:"Masuk sebagai penyelenggara untuk membuka panel admin.",signedIn:!!userId},{status:403,headers});
  return Response.json(await snapshot(db,admin),{headers});}catch(e){return fail(e);}}
export async function POST(request:Request){try{
  if(request.headers.get("sec-fetch-site")==="cross-site")throw new QuizError("Permintaan dari situs lain ditolak.",403);
  if(!request.headers.get("content-type")?.includes("application/json"))throw new QuizError("Format JSON diperlukan.",415);
  const raw=await request.text();if(raw.length>1000000)throw new QuizError("Ukuran masukan terlalu besar.",413);
  const body=JSON.parse(raw) as {action:Action;key?:string;revision?:number};
  if(!body.action||typeof body.action.type!=="string")throw new QuizError("Perintah tidak valid.");
  const db=await database();const userId=await identity(request);const admin=await isOwner(db,userId);
  return Response.json(await mutate(db,body.action,{admin,key:body.key,expectedRevision:body.revision}),{headers});
}catch(e){if(e instanceof SyntaxError)return Response.json({error:"Format JSON tidak valid."},{status:400,headers});return fail(e);}}
