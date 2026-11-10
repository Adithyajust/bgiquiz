import assert from 'node:assert/strict';
import {test} from 'node:test';
import {applyAction,publicQuiz,currentQuestion,isBuzzerReady} from '../lib/engine.ts';
import {seedQuiz} from '../lib/seed.ts';
let n=0;const act=(q,a,now=1000)=>applyAction(q,a,now,`test-${++n}`);
const hidden=q=>{const x=currentQuestion(publicQuiz(q));assert.equal(x.text,'');assert.deepEqual(x.options,[]);assert.equal(x.answer,'');};
let q=seedQuiz();hidden(q);q=act(q,{type:'selectTeam',teamId:'A'});hidden(q);assert.throws(()=>act(q,{type:'buzz',teamId:'A',epoch:q.game.epoch}),/Tunggu host/);
for(const type of ['reguler','rebutan']){
 if(type==='rebutan')q=act(q,{type:'selectRound',roundId:'rebutan'});
 hidden(q);q=act(q,{type:'start'});assert.ok(currentQuestion(publicQuiz(q)).text);
 if(type==='rebutan'){assert.equal(q.game.deadline,null);q=act(q,{type:'buzz',teamId:'B',epoch:q.game.epoch});q=act(q,{type:'confirmBuzz',teamId:'B'});}
 assert.ok(q.game.deadline);q=act(q,{type:'judge',correct:true});q=act(q,{type:'next'});hidden(q);
}
console.log('PASS: host start, hidden prompts/options/answers, both rounds, timers and next question');

for (const [roundId, primary, rivals] of [
 ['reguler', 'A', ['B', 'C']],
 ['reguler-b', 'B', ['C', 'A']],
 ['reguler-c', 'C', ['A', 'B']],
]) {
 test(`${roundId}: same question passes from ${primary} to ${rivals.join(' and ')}`, () => {
  let q=act(seedQuiz(),{type:'selectRound',roundId});
  const round=q.rounds.find(r=>r.id===roundId);
  for (let i=10;i<15;i++) round.questions.push({...round.questions[0],id:`extra-${i}`,number:i+1});
  round.questionCount=15;
  q.game.progress[`${roundId}:${primary}`]=14;
  q=act(q,{type:'selectTeam',teamId:primary});
  q=act(q,{type:'start'});
  const question=currentQuestion(q), epoch=q.game.epoch;
  q=act(q,{type:'setAnswerVisibility',visible:true,epoch,questionId:question.id});
  q=act(q,{type:'judge',correct:false});
  assert.equal(q.game.phase,'buzzing');
  assert.notEqual(q.game.epoch,epoch);
  assert.equal(q.game.deadline,null);
  assert.equal(q.game.progress[`${roundId}:${primary}`],14);
  assert.equal(currentQuestion(publicQuiz(q)).text,question.text);
  assert.equal(currentQuestion(publicQuiz(q)).answer,'');
  const snapshot=publicQuiz(q);
  assert.deepEqual(snapshot.teams.filter(t=>isBuzzerReady(snapshot,t.id)).map(t=>t.id),[...rivals].sort());
  assert.throws(()=>act(q,{type:'next'}),/Nilai jawaban/);
  assert.throws(()=>act(q,{type:'buzz',teamId:rivals[0],epoch}),/soal sebelumnya/);
  assert.throws(()=>act(q,{type:'buzz',teamId:primary,epoch:q.game.epoch}),/grup utama/i);
  q=act(q,{type:'buzz',teamId:rivals[0],epoch:q.game.epoch},1100);
  q=act(q,{type:'buzz',teamId:rivals[1],epoch:q.game.epoch},1120);
  assert.deepEqual(q.game.buzzes.map(b=>b.teamId),rivals);
  assert.equal(q.game.deadline,null);
  q=act(q,{type:'confirmBuzz',teamId:rivals[0]},2000);
  assert.equal(q.game.deadline,2000+round.duration*1000);
  q=act(q,{type:'judge',correct:true});
  assert.deepEqual(q.results.map(r=>[r.teamId,r.points]),[[primary,0],[rivals[0],10]]);
  assert.deepEqual(q.teams.filter(t=>t.score).map(t=>[t.id,t.score]),[[rivals[0],10]]);
  assert.deepEqual(q.game.progress,{[`${roundId}:${primary}`]:15});
  q=act(q,{type:'next'});
  assert.equal(q.game.phase,'finished');
  assert.equal(q.game.openedAt,null);
 });
}

test('host can close an unanswered rebound and start the next question normally', () => {
 let q=act(seedQuiz(),{type:'selectTeam',teamId:'A'});
 q=act(q,{type:'start'});
 assert.throws(()=>act(q,{type:'skipRegularRebound'}));
 q=act(q,{type:'judge',correct:false});
 q=act(q,{type:'skipRegularRebound'});
 assert.equal(q.game.phase,'judged');
 assert.deepEqual(q.game.progress,{'reguler:A':1});
 assert.equal(q.results.length,1);
 assert.ok(q.teams.every(t=>t.score===0));
 q=act(q,{type:'next'});
 hidden(q);
 q=act(q,{type:'start'});
 q=act(q,{type:'judge',correct:true});
 assert.equal(q.game.phase,'judged');
 assert.equal(q.teams[0].score,10);
});

test('a wrong rebound answer ends the question and does not prevent the same group playing the batch later', () => {
 let q=act(seedQuiz(),{type:'selectTeam',teamId:'A'});
 q=act(q,{type:'start'});
 q=act(q,{type:'judge',correct:false});
 q=act(q,{type:'buzz',teamId:'B',epoch:q.game.epoch});
 q=act(q,{type:'confirmBuzz',teamId:'B'});
 q=act(q,{type:'judge',correct:false});
 assert.equal(q.game.phase,'judged');
 assert.equal(q.teams[1].score,0);
 assert.deepEqual(q.game.progress,{'reguler:A':1});
 q=act(q,{type:'next'});
 q=act(q,{type:'selectTeam',teamId:'B'});
 q=act(q,{type:'start'});
 q=act(q,{type:'judge',correct:true});
 assert.equal(q.teams[1].score,10);
 assert.equal(new Set(q.results.map(r=>r.id)).size,3);
});

test('corrections cannot award points to both the primary group and the rebound group', () => {
 const correct=(r,verdict)=>({type:'correctResult',resultId:r.id,correct:verdict,expectedCorrect:r.correct,
  expectedPoints:r.points,expectedCorrectionCount:r.correction?.count??0,reason:'Koreksi dari host'});
 let q=act(seedQuiz(),{type:'selectTeam',teamId:'A'});
 q=act(q,{type:'start'});
 q=act(q,{type:'judge',correct:false});
 assert.throws(()=>act(q,correct(q.results[0],true)),/Selesaikan atau lewati lemparan/);
 q=act(q,{type:'buzz',teamId:'C',epoch:q.game.epoch});
 q=act(q,{type:'confirmBuzz',teamId:'C'});
 q=act(q,{type:'judge',correct:true});
 assert.throws(()=>act(q,correct(q.results[0],true)),/tercatat benar/);
 q=act(q,correct(q.results[1],false));
 q=act(q,correct(q.results[0],true));
 assert.deepEqual(q.teams.map(t=>t.score),[10,0,0]);
 assert.throws(()=>act(q,correct(q.results[1],true)),/tercatat benar/);
});
