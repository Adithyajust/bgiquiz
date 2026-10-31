import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {DatabaseSync} from 'node:sqlite';
import ts from 'typescript';
const output=resolve('.sites-runtime/arena-audio-build');mkdirSync(output,{recursive:true});
for(const name of ['engine','seed','migrations','persistence','store','sqlite-adapter','sqlite-repository','arena-audio']){
 writeFileSync(`${output}/${name}.mjs`,ts.transpileModule(readFileSync(`lib/${name}.ts`,'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText.replace(/from "\.\/([^".]+)"/g,'from "./$1.mjs"'));
}
const load=name=>import(pathToFileURL(`${output}/${name}.mjs`));
const {ArenaAudioCursor,ArenaAudio,ARENA_SOUND_FILES}=await load('arena-audio'),{seedQuiz}=await load('seed'),{applyAction}=await load('engine'),{mutate,snapshot}=await load('store'),{sqliteRepository}=await load('sqlite-repository'),{wrapSqlite}=await load('sqlite-adapter');
function state(revision=0,cues=[],session='quiz-session',sound=true,serverNow=1000){const quiz=seedQuiz();quiz.game.sessionId=session;quiz.sound=sound;return {quiz,revision,audioCues:cues,serverNow,admin:false};}
function cue(revision,type='buzz',extra={}){return {id:`cue-${revision}`,revision,type,sessionId:'quiz-session',at:1000,...extra};}
function database(q){const sql=new DatabaseSync(':memory:');sql.exec(readFileSync('drizzle/0000_hard_rachel_grey.sql','utf8'));const repo=sqliteRepository(wrapSqlite(sql));return {sql,repo,ready:repo.initialize(JSON.stringify(q),1000)};}
function regular(){let q=seedQuiz();q=applyAction(q,{type:'selectTeam',teamId:'A'},1000,'select');return applyAction(q,{type:'start'},1000,'start');}
function rebutan(){let q=seedQuiz();q=applyAction(q,{type:'selectRound',roundId:'rebutan'},1000,'select');return applyAction(q,{type:'start'},1000,'start');}
class FakeContext{
 state='suspended';destination={};played=[];sources=[];resumes=0;closed=false;
 resume(){this.resumes++;this.state='running';return Promise.resolve();}
 decodeAudioData(bytes){return Promise.resolve({name:new TextDecoder().decode(bytes)});}
 createBufferSource(){const context=this,source={buffer:null,onended:null,stopped:false,connect(){},disconnect(){},start(){context.played.push(source.buffer.name);},stop(){source.stopped=true;},end(){source.onended?.();}};this.sources.push(source);return source;}
 close(){this.closed=true;this.state='closed';return Promise.resolve();}
}
const bytes=path=>Promise.resolve(new TextEncoder().encode(path).buffer);
test('Arena first load, reload, and enabling audio do not replay historical sounds',()=>{
 const cursor=new ArenaAudioCursor();assert.deepEqual(cursor.take(state(5,[cue(5,'correct')]),true),[]);assert.deepEqual(cursor.take(state(6,[cue(5,'correct'),cue(6)]),false),[]);assert.deepEqual(cursor.take(state(6,[cue(6)]),true),[]);assert.deepEqual(cursor.take(state(7,[cue(7,'wrong')]),true).map(c=>c.type),['wrong']);
});
test('Arena emits each committed event once and preserves buzzer/verdict order across missed phases',()=>{
 const cursor=new ArenaAudioCursor();cursor.take(state(),true);const s=state(4,[cue(3,'correct'),cue(1),cue(1),cue(2,'wrong')]);assert.deepEqual(cursor.take(s,true).map(c=>c.type),['buzz','wrong','correct']);assert.deepEqual(cursor.take(s,true),[]);assert.deepEqual(cursor.take(state(2,[cue(2)]),true),[]);
});
test('muting, global sound off, session reset, and stale cues never play delayed audio',()=>{
 const c=new ArenaAudioCursor();c.take(state(),true);assert.deepEqual(c.take(state(1,[cue(1)]),false),[]);assert.deepEqual(c.take(state(2,[cue(2)],'quiz-session',false),true),[]);assert.deepEqual(c.take(state(3,[cue(3,'wrong')],'new-session'),true),[]);assert.deepEqual(c.take(state(4,[cue(4,'buzz',{sessionId:'old-session'})],'new-session'),true),[]);assert.deepEqual(c.take(state(5,[cue(5,'correct',{sessionId:'new-session',at:1000})],'new-session',true,7000),true),[]);
});
test('player unlocks and loads the three original MP3 files, then plays only in event order',async()=>{
 const context=new FakeContext(),requested=[],player=new ArenaAudio(context,()=>assert.fail('unexpected audio error'),path=>{requested.push(path);return bytes(path);});const activation=player.activate();assert.equal(context.resumes,1);await activation;assert.deepEqual(new Set(requested),new Set(Object.values(ARENA_SOUND_FILES)));assert.deepEqual(context.played,[]);player.observe(state(),false);player.observe(state(2,[cue(1),cue(2,'correct')]),true);assert.deepEqual(context.played,['/sounds/bunyi_buzer.mp3']);context.sources[0].end();assert.deepEqual(context.played,['/sounds/bunyi_buzer.mp3','/sounds/benar.mp3']);context.sources[1].end();player.observe(state(3,[cue(3,'wrong')]),true);assert.equal(context.played.at(-1),'/sounds/salah.mp3');player.dispose();assert.equal(context.closed,true);
});
test('turning Arena audio off stops playback and clears queued sounds immediately',async()=>{
 const context=new FakeContext(),player=new ArenaAudio(context,()=>{},bytes);await player.activate();player.observe(state(),false);player.observe(state(2,[cue(1),cue(2,'wrong')]),true);const first=context.sources[0];player.observe(state(2),false);assert.equal(first.stopped,true);first.end();assert.equal(context.played.length,1);player.observe(state(3,[cue(3,'correct')]),false);player.observe(state(3,[cue(3,'correct')]),true);assert.equal(context.played.length,1);player.dispose();
});
test('resetting a session stops both the current sound and its queued verdict',async()=>{
 const context=new FakeContext(),player=new ArenaAudio(context,()=>{},bytes);await player.activate();player.observe(state(),false);player.observe(state(2,[cue(1),cue(2,'wrong')]),true);player.observe(state(3,[],'next-session'),true);assert.equal(context.sources[0].stopped,true);context.sources[0].end();assert.equal(context.played.length,1);player.dispose();
});
test('a missing MP3 or browser playback restriction reports failure without a fake success',async()=>{
 const context=new FakeContext(),player=new ArenaAudio(context,()=>{},async()=>{throw Error('missing');});await assert.rejects(()=>player.activate(),/missing/);player.dispose();const blocked=new FakeContext();blocked.resume=async()=>{throw Error('permission');};const other=new ArenaAudio(blocked,()=>{},bytes);await assert.rejects(()=>other.activate(),/permission/);other.dispose();
});
test('accepted regular buzzer and both verdict types reach public Arena even after Next',async()=>{
 for(const correct of [true,false]){const q=regular(),{sql,repo,ready}=database(q);await ready;try{const now=Date.now();await mutate(repo,{type:'buzz',teamId:'A',epoch:q.game.epoch},{admin:false,key:q.teams[0].key,id:'buzz',now});await mutate(repo,{type:'judge',correct},{admin:true,id:'verdict',now});await mutate(repo,{type:'next'},{admin:true,id:'next',now});const safe=await snapshot(repo,false);assert.equal(safe.quiz.game.phase,'ready');assert.deepEqual(safe.quiz.game.buzzes,[]);assert.deepEqual(safe.audioCues.map(c=>c.type),['buzz',correct?'correct':'wrong']);assert.deepEqual(Object.keys(safe.audioCues[0]).sort(),['at','id','revision','sessionId','type']);assert.ok(!JSON.stringify(safe).includes(q.teams[0].key));assert.deepEqual(safe.quiz.results,[]);}finally{sql.close();}}
});
test('the first accepted Rebutan buzzer sounds once despite duplicate or close presses',async()=>{
 const q=rebutan(),{sql,repo,ready}=database(q);await ready;try{const now=Date.now();for(const [i,id] of ['A','A','B'].entries())await mutate(repo,{type:'buzz',teamId:id,epoch:q.game.epoch},{admin:false,key:q.teams.find(t=>t.id===id).key,id:`press-${i}`,now:now+i});const safe=await snapshot(repo,false);assert.equal(safe.quiz.game.buzzes.length,2);assert.deepEqual(safe.audioCues.map(c=>c.id),['press-0']);}finally{sql.close();}
});
test('reopening Rebutan allows a new accepted first-buzzer sound',async()=>{
 const q=rebutan(),{sql,repo,ready}=database(q);await ready;try{const now=Date.now();await mutate(repo,{type:'buzz',teamId:'A',epoch:q.game.epoch},{admin:false,key:q.teams[0].key,id:'first',now});const reopened=await mutate(repo,{type:'reopen'},{admin:true,id:'reopen',now});await mutate(repo,{type:'buzz',teamId:'B',epoch:reopened.quiz.game.epoch},{admin:false,key:q.teams[1].key,id:'second',now});assert.deepEqual((await snapshot(repo,false)).audioCues.map(c=>c.id),['first','second']);}finally{sql.close();}
});
test('failed buzzer requests and rolled back verdicts do not produce Arena audio',async()=>{
 const q=regular(),{sql,repo,ready}=database(q);await ready;try{await assert.rejects(()=>mutate(repo,{type:'buzz',teamId:'B',epoch:q.game.epoch},{admin:false,key:q.teams[1].key}),/grup terpilih/);sql.prepare('INSERT INTO quiz_events VALUES (?,0,?,?,0)').run('duplicate','test','{}');await assert.rejects(()=>mutate(repo,{type:'judge',correct:true},{admin:true,id:'duplicate'}),/UNIQUE/);const safe=await snapshot(repo,false);assert.deepEqual(safe.audioCues,[]);assert.equal(safe.quiz.teams[0].score,0);}finally{sql.close();}
});
test('score correction is silent, reset removes former-session cues, and old audit rows remain compatible',async()=>{
 const q=regular(),{sql,repo,ready}=database(q);await ready;try{const judged=await mutate(repo,{type:'judge',correct:false},{admin:true,id:'judge'}),result=judged.quiz.results[0];await mutate(repo,{type:'correctResult',resultId:result.id,correct:true,expectedCorrect:false,expectedPoints:0,expectedCorrectionCount:0,reason:'Host salah klik'},{admin:true,id:'correction'});assert.deepEqual((await snapshot(repo,false)).audioCues.map(c=>c.id),['judge']);await mutate(repo,{type:'reset',confirm:'RESET'},{admin:true,id:'new-session'});assert.deepEqual((await snapshot(repo,false)).audioCues,[]);sql.prepare('INSERT INTO quiz_events VALUES (?,3,?,?,0)').run('legacy','judge','{"type":"judge"}');assert.deepEqual((await snapshot(repo,false)).audioCues,[]);}finally{sql.close();}
});
test('audio reads respect the snapshot revision and never include an uncommitted future cue',async()=>{
 const q=regular(),{sql,repo,ready}=database(q);await ready;try{const now=Date.now();await mutate(repo,{type:'judge',correct:true},{admin:true,id:'first',now});sql.prepare('INSERT INTO quiz_events VALUES (?,99,?,?,?)').run('future','judge',JSON.stringify({audio:{sessionId:q.game.sessionId,type:'wrong'}}),now);assert.deepEqual((await snapshot(repo,false)).audioCues.map(c=>c.id),['first']);}finally{sql.close();}
});

writeFileSync(`${output}/hook-stub.mjs`,'export const useRef=v=>({current:v});export const useState=v=>[globalThis.__arenaAudioHookValues?.length?globalThis.__arenaAudioHookValues.shift():typeof v==="function"?v():v,()=>{}];export const useEffect=()=>{};');
writeFileSync(`${output}/core-stub.mjs`,'export const cx=(...s)=>s.filter(Boolean).join(" ");export const useClock=()=>({seconds:30,fraction:1,expired:false});export const formatTime=String;export const PageTitle=()=>null,Modal=()=>null,Avatar=()=>null,Stage=()=>null,BuzzerQuestion=()=>null,ChampionshipControl=()=>null,Loading=()=>null,Feedback=()=>null;');
writeFileSync(`${output}/settings-stub.mjs`,'export const BatchManager=()=>null,EventSettings=()=>null,ResultHistory=()=>null;');
writeFileSync(`${output}/screens.mjs`,ts.transpileModule(readFileSync('components/screens.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText.replaceAll('from "react"','from "./hook-stub.mjs"').replaceAll('"@/lib/engine"','"./engine.mjs"').replaceAll('"./core"','"./core-stub.mjs"').replaceAll('"./host-settings"','"./settings-stub.mjs"').replaceAll('"./result-corrections"','"./settings-stub.mjs"'));
const {HostScreen,BuzzerScreen}=await load('screens');
function button(node,test){if(!node||typeof node!=='object')return null;if(node.type==='button'&&test(node.props))return node;for(const child of [node.props?.children].flat(Infinity)){const found=button(child,test);if(found)return found;}return null;}
test('real host Benar/Salah click handlers save verdicts silently and emit cues for Arena',async()=>{
 const oldAudio=globalThis.Audio,oldContext=globalThis.AudioContext;globalThis.Audio=globalThis.AudioContext=class{constructor(){assert.fail('Host must not create an audio player');}};
 try{for(const correct of [true,false]){const q=regular(),{sql,repo,ready}=database(q);await ready;try{const c={data:{quiz:q,revision:0,serverNow:1000,admin:true},busy:false,online:true,offset:{current:0},act:async action=>{c.data=await mutate(repo,action,{admin:true});return true;}};globalThis.__arenaAudioHookValues=[];const tree=HostScreen({c}),control=button(tree,p=>p.className===`button ${correct?'correct':'wrong'}-button`);assert.ok(control);await control.props.onClick();assert.equal(c.data.quiz.teams[0].score,correct?10:0);assert.deepEqual((await snapshot(repo,false)).audioCues.map(c=>c.type),[correct?'correct':'wrong']);}finally{sql.close();}}}finally{globalThis.Audio=oldAudio;globalThis.AudioContext=oldContext;delete globalThis.__arenaAudioHookValues;}
});
test('real participant buzzer handler stays silent while a committed press reaches Arena',async()=>{
 const q=regular(),{sql,repo,ready}=database(q);await ready;const oldAudio=globalThis.Audio,descriptor=Object.getOwnPropertyDescriptor(globalThis,'navigator');let vibrations=0;globalThis.Audio=class{constructor(){assert.fail('Participant must not create audio');}};Object.defineProperty(globalThis,'navigator',{configurable:true,value:{vibrate(){vibrations++;}}});
 try{const c={data:{quiz:q,revision:0,serverNow:1000,admin:false},online:true,busy:false,act:async(action,key)=>{c.data=await mutate(repo,action,{admin:false,key});return true;}};globalThis.__arenaAudioHookValues=[q.teams[0].key];const tree=BuzzerScreen({c,teamId:'A'}),control=button(tree,p=>p['aria-label']==='Tekan buzzer Grup A');assert.ok(control);assert.equal(control.props.disabled,false);await control.props.onClick();assert.equal(vibrations,1);assert.deepEqual((await snapshot(repo,false)).audioCues.map(c=>c.type),['buzz']);}finally{sql.close();globalThis.Audio=oldAudio;if(descriptor)Object.defineProperty(globalThis,'navigator',descriptor);else delete globalThis.navigator;delete globalThis.__arenaAudioHookValues;}
});

test('the audio queue drops expired sounds instead of replaying a delayed backlog',async()=>{
 const context=new FakeContext(),player=new ArenaAudio(context,()=>{},bytes),originalNow=Date.now;let now=1000;Date.now=()=>now;
 try{await player.activate();player.observe(state(),false);player.observe(state(2,[cue(1),cue(2,'wrong')]),true);assert.equal(context.played.length,1);now=7000;context.sources[0].end();assert.equal(context.played.length,1);}finally{player.dispose();Date.now=originalNow;}
});
test('actual HTTP handlers publish accepted participant and host cues to public Arena',async()=>{
 for(const correct of [true,false]){const q=regular(),{sql,repo,ready}=database(q);await ready;const oldSecret=process.env.BGI_ADMIN_TOKEN,oldMode=process.env.NODE_ENV;
 globalThis.__bgiArenaAudioApiRepo=repo;process.env.BGI_ADMIN_TOKEN=crypto.randomUUID();process.env.NODE_ENV='production';
 writeFileSync(`${output}/runtime-node.mjs`,ts.transpileModule(readFileSync('lib/runtime-node.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText.replace('import { getSqlServerRepository } from "./mssql-repository";', 'const getSqlServerRepository=async()=>globalThis.__bgiArenaAudioApiRepo;'));
 writeFileSync(`${output}/api-runtime.mjs`,'export {identity,authenticate,authMode} from "./runtime-node.mjs";export const database=async()=>globalThis.__bgiArenaAudioApiRepo;');
 for(const route of ['quiz','access'])writeFileSync(`${output}/${route}-route.mjs`,ts.transpileModule(readFileSync(`app/api/${route}/route.ts`,'utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText.replaceAll('"@quiz-runtime"','"./api-runtime.mjs"').replaceAll('"@/lib/store"','"./store.mjs"').replaceAll('"@/lib/engine"','"./engine.mjs"'));
 try{const quiz=await load('quiz-route'),access=await load('access-route'),request=(action,key,cookie='')=>new Request('https://quiz.example/api/quiz',{method:'POST',headers:{'content-type':'application/json',cookie},body:JSON.stringify({action,key})});const invalid=await quiz.POST(request({type:'judge',correct}));assert.equal(invalid.status,403);assert.equal((await quiz.POST(request({type:'buzz',teamId:'A',epoch:q.game.epoch},q.teams[0].key))).status,200);const login=await access.POST(new Request('https://quiz.example/api/access',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({password:process.env.BGI_ADMIN_TOKEN})}));const cookie=login.headers.get('set-cookie').split(';')[0];assert.equal((await quiz.POST(request({type:'judge',correct},undefined,cookie))).status,200);assert.equal((await quiz.POST(request({type:'next'},undefined,cookie))).status,200);const response=await quiz.GET(new Request('https://quiz.example/api/quiz'));assert.equal(response.status,200);assert.match(response.headers.get('cache-control'),/no-store/);const safe=await response.json();assert.deepEqual(safe.audioCues.map(c=>c.type),['buzz',correct?'correct':'wrong']);assert.ok(safe.quiz.teams.every(t=>!t.key));assert.deepEqual(safe.quiz.results,[]);}finally{sql.close();delete globalThis.__bgiArenaAudioApiRepo;if(oldSecret===undefined)delete process.env.BGI_ADMIN_TOKEN;else process.env.BGI_ADMIN_TOKEN=oldSecret;if(oldMode===undefined)delete process.env.NODE_ENV;else process.env.NODE_ENV=oldMode;}}
});

function victoryState(revision=10,declaredAt=2000,session='quiz-session'){
 const s=state(revision,[],session,true,3000),q=s.quiz;
 q.rounds.forEach(r=>{q.game.progress[r.type==='reguler'?`${r.id}:A`:r.id]=r.questionCount;});q.game.phase='finished';q.teams[0].score=100;
 s.quiz=applyAction(q,{type:'declareChampion'},declaredAt,`winner-${declaredAt}`);return s;
}
const settle=()=>new Promise(resolve=>setImmediate(resolve));
test('selected victory music waits for the host announcement and plays once through Arena',async()=>{
 const context=new FakeContext(),player=new ArenaAudio(context,()=>assert.fail('audio failed'),bytes);await player.activate();await player.setVictoryMusic(await bytes('QUEEN_MP3_FROM_OPERATOR'));player.observe(state(),true);assert.deepEqual(context.played,[]);const winner=victoryState();player.observe(winner,true);assert.deepEqual(context.played,['QUEEN_MP3_FROM_OPERATOR']);for(let i=0;i<5;i++)player.observe({...winner,revision:11+i},true);assert.equal(context.played.length,1);assert.equal(context.sources[0].loop,false);context.sources[0].end();player.observe({...winner,revision:20},true);assert.equal(context.played.length,1);player.dispose();
});
test('closing the celebration stops music and redeclaring the winner starts it again',async()=>{
 const context=new FakeContext(),player=new ArenaAudio(context,()=>{},bytes);await player.activate();await player.setVictoryMusic(await bytes('Queen MP3'));let s=victoryState();player.observe(s,true);const first=context.sources[0];s={...s,revision:11,quiz:applyAction(s.quiz,{type:'clearChampion'},3000,'close')};player.observe(s,true);assert.equal(first.stopped,true);assert.equal(context.played.length,1);s={...s,revision:12,quiz:applyAction(s.quiz,{type:'declareChampion'},4000,'declare-again')};player.observe(s,true);assert.equal(context.played.length,2);player.dispose();
});
test('muting or leaving Arena stops victory music and a new session clears its playback',async()=>{
 const context=new FakeContext(),player=new ArenaAudio(context,()=>{},bytes);await player.activate();await player.setVictoryMusic(await bytes('Queen MP3'));const s=victoryState();player.observe(s,true);player.observe(s,false);assert.equal(context.sources[0].stopped,true);player.observe(s,true);assert.equal(context.played.length,2);player.observe(state(20,[],'new-session'),true);assert.equal(context.sources[1].stopped,true);assert.equal(context.played.length,2);player.dispose();
});
test('missing optional victory file leaves the three quiz MP3s available without repeated errors',async()=>{
 const context=new FakeContext();let missing=0,fetches=0;const player=new ArenaAudio(context,()=>assert.fail('core audio must stay active'),path=>{if(path.includes('we_are_the_champions')){fetches++;return Promise.reject(Error('404'));}return bytes(path);},()=>missing++);await player.activate();assert.equal(fetches,0);const winner=victoryState();player.observe(winner,true);await settle();for(let i=0;i<4;i++)player.observe({...winner,revision:11+i},true);await settle();assert.equal(fetches,1);assert.equal(missing,1);player.observe(state(20),true);player.observe(state(21,[cue(21,'correct')]),true);assert.equal(context.played.at(-1),'/sounds/benar.mp3');player.dispose();
});
test('a prepared server music file loads lazily and never restarts on polling',async()=>{
 const context=new FakeContext(),requested=[],player=new ArenaAudio(context,()=>{},path=>{requested.push(path);return bytes(path);});await player.activate();const winner=victoryState();player.observe(winner,true);await settle();assert.equal(context.played.at(-1),'/sounds/we_are_the_champions.mp3');assert.equal(requested.filter(p=>p.includes('we_are_the_champions')).length,1);player.observe({...winner,revision:30},true);assert.equal(context.played.length,1);player.dispose();
});
test('a closed celebration cannot start music after a pending audio load completes',async()=>{
 const context=new FakeContext();let complete;const player=new ArenaAudio(context,()=>{},path=>path.includes('we_are_the_champions')?new Promise(resolve=>{complete=resolve;}):bytes(path));await player.activate();player.observe(victoryState(),true);player.observe(state(11),true);complete(await bytes('late music'));await settle();assert.deepEqual(context.played,[]);player.dispose();
});
test('choosing an MP3 during an active celebration starts it without changing scores',async()=>{
 const context=new FakeContext(),winner=victoryState(),before=structuredClone(winner.quiz),player=new ArenaAudio(context,()=>{},path=>path.includes('we_are_the_champions')?Promise.reject(Error('missing')):bytes(path));await player.activate();player.observe(winner,true);await settle();await player.setVictoryMusic(await bytes('selected Queen'));assert.equal(context.played.at(-1),'selected Queen');assert.deepEqual(winner.quiz,before);player.dispose();
});
test('a newly selected MP3 wins over an earlier server file request that finishes later',async()=>{
 const context=new FakeContext();let complete;const player=new ArenaAudio(context,()=>{},path=>path.includes('we_are_the_champions')?new Promise(resolve=>{complete=resolve;}):bytes(path));await player.activate();player.observe(victoryState(),true);await player.setVictoryMusic(await bytes('operator choice'));complete(await bytes('old server file'));await settle();assert.deepEqual(context.played,['operator choice']);player.dispose();
});
test('the celebration takes priority over the last verdict sound and stops it',async()=>{
 const context=new FakeContext(),player=new ArenaAudio(context,()=>{},bytes);await player.activate();await player.setVictoryMusic(await bytes('victory'));player.observe(state(),true);player.observe(state(1,[cue(1,'correct')]),true);const verdict=context.sources[0];player.observe(victoryState(),true);assert.equal(verdict.stopped,true);assert.deepEqual(context.played,['/sounds/benar.mp3','victory']);player.dispose();
});
test('invalid or revoked winner data cannot continue playing victory music',async()=>{
 const context=new FakeContext(),player=new ArenaAudio(context,()=>{},bytes);await player.activate();await player.setVictoryMusic(await bytes('victory'));const winner=victoryState();player.observe(winner,true);const corrected=structuredClone(winner);corrected.revision++;corrected.quiz.teams[2].score=200;player.observe(corrected,true);assert.equal(context.sources[0].stopped,true);assert.equal(context.played.length,1);player.dispose();
});
test('a decode failure for a selected MP3 preserves the previously prepared song',async()=>{
 const context=new FakeContext(),player=new ArenaAudio(context,()=>{},bytes);await player.activate();await player.setVictoryMusic(await bytes('valid song'));const decode=context.decodeAudioData;context.decodeAudioData=async()=>{throw Error('invalid MP3');};await assert.rejects(()=>player.setVictoryMusic(new ArrayBuffer(0)),/invalid MP3/);context.decodeAudioData=decode;player.observe(victoryState(),true);assert.equal(context.played.at(-1),'valid song');player.dispose();
});
