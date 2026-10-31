import type { DatabaseSync } from "node:sqlite";
export function wrapSqlite(sql:DatabaseSync):D1Database {
 function statement(query:string,params:unknown[]=[]){
  function runSync(){const result=sql.prepare(query).run(...params as never[]);return {success:true,meta:{changes:Number(result.changes),last_row_id:Number(result.lastInsertRowid)}};}
  return {bind(...values:unknown[]){return statement(query,values);},_run:runSync,
   async first(column?:string){const row=sql.prepare(query).get(...params as never[]);return row?(column?row[column]:row):null;},
   async run(){return runSync();},
   async all(){return {success:true,results:sql.prepare(query).all(...params as never[]),meta:{}};},
  };
 }
 // Every statement runs synchronously before yielding, so native requests cannot
 // interleave on this SQLite connection during a transaction.
 return {prepare:statement,async batch(statements:{_run:()=>unknown}[]){sql.exec("BEGIN IMMEDIATE");try{const results=statements.map(s=>s._run());sql.exec("COMMIT");return results;}catch(e){sql.exec("ROLLBACK");throw e;}}} as unknown as D1Database;
}
