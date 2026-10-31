import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {DatabaseSync} from 'node:sqlite';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
const output=resolve('.sites-runtime/test-build');
const load=name=>import(pathToFileURL(`${output}/${name}.mjs`));
const {applyAction,publicQuiz,currentQuestion,eventName}=await load('engine');
const {seedQuiz}=await load('seed');
const {quizToRows,rowsToQuiz,rowChanges}=await load('relational-quiz');
const {loadQuiz,mutate,snapshot}=await load('store');
const {sqliteRepository}=await load('sqlite-repository');
const {wrapSqlite}=await load('sqlite-adapter');
let serial=0;const act=(q,a)=>applyAction(q,a,1000,`answer-title-${++serial}`);
const visible=(q,value=true)=>({type:'setAnswerVisibility',visible:value,epoch:q.game.epoch,questionId:currentQuestion(q)?.id});
const db=()=>{const sql=new DatabaseSync(':memory:');sql.exec(readFileSync('drizzle/0000_hard_rachel_grey.sql','utf8'));return {sql,repo:sqliteRepository(wrapSqlite(sql))};};

test('revealing exposes only the current answer and never notes, keys or future answers',()=>{
 let q=seedQuiz();q.rounds.forEach((r,ri)=>r.questions.forEach((v,i)=>{v.answer=`SECRET_${ri}_${i}`;v.notes=`HOST_ONLY_${ri}_${i}`;}));
 const initial=publicQuiz(q);assert.equal(initial.rounds[0].questions[0].answer,'');
 q=act(q,visible(q));const safe=publicQuiz(q);
 for(const r of safe.rounds)for(const question of r.questions){assert.equal(question.notes,'');assert.equal(question.answer,r.id===q.game.roundId&&question.id===currentQuestion(q).id?'SECRET_0_0':'');}
 assert.ok(safe.teams.every(t=>t.key===''));assert.deepEqual(safe.results,[]);
 q=act(q,visible(q,false));assert.ok(publicQuiz(q).rounds.every(r=>r.questions.every(v=>v.answer==='')));
});

test('answer visibility preserves timer score and verdict; new questions and turns hide it',()=>{
 let q=act(seedQuiz(),{type:'selectTeam',teamId:'B'});q=act(q,{type:'start'});
 const before=structuredClone(q);q=act(q,visible(q));
 assert.equal(q.game.deadline,before.game.deadline);assert.equal(q.game.epoch,before.game.epoch);assert.deepEqual(q.teams,before.teams);assert.deepEqual(q.results,before.results);
 q=act(q,{type:'judge',correct:true});assert.equal(q.game.answerVisible,true);assert.equal(q.teams[1].score,10);
 q=act(q,{type:'next'});assert.equal(q.game.answerVisible,false);
 q=act(q,visible(q));q=act(q,{type:'selectTeam',teamId:'C'});assert.equal(q.game.answerVisible,false);
 q=act(q,visible(q));q=act(q,{type:'selectRound',roundId:'rebutan'});assert.equal(q.game.answerVisible,false);
 q=act(q,visible(q));q=act(q,{type:'start'});assert.equal(q.game.answerVisible,false);
 q=act(q,visible(q));q=act(q,{type:'reopen'});assert.equal(q.game.answerVisible,false);
});

test('stale or invalid reveal requests cannot open another question',()=>{
 let q=seedQuiz();assert.throws(()=>act(q,{...visible(q),visible:'true'}),/Status/);
 assert.throws(()=>act(q,{...visible(q),epoch:'old'}),/Soal sudah berubah/);
 assert.throws(()=>act(q,{...visible(q),questionId:'other'}),/Soal sudah berubah/);
 q.game.phase='finished';assert.throws(()=>act(q,visible(q)),/Tidak ada jawaban/);
 q.game.phase='ready';currentQuestion(q).answer=' ';assert.throws(()=>act(q,visible(q)),/Lengkapi jawaban/);
});

test('editing active questions closes reveal and reset preserves event name',()=>{
 let q=act(seedQuiz(),{type:'saveEventSettings',eventName:'Cerdas Cermat BGI'});q=act(q,visible(q));
 q=act(q,{type:'saveQuestion',roundId:q.game.roundId,question:{...currentQuestion(q),text:'Soal diperbarui'}});assert.equal(q.game.answerVisible,false);
 q=act(q,visible(q));q=act(q,{type:'deleteQuestion',roundId:q.game.roundId,questionId:currentQuestion(q).id});assert.equal(q.game.answerVisible,false);
 q=act(q,visible(q));q=act(q,{type:'reset',confirm:'RESET'});assert.equal(q.game.answerVisible,false);assert.equal(q.eventName,'Cerdas Cermat BGI');
});

test('event name validates blanks length and single-line input while preserving all game data',()=>{
 const q=seedQuiz();for(const name of ['', ' ', 'x'.repeat(61), 'Acara\nBaru',null])assert.throws(()=>act(q,{type:'saveEventSettings',eventName:name}));
 const updated=act(q,{type:'saveEventSettings',eventName:'  Kuis BGI 36 Tahun  '});assert.equal(updated.eventName,'Kuis BGI 36 Tahun');assert.deepEqual(updated.game,q.game);assert.deepEqual(updated.teams,q.teams);assert.deepEqual(updated.rounds,q.rounds);assert.equal(eventName({}),'Quiz Night');
});

test('reveal and name are organizer-only, persist for arena reload and reject stale writes',async()=>{
 const {sql,repo}=db();try{
  await repo.initialize(JSON.stringify(seedQuiz()),1000);let q=(await loadQuiz(repo)).quiz;
  for(const a of [visible(q),{type:'saveEventSettings',eventName:'Baru'}])await assert.rejects(()=>mutate(repo,a,{admin:false}),/penyelenggara/);
  await mutate(repo,{type:'saveEventSettings',eventName:'Panggung BGI'},{admin:true,expectedRevision:0});
  await assert.rejects(()=>mutate(repo,visible(q),{admin:true,expectedRevision:0}),/berubah/);
  await mutate(repo,visible(q),{admin:true,expectedRevision:1});
  const saved=await snapshot(repo,false);assert.equal(saved.quiz.eventName,'Panggung BGI');assert.equal(currentQuestion(saved.quiz).answer,currentQuestion(q).answer);assert.equal(saved.quiz.game.answerVisible,true);
  await mutate(repo,visible(q,false),{admin:true});assert.equal(currentQuestion((await snapshot(repo,false)).quiz).answer,'');
 }finally{sql.close();}
});

test('relational mapping persists name and reveal in separate SQL columns with legacy defaults',()=>{
 let q=act(seedQuiz(),{type:'saveEventSettings',eventName:'Kuis 36'});q=act(q,visible(q));
 const rows=quizToRows(q);assert.equal(rows.quiz_settings[0].event_name,'Kuis 36');assert.equal(rows.quiz_game_state[0].answer_visible,true);assert.deepEqual(rowsToQuiz(rows),q);
 const legacy=seedQuiz();delete legacy.eventName;delete legacy.game.answerVisible;
 const recovered=rowsToQuiz(quizToRows(legacy));assert.equal(recovered.eventName,'Quiz Night');assert.equal(recovered.game.answerVisible,false);
 const before=quizToRows(q),hidden=act(q,visible(q,false));assert.deepEqual(rowChanges(before,quizToRows(hidden)).filter(c=>c.changed.length).map(c=>c.table.name),['quiz_game_state']);
});

test('arena and host render synchronized answer controls with editable escaped event names',async()=>{
 const {Stage,Shell}=await load('core'),{HostScreen}=await load('screens'),{EventSettings}=await load('host-settings');
 let q=seedQuiz();q.eventName='Lomba <BGI> & Tim';currentQuestion(q).answer='JAWABAN_ISTIMEWA';currentQuestion(q).notes='RAHASIA_HOST';
 const render=quiz=>renderToStaticMarkup(createElement(Stage,{s:{quiz:publicQuiz(quiz),revision:1,serverNow:1000,admin:false},offset:{current:0}}));
 assert.ok(!render(q).includes('JAWABAN_ISTIMEWA'));q=act(q,visible(q));const html=render(q);assert.ok(html.includes('JAWABAN_ISTIMEWA'));assert.ok(html.includes('JAWABAN BENAR'));assert.ok(!html.includes('RAHASIA_HOST'));assert.ok(html.includes('&lt;BGI&gt;'));assert.ok(!html.includes('<BGI>'));
 const c={data:{quiz:q,revision:1,serverNow:1000,admin:true},online:true,busy:false,offset:{current:0},act:async()=>true,setNotice:()=>{},error:''};
 const host=renderToStaticMarkup(createElement(HostScreen,{c}));assert.ok(host.includes('Pengaturan acara'));assert.ok(host.includes('Sembunyikan jawaban'));assert.ok(host.includes('aria-pressed="true"'));
 const settings=renderToStaticMarkup(createElement(EventSettings,{c,close:()=>{}}));assert.ok(settings.includes('Nama acara'));assert.ok(settings.includes('Simpan nama acara'));
 const shell=renderToStaticMarkup(createElement(Shell,{page:'stage',online:true,eventTitle:q.eventName}));assert.ok(shell.includes('Lomba &lt;BGI&gt; &amp; Tim'));
});
