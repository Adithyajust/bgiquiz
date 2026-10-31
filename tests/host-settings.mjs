import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {DatabaseSync} from 'node:sqlite';

const output=resolve('.sites-runtime/test-build');
const load=name=>import(pathToFileURL(`${output}/${name}.mjs`));
const {applyAction,currentRound,batchDeleteReason,regularBatches,MAX_REGULAR_BATCHES,publicQuiz}=await load('engine');
const {seedQuiz}=await load('seed');
const {loadQuiz,mutate}=await load('store');
const {sqliteRepository}=await load('sqlite-repository');
const {wrapSqlite}=await load('sqlite-adapter');
let serial=0;
const act=(q,a,now=1000)=>applyAction(q,a,now,`host-settings-${++serial}`);
const settings=(name='Paket Nusantara')=>({name,questionCount:2,duration:45,points:15,scoringMode:'round'});
function create(q,name='Paket Nusantara',templateRoundId='') {return act(q,{type:'createBatch',round:settings(name),templateRoundId});}
function localDatabase(){const sql=new DatabaseSync(':memory:');sql.exec(readFileSync('drizzle/0000_hard_rachel_grey.sql','utf8'));return {sql,db:sqliteRepository(wrapSqlite(sql))};}

test('host creates any number of regular packages within the supported limit without changing the current turn',()=>{
  let q=seedQuiz();const original=structuredClone(q),game=structuredClone(q.game);
  q=create(q);q=create(q,'Paket Merdeka');
  assert.equal(regularBatches(q).length,5);assert.deepEqual(q.game,game);assert.deepEqual(original.rounds,seedQuiz().rounds);
  const fresh=regularBatches(q).at(-1);assert.equal(fresh.batchNumber,5);assert.deepEqual(fresh.questions,[]);assert.equal('batchTeam' in fresh,false);
  assert.equal(q.rounds.at(-1).type,'rebutan');assert.deepEqual(q.rounds.map(r=>r.order),[1,2,3,4,5,6]);
  q=act(q,{type:'selectRound',roundId:fresh.id});q=act(q,{type:'selectTeam',teamId:'C'});
  assert.throws(()=>act(q,{type:'start'}),/Lengkapi 2 soal/);
});

test('copied packages retain questions with independent ids and no inherited results or progress',()=>{
  let q=create(seedQuiz(),'Paket Salinan','reguler');const source=q.rounds.find(r=>r.id==='reguler'),copy=regularBatches(q).at(-1);
  assert.deepEqual(copy.questions.map(x=>x.text),source.questions.map(x=>x.text));assert.ok(copy.questions.every((x,i)=>x.id!==source.questions[i].id));
  q=act(q,{type:'saveQuestion',roundId:copy.id,question:{...copy.questions[0],text:'Pertanyaan salinan diubah'}});
  assert.equal(q.rounds.find(r=>r.id==='reguler').questions[0].text,source.questions[0].text);
  q=act(q,{type:'selectRound',roundId:copy.id});q=act(q,{type:'selectTeam',teamId:'B'});q=act(q,{type:'start'},5000);assert.equal(q.game.deadline,50000);
  q=act(q,{type:'judge',correct:true});assert.equal(q.teams[1].score,15);assert.equal(q.game.progress[`${copy.id}:B`],1);assert.equal(q.game.progress['reguler:B'],undefined);
  assert.equal(q.results[0].roundId,copy.id);assert.equal(q.results[0].round,'Paket Salinan');
});

test('batch creation validates names values templates and maximum count',()=>{
  const q=seedQuiz();
  for(const patch of [{name:' '},{questionCount:0},{questionCount:101},{duration:0},{points:-1},{scoringMode:'invalid'}])assert.throws(()=>act(q,{type:'createBatch',round:{...settings(),...patch}}));
  assert.throws(()=>create(q,' babak reguler · batch 1 '),/Nama batch sudah/);
  assert.throws(()=>create(q,'Paket Salah','rebutan'),/sumber tidak ditemukan/);
  let full=q;for(let n=4;n<=MAX_REGULAR_BATCHES;n++)full=create(full,`Paket ${n}`);
  assert.equal(regularBatches(full).length,19);assert.equal(full.rounds.length,20);assert.throws(()=>create(full,'Terlalu banyak'),/Maksimal/);
});

test('moving a package keeps identities current question and earned progress intact',()=>{
  let q=act(seedQuiz(),{type:'selectTeam',teamId:'B'});q=act(q,{type:'start'});q=act(q,{type:'judge',correct:true});q=act(q,{type:'next'});
  const game=structuredClone(q.game),result=structuredClone(q.results);
  q=act(q,{type:'moveBatch',roundId:'reguler-c',direction:'up'});
  assert.deepEqual(regularBatches(q).map(r=>r.id),['reguler','reguler-c','reguler-b']);assert.deepEqual(q.game,game);assert.deepEqual(q.results,result);
  assert.throws(()=>act(q,{type:'moveBatch',roundId:'reguler',direction:'up'}),/urutan tersebut/);
  assert.throws(()=>act(q,{type:'moveBatch',roundId:'rebutan',direction:'down'}),/Batch tidak/);
  assert.throws(()=>act(q,{type:'moveBatch',roundId:'reguler',direction:'invalid'}),/Arah/);
});

test('renaming and configuring a batch preserves the question bank scores and pair progress',()=>{
  let q=act(seedQuiz(),{type:'selectTeam',teamId:'C'});q=act(q,{type:'start'});q=act(q,{type:'judge',correct:true});q=act(q,{type:'next'});
  const r=currentRound(q),game=structuredClone(q.game),questions=structuredClone(r.questions);
  q=act(q,{type:'saveRound',round:{...r,name:'Paket Harmoni',duration:18,points:23,questionCount:7}});
  assert.equal(currentRound(q).name,'Paket Harmoni');assert.deepEqual(q.game,game);assert.deepEqual(currentRound(q).questions,questions);assert.equal(q.teams[2].score,10);
  q=act(q,{type:'start'},1000);assert.equal(q.game.deadline,19000);q=act(q,{type:'judge',correct:true});assert.equal(q.teams[2].score,33);
  assert.throws(()=>act(q,{type:'saveRound',round:{...currentRound(q),name:'Babak Reguler · Batch 2'}}),/Nama batch sudah/);
  q=act(q,{type:'next'});q=act(q,{type:'saveRound',round:{...currentRound(q),questionCount:2}});assert.equal(q.game.phase,'finished');
  q=act(q,{type:'saveRound',round:{...currentRound(q),questionCount:3}});assert.equal(q.game.phase,'ready');assert.equal(q.game.index,2);
});

test('deleting an unused selected package chooses a safe fallback and invalidates stale buzzers',()=>{
  let q=seedQuiz();q=act(q,{type:'selectRound',roundId:'reguler-b'});q=act(q,{type:'selectTeam',teamId:'B'});const epoch=q.game.epoch;
  assert.throws(()=>act(q,{type:'deleteBatch',roundId:'reguler-b',confirm:'yes'}),/Konfirmasi HAPUS/);
  q=act(q,{type:'deleteBatch',roundId:'reguler-b',confirm:'HAPUS'});
  assert.equal(regularBatches(q).length,2);assert.equal(q.game.roundId,'reguler');assert.equal(q.game.selectedTeam,null);assert.equal(q.game.phase,'ready');assert.notEqual(q.game.epoch,epoch);
  assert.throws(()=>act(q,{type:'buzz',teamId:'B',epoch}),/soal sebelumnya/);
  assert.throws(()=>act(q,{type:'deleteBatch',roundId:'rebutan',confirm:'HAPUS'}),/Hanya batch reguler/);
  q=act(q,{type:'deleteBatch',roundId:'reguler-c',confirm:'HAPUS'});
  assert.throws(()=>act(q,{type:'deleteBatch',roundId:'reguler',confirm:'HAPUS'}),/minimal satu/);
});

test('played packages cannot be deleted even after renaming and only an explicit reset unlocks removal',()=>{
  let q=act(seedQuiz(),{type:'selectRound',roundId:'reguler-b'});q=act(q,{type:'selectTeam',teamId:'A'});q=act(q,{type:'start'});q=act(q,{type:'judge',correct:false});
  q=act(q,{type:'saveRound',round:{...currentRound(q),name:'Nama Baru'}});
  assert.match(batchDeleteReason(q,currentRound(q)),/progres atau hasil/);assert.throws(()=>act(q,{type:'deleteBatch',roundId:'reguler-b',confirm:'HAPUS'}),/progres atau hasil/);
  const onlyHistory=structuredClone(q);onlyHistory.game.progress={};delete onlyHistory.results[0].roundId;
  assert.throws(()=>act(onlyHistory,{type:'deleteBatch',roundId:'reguler-b',confirm:'HAPUS'}),/progres atau hasil/);
  q=act(q,{type:'reset',confirm:'RESET'});q=act(q,{type:'deleteBatch',roundId:'reguler-b',confirm:'HAPUS'});assert.equal(q.rounds.some(r=>r.id==='reguler-b'),false);
});

test('structural batch edits reject running paused and rebutan review phases',()=>{
  let regular=act(seedQuiz(),{type:'selectTeam',teamId:'A'});regular=act(regular,{type:'start'});
  let rebutan=act(seedQuiz(),{type:'selectRound',roundId:'rebutan'});rebutan=act(rebutan,{type:'start'});rebutan=act(rebutan,{type:'buzz',teamId:'A',epoch:rebutan.game.epoch});
  for(const q of [regular,act(regular,{type:'pause'}),rebutan]){
    for(const action of [{type:'createBatch',round:settings()},{type:'moveBatch',roundId:'reguler-b',direction:'up'},{type:'deleteBatch',roundId:'reguler-b',confirm:'HAPUS'},{type:'saveRound',round:q.rounds[0]}])assert.throws(()=>act(q,action));
  }
});

test('host names trim whitespace reject blanks or duplicates and preserve timers photo keys scores and progress',()=>{
  let q=act(seedQuiz(),{type:'selectTeam',teamId:'B'});q.teams[1].score=35;q.teams[1].photo='data:image/png;base64,AAAA';q=act(q,{type:'start'});const game=structuredClone(q.game),team=structuredClone(q.teams[1]);
  const save=name=>({type:'saveTeam',teamId:'B',name,participants:'Dina, Eko, Farah',photo:team.photo});
  assert.throws(()=>act(q,save(' ')),/Nama grup wajib/);assert.throws(()=>act(q,save('X'.repeat(41))),/maksimal 40/);assert.throws(()=>act(q,save(' grup a ')),/Nama grup sudah/);
  q=act(q,save(' Tim Nusantara '));assert.equal(q.teams[1].name,'Tim Nusantara');assert.equal(q.teams[1].key,team.key);assert.equal(q.teams[1].photo,team.photo);assert.equal(q.teams[1].score,35);assert.deepEqual(q.game,game);
  assert.equal(publicQuiz(q).teams[1].name,'Tim Nusantara');assert.equal(publicQuiz(q).teams[1].key,'');
});

test('persistent host settings survive reload and an audit failure rolls back creation atomically',async()=>{
  const {sql,db}=localDatabase();await db.initialize(JSON.stringify(seedQuiz()),1000);
  await mutate(db,{type:'createBatch',round:settings(),templateRoundId:'reguler'},{admin:true,id:'new-package'});
  let loaded=await loadQuiz(db),fresh=regularBatches(loaded.quiz).at(-1);
  await mutate(db,{type:'moveBatch',roundId:fresh.id,direction:'up'},{admin:true});
  await mutate(db,{type:'saveTeam',teamId:'C',name:'Tim Tangguh',participants:'',photo:''},{admin:true});
  loaded=await loadQuiz(db);assert.equal(regularBatches(loaded.quiz).length,4);assert.equal(loaded.quiz.teams[2].name,'Tim Tangguh');assert.equal(loaded.quiz.rounds.find(r=>r.id===fresh.id).questions.length,10);
  const before=structuredClone(loaded);sql.prepare('INSERT INTO quiz_events VALUES (?,0,?,?,0)').run('duplicate-host-setting','test','{}');
  await assert.rejects(()=>mutate(db,{type:'createBatch',round:settings('Rollback')},{admin:true,id:'duplicate-host-setting'}),/UNIQUE/);
  assert.deepEqual(await loadQuiz(db),before);sql.close();
});

test('host settings mutations enforce organizer access and stale revision guards',async()=>{
  const {sql,db}=localDatabase();await db.initialize(JSON.stringify(seedQuiz()),1000);
  const actions=[{type:'createBatch',round:settings()},{type:'moveBatch',roundId:'reguler-b',direction:'up'},{type:'deleteBatch',roundId:'reguler-c',confirm:'HAPUS'},{type:'saveTeam',teamId:'A',name:'Tim Baru',photo:'',participants:''}];
  for(const action of actions){await assert.rejects(()=>mutate(db,action,{admin:false}),/penyelenggara/);await assert.rejects(()=>mutate(db,action,{admin:true,expectedRevision:9}),/berubah/);}
  assert.equal((await loadQuiz(db)).revision,0);sql.close();
});

test('host and admin render five batches custom names and accessible management forms',async()=>{
  const {HostScreen,AdminScreen,HostTeamManager}=await load('screens'),{BatchManager,BatchEditor}=await load('host-settings');
  const {createElement}=await import('react'),{renderToStaticMarkup}=await import('react-dom/server');
  let quiz=create(create(seedQuiz()),'Paket Merdeka');quiz=act(quiz,{type:'saveTeam',teamId:'B',name:'Tim Nusantara',participants:'Andi, Budi, Citra',photo:''});
  const c={data:{quiz,revision:1,serverNow:1000,admin:true},online:true,busy:false,offset:{current:0},act:async()=>true,setNotice:()=>{},error:''};
  const host=renderToStaticMarkup(createElement(HostScreen,{c}));assert.ok(host.includes('5 batch'));assert.ok(host.includes('Kelola batch'));assert.ok(host.includes('Nama &amp; foto grup'));assert.ok(host.includes('Tim Nusantara'));assert.equal((host.match(/aria-label="Pilih Batch/g)||[]).length,5);
  const admin=renderToStaticMarkup(createElement(AdminScreen,{c}));assert.equal((admin.match(/class="batch-tab /g)||[]).length,5);assert.ok(admin.includes('Atur 5 paket'));
  const manager=renderToStaticMarkup(createElement(BatchManager,{c,close:()=>{}}));assert.ok(manager.includes('Tambah batch'));assert.ok(manager.includes('Hapus Paket Merdeka'));assert.ok(manager.includes('Naikkan Paket Merdeka'));
  const editor=renderToStaticMarkup(createElement(BatchEditor,{c,r:null,close:()=>{}}));assert.ok(editor.includes('Bank soal awal'));assert.ok(editor.includes('Salin dari'));assert.ok(editor.includes('Simpan batch'));
  const teams=renderToStaticMarkup(createElement(HostTeamManager,{c,close:()=>{},edit:()=>{}}));assert.equal((teams.match(/Ubah nama dan foto/g)||[]).length,3);assert.ok(teams.includes('Tim Nusantara'));assert.equal((teams.match(/class="team-avatar /g)||[]).length,3);
});
