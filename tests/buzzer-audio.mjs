import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import ts from 'typescript';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';

const output=resolve('.sites-runtime/audio-test-build');mkdirSync(output,{recursive:true});
for(const name of ['engine','seed','buzzer-audio']){
 const code=ts.transpileModule(readFileSync(`lib/${name}.ts`,'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText.replace(/from "\.\/([^".]+)"/g,'from "./$1.mjs"');
 writeFileSync(`${output}/${name}.mjs`,code);
}
const load=name=>import(pathToFileURL(`${output}/${name}.mjs`));
writeFileSync(`${output}/audio-controls.mjs`,ts.transpileModule(readFileSync('components/audio-controls.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText);
const {AudioControls}=await load('audio-controls');
const {QuizAudioPlayback,BUZZER_AUDIO_URL,VERDICT_AUDIO_URLS}=await load('buzzer-audio'),{applyAction,publicQuiz}=await load('engine'),{seedQuiz}=await load('seed');
let serial=0;const act=(q,a,now=1000)=>applyAction(q,a,now,`audio-${++serial}`);
const ordinaryRegular=()=>act(act(seedQuiz(),{type:'selectRound',roundId:'reguler-b'}),{type:'selectTeam',teamId:'A'});
function fixture(){
 const state={plays:0,pauses:0,errors:0,created:0,reject:false,sources:[]};
 const clip={src:'',currentTime:9,pause(){state.pauses++;},async play(){state.plays++;state.sources.push(this.src);if(state.reject)throw new Error('Playback blocked');}};
 const player=new QuizAudioPlayback(()=>{state.created++;return clip;},()=>state.errors++);
 return{state,clip,player};
}
test('buzzer uses the supplied MP3 bytes and a versioned local asset URL',()=>{
 assert.match(BUZZER_AUDIO_URL,/^\/audio\/bunyi_buzer\.mp3\?v=/);
 const bytes=readFileSync(`public${BUZZER_AUDIO_URL.split('?')[0]}`);
 assert.equal(bytes.length,31680);assert.equal(createHash('sha256').update(bytes).digest('hex'),'4d74ba22b7e899bb6f9370a31b3db36477591a1ab9f5dc1b91383cf148121766');
});
test('regular buzzer plays once for an accepted press rather than starting the timer',async()=>{
 const {player,state,clip}=fixture();let q=act(seedQuiz(),{type:'selectTeam',teamId:'A'});await player.observe(q.game,true);
 q=act(q,{type:'start'});await player.observe(q.game,true);assert.equal(state.plays,0);
 q=act(q,{type:'buzz',teamId:'A',epoch:q.game.epoch});await player.observe(q.game,true);assert.equal(state.plays,1);assert.equal(clip.currentTime,0);
 for(let i=0;i<5;i++)await player.observe(structuredClone(q.game),true);assert.equal(state.plays,1);
});
test('close rebutan arrivals and server reordering do not replay the same question buzzer',async()=>{
 const {player,state}=fixture();let q=act(seedQuiz(),{type:'selectRound',roundId:'rebutan'});q=act(q,{type:'start'});await player.observe(q.game,true);
 q=act(q,{type:'buzz',teamId:'B',epoch:q.game.epoch},2000);await player.observe(q.game,true);
 q=act(q,{type:'buzz',teamId:'A',epoch:q.game.epoch},1990);assert.equal(q.game.buzzes[0].teamId,'A');await player.observe(q.game,true);
 q=act(q,{type:'confirmBuzz',teamId:'A'},3000);await player.observe(q.game,true);assert.equal(state.plays,1);q=act(q,{type:'judge',correct:true},4000);await player.observe(q.game,true);assert.deepEqual(state.sources,[BUZZER_AUDIO_URL,VERDICT_AUDIO_URLS.correct]);
});
test('reopened buzzer and a new session can each play a fresh clip',async()=>{
 const {player,state}=fixture();let q=act(seedQuiz(),{type:'selectRound',roundId:'rebutan'});q=act(q,{type:'start'});q=act(q,{type:'buzz',teamId:'A',epoch:q.game.epoch},2000);await player.observe(q.game,true);
 q=act(q,{type:'reopen'},3000);await player.observe(q.game,true);q=act(q,{type:'buzz',teamId:'B',epoch:q.game.epoch},4000);await player.observe(q.game,true);assert.equal(state.plays,2);
 const other={...q.game,sessionId:'new-session'};await player.observe(other,true);assert.equal(state.plays,3);
});
test('muted observations consume earlier presses and enabling audio does not replay them',async()=>{
 const {player,state}=fixture();let q=act(seedQuiz(),{type:'selectTeam',teamId:'A'});q=act(q,{type:'start'});q=act(q,{type:'buzz',teamId:'A',epoch:q.game.epoch});await player.observe(q.game,false);await player.observe(q.game,true);
 assert.equal(state.plays,0);assert.equal(state.created,0);await player.preview();assert.equal(state.plays,1);await player.observe(q.game,true);assert.equal(state.plays,1);
});
test('muting immediately pauses and rewinds the active clip',async()=>{
 const {player,state,clip}=fixture();let q=act(seedQuiz(),{type:'selectRound',roundId:'rebutan'});q=act(q,{type:'start'});q=act(q,{type:'buzz',teamId:'A',epoch:q.game.epoch});await player.observe(q.game,true);clip.currentTime=1;const pauses=state.pauses;await player.observe(q.game,false);assert.ok(state.pauses>pauses);assert.equal(clip.currentTime,0);assert.equal(state.plays,1);
});
test('background muted polling does not interrupt a pending user activation preview',async()=>{
 let finish,pauses=0;const clip={currentTime:0,pause(){pauses++;},play(){return new Promise(ok=>{finish=ok;});}};
 const player=new QuizAudioPlayback(()=>clip,()=>assert.fail('Unexpected playback error')),pending=player.preview();
 await player.observe(seedQuiz().game,false);assert.equal(pauses,1);finish();assert.equal(await pending,true);
});
test('browser playback rejection is handled and a subsequent user preview may retry',async()=>{
 const {player,state}=fixture();state.reject=true;assert.equal(await player.preview(),false);assert.equal(state.errors,1);state.reject=false;assert.equal(await player.preview(),true);assert.equal(state.plays,2);assert.equal(state.created,1);
});
test('stopping a pending preview prevents later activation and ignores its aborted rejection',async()=>{
 let reject,errors=0;const clip={currentTime:0,pause(){},play(){return new Promise((_,no)=>{reject=no;});}};
 const player=new QuizAudioPlayback(()=>clip,()=>errors++),pending=player.preview();player.stop();reject(new Error('Interrupted by mute'));assert.equal(await pending,false);assert.equal(errors,0);
});
test('new preview supersedes a pending play without surfacing its interruption',async()=>{
 let reject,errors=0,plays=0;const clip={currentTime:0,pause(){},play(){plays++;return plays===1?new Promise((_,no)=>{reject=no;}):Promise.resolve();}};
 const player=new QuizAudioPlayback(()=>clip,()=>errors++),older=player.preview();assert.equal(await player.preview(),true);reject(new Error('Interrupted by newer press'));assert.equal(await older,false);assert.equal(errors,0);
});
test('unmount disposal stops playback and releases the media for later initialization',async()=>{
 const {player,state}=fixture();await player.preview();const pauses=state.pauses;player.dispose();assert.ok(state.pauses>pauses);await player.preview();assert.equal(state.created,2);assert.equal(state.plays,2);
});

test('correct and wrong verdicts use the exact uploaded MP3 assets',()=>{
 for(const [verdict,name,size,hash] of [
  ['correct','benar.mp3',43008,'a23e872d18e936eae81e28b002b521fdd677b63a5da66467a67babb202c721cb'],
  ['wrong','salah.mp3',56832,'6f9b453e90bd80817ed96ffff2cc85874514da28735c6621b6cd3f1958aac721'],
 ]){
  assert.ok(VERDICT_AUDIO_URLS[verdict].startsWith(`/audio/${name}?v=`));
  const bytes=readFileSync(`public${VERDICT_AUDIO_URLS[verdict].split('?')[0]}`);
  assert.equal(bytes.length,size);assert.equal(createHash('sha256').update(bytes).digest('hex'),hash);
 }
});
for(const correct of [true,false])test(`accepted ${correct?'correct':'wrong'} host judgement plays its MP3 once on the Arena snapshot`,async()=>{
 const {player,state}=fixture();let q=ordinaryRegular();q=act(q,{type:'start'});await player.observe(publicQuiz(q).game,true);assert.equal(state.plays,0);
 q=act(q,{type:'judge',correct});await player.observe(publicQuiz(q).game,true);
 for(let i=0;i<5;i++)await player.observe(structuredClone(publicQuiz(q).game),true);
 assert.deepEqual(state.sources,[VERDICT_AUDIO_URLS[correct?'correct':'wrong']]);assert.equal(q.teams[0].score,correct?10:0);
});
test('muted judgement is consumed and enabling audio does not replay old results',async()=>{
 const {player,state}=fixture();let q=act(seedQuiz(),{type:'selectTeam',teamId:'A'});q=act(q,{type:'start'});q=act(q,{type:'judge',correct:false});
 await player.observe(q.game,false);await player.preview();await player.observe(q.game,true);assert.deepEqual(state.sources,[BUZZER_AUDIO_URL]);
});
test('the next question can play the same verdict again',async()=>{
 const {player,state}=fixture();let q=act(seedQuiz(),{type:'selectTeam',teamId:'A'});q=act(q,{type:'start'});await player.observe(q.game,true);q=act(q,{type:'judge',correct:true});await player.observe(q.game,true);
 q=act(q,{type:'next'});await player.observe(q.game,true);q=act(q,{type:'start'});await player.observe(q.game,true);q=act(q,{type:'judge',correct:true});await player.observe(q.game,true);
 assert.deepEqual(state.sources,[VERDICT_AUDIO_URLS.correct,VERDICT_AUDIO_URLS.correct]);assert.equal(state.created,1);
});
test('a current-result correction switches the verdict sound and does not repeat on polling',async()=>{
 const {player,state}=fixture();let q=ordinaryRegular();q=act(q,{type:'start'});q=act(q,{type:'judge',correct:false});await player.observe(q.game,true);
 q=act(q,{type:'correctResult',resultId:q.results[0].id,correct:true,expectedCorrect:false,expectedPoints:0,expectedCorrectionCount:0,reason:'Host salah menekan tombol.'});
 await player.observe(q.game,true);await player.observe(structuredClone(q.game),true);assert.deepEqual(state.sources,[VERDICT_AUDIO_URLS.wrong,VERDICT_AUDIO_URLS.correct]);
});
test('a delayed snapshot with both a buzzer and verdict prioritizes the verdict',async()=>{
 const {player,state}=fixture();let q=ordinaryRegular();q=act(q,{type:'start'});await player.observe(q.game,true);q=act(q,{type:'buzz',teamId:'A',epoch:q.game.epoch});q=act(q,{type:'judge',correct:false});
 await player.observe(q.game,true);assert.deepEqual(state.sources,[VERDICT_AUDIO_URLS.wrong]);assert.equal(state.created,1);
});
test('a verdict interrupts the buzzer on the same media element and mute stops it',async()=>{
 const {player,state,clip}=fixture();await player.preview();let q=act(seedQuiz(),{type:'selectTeam',teamId:'A'});q=act(q,{type:'start'});await player.observe(q.game,true);q=act(q,{type:'buzz',teamId:'A',epoch:q.game.epoch});await player.observe(q.game,true);
 clip.currentTime=1;const before=state.pauses;q=act(q,{type:'judge',correct:true});await player.observe(q.game,true);assert.ok(state.pauses>before);assert.equal(clip.currentTime,0);assert.equal(clip.src,VERDICT_AUDIO_URLS.correct);assert.equal(state.created,1);
 clip.currentTime=.5;await player.observe(q.game,false);assert.equal(clip.currentTime,0);assert.equal(state.plays,3);
});
test('rejected host judgement produces no verdict sound',async()=>{
 const {player,state}=fixture(),q=seedQuiz();await player.observe(q.game,true);assert.throws(()=>act(q,{type:'judge',correct:true}));await player.observe(q.game,true);assert.equal(state.plays,0);
});

function findButton(node,label){
 if(!node||typeof node!=='object')return null;
 if(node.type==='button'&&node.props['aria-label']===label)return node;
 const children=Array.isArray(node.props?.children)?node.props.children:[node.props?.children];
 for(const child of children){const found=findButton(child,label);if(found)return found;}
 return null;
}
for(const host of [true,false])test(`${host?'Host':'Arena'} test buttons play the selected MP3 without changing scores or game state`,async()=>{
 const {player,state}=fixture(),quiz=seedQuiz(),before=structuredClone(quiz);
 const props={enabled:false,starting:false,host,onToggle(){},onPreview:sound=>player.preview(sound)},controls=AudioControls(props);
 const html=renderToStaticMarkup(createElement(AudioControls,props));
 assert.ok(html.includes(host?'Audio Host':'Uji suara Arena'));
 for(const [label,url] of [['Uji suara Benar',VERDICT_AUDIO_URLS.correct],['Uji suara Salah',VERDICT_AUDIO_URLS.wrong],['Uji suara buzzer',BUZZER_AUDIO_URL]]){
  const button=findButton(controls,label);assert.ok(button,`Missing ${label}`);await button.props.onClick();assert.equal(state.sources.at(-1),url);
 }
 assert.equal(state.created,1);assert.deepEqual(quiz,before);
});
test('a verdict preview does not replay the existing result when Audio becomes active',async()=>{
 const {player,state}=fixture();let q=act(seedQuiz(),{type:'selectTeam',teamId:'A'});q=act(q,{type:'start'});q=act(q,{type:'judge',correct:false});await player.observe(q.game,false);
 await player.preview('correct');await player.observe(q.game,true);assert.deepEqual(state.sources,[VERDICT_AUDIO_URLS.correct]);
});
