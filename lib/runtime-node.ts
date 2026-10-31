import { createHmac, timingSafeEqual } from "node:crypto";
import { getSqlServerRepository } from "./mssql-repository";
export const authMode="password";
export const database = getSqlServerRepository;
const organizer="node-organizer";
function signature(expires:string,secret:string){return createHmac("sha256",secret).update(`bgi:${expires}`).digest("base64url");}
function same(a:string,b:string){const x=Buffer.from(a),y=Buffer.from(b);return x.length===y.length&&timingSafeEqual(x,y);}
export async function identity(request:Request){
 const secret=process.env.BGI_ADMIN_TOKEN;
 if(!secret&&process.env.NODE_ENV==="development"&&["localhost","127.0.0.1","[::1]"].includes(new URL(request.url).hostname))return organizer;
 if(!secret)return null;
 const value=request.headers.get("cookie")?.split(";").map(v=>v.trim()).find(v=>v.startsWith("bgi-admin="))?.slice(10);
 if(!value)return null;const [expires,sig]=value.split(".");
 if(!expires||!sig||!/^\d+$/.test(expires)||Number(expires)<Date.now()||Number(expires)>Date.now()+9*60*60*1000)return null;
 return same(sig,signature(expires,secret))?organizer:null;
}
export async function authenticate(request:Request,password:string):Promise<string|null>{
 const secret=process.env.BGI_ADMIN_TOKEN;if(!secret||!password||password.length>256||!same(password,secret))return null;
 const expires=String(Date.now()+8*60*60*1000);return `bgi-admin=${expires}.${signature(expires,secret)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800${new URL(request.url).protocol==="https:"?"; Secure":""}`;
}
