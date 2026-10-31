import {test} from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {readFileSync} from 'node:fs';
import {sqlServerConfig} from '../scripts/mssql-config.mjs';
const mod = name => import(pathToFileURL(resolve(`.sites-runtime/test-build/${name}.mjs`)));
const {sqlServerRepository} = await mod('mssql-repository');
const {quizTables,quizToRows,rowsToQuiz,emptyQuizRows,rowChanges} = await mod('relational-quiz');
const {seedQuiz} = await mod('seed');
const {applyAction} = await mod('engine');
const {loadQuiz,mutate,snapshot} = await mod('store');

// This is a contract double, not a T-SQL interpreter. It enforces FK ordering,
// isolation of serialized transactions and rollback of all affected row sets.
function fakeDriver(options={}) {
 const trace=[],queries=[],transactions=[];
 const initial=options.quiz??seedQuiz();
 const state={header:options.empty?null:{id:'main',document:options.legacy?JSON.stringify(initial):null,revision:4,updated_at:1000,storage_version:options.legacy?1:2},
   rows:options.empty||options.legacy?emptyQuizRows():quizToRows(initial),owner:null,archives:[],events:[]};
 let lock=Promise.resolve();
 function validate() {
   const has=(table,values)=>state.rows[table].some(row=>Object.entries(values).every(([k,v])=>row[k]===v));
   for (const table of quizTables) for (const r of state.rows[table.name]) {
     if(!state.header||r.room_id!==state.header.id)throw new Error('FK room');
     if(r.round_id!=null&&!has('quiz_rounds',{room_id:r.room_id,id:r.round_id}))throw new Error('FK round');
     for(const key of ['team_id','batch_team','selected_team_id','active_team_id'])
       if(r[key]!=null&&!has('quiz_teams',{room_id:r.room_id,id:r[key]}))throw new Error('FK team');
     if(r.question_id!=null&&!has('quiz_questions',{room_id:r.room_id,round_id:r.round_id,id:r.question_id}))throw new Error('FK question');
   }
 }
 class Transaction extends EventEmitter {
  constructor(pool){super();this.pool=pool;transactions.push(this);}
  async begin(level){trace.push('begin');this.level=level;if(options.failBegin)throw new Error('begin failed');const previous=lock;lock=new Promise(r=>{this.release=r;});await previous;this.original=structuredClone(state);}
  async commit(){trace.push('commit');if(options.failCommit)throw new Error('commit failed');this.release();}
  async rollback(){trace.push('rollback');Object.assign(state,structuredClone(this.original));this.release();this.emit('rollback');}
 }
 class Request {
  constructor(connection){this.connection=connection;this.params={};}
  input(name,type,value){this.params[name]={type,value};return this;}
  async query(text){queries.push({connection:this.connection,text,params:this.params});const p=Object.fromEntries(Object.entries(this.params).map(([k,v])=>[k,v.value]));
   if(text.startsWith('UPDATE dbo.quiz_rooms SET revision')){trace.push('cas');const changed=options.changed??(state.header?.revision===p.revision&&state.header?.storage_version===2?1:0);if(changed){state.header.revision++;state.header.updated_at=p.at;}return{recordset:[{changed}]};}
   if(text.startsWith('SELECT id, document')){trace.push('read');const header=state.header?[structuredClone(state.header)]:[];return{recordset:header,recordsets:[header,...quizTables.map(t=>structuredClone(state.rows[t.name]))]};}
   if(text.startsWith('SELECT TOP (32)'))return {recordset:state.events.filter(e=>e.revision<=p.maxRevision&&e.revision>p.minRevision&&['buzz','judge'].includes(e.kind)).sort((a,b)=>b.revision-a.revision).slice(0,32).map(e=>({id:e.eventId,revision:e.revision,kind:e.kind,payload:e.payload,created_at:e.at}))};
   if(text.startsWith('IF EXISTS')){trace.push('migration check');if(Object.values(state.rows).some(rows=>rows.length))throw new Error('Relational rows already exist');return{recordset:[]};}
   if(text.startsWith('SELECT user_id')){trace.push('owner');return{recordset:state.owner?[{user_id:state.owner}]:[]};}
   if(text.startsWith('IF NOT EXISTS')&&text.includes('quiz_owners')){trace.push('claim');state.owner??=p.userId;return{recordset:[]};}
   if(text.startsWith('IF NOT EXISTS')){trace.push('initialize');const created=state.header?0:1;if(created)state.header={id:p.room,document:null,revision:0,updated_at:p.at,storage_version:2};return{recordset:[{created}]};}
   if(text.startsWith('INSERT INTO dbo.quiz_legacy_snapshots')){trace.push('archive');if(state.archives.length)throw new Error('duplicate archive');state.archives.push(structuredClone(p));return{recordset:[]};}
   if(text.startsWith('UPDATE dbo.quiz_rooms SET document')){trace.push('migrate');state.header.document=null;state.header.storage_version=2;return{recordset:[]};}
   if(text.startsWith('INSERT INTO dbo.quiz_events')){trace.push('event');if(options.failAudit){if(options.autoRollback){Object.assign(state,structuredClone(this.connection.original));trace.push('server rollback');this.connection.release();this.connection.emit('rollback');}throw new Error('event failed');}if(state.events.some(e=>e.eventId===p.eventId))throw new Error('duplicate event');state.events.push(p);return{recordset:[]};}
   const tableName=/dbo\.\[(quiz_\w+)\]/.exec(text)?.[1];
   if(tableName){trace.push(tableName);if(options.failTable===tableName)throw new Error('table write failed');const table=quizTables.find(t=>t.name===tableName),incoming=JSON.parse(p.rows),key=row=>JSON.stringify(table.keys.map(k=>row[k]));
     if(text.startsWith('DELETE')){const keys=new Set(incoming.map(key));state.rows[tableName]=state.rows[tableName].filter(r=>!keys.has(key(r)));}
     else for(const row of incoming){const i=state.rows[tableName].findIndex(r=>key(r)===key(row));if(i===-1)state.rows[tableName].push(row);else state.rows[tableName][i]=row;}
     validate();return{recordset:[]};
   }
   throw new Error(`Unexpected SQL in contract double: ${text.slice(0,100)}`);
  }
 }
 const driver={Request,Transaction,ISOLATION_LEVEL:{READ_COMMITTED:2},NVarChar:length=>({name:'nvarchar',length}),Int:{name:'int'},BigInt:{name:'bigint'},MAX:-1};
 const pool={};return{driver,pool,trace,queries,transactions,state,repo:sqlServerRepository(pool,driver)};
}
const changeFor=(quiz,extra={})=>({document:JSON.stringify(quiz),expectedRevision:4,eventId:'event-5',kind:'sound',payload:'{"type":"sound"}',at:1792380000000,...extra});
const soundChange=h=>{const q=rowsToQuiz(h.state.rows);q.sound=!q.sound;return changeFor(q);};
const alter=(q,a,id='action',at=1000)=>applyAction(q,a,at,id);

test('relational round trip preserves Unicode, photos, answer choices and null timers',()=>{
 const q=seedQuiz();q.teams[0].photo='data:image/png;base64,AAAA';q.teams[0].name='Grup 日本語';q.rounds[0].questions[0].text='Teks العربية 日本語';
 q.game.deadline=1792380000000;q.game.remaining=0;q.game.progress={'reguler:A':0};
 assert.deepEqual(rowsToQuiz(quizToRows(q)),q);
});
test('relational mapper uses composite question identity across batches',()=>{
 const q=seedQuiz();q.rounds[1].questions[1].id=q.rounds[0].questions[1].id;q.rounds[1].questions[1].options=['Satu','Dua'];q.rounds[1].questions[1].answer='Dua';
 assert.deepEqual(rowsToQuiz(quizToRows(q)),q);
});
test('relational reads restore explicit ordering and BIGINT string values',()=>{
 const q=seedQuiz(),rows=quizToRows(q);for(const key of Object.keys(rows))rows[key].reverse();
 rows.quiz_game_state[0].deadline='1792380000000';rows.quiz_game_state[0].remaining='0';
 const restored=rowsToQuiz(rows);assert.deepEqual(restored.rounds,q.rounds);assert.deepEqual(restored.teams,q.teams);assert.equal(restored.game.deadline,1792380000000);assert.equal(restored.game.remaining,0);
});
test('relational delta excludes question banks and photos for buzzer-only changes',()=>{
 let q=alter(seedQuiz(),{type:'selectRound',roundId:'rebutan'});q=alter(q,{type:'start'});const after=alter(q,{type:'buzz',teamId:'A',epoch:q.game.epoch},'buzz',2000);
 assert.deepEqual(rowChanges(quizToRows(q),quizToRows(after)).filter(c=>c.changed.length||c.deleted.length).map(c=>c.table.name),['quiz_game_state','quiz_buzzes']);
});
test('relational mapper rejects orphan progress, oversized strings and unsafe integers',()=>{
 const q=seedQuiz();q.game.progress={'missing:A':1};assert.throws(()=>quizToRows(q),/Progres/);q.game.progress={};q.rounds[0].questions[0].answer='x'.repeat(1001);assert.throws(()=>quizToRows(q),/melebihi/);q.rounds[0].questions[0].answer='ok';q.game.deadline=Number.MAX_SAFE_INTEGER+1;assert.throws(()=>quizToRows(q),/bilangan bulat/);
});
test('SQL Server CAS writes normalized changes and audit in one transaction',async()=>{
 const h=fakeDriver();const change=soundChange(h);assert.equal(await h.repo.compareAndSwap(change),true);
 assert.deepEqual(h.trace,['begin','cas','read','quiz_settings','event','commit']);assert.equal(h.transactions[0].level,2);assert.ok(h.queries.every(q=>q.connection===h.transactions[0]));
 assert.equal(h.queries[0].params.at.type.name,'bigint');assert.equal(h.queries.find(q=>q.params.rows)?.params.rows.type.length,-1);assert.ok(!h.queries.some(q=>q.text.includes('document = @document')));
 assert.equal(rowsToQuiz(h.state.rows).sound,JSON.parse(change.document).sound);assert.equal(h.state.events[0].revision,5);
});
test('SQL Server revision conflict commits no rows or audit',async()=>{const h=fakeDriver({changed:0}),before=structuredClone(h.state);assert.equal(await h.repo.compareAndSwap(soundChange(h)),false);assert.deepEqual(h.trace,['begin','cas','commit']);assert.deepEqual(h.state,before);});
test('SQL Server audit failure rolls back all relational tables and revision',async()=>{const h=fakeDriver({failAudit:true}),before=structuredClone(h.state);await assert.rejects(()=>h.repo.compareAndSwap(soundChange(h)),/event failed/);assert.equal(h.trace.at(-1),'rollback');assert.deepEqual(h.state,before);});
test('SQL Server child-table failure rolls back the complete write',async()=>{const h=fakeDriver({failTable:'quiz_settings'}),before=structuredClone(h.state);await assert.rejects(()=>h.repo.compareAndSwap(soundChange(h)),/table write failed/);assert.deepEqual(h.state,before);assert.ok(!h.trace.includes('event'));});
test('SQL Server auto-aborted transaction does not roll back twice',async()=>{const h=fakeDriver({failAudit:true,autoRollback:true});await assert.rejects(()=>h.repo.compareAndSwap(soundChange(h)),/event failed/);assert.equal(h.trace.at(-1),'server rollback');assert.ok(!h.trace.includes('rollback'));});
test('SQL Server failed begin avoids rollback on an unstarted transaction',async()=>{const h=fakeDriver({failBegin:true});await assert.rejects(()=>h.repo.compareAndSwap(soundChange(h)),/begin failed/);assert.deepEqual(h.trace,['begin']);});
test('SQL Server commit failure preserves error and rolls back',async()=>{const h=fakeDriver({failCommit:true}),before=structuredClone(h.state);await assert.rejects(()=>h.repo.compareAndSwap(soundChange(h)),/commit failed/);assert.deepEqual(h.trace.slice(-2),['commit','rollback']);assert.deepEqual(h.state,before);});
test('SQL Server initializes parent and child rows atomically, only once',async()=>{
 const h=fakeDriver({empty:true}),q=seedQuiz();await h.repo.initialize(JSON.stringify(q),1000);await h.repo.initialize(JSON.stringify({...q,sound:!q.sound}),2000);
 assert.deepEqual(rowsToQuiz(h.state.rows),q);assert.equal(h.state.header.revision,0);assert.equal(h.state.header.document,null);assert.equal(h.state.header.storage_version,2);
 assert.ok(h.queries.filter(q=>q.text.startsWith('IF NOT EXISTS')).every(q=>q.text.includes('UPDLOCK, HOLDLOCK')));
});
test('SQL Server initialization rolls back parent when child insert fails',async()=>{const h=fakeDriver({empty:true,failTable:'quiz_questions'});await assert.rejects(()=>h.repo.initialize(JSON.stringify(seedQuiz()),1000),/table write failed/);assert.equal(h.state.header,null);assert.deepEqual(h.state.rows,emptyQuizRows());});
test('SQL Server read reconstructs state in one locked transaction',async()=>{const h=fakeDriver(),row=await h.repo.read();assert.equal(row.revision,4);assert.deepEqual(JSON.parse(row.document),seedQuizFor(h));assert.deepEqual(h.trace,['begin','read','commit']);assert.ok(h.queries[0].text.includes('WITH (HOLDLOCK)'));assert.ok(h.queries.every(q=>q.params.room.value==='main'));});
function seedQuizFor(h){return rowsToQuiz(h.state.rows);}
test('SQL Server missing room and owner read as null, owner claim is parameterized',async()=>{
 const h=fakeDriver({empty:true});assert.equal(await h.repo.read(),null);assert.equal(await h.repo.getOwner(),null);const user="operator'; DROP TABLE dbo.quiz_rooms;--";await h.repo.claimOwner(user,1000);await h.repo.claimOwner('another',2000);assert.equal(await h.repo.getOwner(),user);assert.ok(h.queries.every(q=>!q.text.includes(user)));
});
test('SQL Server migration archives the exact JSON once and keeps revision and live state',async()=>{
 let q=alter(seedQuiz(),{type:'selectTeam',teamId:'B'});q=alter(q,{type:'start'},'start',1000);q=alter(q,{type:'pause'},'pause',3000);q.teams[1].score=70;
 const h=fakeDriver({legacy:true,quiz:q}),source=h.state.header.document,row=await h.repo.read();
 assert.equal(h.state.archives.length,1);assert.equal(h.state.archives[0].document,source);assert.equal(h.state.header.document,null);assert.equal(h.state.header.storage_version,2);assert.equal(row.revision,4);assert.deepEqual(JSON.parse(row.document),q);await h.repo.read();assert.equal(h.state.archives.length,1);
});
test('SQL Server failed migration retains source JSON and leaves no partial archive',async()=>{
 const h=fakeDriver({legacy:true,failTable:'quiz_questions'}),before=structuredClone(h.state);await assert.rejects(()=>h.repo.read(),/table write failed/);assert.deepEqual(h.state,before);
});
test('SQL Server oversized legacy field fails before source or archive changes',async()=>{
 const q=seedQuiz();q.rounds[0].questions[0].text='x'.repeat(2001);const h=fakeDriver({legacy:true,quiz:q}),before=structuredClone(h.state);await assert.rejects(()=>h.repo.read(),/melebihi/);assert.deepEqual(h.state,before);
});
test('SQL Server migration refuses to overwrite pre-existing relational rows',async()=>{
 const h=fakeDriver({legacy:true});h.state.rows.quiz_settings.push({room_id:'main',schema_version:3,sound_enabled:false});const before=structuredClone(h.state);await assert.rejects(()=>h.repo.read(),/Relational rows already exist/);assert.deepEqual(h.state,before);
});
test('SQL Server one-bank legacy migration preserves a paused turn and result history',async()=>{
 let q=alter(seedQuiz(),{type:'selectTeam',teamId:'B'});q=alter(q,{type:'start'});q=alter(q,{type:'judge',correct:true});q=alter(q,{type:'next'});q=alter(q,{type:'start'},'start2',5000);q=alter(q,{type:'pause'},'pause2',6000);
 q.schemaVersion=1;q.rounds=q.rounds.filter(r=>r.id==='reguler'||r.type==='rebutan');q.rounds.forEach((r,i)=>{r.order=i+1;delete r.batchNumber;});q.results.forEach(r=>delete r.roundId);
 const h=fakeDriver({legacy:true,quiz:q}),saved=await loadQuiz(h.repo);assert.equal(saved.quiz.schemaVersion,3);assert.equal(saved.quiz.game.roundId,'reguler-b');assert.equal(saved.quiz.game.index,q.game.index);assert.equal(saved.quiz.game.remaining,q.game.remaining);assert.equal(saved.quiz.game.epoch,q.game.epoch);assert.equal(saved.quiz.teams[1].score,10);assert.equal(saved.quiz.results.length,1);assert.equal(saved.quiz.rounds.length,4);assert.equal(h.state.archives[0].document,JSON.stringify(q));
});
test('SQL Server legacy engine schema 2 upgrades through the audited store path',async()=>{
 const q=seedQuiz();q.schemaVersion=2;q.rounds.filter(r=>r.type==='reguler').forEach((r,i)=>{r.batchTeam=['A','B','C'][i];delete r.batchNumber;});const h=fakeDriver({legacy:true,quiz:q}),saved=await loadQuiz(h.repo);
 assert.equal(saved.quiz.schemaVersion,3);assert.deepEqual(saved.quiz.rounds.filter(r=>r.type==='reguler').map(r=>r.batchNumber),[1,2,3]);assert.equal(saved.revision,5);assert.equal(h.state.archives[0].document,JSON.stringify(q));assert.equal(h.state.events[0].kind,'schema_migration_v3');
});
test('SQL Server active unused batch deletion detaches game state before deleting parent',async()=>{
 const q=alter(seedQuiz(),{type:'selectRound',roundId:'reguler-b'}),h=fakeDriver({quiz:q});const after=alter(q,{type:'deleteBatch',roundId:'reguler-b',confirm:'HAPUS'});assert.equal(await h.repo.compareAndSwap(changeFor(after,{kind:'deleteBatch'})),true);assert.deepEqual(rowsToQuiz(h.state.rows),after);
 const deletes=h.queries.filter(q=>q.text.startsWith('DELETE')).map(q=>/dbo\.\[(quiz_\w+)\]/.exec(q.text)[1]);assert.ok(deletes.indexOf('quiz_game_state')<deletes.indexOf('quiz_rounds'));assert.ok(deletes.indexOf('quiz_question_options')<deletes.indexOf('quiz_questions'));
});
test('SQL Server judging persists score, result, progress and game together',async()=>{
 let q=alter(seedQuiz(),{type:'selectTeam',teamId:'A'});q=alter(q,{type:'start'});const h=fakeDriver({quiz:q});await mutate(h.repo,{type:'judge',correct:true},{admin:true,expectedRevision:4,id:'judge',now:2000});const saved=await loadQuiz(h.repo);assert.equal(saved.quiz.teams[0].score,10);assert.equal(saved.quiz.results.length,1);assert.equal(saved.quiz.game.progress['reguler:A'],1);assert.equal(saved.quiz.game.phase,'judged');assert.ok(!h.queries.some(q=>q.params.rows&&q.text.includes('dbo.[quiz_questions]')));
});
test('SQL Server reset removes results, progress and buzzes while preserving questions and keys',async()=>{
 let q=alter(seedQuiz(),{type:'selectTeam',teamId:'A'});q=alter(q,{type:'start'});q=alter(q,{type:'judge',correct:true});const h=fakeDriver({quiz:q});await mutate(h.repo,{type:'reset',confirm:'RESET'},{admin:true,id:'reset'});const saved=(await loadQuiz(h.repo)).quiz;assert.equal(saved.results.length,0);assert.deepEqual(saved.game.progress,{});assert.equal(saved.teams[0].score,0);assert.deepEqual(saved.rounds,q.rounds);assert.equal(saved.teams[0].key,q.teams[0].key);
});
test('SQL Server question edits remain parameterized, including quote and SQL text',async()=>{
 const q=seedQuiz(),h=fakeDriver({quiz:q});const text="Soal 日本語 '; DROP TABLE dbo.quiz_teams;--";const after=alter(q,{type:'saveQuestion',roundId:q.rounds[0].id,question:{...q.rounds[0].questions[0],text}});await h.repo.compareAndSwap(changeFor(after,{kind:'saveQuestion'}));assert.ok(h.queries.every(q=>!q.text.includes(text)));assert.equal(rowsToQuiz(h.state.rows).rounds[0].questions[0].text,text);
});
test('SQL Server question deletion removes choices before parent and preserves ordering',async()=>{
 const q=seedQuiz(),h=fakeDriver({quiz:q});const after=alter(q,{type:'deleteQuestion',roundId:'reguler',questionId:q.rounds[0].questions[1].id});await h.repo.compareAndSwap(changeFor(after));assert.deepEqual(rowsToQuiz(h.state.rows),after);
});
test('SQL Server storage DDL contains every mapped table and matching columns',()=>{
 const ddl=readFileSync('sql/sqlserver/002_relational_schema.sql','utf8');for(const table of quizTables){const body=new RegExp(`CREATE TABLE dbo\\.${table.name} \\(([\\s\\S]*?)\\n        \\);`).exec(ddl)?.[1];assert.ok(body,table.name);for(const [column,type] of Object.entries(table.columns))assert.match(body,new RegExp(`\\b${column}\\s+${type.replace(/[()]/g,'\\$&')}`,'i'));}assert.match(ddl,/compatibility_level/);
});
const base={MSSQL_SERVER:'db.internal',MSSQL_DATABASE:'BGIQuiz',MSSQL_USER:'quiz_app',MSSQL_PASSWORD:'  keep spaces  '};
test('SQL Server configuration keeps TLS verification on and preserves password',()=>{const c=sqlServerConfig(base);assert.equal(c.server,'db.internal');assert.equal(c.port,1433);assert.equal(c.options.encrypt,true);assert.equal(c.options.trustServerCertificate,false);assert.equal(c.password,base.MSSQL_PASSWORD);assert.equal(c.pool.max,10);});
test('SQL Server configuration validates numeric limits and named instances',()=>{assert.throws(()=>sqlServerConfig({}),/MSSQL_SERVER/);assert.throws(()=>sqlServerConfig({...base,MSSQL_PORT:'70000'}),/MSSQL_PORT/);assert.throws(()=>sqlServerConfig({...base,MSSQL_ENCRYPT:'yes'}),/true atau false/);assert.throws(()=>sqlServerConfig({...base,MSSQL_INSTANCE:'SQLEXPRESS',MSSQL_PORT:'1433'}),/pilih salah satu/);assert.equal(sqlServerConfig({...base,MSSQL_INSTANCE:'SQLEXPRESS'}).options.instanceName,'SQLEXPRESS');});

test('SQL Server event rename and answer reveal survive reread without rewriting question banks',async()=>{
 const q=seedQuiz(),h=fakeDriver({quiz:q});
 await mutate(h.repo,{type:'saveEventSettings',eventName:'Kuis <BGI> & Indonesia'},{admin:true,expectedRevision:4});
 let state=await loadQuiz(h.repo);assert.equal(state.quiz.eventName,'Kuis <BGI> & Indonesia');
 await mutate(h.repo,{type:'setAnswerVisibility',visible:true,epoch:state.quiz.game.epoch,questionId:state.quiz.rounds[0].questions[0].id},{admin:true,expectedRevision:state.revision});
 state=await loadQuiz(h.repo);assert.equal(state.quiz.game.answerVisible,true);
 assert.ok(!h.queries.some(q=>q.params.rows&&q.text.includes('dbo.[quiz_questions]')));
});
test('SQL Server reveal failure rolls back visibility and revision',async()=>{
 const q=seedQuiz(),h=fakeDriver({quiz:q,failTable:'quiz_game_state'}),before=structuredClone(h.state);
 await assert.rejects(()=>mutate(h.repo,{type:'setAnswerVisibility',visible:true,epoch:q.game.epoch,questionId:q.rounds[0].questions[0].id},{admin:true,expectedRevision:4}),/table write failed/);assert.deepEqual(h.state,before);
});

function resultCorrectionFixture(){let q=alter(seedQuiz(),{type:'selectTeam',teamId:'B'});q=alter(q,{type:'start'});return alter(q,{type:'judge',correct:false});}
const resultCorrection=q=>({type:'correctResult',resultId:q.results[0].id,correct:true,expectedCorrect:false,expectedPoints:0,expectedCorrectionCount:0,reason:'Host salah menekan Salah.'});
test('SQL Server correction persists original value result metadata score and audit atomically',async()=>{
 const q=resultCorrectionFixture(),h=fakeDriver({quiz:q});await mutate(h.repo,resultCorrection(q),{admin:true,expectedRevision:4,id:'correct-result',now:9000});
 const saved=(await loadQuiz(h.repo)).quiz;assert.equal(saved.teams[1].score,10);assert.equal(saved.results[0].points,10);assert.equal(saved.results[0].possiblePoints,10);assert.deepEqual(saved.results[0].correction,{count:1,at:9000,reason:'Host salah menekan Salah.'});assert.equal(saved.results[0].at,q.results[0].at);assert.equal(saved.game.feedback,'correct');
 const written=[...new Set(h.queries.filter(x=>x.params.rows).map(x=>/dbo\.\[(quiz_\w+)\]/.exec(x.text)[1]))];assert.deepEqual(written,['quiz_team_scores','quiz_game_state','quiz_results']);
 const audit=JSON.parse(h.state.events[0].payload);assert.deepEqual(audit.before,{correct:false,points:0,score:0});assert.deepEqual(audit.after,{correct:true,points:10,score:10});assert.equal(audit.reason,'Host salah menekan Salah.');
 assert.deepEqual(rowsToQuiz(quizToRows(saved)),saved);
});
test('SQL Server correction audit or result failure rolls back score metadata feedback and revision',async()=>{
 for(const failure of [{failAudit:true},{failTable:'quiz_results'}]){const q=resultCorrectionFixture(),h=fakeDriver({quiz:q,...failure}),before=structuredClone(h.state);await assert.rejects(()=>mutate(h.repo,resultCorrection(q),{admin:true,expectedRevision:4}),/failed/);assert.deepEqual(h.state,before);}
});
test('SQL Server simultaneous corrections commit one delta and one audit',async()=>{
 const q=resultCorrectionFixture(),h=fakeDriver({quiz:q});const attempts=await Promise.allSettled(['one','two'].map(id=>mutate(h.repo,resultCorrection(q),{admin:true,expectedRevision:4,id})));
 assert.equal(attempts.filter(r=>r.status==='fulfilled').length,1);assert.equal(rowsToQuiz(h.state.rows).teams[1].score,10);assert.equal(h.state.events.length,1);assert.equal(h.state.header.revision,5);
});
test('SQL Server legacy correction preserves null value until host explicitly confirms original points',async()=>{
 const q=resultCorrectionFixture();delete q.results[0].possiblePoints;const h=fakeDriver({quiz:q});assert.equal(h.state.rows.quiz_results[0].possible_points,null);assert.equal(h.state.rows.quiz_results[0].correction_count,0);
 await mutate(h.repo,{...resultCorrection(q),possiblePoints:27},{admin:true,expectedRevision:4});const saved=(await loadQuiz(h.repo)).quiz;assert.equal(saved.teams[1].score,27);assert.equal(saved.results[0].possiblePoints,27);
});

function championshipReady(){
 let q=seedQuiz();q.rounds.forEach(r=>{r.questionCount=1;r.questions=r.questions.slice(0,1);});
 for(const [i,r] of q.rounds.entries()){
  q=alter(q,{type:'selectRound',roundId:r.id});if(r.type==='reguler')q=alter(q,{type:'selectTeam',teamId:['A','B','C'][i]});q=alter(q,{type:'start'});
  if(r.type==='rebutan'){q=alter(q,{type:'buzz',teamId:'A',epoch:q.game.epoch});q=alter(q,{type:'confirmBuzz',teamId:'A'});}
  q=alter(q,{type:'judge',correct:true});q=alter(q,{type:'next'});
 }
 return q;
}
test('SQL Server persists winner announcement, scores and audit atomically across read',async()=>{
 const h=fakeDriver({quiz:championshipReady()});await mutate(h.repo,{type:'declareChampion'},{admin:true,expectedRevision:4,id:'announce'});const saved=await loadQuiz(h.repo);assert.deepEqual(saved.quiz.championship.teamIds,['A']);assert.equal(saved.quiz.championship.score,20);assert.equal(h.state.rows.quiz_championships.length,1);assert.equal(h.state.events[0].kind,'declareChampion');assert.equal(JSON.parse(h.state.events[0].payload).championship.score,20);assert.equal(saved.revision,5);
});
test('SQL Server announcement audit failure rolls back the winner and game state',async()=>{
 const h=fakeDriver({quiz:championshipReady(),failAudit:true}),before=structuredClone(h.state);await assert.rejects(()=>mutate(h.repo,{type:'declareChampion'},{admin:true,id:'announce-fail'}),/event failed/);assert.deepEqual(h.state,before);
});
test('SQL Server score correction removes the announced winner while preserving the question bank',async()=>{
 const q=alter(championshipReady(),{type:'declareChampion'}),h=fakeDriver({quiz:q}),r=q.results[0];await mutate(h.repo,{type:'correctResult',resultId:r.id,correct:false,expectedCorrect:true,expectedPoints:r.points,expectedCorrectionCount:0,reason:'Koreksi penilaian'},{admin:true,id:'fix-winner'});const saved=(await loadQuiz(h.repo)).quiz;assert.equal(saved.championship,undefined);assert.deepEqual(h.state.rows.quiz_championships,[]);assert.deepEqual(saved.rounds,q.rounds);
});

function spareBatchFixture(){
 const q=alter(championshipReady(),{type:'createBatch',round:{name:'Batch 4',questionCount:1,duration:30,points:10,scoringMode:'round'},templateRoundId:'reguler'});
 return {q,id:q.rounds.find(r=>r.name==='Batch 4').id};
}
test('SQL Server stores unused round selection and audit without changing questions scores or progress',async()=>{
 const {q,id}=spareBatchFixture(),h=fakeDriver({quiz:q});await mutate(h.repo,{type:'setRoundParticipation',roundId:id,enabled:false},{admin:true,expectedRevision:4,id:'skip-spare'});const saved=(await loadQuiz(h.repo)).quiz;assert.deepEqual(saved.game.excludedRoundIds,[id]);assert.deepEqual(saved.teams,q.teams);assert.deepEqual(saved.rounds,q.rounds);assert.deepEqual(saved.game.progress,q.game.progress);assert.equal(h.state.rows.quiz_round_exclusions.length,1);assert.deepEqual(JSON.parse(h.state.events[0].payload).after,[id]);await mutate(h.repo,{type:'declareChampion'},{admin:true,id:'declare-with-spare'});assert.deepEqual((await loadQuiz(h.repo)).quiz.championship.teamIds,['A']);
});
test('SQL Server rolls back round participation on write or audit failure',async()=>{
 for(const failure of [{failAudit:true},{failTable:'quiz_round_exclusions'}]){const {q,id}=spareBatchFixture(),h=fakeDriver({quiz:q,...failure}),before=structuredClone(h.state);await assert.rejects(()=>mutate(h.repo,{type:'setRoundParticipation',roundId:id,enabled:false},{admin:true,id:'skip-fail'}),/failed/);assert.deepEqual(h.state,before);}
});
test('SQL Server removes exclusion children before deleting a spare batch or resetting the session',async()=>{
 for(const mode of ['deleteBatch','reset']){let {q,id}=spareBatchFixture();q=alter(q,{type:'setRoundParticipation',roundId:id,enabled:false});const h=fakeDriver({quiz:q});await mutate(h.repo,mode==='reset'?{type:'reset',confirm:'RESET'}:{type:'deleteBatch',roundId:id,confirm:'HAPUS'},{admin:true,id:`clean-${mode}`});assert.deepEqual(h.state.rows.quiz_round_exclusions,[]);assert.equal((await loadQuiz(h.repo)).quiz.game.excludedRoundIds,undefined);}
});

test('SQL Server Arena receives committed buzzer and verdict audio after host advances immediately',async()=>{
 let q=alter(seedQuiz(),{type:'selectTeam',teamId:'A'});q=alter(q,{type:'start'});const h=fakeDriver({quiz:q}),now=Date.now();
 await mutate(h.repo,{type:'buzz',teamId:'A',epoch:q.game.epoch},{admin:false,key:q.teams[0].key,id:'arena-buzz',now});await mutate(h.repo,{type:'judge',correct:false},{admin:true,id:'arena-wrong',now:now+1});await mutate(h.repo,{type:'next'},{admin:true,id:'arena-next',now:now+2});const safe=await snapshot(h.repo,false);
 assert.deepEqual(safe.audioCues.map(c=>c.type),['buzz','wrong']);assert.equal(safe.quiz.game.phase,'ready');assert.deepEqual(safe.quiz.game.buzzes,[]);assert.deepEqual(safe.quiz.results,[]);assert.ok(safe.quiz.teams.every(t=>!t.key));const query=h.queries.find(q=>q.text.startsWith('SELECT TOP (32)'));assert.ok(query);assert.equal(query.params.maxRevision.value,safe.revision);assert.ok(!query.text.includes('CREATE'));
});
test('SQL Server rejected or rolled back verdicts never publish an Arena audio cue',async()=>{
 let q=alter(seedQuiz(),{type:'selectTeam',teamId:'A'});q=alter(q,{type:'start'});const h=fakeDriver({quiz:q,failAudit:true});await assert.rejects(()=>mutate(h.repo,{type:'judge',correct:true},{admin:true,id:'failed-audio'}),/event failed/);assert.deepEqual((await snapshot(h.repo,false)).audioCues,[]);assert.equal(h.state.rows.quiz_team_scores[0].score,0);
});
