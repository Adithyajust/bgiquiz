import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {DatabaseSync} from 'node:sqlite';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import ts from 'typescript';
const output=resolve('.sites-runtime/championship-build');mkdirSync(output,{recursive:true});
for(const name of ['engine','seed','migrations','persistence','store','sqlite-adapter','sqlite-repository','relational-quiz','mssql-driver','mssql-repository','runtime-node']){
 const text=ts.transpileModule(readFileSync(`lib/${name}.ts`,'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText.replace(/from "\.\/([^".]+)"/g,'from "./$1.mjs"').replaceAll('"../scripts/mssql-config.mjs"',JSON.stringify(pathToFileURL(resolve('scripts/mssql-config.mjs')).href));writeFileSync(`${output}/${name}.mjs`,text);
}
writeFileSync(`${output}/core.mjs`,ts.transpileModule(readFileSync('components/core.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText.replaceAll('"@/lib/engine"','"./engine.mjs"'));
const load=name=>import(pathToFileURL(`${output}/${name}.mjs`));
const {seedQuiz}=await load('seed'),{applyAction,competitionProgress,championTeams,publicQuiz}=await load('engine');
const {quizToRows,rowsToQuiz}=await load('relational-quiz'),{sqliteRepository}=await load('sqlite-repository'),{wrapSqlite}=await load('sqlite-adapter'),{loadQuiz,mutate,snapshot}=await load('store');
const {Stage,ChampionshipControl}=await load('core'),{CHAMPIONSHIP_SCHEMA_SQL,ROUND_EXCLUSIONS_SCHEMA_SQL,ensureChampionshipTable}=await load('mssql-repository');
let serial=0;const act=(q,action)=>applyAction(q,action,1000+serial,`champ-${++serial}`);
export function completedFixture(count=1){
 let q=seedQuiz();q.rounds.forEach(r=>{r.questionCount=count;r.questions=r.questions.slice(0,count);});
 for(const [index,round] of q.rounds.entries()){
  q=act(q,{type:'selectRound',roundId:round.id});const teamId=['A','B','C'][index%3];if(round.type==='reguler')q=act(q,{type:'selectTeam',teamId});
  for(let i=0;i<count;i++){
   q=act(q,{type:'start'});if(round.type==='rebutan'){q=act(q,{type:'buzz',teamId:'A',epoch:q.game.epoch});q=act(q,{type:'confirmBuzz',teamId:'A'});}
   q=act(q,{type:'judge',correct:true});q=act(q,{type:'next'});
  }
 }
 return q;
}
function db(file=':memory:'){
 const sql=new DatabaseSync(file);sql.exec(readFileSync('drizzle/0000_hard_rachel_grey.sql','utf8'));return {sql,repo:sqliteRepository(wrapSqlite(sql))};
}
test('Tentukan Juara is disabled at the start and the server rejects premature declaration',()=>{
 const q=seedQuiz(),html=renderToStaticMarkup(createElement(ChampionshipControl,{c:{data:{quiz:q},busy:false,online:true}}));
 assert.ok(html.includes('Tentukan Juara'));assert.match(html,/<button[^>]+disabled/);assert.equal(competitionProgress(q).ready,false);assert.throws(()=>act(q,{type:'declareChampion'}),/Selesaikan seluruh babak/);assert.equal(q.championship,undefined);
});
test('all three regular batches and all ten Rebutan questions enable declaration',()=>{
 const q=completedFixture(10),progress=competitionProgress(q);assert.equal(progress.rounds.length,4);assert.ok(progress.rounds.every(r=>r.answered===10&&r.complete));assert.equal(progress.ready,true);
 const announced=act(q,{type:'declareChampion',teamIds:['C'],score:999999});assert.deepEqual(announced.championship.teamIds,['A']);assert.equal(announced.championship.score,200);assert.equal(announced.game.phase,'finished');assert.equal(announced.game.answerVisible,false);assert.equal(q.championship,undefined);
});
test('partial play spread across groups does not complete a regular batch',()=>{
 const q=completedFixture();q.rounds[0].questionCount=10;q.game.progress['reguler:A']=5;q.game.progress['reguler:B']=5;assert.equal(competitionProgress(q).rounds[0].answered,5);assert.equal(competitionProgress(q).ready,false);assert.throws(()=>act(q,{type:'declareChampion'}),/seluruh babak/);
});
test('a final judged answer allows announcement, but an active question blocks it',()=>{
 let q=completedFixture();q.game.phase='judged';assert.equal(competitionProgress(q).ready,true);assert.ok(act(q,{type:'declareChampion'}).championship);q.game.phase='answering';assert.equal(competitionProgress(q).ready,false);assert.throws(()=>act(q,{type:'declareChampion'}),/soal yang sedang berjalan/);
});
test('all configured dynamic batches must also finish',()=>{
 let q=completedFixture();q=act(q,{type:'createBatch',round:{name:'Batch Tambahan',questionCount:1,duration:30,points:10,scoringMode:'round'},templateRoundId:'reguler'});assert.equal(competitionProgress(q).ready,false);assert.equal(competitionProgress(q).rounds.length,5);
});
test('equal highest scores announce every tied team and never select an arbitrary winner',()=>{
 const q=completedFixture();q.teams[1].score=20;let n=act(q,{type:'declareChampion'});assert.deepEqual(n.championship.teamIds,['A','B']);assert.equal(championTeams(n).length,2);assert.deepEqual(rowsToQuiz(quizToRows(n)).championship,n.championship);q.teams.forEach(t=>t.score=0);n=act(q,{type:'declareChampion'});assert.equal(championTeams(n).length,3);assert.equal(n.championship.score,0);assert.deepEqual(rowsToQuiz(quizToRows(n)).championship,n.championship);
});
test('either team B or C can win based on the highest final score',()=>{
 for(const id of ['B','C']){const q=completedFixture();q.teams.find(t=>t.id===id).score=100;const result=act(q,{type:'declareChampion',teamIds:['A']});assert.deepEqual(result.championship.teamIds,[id]);assert.equal(championTeams(result)[0].id,id);assert.equal(result.championship.score,100);}
});
test('the Stage shows the actual winning photo, name and final score without question secrets',()=>{
 let q=completedFixture();q.teams[0].name='Tim Terbaik';q.teams[0].photo='data:image/png;base64,AAAA';q=act(q,{type:'declareChampion'});
 const html=renderToStaticMarkup(createElement(Stage,{s:{quiz:publicQuiz(q),admin:false,revision:1,serverNow:1000},offset:{current:0}}));assert.ok(html.includes('Perayaan juara kuis'));assert.ok(html.includes('Tim Terbaik'));assert.ok(html.includes('data:image/png;base64,AAAA'));assert.ok(html.includes('20'));assert.ok(html.includes('POIN AKHIR'));assert.ok(!html.includes(q.teams[0].key));assert.ok(!html.includes(q.rounds[0].questions[0].answer));
});
test('previewing a question does not show the victory scene',()=>{
 const q=act(completedFixture(),{type:'declareChampion'}),html=renderToStaticMarkup(createElement(Stage,{s:{quiz:q},offset:{current:0},preview:true}));assert.ok(!html.includes('Perayaan juara kuis'));
});
test('duplicate declaration preserves the original timestamp and scores',()=>{
 const q=act(completedFixture(),{type:'declareChampion'}),again=act(q,{type:'declareChampion'});assert.deepEqual(again,q);
});
test('a score correction revokes the announcement and host can declare the new winner',()=>{
 let q=act(completedFixture(),{type:'declareChampion'});const result=q.results[0];q=act(q,{type:'correctResult',resultId:result.id,correct:false,expectedCorrect:true,expectedPoints:result.points,expectedCorrectionCount:0,reason:'Koreksi jawaban host'});assert.equal(q.championship,undefined);q=act(q,{type:'declareChampion'});assert.deepEqual(q.championship.teamIds,['A','B','C']);assert.equal(q.championship.score,10);
});
test('reset removes the winner, and stale or manually changed score data cannot show an outdated champion',()=>{
 const q=act(completedFixture(),{type:'declareChampion'}),stale=structuredClone(q);stale.game.sessionId='other';assert.equal(championTeams(stale).length,0);stale.game.sessionId=q.game.sessionId;stale.teams[2].score=999;assert.equal(championTeams(stale).length,0);const reset=act(q,{type:'reset',confirm:'RESET'});assert.equal(reset.championship,undefined);assert.equal(competitionProgress(reset).ready,false);
});
test('hide and reannounce are reversible without changing team scores',()=>{
 const q=act(completedFixture(),{type:'declareChampion'}),hidden=act(q,{type:'clearChampion'});assert.equal(championTeams(hidden).length,0);assert.deepEqual(hidden.teams,q.teams);assert.equal(championTeams(act(hidden,{type:'declareChampion'})).length,1);
});
test('name and photo maintenance keeps a valid announced winner',()=>{
 let q=act(completedFixture(),{type:'declareChampion'});q=act(q,{type:'saveTeam',teamId:'A',name:'Tim Juara Baru',participants:'A, B, C',photo:'data:image/png;base64,AAAA'});assert.equal(championTeams(q)[0].name,'Tim Juara Baru');
});
test('SQL Server row mapping persists winner IDs, final score and declaration time',()=>{
 const q=act(completedFixture(),{type:'declareChampion'}),rows=quizToRows(q);assert.equal(rows.quiz_championships.length,1);assert.deepEqual(rowsToQuiz(rows),q);const original=seedQuiz();assert.deepEqual(rowsToQuiz(quizToRows(original)),original);
});
test('host authorization and stale revisions protect winner declarations',async()=>{
 const {repo,sql}=db();try{await repo.initialize(JSON.stringify(completedFixture()),1000);await assert.rejects(()=>mutate(repo,{type:'declareChampion'},{admin:false}),/penyelenggara/);await assert.rejects(()=>mutate(repo,{type:'declareChampion'},{admin:true,expectedRevision:999}),/berubah/);assert.equal((await loadQuiz(repo)).quiz.championship,undefined);}finally{sql.close();}
});
test('concurrent winner declarations commit once and persist across reload',async()=>{
 const {repo,sql}=db();try{await repo.initialize(JSON.stringify(completedFixture()),1000);const results=await Promise.allSettled([mutate(repo,{type:'declareChampion'},{admin:true,expectedRevision:0,id:'winner-1'}),mutate(repo,{type:'declareChampion'},{admin:true,expectedRevision:0,id:'winner-2'})]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);const state=await snapshot(repo,false);assert.equal(championTeams(state.quiz)[0].id,'A');assert.equal(state.revision,1);assert.equal(sql.prepare("SELECT COUNT(*) AS n FROM quiz_events WHERE kind='declareChampion'").get().n,1);assert.ok(state.quiz.teams.every(t=>t.key===''));assert.deepEqual(state.quiz.results,[]);}finally{sql.close();}
});
test('SQLite restart retains the declaration and publicly renders the same winner',async()=>{
 const file=resolve(output,'winner.sqlite');rmSync(file,{force:true});let {repo,sql}=db(file);await repo.initialize(JSON.stringify(completedFixture()),1000);await mutate(repo,{type:'declareChampion'},{admin:true,id:'winner-file'});sql.close();sql=new DatabaseSync(file);repo=sqliteRepository(wrapSqlite(sql));try{const state=await snapshot(repo,false);assert.deepEqual(state.quiz.championship.teamIds,['A']);assert.equal(championTeams(state.quiz)[0].score,20);}finally{sql.close();}
});
test('bootstrap SQL and SSMS migrations create the same dedicated tables before reads',async()=>{
 for(const [file,ddl] of [['007_championship.sql',CHAMPIONSHIP_SCHEMA_SQL],['008_round_participation.sql',ROUND_EXCLUSIONS_SCHEMA_SQL]]){const script=readFileSync(`sql/sqlserver/${file}`,'utf8').split('\n').filter(line=>!line.startsWith('--')).join('\n').trim();assert.equal(script,ddl.trim());assert.ok(!ddl.includes('ALTER TABLE'));assert.ok(!ddl.includes('DROP TABLE'));}
 const queries=[];const driver={Request:class{async query(sql){queries.push(sql);}}};await ensureChampionshipTable({},driver);assert.deepEqual(queries,[CHAMPIONSHIP_SCHEMA_SQL,ROUND_EXCLUSIONS_SCHEMA_SQL]);
});
test('HTTP API accepts an authenticated host announcement and exposes the persisted winner in public Arena',async()=>{
 const {repo,sql}=db(),oldSecret=process.env.BGI_ADMIN_TOKEN,oldMode=process.env.NODE_ENV;await repo.initialize(JSON.stringify(completedFixture()),1000);
 globalThis.__bgiChampionApiRepository=repo;process.env.BGI_ADMIN_TOKEN=crypto.randomUUID();process.env.NODE_ENV='production';
 writeFileSync(`${output}/api-runtime.mjs`,'export {identity,authenticate,authMode} from "./runtime-node.mjs"; export const database=async()=>globalThis.__bgiChampionApiRepository;');
 for(const route of ['quiz','access'])writeFileSync(`${output}/${route}-route.mjs`,ts.transpileModule(readFileSync(`app/api/${route}/route.ts`,'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText.replaceAll('"@quiz-runtime"','"./api-runtime.mjs"').replaceAll('"@/lib/store"','"./store.mjs"').replaceAll('"@/lib/engine"','"./engine.mjs"'));
 try{
  const quiz=await load('quiz-route'),access=await load('access-route');const post=cookie=>new Request('https://quiz.example/api/quiz',{method:'POST',headers:{'Content-Type':'application/json',cookie},body:JSON.stringify({action:{type:'declareChampion'},revision:0})});
  assert.equal((await quiz.POST(post(''))).status,403);
  const login=await access.POST(new Request('https://quiz.example/api/access',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:process.env.BGI_ADMIN_TOKEN})}));assert.equal(login.status,200);const cookie=login.headers.get('set-cookie').split(';')[0];assert.equal((await quiz.POST(post(cookie))).status,200);
  const response=await quiz.GET(new Request('https://quiz.example/api/quiz'));assert.equal(response.status,200);assert.ok(response.headers.get('cache-control').includes('no-store'));const state=await response.json();assert.deepEqual(state.quiz.championship.teamIds,['A']);assert.ok(state.quiz.teams.every(t=>t.key===''));const html=renderToStaticMarkup(createElement(Stage,{s:state,offset:{current:0}}));assert.ok(html.includes('SELAMAT, SANG JUARA!'));assert.ok(html.includes('Grup A'));
 }finally{delete globalThis.__bgiChampionApiRepository;if(oldSecret===undefined)delete process.env.BGI_ADMIN_TOKEN;else process.env.BGI_ADMIN_TOKEN=oldSecret;if(oldMode===undefined)delete process.env.NODE_ENV;else process.env.NODE_ENV=oldMode;sql.close();}
});

function extraBatch(q,copy=false){
 const next=act(q,{type:'createBatch',round:{name:'Batch 4 cadangan',questionCount:copy?q.rounds[0].questionCount:10,duration:30,points:10,scoringMode:'round'},...(copy?{templateRoundId:'reguler'}:{})});return {q:next,id:next.rounds.find(r=>r.name==='Batch 4 cadangan').id};
}
function hostButton(node,label){
 if(!node||typeof node!=='object')return null;
 if(node.type==='button'&&(node.props['aria-label']===label||node.props.className?.includes(label)))return node;
 for(const child of [node.props?.children].flat(Infinity)){const found=hostButton(child,label);if(found)return found;}
 return null;
}
test('an empty Batch 4 is automatically skipped after Batch 1-3 and Rebutan finish',()=>{
 const {q,id}=extraBatch(completedFixture(10));const row=competitionProgress(q).rounds.find(r=>r.id===id);assert.equal(row.exclusion,'empty');assert.equal(row.complete,false);assert.equal(competitionProgress(q).ready,true);const winner=act(q,{type:'declareChampion'});assert.equal(winner.championship.score,200);assert.equal(championTeams(publicQuiz(winner))[0].id,'A');const html=renderToStaticMarkup(createElement(ChampionshipControl,{c:{data:{quiz:q},busy:false,online:true}}));assert.ok(html.includes('Dilewati: bank soal kosong'));assert.ok(!hostButton(ChampionshipControl({c:{data:{quiz:q},busy:false,online:true}}),'champion-button').props.disabled);
});
test('an unselected batch with questions requires the host to explicitly mark it unused',()=>{
 let {q,id}=extraBatch(completedFixture(),true);assert.equal(competitionProgress(q).ready,false);assert.throws(()=>act(q,{type:'declareChampion'}),/Batch 4 cadangan/);const before=structuredClone(q);q=act(q,{type:'setRoundParticipation',roundId:id,enabled:false});assert.equal(competitionProgress(q).ready,true);assert.deepEqual(q.teams,before.teams);assert.deepEqual(q.results,before.results);assert.deepEqual(q.rounds,before.rounds);assert.deepEqual(q.game.progress,before.game.progress);assert.equal(championTeams(act(q,{type:'declareChampion'}))[0].id,'A');
});
test('host can click Tidak dimainkan, then declare the winner with the real control handlers',async()=>{
 const fixture=extraBatch(completedFixture(),true),notices=[];const c={data:{quiz:fixture.q},busy:false,online:true,setNotice:n=>notices.push(n),act:async a=>{c.data.quiz=act(c.data.quiz,a);return true;}};
 let tree=ChampionshipControl({c});assert.equal(hostButton(tree,'champion-button').props.disabled,true);const skip=hostButton(tree,'Tidak dimainkan: Batch 4 cadangan');assert.equal(skip.props.disabled,false);await skip.props.onClick();tree=ChampionshipControl({c});assert.equal(hostButton(tree,'champion-button').props.disabled,false);assert.ok(hostButton(tree,'Ikutkan lagi Batch 4 cadangan'));await hostButton(tree,'champion-button').props.onClick();assert.deepEqual(c.data.quiz.championship.teamIds,['A']);assert.ok(notices.some(n=>n.includes('Perayaan kemenangan')));
});
test('reincluding an unused batch revokes the winner and requires playing that batch',()=>{
 let {q,id}=extraBatch(completedFixture(),true);q=act(q,{type:'setRoundParticipation',roundId:id,enabled:false});q=act(q,{type:'declareChampion'});q=act(q,{type:'setRoundParticipation',roundId:id,enabled:true});assert.equal(q.game.excludedRoundIds,undefined);assert.equal(q.championship,undefined);assert.equal(competitionProgress(q).ready,false);q=act(q,{type:'selectRound',roundId:id});q=act(q,{type:'selectTeam',teamId:'B'});assert.equal(act(q,{type:'start'}).game.phase,'answering');
});
test('a batch with judgments cannot be excluded and its points remain unchanged',()=>{
 let {q,id}=extraBatch(completedFixture(2),true);q=act(q,{type:'selectRound',roundId:id});q=act(q,{type:'selectTeam',teamId:'B'});q=act(q,{type:'start'});q=act(q,{type:'judge',correct:true});const before=structuredClone(q);assert.throws(()=>act(q,{type:'setRoundParticipation',roundId:id,enabled:false}),/sudah dimainkan/);assert.deepEqual(q,before);assert.equal(competitionProgress(q).ready,false);
});
test('active questions block changing participation even for a different unused round',()=>{
 let {q,id}=extraBatch(completedFixture(),true);q=act(q,{type:'selectRound',roundId:id});q=act(q,{type:'selectTeam',teamId:'B'});q=act(q,{type:'start'});assert.throws(()=>act(q,{type:'setRoundParticipation',roundId:id,enabled:false}),/Selesaikan soal/);
});
test('an explicitly unused batch cannot start until it is reenabled',()=>{
 let {q,id}=extraBatch(completedFixture(),true);q=act(q,{type:'setRoundParticipation',roundId:id,enabled:false});q=act(q,{type:'selectRound',roundId:id});q=act(q,{type:'selectTeam',teamId:'A'});assert.throws(()=>act(q,{type:'start'}),/Ikutkan lagi/);
});
test('adding questions to an automatically skipped empty batch makes it required again',()=>{
 let {q,id}=extraBatch(completedFixture());assert.equal(competitionProgress(q).ready,true);q=act(q,{type:'saveQuestion',roundId:id,question:{...q.rounds[0].questions[0],id:undefined,number:1}});assert.equal(competitionProgress(q).ready,false);assert.equal(competitionProgress(q).rounds.find(r=>r.id===id).excluded,false);
});
test('empty or excluded rounds alone never allow declaring a winner before any play',()=>{
 const q=seedQuiz();q.rounds.forEach(r=>r.questions=[]);assert.ok(competitionProgress(q).rounds.every(r=>r.excluded));assert.equal(competitionProgress(q).ready,false);assert.throws(()=>act(q,{type:'declareChampion'}),/Selesaikan/);
});
test('reset and deleting a spare batch remove its session participation choice',()=>{
 let {q,id}=extraBatch(completedFixture(),true);q=act(q,{type:'setRoundParticipation',roundId:id,enabled:false});const reset=act(q,{type:'reset',confirm:'RESET'});assert.equal(reset.game.excludedRoundIds,undefined);assert.equal(competitionProgress(reset).ready,false);const deleted=act(q,{type:'deleteBatch',roundId:id,confirm:'HAPUS'});assert.equal(deleted.game.excludedRoundIds,undefined);assert.equal(competitionProgress(deleted).ready,true);assert.deepEqual(rowsToQuiz(quizToRows(deleted)),deleted);
});
test('relational round participation persists per session and ignores stale session records',()=>{
 let {q,id}=extraBatch(completedFixture(),true);q=act(q,{type:'setRoundParticipation',roundId:id,enabled:false});const rows=quizToRows(q);assert.deepEqual(rowsToQuiz(rows),q);assert.equal(rows.quiz_round_exclusions[0].round_id,id);rows.quiz_round_exclusions[0].session_id='old-session';assert.equal(rowsToQuiz(rows).game.excludedRoundIds,undefined);assert.equal(competitionProgress(rowsToQuiz(rows)).ready,false);
});
test('unused round selection requires host access and persists after a SQLite restart',async()=>{
 const fixture=extraBatch(completedFixture(),true),file=resolve(output,'participation.sqlite');rmSync(file,{force:true});let {repo,sql}=db(file);await repo.initialize(JSON.stringify(fixture.q),1000);const action={type:'setRoundParticipation',roundId:fixture.id,enabled:false};await assert.rejects(()=>mutate(repo,action,{admin:false}),/penyelenggara/);await assert.rejects(()=>mutate(repo,action,{admin:true,expectedRevision:999}),/berubah/);await mutate(repo,action,{admin:true,expectedRevision:0,id:'skip-batch4'});const audit=JSON.parse(sql.prepare("SELECT payload FROM quiz_events WHERE id='skip-batch4'").get().payload);assert.deepEqual(audit.after,[fixture.id]);sql.close();sql=new DatabaseSync(file);repo=sqliteRepository(wrapSqlite(sql));try{const saved=(await loadQuiz(repo)).quiz;assert.equal(competitionProgress(saved).ready,true);await mutate(repo,{type:'declareChampion'},{admin:true,id:'winner-with-unused'});assert.equal(championTeams((await snapshot(repo,false)).quiz)[0].id,'A');}finally{sql.close();}
});
