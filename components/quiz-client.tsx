"use client";
import { useEffect, useRef, useState } from "react";
import { Expand, Volume2, VolumeX, ArrowUpRight, Mic2, Presentation, Radio, Music2 } from "lucide-react";
import { eventName } from "@/lib/engine";
import { ArenaAudio } from "@/lib/arena-audio";
import { Shell, useQuiz, Feedback, Loading, Stage, cx } from "./core";
import { CorrectionsScreen } from "./result-corrections";
import { HostScreen, AdminScreen, TeamsScreen, GuideScreen, BuzzerScreen } from "./screens";
export default function QuizApp({page="stage",teamId=""}:{page?:string;teamId?:string}){
 const admin=["host","admin","teams","corrections"].includes(page),c=useQuiz(admin),frame=useRef<HTMLDivElement>(null),audio=useRef<ArenaAudio|null>(null);
 const [sound,setSound]=useState(false),[unlocking,setUnlocking]=useState(false),[fullscreen,setFullscreen]=useState(false);
 const latest=useRef(c.data),unlockingRef=useRef(false);latest.current=c.data;
 const musicInput=useRef<HTMLInputElement>(null),musicBusy=useRef(false);
 const [musicName,setMusicName]=useState(""),[loadingMusic,setLoadingMusic]=useState(false);
 const title=eventName(c.data?.quiz??{});
 useEffect(()=>{document.title=`BGI ${title} | PT Bringin Gigantara`;},[title]);
 useEffect(()=>{const fn=()=>setFullscreen(!!document.fullscreenElement);document.addEventListener("fullscreenchange",fn);return()=>document.removeEventListener("fullscreenchange",fn);},[]);
 useEffect(()=>{if(c.data)audio.current?.observe(c.data,page==="stage"&&sound&&c.online);},[c.data,c.online,sound,page]);
 useEffect(()=>()=>{audio.current?.dispose();audio.current=null;},[]);
 async function toggleSound(){
  if(page!=="stage"||unlockingRef.current)return;
  if(sound){audio.current?.stop();setSound(false);return;}
  unlockingRef.current=true;setUnlocking(true);
  try{
   const player=audio.current??=new ArenaAudio(new AudioContext(),()=>{setSound(false);c.setError("Suara Arena terhenti. Periksa speaker dan izin suara browser, lalu klik Aktifkan Audio Arena lagi.");},undefined,()=>c.setNotice("Pilih MP3 perayaan di Arena untuk memutar lagu kemenangan. Suara buzzer, Benar, dan Salah tetap aktif."));
   if(latest.current)player.observe(latest.current,false);
   await player.activate();
   if(audio.current!==player)return;
   if(latest.current)player.observe(latest.current,false);
   setSound(true);c.setNotice("Audio Arena aktif. Suara kuis dan musik perayaan mengikuti perangkat Arena.");
  }catch{setSound(false);c.setError("Audio Arena belum aktif. Periksa speaker, izin suara browser, dan berkas MP3, lalu coba lagi.");}
  finally{unlockingRef.current=false;setUnlocking(false);}
 }
 async function chooseVictoryMusic(file?:File){
  const player=audio.current;if(!file||!player||!sound||musicBusy.current)return;
  if(!/\.mp3$/i.test(file.name)||file.size===0||file.size>20*1024*1024){c.setError("Pilih berkas MP3 berisi audio dengan ukuran maksimal 20 MB.");return;}
  musicBusy.current=true;setLoadingMusic(true);
  try{if(await player.setVictoryMusic(await file.arrayBuffer())){setMusicName(file.name);c.setNotice("Musik perayaan siap. Arena memutarnya saat host menetapkan juara.");}}
  catch{c.setError("Musik belum dapat dibuka. Pilih berkas MP3 yang dapat diputar pada perangkat ini.");}
  finally{musicBusy.current=false;setLoadingMusic(false);}
 }
 async function expand(){try{if(document.fullscreenElement)await document.exitFullscreen();else await frame.current?.requestFullscreen();}catch{c.setError("Browser tidak mendukung layar penuh. Gunakan tombol F11.");}}
 if(page==="buzzer")return <BuzzerScreen c={c} teamId={teamId}/>;
 return <Shell page={page} online={c.online} eventTitle={title}><main className={cx("main-content",page==="stage"&&"stage-page")}><Feedback c={c}/>{page==="guide"?<GuideScreen/>:!c.data?<Loading c={c} admin={admin}/>:page==="host"?<HostScreen c={c}/>:page==="corrections"?<CorrectionsScreen c={c}/>:page==="admin"?<AdminScreen c={c}/>:page==="teams"?<TeamsScreen c={c}/>:<><div className="stage-page-heading"><div><span className="eyebrow">LIVE EXPERIENCE</span><h1>Arena Kuis <span>/</span> <small>Layar panggung</small></h1></div><div className="stage-heading-meta"><span className="live-pill"><span className="status-dot"/> SESI {c.data.quiz.game.phase==="ready"?"SIAP":"BERLANGSUNG"}</span><span className="screen-ratio"><Presentation size={15}/> 16:9</span></div></div><div ref={frame} className={cx("arena-frame",fullscreen&&"is-fullscreen")}><Stage s={c.data} offset={c.offset}/>{fullscreen&&<button className="fullscreen-exit button subtle" onClick={expand}>Keluar layar penuh · Esc</button>}</div><div className="arena-toolbar"><div className="toolbar-description"><span className="toolbar-icon"><Radio size={18}/></span><div><strong>Satu panggung. Tiga tim. Semangat yang sama.</strong><span>Pandu jalannya kuis melalui panel pembawa acara.</span></div></div><div className="toolbar-buttons"><button className={cx("button subtle",sound&&"sound-on")} onClick={toggleSound} disabled={unlocking} aria-pressed={sound} title="Suara buzzer, Benar, dan Salah melalui speaker perangkat Arena">{sound?<Volume2 size={17}/>:<VolumeX size={17}/>}<span>{unlocking?"Menyiapkan audio…":sound?"Audio Arena aktif":"Aktifkan Audio Arena"}</span></button><button className="button secondary" onClick={expand}><Expand size={16}/><span>Layar penuh</span></button><a href="/host" className="button primary"><Mic2 size={17}/> Kontrol kuis <ArrowUpRight size={16}/></a></div></div><div className="arena-music-control"><div><Music2 size={18}/><span><strong>Musik perayaan juara</strong><small>{musicName||"Pilih MP3 We Are the Champions dari Queen sebelum host menetapkan juara."}</small><small>{sound?"Pilihan lagu berlaku selama tab ini terbuka. Pilih ulang setelah refresh.":"Aktifkan Audio Arena terlebih dahulu untuk memilih lagu."}</small></span></div><input ref={musicInput} type="file" accept=".mp3,audio/mpeg" hidden aria-label="Pilih MP3 musik perayaan" onChange={e=>{const file=e.target.files?.[0];e.target.value="";void chooseVictoryMusic(file);}}/><button className="button secondary" disabled={!sound||loadingMusic} onClick={()=>musicInput.current?.click()}><Music2 size={16}/>{loadingMusic?"Menyiapkan musik…":musicName?"Ganti MP3 perayaan":"Pilih MP3 perayaan"}</button></div><div className="stage-footnote"><span><span className="status-dot"/> Soal dan skor tersinkron otomatis</span><span>Aktifkan Audio Arena sekali. Hubungkan speaker ke perangkat yang membuka Arena.</span></div></> }</main></Shell>;
}
