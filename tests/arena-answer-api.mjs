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

test('host API reveal appears in public Arena and disappears on hide and next question',async()=>{
 const {seedQuiz}=await load('seed'),{sqliteRepository}=await load('sqlite-repository'),{wrapSqlite}=await load('sqlite-adapter');
 const {Stage}=await load('core'),quiz=await load('quiz-route'),access=await load('access-route');
 const sql=new DatabaseSync(':memory:');sql.exec(readFileSync('drizzle/0000_hard_rachel_grey.sql','utf8'));
 const repository=sqliteRepository(wrapSqlite(sql)),q=seedQuiz();q.rounds[0].questions[0].answer='JAWABAN_UJI_ARENA';q.rounds[0].questions[0].options=[];q.rounds[0].questions[0].notes='CATATAN_KHUSUS_HOST';q.rounds[0].questions[1].answer='RAHASIA_SOAL_BERIKUTNYA';q.rounds[0].questions[1].options=[];
 await repository.initialize(JSON.stringify(q),1000);
 const oldToken=process.env.BGI_ADMIN_TOKEN,oldMode=process.env.NODE_ENV;globalThis.__bgiApiTestRepository=repository;process.env.BGI_ADMIN_TOKEN=crypto.randomUUID();process.env.NODE_ENV='production';
 const get=async()=>{const r=await quiz.GET(new Request('https://quiz.example/api/quiz'));assert.equal(r.status,200);return r.json();};
 try{
  const login=await access.POST(new Request('https://quiz.example/api/access',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:process.env.BGI_ADMIN_TOKEN})}));assert.equal(login.status,200);const cookie=login.headers.get('set-cookie').split(';')[0];
  const post=async(action)=>{const r=await quiz.POST(new Request('https://quiz.example/api/quiz',{method:'POST',headers:{'Content-Type':'application/json',cookie},body:JSON.stringify({action})}));assert.equal(r.status,200);return r.json();};
  const render=s=>renderToStaticMarkup(createElement(Stage,{s,offset:{current:0}}));
  assert.ok(!render(await get()).includes('JAWABAN_UJI_ARENA'));
  const toggle=visible=>({type:'setAnswerVisibility',visible,epoch:q.game.epoch,questionId:q.rounds[0].questions[0].id});
  await post(toggle(true));let publicState=await get(),html=render(publicState);assert.equal(publicState.quiz.game.answerVisible,true);assert.ok(html.includes('JAWABAN_UJI_ARENA'));assert.ok(html.includes('JAWABAN BENAR'));assert.ok(!html.includes('CATATAN_KHUSUS_HOST'));assert.ok(!JSON.stringify(publicState).includes('RAHASIA_SOAL_BERIKUTNYA'));
  await post(toggle(false));assert.ok(!render(await get()).includes('JAWABAN_UJI_ARENA'));
  await post({type:'selectTeam',teamId:'A'});await post({type:'start'});const active=await get();q.game.epoch=active.quiz.game.epoch;await post(toggle(true));await post({type:'judge',correct:true});await post({type:'next'});
  publicState=await get();assert.equal(publicState.quiz.game.answerVisible,false);assert.ok(!JSON.stringify(publicState).includes('RAHASIA_SOAL_BERIKUTNYA'));assert.ok(!render(publicState).includes('JAWABAN_UJI_ARENA'));
 }finally{
  delete globalThis.__bgiApiTestRepository;if(oldToken===undefined)delete process.env.BGI_ADMIN_TOKEN;else process.env.BGI_ADMIN_TOKEN=oldToken;if(oldMode===undefined)delete process.env.NODE_ENV;else process.env.NODE_ENV=oldMode;sql.close();
 }
});
