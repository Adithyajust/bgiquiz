"use client";
import { Volume2, VolumeX } from "lucide-react";
import type { QuizSound } from "@/lib/buzzer-audio";

export function AudioControls({enabled,starting,host=false,onToggle,onPreview}:{
  enabled:boolean;starting:boolean;host?:boolean;
  onToggle:()=>void;onPreview:(sound:QuizSound)=>void;
}){
  return <section className="panel" aria-label={host?"Audio Host":"Uji suara Arena"} style={{display:"flex",flexWrap:"wrap",alignItems:"center",justifyContent:"space-between",gap:16,padding:16,marginBottom:20}}>
    <div><strong>{host?"Audio Host":"Uji suara Arena"}</strong><p style={{margin:"4px 0 0",fontSize:13}}>Aktifkan suara pada satu halaman yang terhubung ke speaker. Tombol uji juga mengaktifkan audio.</p></div>
    <div style={{display:"flex",flexWrap:"wrap",alignItems:"center",gap:8}}>
      {host&&<button className="button secondary" onClick={onToggle} disabled={starting} aria-pressed={enabled}>{enabled?<Volume2 size={16}/>:<VolumeX size={16}/>} {starting?"Menyiapkan audio…":`Audio Host ${enabled?"aktif":"nonaktif"}`}</button>}
      <button className="button subtle" aria-label="Uji suara buzzer" title="bunyi_buzer.mp3" disabled={starting} onClick={()=>onPreview("buzzer")}>Uji buzzer</button>
      <button className="button secondary" aria-label="Uji suara Benar" title="benar.mp3" disabled={starting} onClick={()=>onPreview("correct")}>Uji Benar</button>
      <button className="button secondary" aria-label="Uji suara Salah" title="salah.mp3" disabled={starting} onClick={()=>onPreview("wrong")}>Uji Salah</button>
    </div>
  </section>;
}
