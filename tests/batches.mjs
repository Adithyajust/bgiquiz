import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import ts from 'typescript';

const output=resolve('.sites-runtime/test-build');
const load=name=>import(pathToFileURL(`${output}/${name}.mjs`));
const {applyAction,publicQuiz,currentRound,currentQuestion}=await load('engine');
const {seedQuiz}=await load('seed');
const {upgradeQuiz}=await load('migrations');
const {loadQuiz,mutate,snapshot}=await load('store');
const {sqliteRepository}=await load('sqlite-repository');
const {wrapSqlite}=await load('sqlite-adapter');
let serial=0;
const act=(q,a,now=1000)=>applyAction(q,a,now,`batch-test-${++serial}`);
function legacyQuiz(){
  const q=seedQuiz();delete q.schemaVersion;
  const regular=q.rounds[0],rebutan=q.rounds.find(r=>r.type==='rebutan');
  delete regular.batchTeam;delete regular.batchNumber;regular.name='Babak Reguler';rebutan.order=2;
  q.rounds=[regular,rebutan];return q;
}
function localDatabase(){
  const sql=new DatabaseSync(':memory:');
  sql.exec(readFileSync('drizzle/0000_hard_rachel_grey.sql','utf8'));
  return {sql,db:sqliteRepository(wrapSqlite(sql))};
}

test('three regular packages have distinct prompts and question ids',()=>{
  const q=seedQuiz(),batches=q.rounds.filter(r=>r.type==='reguler');
  const questions=batches.flatMap(r=>r.questions);
  assert.equal(questions.length,30);
  assert.equal(new Set(questions.map(q=>q.text)).size,30);
  assert.equal(new Set(questions.map(q=>q.id)).size,30);
  assert.equal(q.rounds.find(r=>r.type==='rebutan').questions.length,10);
});

test('every batch accepts any host-selected team and rejects other buzzers',()=>{
  for(const batch of seedQuiz().rounds.filter(r=>r.type==='reguler'))for(const teamId of ['A','B','C']){
    let q=act(seedQuiz(),{type:'selectRound',roundId:batch.id});
    assert.equal(q.game.selectedTeam,null);
    assert.throws(()=>act(q,{type:'start'}),/Pilih grup/);
    q=act(q,{type:'selectTeam',teamId});
    const other=q.teams.find(t=>t.id!==teamId).id;
    assert.throws(()=>act(q,{type:'buzz',teamId:other,epoch:q.game.epoch}),/Hanya grup terpilih/);
    q=act(q,{type:'buzz',teamId,epoch:q.game.epoch},5000);
    assert.equal(q.game.activeTeam,teamId);assert.equal(q.game.deadline,35000);
    assert.throws(()=>act(q,{type:'selectRound',roundId:'rebutan'}),/Selesaikan soal/);
    assert.throws(()=>act(q,{type:'selectTeam',teamId:other}),/Selesaikan soal/);
    q=act(q,{type:'judge',correct:true});
    assert.equal(q.teams.find(t=>t.id===teamId).score,10);
    assert.ok(q.teams.filter(t=>t.id!==teamId).every(t=>t.score===0));
  }
});

test('independent batch counts points and duration accumulate into rebutan scores',()=>{
  let q=seedQuiz();
  for(const [i,id] of ['reguler','reguler-b','reguler-c'].entries()){
    const r=q.rounds.find(r=>r.id===id);
    q=act(q,{type:'saveRound',round:{...r,questionCount:i+2,duration:10*(i+1),points:7+6*i,scoringMode:i===1?'question':'round'}});
  }
  const second=q.rounds.find(r=>r.id==='reguler-b');
  q=act(q,{type:'saveQuestion',roundId:second.id,question:{...second.questions[0],points:23}});
  for(const [i,id] of ['reguler','reguler-b','reguler-c'].entries()){
    q=act(q,{type:'selectRound',roundId:id});q=act(q,{type:'selectTeam',teamId:['B','C','A'][i]});assert.equal(q.game.index,0);
    for(let n=0;n<i+2;n++){
      q=act(q,{type:'start'},10000);
      assert.equal(q.game.deadline,10000+10000*(i+1));
      q=act(q,{type:'judge',correct:n===0},11000);
      q=act(q,{type:'next'});
    }
    assert.equal(q.game.phase,'finished');
  }
  assert.deepEqual(q.teams.map(t=>t.score),[19,7,23]);
  q=act(q,{type:'selectRound',roundId:'reguler-b'});q=act(q,{type:'selectTeam',teamId:'C'});assert.equal(q.game.phase,'finished');
  q=act(q,{type:'selectRound',roundId:'rebutan'});q=act(q,{type:'start'});
  q=act(q,{type:'buzz',teamId:'C',epoch:q.game.epoch},2000);
  q=act(q,{type:'confirmBuzz',teamId:'C'},3000);q=act(q,{type:'judge',correct:true},4000);
  assert.deepEqual(q.teams.map(t=>t.score),[19,7,33]);
  assert.equal(q.results.length,10);
  assert.ok(q.results.find(x=>x.teamId==='C').round.includes('Batch 2'));
});

test('editing and resetting packages preserves independent banks and assignments',()=>{
  let q=seedQuiz();const before=structuredClone(q);
  const b=q.rounds.find(r=>r.batchNumber===2);
  q=act(q,{type:'saveQuestion',roundId:b.id,question:{...b.questions[0],text:'Pertanyaan khusus B',answer:'Jawaban B'}});
  assert.deepEqual(q.rounds[0],before.rounds[0]);assert.deepEqual(q.rounds[2],before.rounds[2]);
  q=act(q,{type:'selectRound',roundId:b.id});q=act(q,{type:'selectTeam',teamId:'C'});q=act(q,{type:'start'});q=act(q,{type:'judge',correct:true});
  const banks=structuredClone(q.rounds),keys=q.teams.map(t=>t.key);
  q=act(q,{type:'reset',confirm:'RESET'});
  assert.deepEqual(q.rounds,banks);assert.deepEqual(q.teams.map(t=>t.key),keys);
  assert.deepEqual(q.teams.map(t=>t.score),[0,0,0]);assert.deepEqual(q.game.progress,{});
});

test('public snapshot only exposes the active question from the active batch',()=>{
  const full=act(seedQuiz(),{type:'selectRound',roundId:'reguler-b'}),safe=publicQuiz(full);
  assert.equal(currentQuestion(safe).text,currentQuestion(full).text);
  for(const r of safe.rounds)for(const [i,q] of r.questions.entries()){
    assert.equal(q.answer,'');assert.equal(q.notes,'');
    if(r.id!==safe.game.roundId||i!==safe.game.index){assert.equal(q.text,'');assert.deepEqual(q.options,[]);}
  }
});

test('legacy upgrade preserves custom questions settings scores photos and buzzer keys',()=>{
  const old=legacyQuiz();old.rounds[0].questions[0].text='Pertanyaan buatan panitia';
  old.rounds[0].points=17;old.rounds[0].duration=45;old.teams[0].score=91;
  old.teams[1].photo='data:image/png;base64,AAAA';const before=structuredClone(old);
  const {quiz:q,changed}=upgradeQuiz(old);
  assert.equal(changed,true);assert.deepEqual(old,before);assert.equal(q.schemaVersion,3);
  assert.deepEqual(q.teams,old.teams);assert.deepEqual(q.results,old.results);
  assert.deepEqual(q.rounds[0].questions,old.rounds[0].questions);
  assert.equal(q.rounds[0].points,17);assert.equal(q.rounds[0].duration,45);
  assert.notEqual(q.rounds[1].questions[0].text,q.rounds[0].questions[0].text);
  assert.equal(upgradeQuiz(q).changed,false);
});

test('legacy active and paused group B retains its exact question timer epoch and verdict history',()=>{
  for(const paused of [false,true]){
    let old=act(legacyQuiz(),{type:'selectTeam',teamId:'B'});
    old.rounds[0].points=17;old.rounds[0].questions[1].text='Soal B yang sedang berjalan';
    old=act(old,{type:'start'},1000);old=act(old,{type:'judge',correct:true},2000);old=act(old,{type:'next'});
    old=act(old,{type:'start'},3000);if(paused)old=act(old,{type:'pause'},7000);
    let {quiz:q}=upgradeQuiz(old);const b=currentRound(q);
    assert.equal(b.batchNumber,2);assert.equal(currentQuestion(q).text,'Soal B yang sedang berjalan');
    for(const key of ['phase','deadline','remaining','epoch','index','selectedTeam','activeTeam'])assert.deepEqual(q.game[key],old.game[key]);
    assert.equal(q.game.progress[`${b.id}:B`],1);
    assert.equal(q.results[0].id,old.results[0].id.replace(':reguler:B:',`:${b.id}:B:`));
    if(paused)q=act(q,{type:'resume'},8000);
    q=act(q,{type:'judge',correct:true},9000);assert.equal(q.teams[1].score,34);
    q=act(q,{type:'selectRound',roundId:b.id});q=act(q,{type:'selectTeam',teamId:'B'});assert.equal(q.game.index,2);
    assert.throws(()=>act(q,{type:'judge',correct:true}),/Konfirmasi/);
  }
});

test('legacy completed group C remains completed after migration',()=>{
  let old=act(legacyQuiz(),{type:'selectTeam',teamId:'C'});
  for(let i=0;i<10;i++){old=act(old,{type:'start'});old=act(old,{type:'judge',correct:true});old=act(old,{type:'next'});}
  let {quiz:q}=upgradeQuiz(old);const c=currentRound(q);
  assert.equal(c.batchNumber,3);assert.equal(q.game.phase,'finished');assert.equal(q.teams[2].score,100);
  q=act(q,{type:'selectRound',roundId:'rebutan'});q=act(q,{type:'selectRound',roundId:c.id});q=act(q,{type:'selectTeam',teamId:'C'});
  assert.equal(q.game.phase,'finished');assert.equal(q.game.index,10);
});

test('concurrent legacy reads persist one atomic migration with one audit event',async()=>{
  const {db,sql}=localDatabase();await db.initialize(JSON.stringify(legacyQuiz()),1000);
  const states=await Promise.all([loadQuiz(db),loadQuiz(db),loadQuiz(db)]);
  assert.ok(states.every(s=>s.revision===1&&s.quiz.rounds.length===4));
  assert.equal(sql.prepare('SELECT COUNT(*) AS n FROM quiz_events').get().n,1);
  assert.equal(sql.prepare('SELECT kind FROM quiz_events').get().kind,'schema_migration_v3');
  assert.equal((await loadQuiz(db)).revision,1);assert.equal((await snapshot(db,true)).quiz.schemaVersion,3);
  const b=states[0].quiz.rounds.find(r=>r.batchNumber===2);
  await mutate(db,{type:'selectRound',roundId:b.id},{admin:true,expectedRevision:1});
  assert.equal((await loadQuiz(db)).quiz.game.selectedTeam,null);
  await mutate(db,{type:'selectTeam',teamId:'A'},{admin:true,expectedRevision:2});
  assert.equal((await loadQuiz(db)).quiz.game.selectedTeam,'A');sql.close();
});

test('failed migration audit rolls back the document and retry upgrades without losing data',async()=>{
  const {db,sql}=localDatabase(),old=legacyQuiz();old.teams[0].score=42;
  await db.initialize(JSON.stringify(old),1000);
  sql.exec("CREATE TRIGGER block_migration BEFORE INSERT ON quiz_events BEGIN SELECT RAISE(ABORT, 'migration audit failure'); END;");
  await assert.rejects(()=>loadQuiz(db),/migration audit failure/);
  const row=await db.read();assert.equal(row.revision,0);assert.deepEqual(JSON.parse(row.document),old);
  sql.exec('DROP TRIGGER block_migration');const state=await loadQuiz(db);
  assert.equal(state.revision,1);assert.equal(state.quiz.teams[0].score,42);sql.close();
});

test('future data versions are rejected instead of being downgraded',()=>{
  const q=seedQuiz();q.schemaVersion=99;assert.throws(()=>upgradeQuiz(q),/Versi data kuis lebih baru/);
});

test('host and admin render three batch choices while keeping regular and rebutan sections',async()=>{
  for(const file of ['core','host-settings','result-corrections','screens']){
    let code=ts.transpileModule(readFileSync(`components/${file}.tsx`,'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
    code=code.replaceAll('"@/lib/engine"','"./engine.mjs"').replaceAll('"./core"','"./core.mjs"').replaceAll('"./host-settings"','"./host-settings.mjs"').replaceAll('"./result-corrections"','"./result-corrections.mjs"');
    writeFileSync(`${output}/${file}.mjs`,code);
  }
  const {HostScreen,AdminScreen}=await load('screens'),{createElement}=await import('react'),{renderToStaticMarkup}=await import('react-dom/server');
  let quiz=act(seedQuiz(),{type:'selectRound',roundId:'reguler-b'});quiz=act(quiz,{type:'selectTeam',teamId:'A'});
  const c={data:{quiz,revision:1,serverNow:1000,admin:true},online:true,busy:false,offset:{current:0},act:async()=>true,setNotice:()=>{},error:''};
  const host=renderToStaticMarkup(createElement(HostScreen,{c}));
  for(const i of [1,2,3])assert.ok(host.includes(`aria-label="Pilih Batch ${i}"`));
  for(const team of ['A','B','C'])assert.ok(host.includes(`Pilih Grup ${team} untuk Batch 2`));
  assert.ok(host.includes('Grup bebas untuk Batch')); 
  assert.equal((host.match(/class="round-switch-button/g)||[]).length,2);
  const admin=renderToStaticMarkup(createElement(AdminScreen,{c}));
  assert.equal((admin.match(/class="batch-tab /g)||[]).length,3);
  assert.ok(admin.includes('Babak Reguler'));assert.ok(admin.includes('Babak Rebutan'));
});

test('progress is independent for each batch and team combination',()=>{
  let q=act(seedQuiz(),{type:'selectRound',roundId:'reguler'});
  q=act(q,{type:'selectTeam',teamId:'B'});
  for(let i=0;i<2;i++){q=act(q,{type:'start'});q=act(q,{type:'judge',correct:true});q=act(q,{type:'next'});}
  q=act(q,{type:'selectTeam',teamId:'C'});assert.equal(q.game.index,0);
  q=act(q,{type:'start'});q=act(q,{type:'judge',correct:true});q=act(q,{type:'next'});
  q=act(q,{type:'selectTeam',teamId:'B'});assert.equal(q.game.index,2);
  q=act(q,{type:'selectRound',roundId:'reguler-b'});assert.equal(q.game.selectedTeam,null);
  q=act(q,{type:'selectTeam',teamId:'B'});assert.equal(q.game.index,0);
  q=act(q,{type:'selectRound',roundId:'reguler'});q=act(q,{type:'selectTeam',teamId:'B'});
  assert.equal(q.game.index,2);assert.deepEqual(q.teams.map(t=>t.score),[0,20,10]);
  assert.deepEqual(q.game.progress,{'reguler:B':2,'reguler:C':1});
  assert.equal(new Set(q.results.map(x=>x.id)).size,3);
  assert.throws(()=>act(q,{type:'judge',correct:true}),/Konfirmasi/);
});

test('changing the selected team invalidates in-flight buzzers and is blocked after a verdict until next',()=>{
  let q=act(seedQuiz(),{type:'selectTeam',teamId:'A'});const staleEpoch=q.game.epoch;
  q=act(q,{type:'selectTeam',teamId:'B'});
  assert.throws(()=>act(q,{type:'buzz',teamId:'A',epoch:staleEpoch}),/soal sebelumnya/);
  q=act(q,{type:'start'});q=act(q,{type:'pause'});
  assert.throws(()=>act(q,{type:'selectTeam',teamId:'C'}),/Selesaikan soal/);
  q=act(q,{type:'judge',correct:true});
  assert.throws(()=>act(q,{type:'selectTeam',teamId:'C'}),/soal berikutnya/);
  assert.deepEqual(q.teams.map(t=>t.score),[0,10,0]);
});

test('fixed batch version 2 upgrades without changing active timer questions results or scores',()=>{
  let old=seedQuiz();old.schemaVersion=2;
  old.rounds.filter(r=>r.type==='reguler').forEach((r,i)=>{r.batchTeam=['A','B','C'][i];delete r.batchNumber;});
  old=act(old,{type:'selectRound',roundId:'reguler-b'});old=act(old,{type:'selectTeam',teamId:'B'});
  old=act(old,{type:'start'},2000);old=act(old,{type:'judge',correct:true},3000);old=act(old,{type:'next'});
  old=act(old,{type:'start'},4000);old=act(old,{type:'pause'},6000);
  const before=structuredClone(old),{quiz:q,changed}=upgradeQuiz(old);
  assert.equal(changed,true);assert.equal(q.schemaVersion,3);assert.deepEqual(old,before);
  assert.deepEqual(q.game,old.game);assert.deepEqual(q.teams,old.teams);assert.deepEqual(q.results,old.results);
  for(const [i,r] of q.rounds.filter(r=>r.type==='reguler').entries()){
    assert.equal(r.batchNumber,i+1);assert.equal('batchTeam' in r,false);
    assert.deepEqual(r.questions,old.rounds[i].questions);
  }
  assert.equal(upgradeQuiz(q).changed,false);
});

test('dynamic selections persist and concurrent host choices cannot overwrite one another',async()=>{
  const {db,sql}=localDatabase();await db.initialize(JSON.stringify(seedQuiz()),1000);
  await mutate(db,{type:'selectRound',roundId:'reguler'},{admin:true,expectedRevision:0});
  const requests=await Promise.allSettled(['B','C'].map(teamId=>mutate(db,{type:'selectTeam',teamId},{admin:true,expectedRevision:1})));
  assert.equal(requests.filter(x=>x.status==='fulfilled').length,1);
  assert.equal(requests.find(x=>x.status==='rejected').reason.status,409);
  let state=await loadQuiz(db);const selected=state.quiz.game.selectedTeam;
  assert.ok(['B','C'].includes(selected));assert.equal(state.revision,2);
  await mutate(db,{type:'start'},{admin:true,expectedRevision:2});
  await mutate(db,{type:'judge',correct:true},{admin:true,expectedRevision:3});
  state=await loadQuiz(db);
  assert.equal(state.quiz.teams.find(t=>t.id===selected).score,10);
  assert.equal(state.quiz.results[0].teamId,selected);
  assert.equal(state.quiz.game.progress[`reguler:${selected}`],1);sql.close();
});

test('version 2 SQL upgrade records the correct migration source and preserves selected group',async()=>{
  const {db,sql}=localDatabase();let old=seedQuiz();old.schemaVersion=2;
  old.rounds.filter(r=>r.type==='reguler').forEach((r,i)=>{r.batchTeam=['A','B','C'][i];delete r.batchNumber;});
  old=act(old,{type:'selectTeam',teamId:'A'});
  await db.initialize(JSON.stringify(old),1000);const saved=await loadQuiz(db);
  assert.equal(saved.quiz.game.selectedTeam,'A');assert.equal(saved.revision,1);
  const event=sql.prepare('SELECT payload FROM quiz_events').get();
  assert.deepEqual(JSON.parse(event.payload),{from:2,to:3});sql.close();
});
