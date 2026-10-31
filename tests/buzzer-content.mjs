import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import ts from 'typescript';

const output=resolve('.sites-runtime/buzzer-content-build');mkdirSync(output,{recursive:true});
for(const name of ['engine','seed']){
 const code=ts.transpileModule(readFileSync(`lib/${name}.ts`,'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText.replace(/from "\.\/([^".]+)"/g,'from "./$1.mjs"');
 writeFileSync(`${output}/${name}.mjs`,code);
}
writeFileSync(`${output}/core.mjs`,ts.transpileModule(readFileSync('components/core.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText.replaceAll('"@/lib/engine"','"./engine.mjs"'));
const load=name=>import(pathToFileURL(`${output}/${name}.mjs`));
const {applyAction,publicQuiz,currentQuestion,currentRound}=await load('engine'),{seedQuiz}=await load('seed'),{BuzzerQuestion,Stage}=await load('core');
let serial=0;const act=(q,action)=>applyAction(q,action,1000,`content-${++serial}`);
function fixture(type='reguler'){
 let q=seedQuiz();
 for(const r of q.rounds){
  Object.assign(r.questions[0],{text:`PERTANYAAN_AKTIF_${r.id}`,answer:`JAWABAN_RAHASIA_${r.id}`,notes:'CATATAN_PRIVAT_HOST',options:[]});
  Object.assign(r.questions[1],{text:`PERTANYAAN_BERIKUT_${r.id}`,answer:`RAHASIA_BERIKUT_${r.id}`,options:[]});
 }
 q=act(q,{type:'selectRound',roundId:type==='rebutan'?'rebutan':'reguler'});
 if(type==='reguler')q=act(q,{type:'selectTeam',teamId:'A'});
 return q;
}
const toggle=(q,visible)=>act(q,{type:'setAnswerVisibility',visible,epoch:q.game.epoch,questionId:currentQuestion(q).id});
function answering(q){
 q=act(q,{type:'start'});
 if(currentRound(q).type==='rebutan'){q=act(q,{type:'buzz',teamId:'B',epoch:q.game.epoch});q=act(q,{type:'confirmBuzz',teamId:'B'});}
 return q;
}
function renderBoth(q){
 const safe=publicQuiz(q);
 return [renderToStaticMarkup(createElement(BuzzerQuestion,{quiz:safe})),renderToStaticMarkup(createElement(Stage,{s:{quiz:safe,revision:0,serverNow:1000,admin:false},offset:{current:0}}))];
}
function visible(q,prompt,answer=false){
 const current=currentQuestion(q);
 for(const html of renderBoth(q)){
  assert.equal(html.includes(current.text),prompt,'Question visibility must agree');
  assert.equal(html.includes(current.answer),answer,'Answer visibility must agree');
  assert.ok(!html.includes('CATATAN_PRIVAT_HOST'));assert.ok(!html.includes('PERTANYAAN_BERIKUT_'));assert.ok(!html.includes('RAHASIA_BERIKUT_'));
 }
}
for(const type of ['reguler','rebutan']){
 test(`${type}: participant and Arena hide the upcoming prompt before host starts, even with reveal enabled`,()=>{
  let q=fixture(type);visible(q,false);q=toggle(q,true);visible(q,false);
 });
 test(`${type}: host start, reveal, hide, pause and resume keep both displays in sync`,()=>{
  let q=answering(fixture(type));visible(q,true);q=toggle(q,true);visible(q,true,true);q=toggle(q,false);visible(q,true);
  q=act(q,{type:'pause'});visible(q,true);q=act(q,{type:'resume'});visible(q,true);
 });
 for(const correct of [true,false])test(`${type}: judging ${correct?'correct':'wrong'} does not open the answer automatically`,()=>{
  let q=answering(fixture(type));q=act(q,{type:'judge',correct});visible(q,true);q=toggle(q,true);visible(q,true,true);
 });
 test(`${type}: next removes the old prompt and answer until host starts the new question`,()=>{
  let q=answering(fixture(type));q=toggle(q,true);const old=currentQuestion(q);q=act(q,{type:'judge',correct:true});q=act(q,{type:'next'});
  for(const html of renderBoth(q)){assert.ok(!html.includes(old.text));assert.ok(!html.includes(old.answer));assert.ok(!html.includes(currentQuestion(q).text));}
  assert.equal(q.game.answerVisible,false);q=answering(q);
  for(const html of renderBoth(q)){assert.ok(html.includes(currentQuestion(q).text));assert.ok(!html.includes(currentQuestion(q).answer));assert.ok(!html.includes(old.answer));}
 });
}
test('rebutan shows the same prompt during buzzing, review and answering; reopening hides a revealed answer',()=>{
 let q=act(fixture('rebutan'),{type:'start'});visible(q,true);q=act(q,{type:'buzz',teamId:'A',epoch:q.game.epoch});visible(q,true);
 q=toggle(q,true);visible(q,true,true);q=act(q,{type:'reopen'});visible(q,true);q=act(q,{type:'buzz',teamId:'C',epoch:q.game.epoch});q=act(q,{type:'confirmBuzz',teamId:'C'});visible(q,true);
});
test('multiple-choice displays options before reveal and the same answer letter as Arena after reveal',()=>{
 let q=fixture();Object.assign(currentQuestion(q),{options:['PILIHAN_SATU','PILIHAN_DUA','PILIHAN_TIGA'],answer:'PILIHAN_DUA'});q=answering(q);
 for(const html of renderBoth(q)){assert.ok(html.includes('PILIHAN_SATU'));assert.ok(!html.includes('JAWABAN BENAR'));}
 q=toggle(q,true);for(const html of renderBoth(q)){assert.ok(html.includes('B. PILIHAN_DUA'));assert.ok(!html.includes('PILIHAN_SATU'));assert.ok(html.includes('JAWABAN BENAR'));}
 q=toggle(q,false);for(const html of renderBoth(q)){assert.ok(html.includes('PILIHAN_SATU'));assert.ok(!html.includes('B. PILIHAN_DUA'));}
});
test('changing a batch clears the prompt and answer on both displays',()=>{
 let q=answering(fixture());q=toggle(q,true);q=act(q,{type:'judge',correct:true});q=act(q,{type:'selectRound',roundId:'reguler-b'});visible(q,false);assert.equal(q.game.answerVisible,false);
});
test('finished rounds hide the last prompt and answer',()=>{
 let q=fixture();for(let i=0;i<10;i++){q=answering(q);q=toggle(q,true);q=act(q,{type:'judge',correct:true});q=act(q,{type:'next'});}
 assert.equal(q.game.phase,'finished');for(const html of renderBoth(q)){assert.ok(!html.includes('PERTANYAAN_AKTIF_'));assert.ok(!html.includes('JAWABAN_RAHASIA_'));}
});
test('participant rendering escapes question and revealed answer content without mutating the snapshot',()=>{
 let q=fixture();Object.assign(currentQuestion(q),{text:'<img src=x onerror=alert(1)>',answer:'<script>alert(2)</script>'});q=toggle(answering(q),true);const before=structuredClone(q);
 for(const html of renderBoth(q)){assert.ok(html.includes('&lt;img'));assert.ok(html.includes('&lt;script&gt;'));assert.ok(!html.includes('<script>'));assert.ok(!html.includes('<img src="x"'));}
 assert.deepEqual(q,before);
});
