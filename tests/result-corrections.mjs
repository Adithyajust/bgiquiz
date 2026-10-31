import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {DatabaseSync} from 'node:sqlite';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
const load=name=>import(pathToFileURL(resolve(`.sites-runtime/test-build/${name}.mjs`)));
const {applyAction,currentResult,resultPossiblePoints}=await load('engine'),{seedQuiz}=await load('seed');
const {mutate,loadQuiz,snapshot}=await load('store'),{sqliteRepository}=await load('sqlite-repository'),{wrapSqlite}=await load('sqlite-adapter');
let serial=0;
const act=(q,a,now=1000)=>applyAction(q,a,now,`correction-${++serial}`);
function judged(correct=false,points=10){let q=seedQuiz();q.rounds[0].points=points;q=act(q,{type:'selectTeam',teamId:'A'});q=act(q,{type:'start'});return act(q,{type:'judge',correct},2000);}
const correction=(r,correct=!r.correct,extra={})=>({type:'correctResult',resultId:r.id,correct,expectedCorrect:r.correct,expectedPoints:r.points,expectedCorrectionCount:r.correction?.count??0,reason:'Host salah menekan tombol penilaian.',...extra});
function database(){const sql=new DatabaseSync(':memory:');sql.exec(readFileSync('drizzle/0000_hard_rachel_grey.sql','utf8'));return{sql,db:sqliteRepository(wrapSqlite(sql))};}

test('wrong to correct adds original value once and updates current feedback without advancing',()=>{
 const q=judged(false,17),before=structuredClone(q),after=act(q,correction(q.results[0]),3000);
 assert.equal(after.teams[0].score,17);assert.equal(after.results.length,1);assert.equal(after.results[0].points,17);assert.equal(after.results[0].at,2000);assert.equal(after.game.feedback,'correct');
 assert.deepEqual(after.game,{...before.game,feedback:'correct'});assert.deepEqual(q,before);assert.equal(after.results[0].correction.count,1);assert.equal(currentResult(after).correct,true);
 assert.throws(()=>act(after,correction(q.results[0])),e=>e.status===409);
});
test('correct to wrong subtracts only awarded points and preserves snapshot across bank edits and reversals',()=>{
 let q=judged(true,25);q.teams[0].score+=40;q.rounds[0].points=99;
 q=act(q,correction(q.results[0]));assert.equal(q.teams[0].score,40);assert.equal(q.results[0].possiblePoints,25);assert.equal(q.game.feedback,'wrong');
 q=act(q,correction(q.results[0],true,{possiblePoints:999}));assert.equal(q.teams[0].score,65);assert.equal(q.results[0].points,25);assert.equal(q.results[0].correction.count,2);
});
test('correcting an older result leaves an active question timer team buzzer and answer visibility intact',()=>{
 let q=judged();const id=q.results[0].id;q=act(q,{type:'next'});q=act(q,{type:'selectTeam',teamId:'B'});q=act(q,{type:'start'},5000);q=act(q,{type:'setAnswerVisibility',visible:true,epoch:q.game.epoch,questionId:q.rounds[0].questions[0].id});
 const game=structuredClone(q.game),after=act(q,correction(q.results.find(r=>r.id===id)),6000);
 assert.deepEqual(after.game,game);assert.equal(after.teams[0].score,10);assert.equal(after.teams[1].score,0);assert.deepEqual(after.rounds,q.rounds);
});
test('rebutan correction uses recorded answering group and original per-question points',()=>{
 let q=act(seedQuiz(),{type:'selectRound',roundId:'rebutan'});q.rounds.at(-1).scoringMode='question';q.rounds.at(-1).questions[0].points=35;
 q=act(q,{type:'start'});q=act(q,{type:'buzz',teamId:'C',epoch:q.game.epoch});q=act(q,{type:'confirmBuzz',teamId:'C'});q=act(q,{type:'judge',correct:false});q=act(q,correction(q.results[0]));
 assert.deepEqual(q.teams.map(t=>t.score),[0,0,35]);assert.equal(q.game.feedback,'correct');assert.equal(q.game.progress.rebutan,1);
});
test('zero-point questions may change verdict without changing score',()=>{
 let q=judged(false,0);q=act(q,correction(q.results[0]));assert.equal(q.teams[0].score,0);assert.equal(q.results[0].correct,true);assert.equal(q.results[0].possiblePoints,0);
});
test('legacy wrong result requires explicit original value and retains it for later reversals',()=>{
 let q=judged();delete q.results[0].possiblePoints;assert.equal(resultPossiblePoints(q.results[0]),null);
 for(const possiblePoints of [undefined,-1,1001,1.5])assert.throws(()=>act(q,correction(q.results[0],true,{possiblePoints})),/Nilai jawaban benar/);
 q=act(q,correction(q.results[0],true,{possiblePoints:30}));assert.equal(q.teams[0].score,30);q=act(q,correction(q.results[0]));assert.equal(q.teams[0].score,0);q=act(q,correction(q.results[0]));assert.equal(q.teams[0].score,30);
});
test('legacy correct result derives known awarded value without reading current question bank',()=>{
 let q=judged(true,19);delete q.results[0].possiblePoints;q.rounds[0].questions=[];assert.equal(resultPossiblePoints(q.results[0]),19);
 q=act(q,correction(q.results[0]));assert.equal(q.results[0].possiblePoints,19);assert.equal(q.teams[0].score,0);
});
test('correction validates reason verdict result identity and stale ABA forms',()=>{
 let q=judged(),r=q.results[0];
 for(const extra of [{reason:' '},{reason:'x'.repeat(501)},{correct:'true'},{resultId:'missing'},{correct:false}])assert.throws(()=>act(q,correction(r,true,extra)));
 const old=correction(r);q=act(q,old);q=act(q,correction(q.results[0]));assert.equal(q.results[0].correct,false);assert.throws(()=>act(q,old),e=>e.status===409);
 q=act(q,{type:'reset',confirm:'RESET'});assert.throws(()=>act(q,old),/tidak ditemukan/);
});
test('correction rejects an inconsistent negative total without changing source',()=>{
 const q=judged(true);q.teams[0].score=0;const before=structuredClone(q);assert.throws(()=>act(q,correction(q.results[0])),/tidak konsisten/);assert.deepEqual(q,before);
});
test('concurrent corrections award once and store complete before and after audit',async()=>{
 const {sql,db}=database();try{const q=judged();await db.initialize(JSON.stringify(q),1000);const action=correction(q.results[0]);
 await assert.rejects(()=>mutate(db,action,{admin:false}),e=>e.status===403);
 const done=await Promise.allSettled([mutate(db,action,{admin:true,expectedRevision:0,id:'correct-a'}),mutate(db,action,{admin:true,expectedRevision:0,id:'correct-b'})]);assert.equal(done.filter(r=>r.status==='fulfilled').length,1);
 const state=await loadQuiz(db);assert.equal(state.quiz.teams[0].score,10);assert.equal(state.quiz.results[0].correction.count,1);assert.equal(state.revision,1);
 const event=sql.prepare('SELECT payload FROM quiz_events WHERE kind=?').get('correctResult'),p=JSON.parse(event.payload);assert.deepEqual(p.before,{correct:false,points:0,score:0});assert.deepEqual(p.after,{correct:true,points:10,score:10});assert.equal(p.reason,action.reason);assert.equal(p.resultId,action.resultId);
 const pub=await snapshot(db,false);assert.equal(pub.quiz.teams[0].score,10);assert.deepEqual(pub.quiz.results,[]);assert.ok(!JSON.stringify(pub).includes(action.reason));
 }finally{sql.close();}
});
test('correction audit failure rolls back result score feedback and revision together',async()=>{
 const {sql,db}=database();try{const q=judged();await db.initialize(JSON.stringify(q),1000);sql.prepare('INSERT INTO quiz_events VALUES (?,0,?,?,0)').run('duplicate','test','{}');
 await assert.rejects(()=>mutate(db,correction(q.results[0]),{admin:true,id:'duplicate'}),/UNIQUE/);const after=await loadQuiz(db);assert.deepEqual(after.quiz,q);assert.equal(after.revision,0);
 }finally{sql.close();}
});
test('host menus full history correction form and CSV expose corrected result and audit summary',async()=>{
 const {HostScreen}=await load('screens'),{ResultHistory,CorrectionForm,resultsCsv}=await load('result-corrections');let q=judged();q=act(q,correction(q.results[0]));
 const c={data:{quiz:q,revision:1,serverNow:1000,admin:true},online:true,busy:false,offset:{current:0},act:async()=>true,setNotice:()=>{},setError:()=>{},error:''};
 const html=renderToStaticMarkup(createElement(HostScreen,{c}));assert.ok(html.includes('Koreksi penilaian'));assert.ok(html.includes('Koreksi 1 kali'));assert.ok(html.includes('+10 poin untuk Grup A'));
 const all=renderToStaticMarkup(createElement(ResultHistory,{c,showAll:true}));assert.ok(all.includes('Cari hasil penilaian'));assert.ok(all.includes(q.results[0].question));
 const form=renderToStaticMarkup(createElement(CorrectionForm,{result:q.results[0],c,close:()=>{}}));assert.ok(form.includes('Alasan koreksi'));assert.ok(form.includes('Simpan koreksi'));assert.ok(form.includes('10 poin'));assert.ok(!form.includes('Nilai jawaban benar untuk hasil lama'));
 q.results[0].correction.reason='=SUM(1,2)';const csv=resultsCsv(c.data);assert.ok(csv.includes('Jumlah koreksi'));assert.ok(csv.includes('Alasan koreksi terakhir'));assert.ok(csv.includes('"Benar","10"'));assert.ok(csv.includes('"\'=SUM(1,2)"'));
 const legacy=structuredClone(q.results[0]);legacy.correct=false;legacy.points=0;delete legacy.possiblePoints;const old=renderToStaticMarkup(createElement(CorrectionForm,{result:legacy,c:{...c,data:{...c.data,quiz:{...q,results:[legacy]}}},close:()=>{}}));assert.ok(old.includes('Nilai jawaban benar untuk hasil lama'));
});

test('host HTTP correction updates public Arena score and rejects participant and stale correction requests',async()=>{
 const {sql,db}=database(),quiz=await load('quiz-route'),access=await load('access-route'),{Stage}=await load('core');const q=judged();await db.initialize(JSON.stringify(q),1000);
 const token=process.env.BGI_ADMIN_TOKEN,mode=process.env.NODE_ENV;globalThis.__bgiApiTestRepository=db;process.env.BGI_ADMIN_TOKEN=crypto.randomUUID();process.env.NODE_ENV='production';
 const request=(action,cookie)=>new Request('https://quiz.example/api/quiz',{method:'POST',headers:{'Content-Type':'application/json',...(cookie?{cookie}:{})},body:JSON.stringify({action})});
 try{const action=correction(q.results[0]);let response=await quiz.POST(request(action));assert.equal(response.status,403);
 const login=await access.POST(new Request('https://quiz.example/api/access',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:process.env.BGI_ADMIN_TOKEN})}));const cookie=login.headers.get('set-cookie').split(';')[0];
 response=await quiz.POST(request(action,cookie));assert.equal(response.status,200);const saved=await response.json();assert.equal(saved.quiz.results[0].correct,true);assert.equal(saved.quiz.teams[0].score,10);
 const pub=await(await quiz.GET(new Request('https://quiz.example/api/quiz'))).json();assert.equal(pub.quiz.teams[0].score,10);assert.deepEqual(pub.quiz.results,[]);const html=renderToStaticMarkup(createElement(Stage,{s:pub,offset:{current:0}}));assert.ok(html.includes('BENAR'));assert.ok(!html.includes(action.reason));
 response=await quiz.POST(request(action,cookie));assert.equal(response.status,409);assert.equal((await loadQuiz(db)).quiz.teams[0].score,10);
 }finally{delete globalThis.__bgiApiTestRepository;if(token===undefined)delete process.env.BGI_ADMIN_TOKEN;else process.env.BGI_ADMIN_TOKEN=token;if(mode===undefined)delete process.env.NODE_ENV;else process.env.NODE_ENV=mode;sql.close();}
});

test('correction menu and prominent host link remain discoverable before any result exists',async()=>{
 const {Shell}=await load('core'),{HostScreen}=await load('screens'),{CorrectionsScreen}=await load('result-corrections');
 const c={data:{quiz:seedQuiz(),revision:0,serverNow:1000,admin:true},online:true,busy:false,offset:{current:0},act:async()=>true,setNotice:()=>{},setError:()=>{},error:''};
 const shell=renderToStaticMarkup(createElement(Shell,{page:'corrections',online:true,children:createElement(CorrectionsScreen,{c})}));
 assert.match(shell,/href="\/koreksi" class="nav-link active" aria-current="page"/);assert.ok(shell.includes('Koreksi Nilai'));assert.ok(shell.includes('Belum ada hasil untuk dikoreksi.'));assert.ok(shell.includes('Beri penilaian Benar atau Salah'));assert.ok(!shell.includes('<dialog'));
 const host=renderToStaticMarkup(createElement(HostScreen,{c}));assert.ok(host.includes('aria-label="Akses koreksi nilai"'));assert.match(host,/href="\/koreksi"/);assert.ok(host.includes('Buka Koreksi Nilai'));
});
test('dedicated correction page lists older results inline beyond the five-row host summary',async()=>{
 const {CorrectionsScreen}=await load('result-corrections');let q=act(seedQuiz(),{type:'selectTeam',teamId:'A'});
 for(let i=0;i<6;i++){q=act(q,{type:'start'});q=act(q,{type:'judge',correct:false});if(i<5)q=act(q,{type:'next'});}
 const c={data:{quiz:q,revision:20,serverNow:1000,admin:true},online:true,busy:false,offset:{current:0},act:async()=>true,setNotice:()=>{},setError:()=>{},error:''};
 const html=renderToStaticMarkup(createElement(CorrectionsScreen,{c}));assert.ok(html.includes(q.results[0].question));assert.equal((html.match(/aria-label="Koreksi penilaian /g)||[]).length,6);assert.ok(html.includes('6 dari 6 hasil'));assert.ok(!html.includes('<dialog'));
});
