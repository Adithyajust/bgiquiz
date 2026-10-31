"use client";

import { useState, type FormEvent } from "react";
import { ArrowDown, ArrowUp, ExternalLink, Info, Pencil, Plus, Save, Trash2 } from "lucide-react";
import { batchDeleteReason, batchNumber, eventName, MAX_EVENT_NAME_LENGTH, MAX_REGULAR_BATCHES, regularBatches, type Round } from "@/lib/engine";
import { Modal, type QuizConnection } from "./core";

function FormError({text}:{text:string}) {
  return text ? <p className="field-error" role="alert"><Info size={15}/>{text}</p> : null;
}

export function BatchManager({c,close}:{c:QuizConnection;close:()=>void}) {
  const quiz=c.data!.quiz, batches=regularBatches(quiz);
  const [editing,setEditing]=useState<Round|null>(null),[creating,setCreating]=useState(false),[deleting,setDeleting]=useState<Round|null>(null);
  const disabled=c.busy||!c.online, locked=!["ready","judged","finished"].includes(quiz.game.phase);
  if (creating||editing) return <BatchEditor c={c} r={editing} close={()=>{setCreating(false);setEditing(null);}}/>;
  if (deleting) return <Modal title={`Hapus ${deleting.name}?`} subtitle="Penghapusan juga menghapus bank soal batch ini. Batch yang sudah memiliki progres tetap terkunci." onClose={()=>setDeleting(null)}>
    <div className="modal-body"><p className="settings-help">Batch lain, identitas grup, dan skor tetap tersedia. Anda dapat membuat batch baru setelah penghapusan.</p><FormError text={c.error}/></div>
    <div className="modal-actions"><button className="button secondary" onClick={()=>setDeleting(null)}>Batal</button><button className="button danger" disabled={disabled||locked} onClick={async()=>{if(await c.act({type:"deleteBatch",roundId:deleting.id,confirm:"HAPUS"})){setDeleting(null);c.setNotice("Batch berhasil dihapus.");}}}><Trash2 size={16}/> Hapus batch</button></div>
  </Modal>;
  return <Modal wide title="Kelola batch reguler" subtitle="Tambahkan paket soal, ubah nama dan pengaturan, lalu atur urutannya. Host tetap bebas memilih grup untuk setiap batch." onClose={close}>
    <div className="modal-body batch-manager">
      <div className="settings-toolbar"><span>{batches.length} batch · Maksimal {MAX_REGULAR_BATCHES}</span><button className="button primary small" disabled={disabled||locked||batches.length>=MAX_REGULAR_BATCHES} onClick={()=>setCreating(true)}><Plus size={16}/> Tambah batch</button></div>
      {locked&&<p className="warning-banner"><Info size={16}/> Selesaikan soal yang sedang berjalan sebelum mengubah batch.</p>}
      <div className="batch-manager-list">{batches.map((batch,i)=>{
        const reason=batchDeleteReason(quiz,batch);
        return <article className="batch-manager-row" key={batch.id}>
          <div className="batch-manager-title"><span className="settings-number">{i+1}</span><div><strong>{batch.name}</strong><small>Batch {batchNumber(batch)} · {batch.questions.length}/{batch.questionCount} soal · {batch.duration} detik · {batch.points} poin{batch.scoringMode==="question"?" bawaan":""}</small></div></div>
          <div className="settings-row-actions">
            <button className="icon-button" aria-label={`Naikkan ${batch.name}`} title="Naik satu urutan" disabled={disabled||locked||i===0} onClick={()=>c.act({type:"moveBatch",roundId:batch.id,direction:"up"})}><ArrowUp size={16}/></button>
            <button className="icon-button" aria-label={`Turunkan ${batch.name}`} title="Turun satu urutan" disabled={disabled||locked||i===batches.length-1} onClick={()=>c.act({type:"moveBatch",roundId:batch.id,direction:"down"})}><ArrowDown size={16}/></button>
            <button className="button secondary small" aria-label={`Ubah pengaturan ${batch.name}`} disabled={disabled||locked} onClick={()=>setEditing(structuredClone(batch))}><Pencil size={14}/> Ubah</button>
            <button className="icon-button danger-text" aria-label={`Hapus ${batch.name}`} title={reason||"Hapus batch dan bank soalnya"} disabled={disabled||!!reason} onClick={()=>setDeleting(batch)}><Trash2 size={16}/></button>
          </div>
          {reason&&<p className="batch-delete-note">{reason}</p>}
        </article>;
      })}</div>
      <p className="settings-help">Batch baru dapat memakai bank soal kosong atau menyalin soal dari batch lain. Lengkapi soal sebelum memulai. Perubahan urutan dan nama mempertahankan progres setiap grup.</p>
      <FormError text={c.error}/>
    </div>
    <div className="modal-actions"><a href="/admin" className="button secondary"><ExternalLink size={15}/> Buka Bank Soal</a><button className="button primary" onClick={close}>Selesai</button></div>
  </Modal>;
}

export function BatchEditor({c,r,close}:{c:QuizConnection;r:Round|null;close:()=>void}) {
  const batches=regularBatches(c.data!.quiz), next=Math.max(0,...batches.map(batchNumber))+1;
  const [v,setV]=useState<Pick<Round,"name"|"questionCount"|"duration"|"points"|"scoringMode">>(r??{name:`Babak Reguler · Batch ${next}`,questionCount:10,duration:30,points:10,scoringMode:"round"});
  const [template,setTemplate]=useState("");
  const disabled=c.busy||!c.online||!["ready","judged","finished"].includes(c.data!.quiz.game.phase);
  function update(key:string,value:unknown) { setV(x=>({...x,[key]:value})); }
  async function save(e:FormEvent) {
    e.preventDefault();
    const ok=await c.act(r?{type:"saveRound",round:{...v,id:r.id,order:r.order}}:{type:"createBatch",round:v,templateRoundId:template});
    if(ok){close();c.setNotice(r?"Pengaturan batch tersimpan.":"Batch baru tersimpan. Periksa soalnya melalui Bank Soal.");}
  }
  return <Modal title={r?"Ubah batch reguler":"Tambah batch reguler"} subtitle="Atur paket soal tanpa menetapkan grup pemilik. Host memilih grup saat kuis berlangsung." onClose={close}>
    <form onSubmit={save}>
      <div className="modal-body batch-editor-form">
        <label className="field">Nama batch<input required maxLength={80} value={v.name} onChange={e=>update("name",e.target.value)} placeholder="Contoh: Paket Nusantara" autoFocus/></label>
        {!r&&<label className="field">Bank soal awal<select value={template} onChange={e=>{setTemplate(e.target.value);const source=batches.find(b=>b.id===e.target.value);if(source)setV(x=>({...x,questionCount:source.questionCount,duration:source.duration,points:source.points,scoringMode:source.scoringMode}));}}><option value="">Kosong, isi melalui Bank Soal</option>{batches.map(b=><option key={b.id} value={b.id}>Salin dari {b.name} ({b.questions.length} soal)</option>)}</select><span className="field-hint">Salinan memiliki soal dan progres sendiri. Perubahan pada sumber tidak mengubah salinan.</span></label>}
        <div className="form-grid"><label className="field">Jumlah soal<input required type="number" min={1} max={100} value={v.questionCount} onChange={e=>update("questionCount",Number(e.target.value))}/></label><label className="field">Durasi menjawab dalam detik<input required type="number" min={1} max={600} value={v.duration} onChange={e=>update("duration",Number(e.target.value))}/></label></div>
        <div className="form-grid"><label className="field">Nilai awal soal<input required type="number" min={0} max={1000} value={v.points} onChange={e=>update("points",Number(e.target.value))}/></label><label className="field">Pengaturan nilai<select value={v.scoringMode} onChange={e=>update("scoringMode",e.target.value)}><option value="round">Sama untuk seluruh batch</option><option value="question">Atur nilai per soal</option></select></label></div>
        <p className="settings-help">Gunakan panah pada daftar batch untuk mengubah urutan. Kelola pertanyaan dan jawaban melalui Bank Soal.</p>
        <FormError text={c.error}/>
      </div>
      <div className="modal-actions"><button className="button secondary" type="button" onClick={close}>Kembali</button><button className="button primary" disabled={disabled}><Save size={16}/> Simpan batch</button></div>
    </form>
  </Modal>;
}

export function EventSettings({c,close}:{c:QuizConnection;close:()=>void}) {
 const [name,setName]=useState(eventName(c.data!.quiz));
 async function save(e:FormEvent){
  e.preventDefault();
  if(await c.act({type:"saveEventSettings",eventName:name})){
   close();c.setNotice("Nama acara tersimpan dan tampil di seluruh layar.");
  }
 }
 return <Modal title="Pengaturan acara" subtitle="Ubah nama acara pada navigasi, Arena, dan halaman buzzer." onClose={close}>
  <form onSubmit={save}>
   <div className="modal-body event-settings-form">
    <label className="field">Nama acara<input autoFocus required maxLength={MAX_EVENT_NAME_LENGTH} value={name} onChange={e=>setName(e.target.value)} placeholder="Contoh: Cerdas Cermat BGI"/></label>
    <p className="field-hint">Maksimal {MAX_EVENT_NAME_LENGTH} karakter. Nama acara tetap tersimpan saat kuis diulang.</p>
    <div className="event-name-preview"><span>PRATINJAU NAMA</span><strong>{name.trim()||"Nama acara"}</strong></div>
    <FormError text={c.error}/>
   </div>
   <div className="modal-actions"><button type="button" className="button secondary" onClick={close}>Batal</button><button className="button primary" disabled={c.busy||!c.online||!name.trim()}><Save size={16}/> Simpan nama acara</button></div>
  </form>
 </Modal>;
}
