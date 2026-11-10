import ts from 'typescript';
import {readFileSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {DatabaseSync} from 'node:sqlite';
import {test} from 'node:test';
import assert from 'node:assert/strict';
const output=resolve('.sites-runtime/test-build');mkdirSync(output,{recursive:true});
for(const file of ['engine','seed','migrations','persistence','store','sqlite-adapter','sqlite-repository','relational-quiz','mssql-driver','mssql-repository','runtime-node']){const content=ts.transpileModule(readFileSync(`lib/${file}.ts`,'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText.replace(/from "\.\/([^".]+)"/g,'from "./$1.mjs"').replaceAll('"../scripts/mssql-config.mjs"',JSON.stringify(pathToFileURL(resolve('scripts/mssql-config.mjs')).href));writeFileSync(`${output}/${file}.mjs`,content);}
const {applyAction,validateQuestion,publicQuiz,pointsFor,QuizError}=await import(pathToFileURL(`${output}/engine.mjs`));
const {seedQuiz}=await import(pathToFileURL(`${output}/seed.mjs`));
const {loadQuiz,mutate,snapshot,isOwner}=await import(pathToFileURL(`${output}/store.mjs`));
const {wrapSqlite}=await import(pathToFileURL(`${output}/sqlite-adapter.mjs`));
const {sqliteRepository}=await import(pathToFileURL(`${output}/sqlite-repository.mjs`));
let serial=0;function act(q,a,now=1000){return applyAction(q,a,now,`id-${++serial}`);}
function readyRegular(){return act(seedQuiz(),{type:'selectTeam',teamId:'A'});}
function readyRebutan(){let q=act(seedQuiz(),{type:'selectRound',roundId:'rebutan'});return act(q,{type:'start'},1000);}
function sqlDb(file=':memory:'){const sql=new DatabaseSync(file);sql.exec(readFileSync('drizzle/0000_hard_rachel_grey.sql','utf8'));return {sql,db:sqliteRepository(wrapSqlite(sql))};}
async function saveSeed(db,q){await db.initialize(JSON.stringify(q),1000);}

test('default rounds contain 10 questions, 10 points and exactly three groups',()=>{const q=seedQuiz();assert.equal(q.rounds.length,4);assert.deepEqual(q.rounds.filter(r=>r.type==='reguler').map(r=>r.batchNumber),[1,2,3]);for(const r of q.rounds){assert.equal(r.questionCount,10);assert.equal(r.points,10);assert.equal(r.questions.length,10);}assert.deepEqual(q.teams.map(t=>t.id),['A','B','C']);});
test('question validation rejects empty and whitespace-only prompts and answers',()=>{const q=seedQuiz().rounds[0].questions[0];for(const text of ['', '  '])assert.throws(()=>validateQuestion({...q,text},q.id),/Pertanyaan wajib/);for(const answer of ['', ' \n'])assert.throws(()=>validateQuestion({...q,answer},q.id),/Jawaban benar wajib/);});
test('multiple choice requires unique choices and a matching correct answer',()=>{const q=seedQuiz().rounds[0].questions[1];assert.throws(()=>validateQuestion({...q,answer:'Invalid'},q.id),/sesuai/);assert.throws(()=>validateQuestion({...q,options:['Router','Router']},q.id),/sama/);assert.equal(validateQuestion(q,q.id).options.length,4);});
test('regular round requires a selected team and rejects other team buzzers',()=>{assert.throws(()=>act(seedQuiz(),{type:'start'}),/Pilih grup/);const q=readyRegular();assert.throws(()=>act(q,{type:'buzz',teamId:'B',epoch:q.game.epoch}),/batch reguler|Hanya grup terpilih/);assert.throws(()=>act(q,{type:'buzz',teamId:'A',epoch:q.game.epoch},2000),/Tunggu host/);const started=act(q,{type:'start'},2000);const n=act(started,{type:'buzz',teamId:'A',epoch:started.game.epoch},2000);assert.equal(n.game.activeTeam,'A');assert.equal(n.game.deadline,32000);});
test('regular verdict awards configured round points once and advances in order',()=>{let q=readyRegular();q.rounds[0].points=17;q=act(q,{type:'start'});const before=structuredClone(q);q=act(q,{type:'judge',correct:true});assert.equal(q.teams[0].score,17);assert.equal(before.teams[0].score,0);assert.throws(()=>act(q,{type:'judge',correct:true}),/Konfirmasi/);q=act(q,{type:'next'});assert.equal(q.game.index,1);assert.equal(q.game.phase,'ready');assert.equal(q.game.activeTeam,null);});
test('question point override follows the selected scoring mode',()=>{let q=readyRegular();q.rounds[0].scoringMode='question';q.rounds[0].questions[0].points=25;q=act(q,{type:'start'});q=act(q,{type:'judge',correct:true});assert.equal(q.teams[0].score,25);});
test('ten regular questions complete one group and next group starts from one',()=>{let q=readyRegular();for(let i=0;i<10;i++){q=act(q,{type:'start'});q=act(q,{type:'judge',correct:i%2===0});if(i%2!==0)q=act(q,{type:'skipRegularRebound'});q=act(q,{type:'next'});}assert.equal(q.game.phase,'finished');assert.equal(q.teams[0].score,50);assert.equal(q.game.progress['reguler:A'],10);q=act(q,{type:'selectRound',roundId:'reguler-b'});assert.equal(q.game.selectedTeam,null);q=act(q,{type:'selectTeam',teamId:'B'});assert.equal(q.game.index,0);assert.equal(q.game.phase,'ready');q=act(q,{type:'selectRound',roundId:'reguler'});q=act(q,{type:'selectTeam',teamId:'A'});assert.equal(q.game.phase,'finished');});
test('judged progress survives round switching and cannot award the same question twice',()=>{let q=readyRegular();q=act(q,{type:'start'});q=act(q,{type:'judge',correct:true});q=act(q,{type:'selectRound',roundId:'rebutan'});q=act(q,{type:'selectRound',roundId:'reguler'});q=act(q,{type:'selectTeam',teamId:'A'});assert.equal(q.game.index,1);assert.equal(q.teams[0].score,10);});
test('rebutan locks after first buzzer and keeps close arrivals in server order',()=>{let q=readyRebutan();const epoch=q.game.epoch;q=act(q,{type:'buzz',teamId:'B',epoch},2000);q=act(q,{type:'buzz',teamId:'A',epoch},2020);assert.equal(q.game.phase,'review');assert.equal(q.game.deadline,null);assert.equal(q.game.activeTeam,null);assert.deepEqual(q.game.buzzes.map(b=>b.teamId),['B','A']);assert.throws(()=>act(q,{type:'buzz',teamId:'C',epoch},2300),/terkunci/);});
test('MC confirmation may select a recorded group and starts its timer at confirmation',()=>{let q=readyRebutan();const epoch=q.game.epoch;q=act(q,{type:'buzz',teamId:'B',epoch},2000);q=act(q,{type:'buzz',teamId:'A',epoch},2020);assert.throws(()=>act(q,{type:'confirmBuzz',teamId:'C'},3000),/tidak tercatat/);q=act(q,{type:'confirmBuzz',teamId:'A'},5000);assert.equal(q.game.activeTeam,'A');assert.equal(q.game.deadline,25000);assert.throws(()=>act(q,{type:'buzz',teamId:'C',epoch},5100),/terkunci/);});
test('wrong answers keep score and next question closes all buzzers until reopened',()=>{let q=readyRebutan();q=act(q,{type:'buzz',teamId:'C',epoch:q.game.epoch},2000);q=act(q,{type:'confirmBuzz',teamId:'C'},4000);q=act(q,{type:'judge',correct:false},5000);assert.equal(q.teams[2].score,0);q=act(q,{type:'next'});assert.equal(q.game.phase,'ready');assert.equal(q.game.buzzes.length,0);q=act(q,{type:'start'});assert.equal(q.game.phase,'buzzing');});
test('pause and resume preserve remaining duration including expiration',()=>{let q=readyRegular();q=act(q,{type:'start'},1000);q=act(q,{type:'pause'},11000);assert.equal(q.game.remaining,20000);q=act(q,{type:'resume'},16000);assert.equal(q.game.deadline,36000);q=act(q,{type:'pause'},40000);assert.equal(q.game.remaining,0);q=act(q,{type:'resume'},45000);assert.equal(q.game.deadline,45000);});
test('stale epoch never presses a new question buzzer',()=>{const q=readyRebutan();assert.throws(()=>act(q,{type:'buzz',teamId:'A',epoch:'old-question'}),/soal sebelumnya/);});
test('round and question CRUD validates numbers, blanks and readiness',()=>{let q=seedQuiz();assert.throws(()=>act(q,{type:'saveRound',round:{...q.rounds[0],questionCount:0}}),/Jumlah soal/);assert.throws(()=>act(q,{type:'saveQuestion',roundId:'reguler',question:{...q.rounds[0].questions[0],text:''}}),/Pertanyaan wajib/);q=act(q,{type:'deleteQuestion',roundId:'reguler',questionId:'reg-2'});assert.equal(q.rounds[0].questions.length,9);assert.deepEqual(q.rounds[0].questions.map(q=>q.number),[1,2,3,4,5,6,7,8,9]);q=act(q,{type:'selectTeam',teamId:'A'});assert.throws(()=>act(q,{type:'start'}),/Lengkapi 10 soal/);});
test('public state removes every answer, MC note, team key and future prompt',()=>{const original=seedQuiz(),q=publicQuiz(original);assert.ok(q.rounds.every(r=>r.questions.every(x=>x.answer===''&&x.notes==='')));assert.ok(q.teams.every(t=>t.key===''));assert.equal(q.rounds[0].questions[0].text,'');assert.ok(q.rounds[0].questions.slice(1).every(x=>x.text===''));assert.ok(q.rounds[1].questions.every(x=>x.text===''));assert.notEqual(original.rounds[0].questions[0].answer,'');});
test('team photo rejects active content and persists one circular photo per team',()=>{const q=seedQuiz();assert.throws(()=>act(q,{type:'saveTeam',teamId:'A',name:'A',participants:'',photo:'data:image/svg+xml;base64,AAAA'}),/Foto harus/);const n=act(q,{type:'saveTeam',teamId:'A',name:'Tim Kompak',participants:'Andi, Budi, Citra',photo:'data:image/png;base64,AAAA'});assert.equal(n.teams[0].name,'Tim Kompak');assert.equal(n.teams[0].photo,'data:image/png;base64,AAAA');});
test('reset requires explicit phrase and preserves questions and team identities',()=>{let q=readyRegular();q=act(q,{type:'start'});q=act(q,{type:'judge',correct:true});assert.throws(()=>act(q,{type:'reset',confirm:'yes'}),/RESET/);const n=act(q,{type:'reset',confirm:'RESET'});assert.equal(n.teams[0].score,0);assert.equal(n.results.length,0);assert.equal(n.rounds[0].questions.length,10);assert.equal(n.teams[0].key,q.teams[0].key);});
test('SQLite reload preserves score, remaining deadline and progress',async()=>{const file=resolve(output,'persistence.sqlite');rmSync(file,{force:true});let {sql,db}=sqlDb(file);await saveSeed(db,readyRegular());await mutate(db,{type:'start'},{admin:true,now:1000});await mutate(db,{type:'judge',correct:true},{admin:true,now:2000});await mutate(db,{type:'next'},{admin:true});await mutate(db,{type:'start'},{admin:true,now:5000});sql.close();sql=new DatabaseSync(file);db=sqliteRepository(wrapSqlite(sql));const state=await loadQuiz(db);assert.equal(state.quiz.teams[0].score,10);assert.equal(state.quiz.game.index,1);assert.equal(state.quiz.game.deadline,35000);assert.equal(state.quiz.game.progress['reguler:A'],1);sql.close();});
test('SQLite authorization rejects unknown buzzer keys and unauthorized edits',async()=>{const {db,sql}=sqlDb();await saveSeed(db,readyRebutan());await assert.rejects(()=>mutate(db,{type:'reset',confirm:'RESET'},{admin:false}),/penyelenggara/);const q=(await loadQuiz(db)).quiz;await assert.rejects(()=>mutate(db,{type:'buzz',teamId:'A',epoch:q.game.epoch},{admin:false,key:'wrong'}),/Tautan buzzer/);sql.close();});
test('concurrent SQL buzzer requests retain all close presses without lost updates',async()=>{const {db,sql}=sqlDb();const q=readyRebutan();await saveSeed(db,q);await Promise.all(['B','A','C'].map((teamId,i)=>mutate(db,{type:'buzz',teamId,epoch:q.game.epoch},{admin:false,key:q.teams.find(t=>t.id===teamId).key,now:2000+i*10,id:`concurrent-${i}`})));const saved=await loadQuiz(db);assert.equal(saved.revision,3);assert.deepEqual(saved.quiz.game.buzzes.map(b=>b.teamId),['B','A','C']);assert.equal(saved.quiz.game.activeTeam,null);assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM quiz_events').get().n,3);sql.close();});
test('concurrent SQL verdicts award once and stale revisions return a conflict',async()=>{const {db,sql}=sqlDb();const q=act(readyRegular(),{type:'start'});await saveSeed(db,q);const results=await Promise.allSettled([mutate(db,{type:'judge',correct:true},{admin:true,expectedRevision:0,id:'judge1'}),mutate(db,{type:'judge',correct:true},{admin:true,expectedRevision:0,id:'judge2'})]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);const saved=await loadQuiz(db);assert.equal(saved.quiz.teams[0].score,10);assert.equal(saved.quiz.results.length,1);assert.equal(saved.revision,1);sql.close();});

test('SQLite reopens a pending regular rebound and commits the answering group score',async()=>{
 const file=resolve(output,'rebound.sqlite');rmSync(file,{force:true});
 let {sql,db}=sqlDb(file);
 try {
  const quiz=act(readyRegular(),{type:'start'});
  await saveSeed(db,quiz);
  const open=await mutate(db,{type:'judge',correct:false},{admin:true,now:2000});
  sql.close();
  sql=new DatabaseSync(file);
  db=sqliteRepository(wrapSqlite(sql));
  const safe=await snapshot(db,false);
  assert.equal(safe.quiz.game.phase,'buzzing');
  assert.equal(safe.quiz.game.epoch,open.quiz.game.epoch);
  const buzz={type:'buzz',teamId:'C',epoch:safe.quiz.game.epoch};
  await mutate(db,buzz,{admin:false,key:quiz.teams[2].key,now:2100});
  await mutate(db,{type:'confirmBuzz',teamId:'C'},{admin:true,now:2200});
  await mutate(db,{type:'judge',correct:true},{admin:true,now:2300});
  const saved=(await loadQuiz(db)).quiz;
  assert.deepEqual(saved.teams.map(t=>t.score),[0,0,10]);
  assert.deepEqual(saved.game.progress,{'reguler:A':1});
 } finally {
  sql.close();
 }
});
test('SQL audit failure rolls back the complete score and game update',async()=>{const {db,sql}=sqlDb();await saveSeed(db,act(readyRegular(),{type:'start'}));sql.prepare('INSERT INTO quiz_events VALUES (?,0,?,?,0)').run('duplicate','test','{}');await assert.rejects(()=>mutate(db,{type:'judge',correct:true},{admin:true,id:'duplicate'}),/UNIQUE/);const saved=await loadQuiz(db);assert.equal(saved.quiz.teams[0].score,0);assert.equal(saved.quiz.game.phase,'answering');assert.equal(saved.revision,0);sql.close();});
test('owner claim is atomic and another identity cannot take over',async()=>{const {db,sql}=sqlDb();assert.equal(await isOwner(db,null,true),false);assert.equal(await isOwner(db,'owner',true),true);assert.equal(await isOwner(db,'someone-else',true),false);assert.equal(await isOwner(db,'owner'),true);sql.close();});
test('native Next.js ignores spoofed identity headers and verifies signed admin cookies',async()=>{const runtime=await import(pathToFileURL(`${output}/runtime-node.mjs`));process.env.NODE_ENV='test';process.env.BGI_ADMIN_TOKEN=crypto.randomUUID();const request=new Request('https://quiz.example/host',{headers:{'oai-authenticated-user-id':'spoofed'}});assert.equal(await runtime.identity(request),null);assert.equal(await runtime.authenticate(request,'incorrect'),null);const cookie=await runtime.authenticate(request,process.env.BGI_ADMIN_TOKEN);assert.ok(cookie.includes('HttpOnly'));assert.ok(cookie.includes('Secure'));const signed=new Request(request.url,{headers:{cookie:cookie.split(';')[0]}});assert.equal(await runtime.identity(signed),'node-organizer');const invalid=new Request(request.url,{headers:{cookie:cookie.split(';')[0]+'x'}});assert.equal(await runtime.identity(invalid),null);delete process.env.BGI_ADMIN_TOKEN;});

test('API verifies login, hides answers, rejects invalid saves, and persists host changes',async()=>{
 const file=resolve(output,'api.sqlite');rmSync(file,{force:true});const local=sqlDb(file);globalThis.__bgiApiTestRepository=local.db;process.env.BGI_ADMIN_TOKEN=crypto.randomUUID();process.env.NODE_ENV='production';
 writeFileSync(`${output}/api-runtime.mjs`, 'export {identity,authenticate,authMode} from "./runtime-node.mjs"; export const database=async()=>globalThis.__bgiApiTestRepository;');
 for(const route of ['quiz','access']){const content=ts.transpileModule(readFileSync(`app/api/${route}/route.ts`,'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText.replaceAll('"@quiz-runtime"','"./api-runtime.mjs"').replaceAll('"@/lib/store"','"./store.mjs"').replaceAll('"@/lib/engine"','"./engine.mjs"');writeFileSync(`${output}/${route}-route.mjs`,content);}
 const quiz=await import(pathToFileURL(`${output}/quiz-route.mjs`)),access=await import(pathToFileURL(`${output}/access-route.mjs`));
 const get=()=>new Request('https://quiz.example/api/quiz');const post=(action,cookie='',extra={})=>new Request('https://quiz.example/api/quiz',{method:'POST',headers:{'Content-Type':'application/json',cookie,...extra},body:JSON.stringify({action})});
 let response=await access.POST(new Request('https://quiz.example/api/access',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:process.env.BGI_ADMIN_TOKEN})}));assert.equal(response.status,200);assert.equal((await response.json()).admin,true);const cookie=response.headers.get('set-cookie').split(';')[0];
 response=await quiz.GET(get());let state=await response.json();assert.ok(state.quiz.teams.every(t=>!t.key));assert.ok(state.quiz.rounds.every(r=>r.questions.every(q=>!q.answer&&!q.notes)));assert.ok(response.headers.get('cache-control').includes('no-store'));
 response=await quiz.GET(new Request('https://quiz.example/api/quiz?admin=1'));assert.equal(response.status,403);
 response=await quiz.POST(post({type:'selectTeam',teamId:'A'}));assert.equal(response.status,403);
 response=await quiz.POST(post({type:'selectTeam',teamId:'A'},cookie,{'sec-fetch-site':'cross-site'}));assert.equal(response.status,403);
 response=await quiz.POST(post({type:'selectTeam',teamId:'A'},cookie));assert.equal(response.status,200);
 response=await quiz.GET(new Request('https://quiz.example/api/quiz?admin=1',{headers:{cookie}}));state=await response.json();assert.equal(state.quiz.game.selectedTeam,'A');assert.ok(state.quiz.teams[0].key);
 response=await quiz.POST(post({type:'saveQuestion',roundId:'reguler',question:{...state.quiz.rounds[0].questions[0],answer:' '}},cookie));assert.equal(response.status,400);
 response=await quiz.POST(new Request(get(),{method:'POST',headers:{'Content-Type':'application/json'},body:'{broken'}));assert.equal(response.status,400);
 response=await quiz.POST(new Request(get(),{method:'POST',body:'text'}));assert.equal(response.status,415);
 delete process.env.BGI_ADMIN_TOKEN;delete globalThis.__bgiApiTestRepository;local.sql.close();
});

test('stage server render includes both logos, three shared-photo slots, question and score without answer',async()=>{
 const content=ts.transpileModule(readFileSync('components/core.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText.replaceAll('"@/lib/engine"','"./engine.mjs"');writeFileSync(`${output}/core.mjs`,content);
 const {Stage}=await import(pathToFileURL(`${output}/core.mjs`)),{createElement}=await import('react'),{renderToStaticMarkup}=await import('react-dom/server');const q=seedQuiz();q.game.index=3;q.game.phase='answering';q.teams[0].score=240;
 const html=renderToStaticMarkup(createElement(Stage,{s:{quiz:q,revision:0,serverNow:1000,admin:false},offset:{current:0}}));assert.ok(html.includes('/brand/bgi.png'));assert.ok(html.includes('/brand/36-tahun.png'));assert.ok(html.includes('240'));assert.ok(html.includes(q.rounds[0].questions[3].text));assert.ok(!html.includes(q.rounds[0].questions[3].answer));assert.equal((html.match(/class="team-avatar /g)||[]).length,3);assert.ok(html.includes('Bersama, Melangkah Lebih Kuat'));
});

test('verdict stops the timer at its current remaining time until the next question',()=>{let q=act(seedQuiz(),{type:'selectTeam',teamId:'B'});q=act(q,{type:'start'},1000);q=act(q,{type:'judge',correct:true},11000);assert.equal(q.game.deadline,null);assert.equal(q.game.remaining,20000);q=act(q,{type:'next'},15000);assert.equal(q.game.remaining,null);q=act(q,{type:'start'},16000);q=act(q,{type:'pause'},17000);q=act(q,{type:'judge',correct:false},19000);assert.equal(q.game.remaining,29000);});

await import('./mssql.mjs');

await import('./batches.mjs');
await import('./host-settings.mjs');
await import('./answer-title.mjs');

await import('./arena-answer-api.mjs');
await import('./result-corrections.mjs');

await import('./buzzer-content.mjs');
await import('./championship.mjs');

await import('./arena-audio.mjs');
