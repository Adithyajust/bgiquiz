import assert from 'node:assert/strict';
import {applyAction,publicQuiz,currentQuestion} from '../lib/engine.ts';
import {seedQuiz} from '../lib/seed.ts';
let n=0;const act=(q,a)=>applyAction(q,a,1000,`test-${++n}`);
const hidden=q=>{const x=currentQuestion(publicQuiz(q));assert.equal(x.text,'');assert.deepEqual(x.options,[]);assert.equal(x.answer,'');};
let q=seedQuiz();hidden(q);q=act(q,{type:'selectTeam',teamId:'A'});hidden(q);assert.throws(()=>act(q,{type:'buzz',teamId:'A',epoch:q.game.epoch}),/Tunggu host/);
for(const type of ['reguler','rebutan']){
 if(type==='rebutan')q=act(q,{type:'selectRound',roundId:'rebutan'});
 hidden(q);q=act(q,{type:'start'});assert.ok(currentQuestion(publicQuiz(q)).text);
 if(type==='rebutan'){assert.equal(q.game.deadline,null);q=act(q,{type:'buzz',teamId:'B',epoch:q.game.epoch});q=act(q,{type:'confirmBuzz',teamId:'B'});}
 assert.ok(q.game.deadline);q=act(q,{type:'judge',correct:true});q=act(q,{type:'next'});hidden(q);
}
console.log('PASS: host start, hidden prompts/options/answers, both rounds, timers and next question');
