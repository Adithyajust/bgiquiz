import { env } from "cloudflare:workers";
import { sqliteRepository } from "./sqlite-repository";
import type { QuizRepository } from "./persistence";
export const authMode="chatgpt";
export async function database():Promise<QuizRepository>{if(!env.DB)throw new Error("Database unavailable");return sqliteRepository(env.DB);}
export async function identity(request:Request){return request.headers.get("oai-authenticated-user-id");}
export async function authenticate(_request:Request,_password:string):Promise<string|null>{return null;}
