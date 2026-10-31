import type { Quiz, Question } from "./engine";
const regular: [string,string,string,string[]?][] = [
  ["Apa kepanjangan nama perusahaan BGI?", "PT Bringin Gigantara", "BGI"],
  ["Apa nama perangkat yang menghubungkan beberapa jaringan komputer?", "Router", "Teknologi", ["Router", "Monitor", "Keyboard", "Printer"]],
  ["Pada tanggal berapa Indonesia memproklamasikan kemerdekaannya?", "17 Agustus 1945", "Indonesia"],
  ["Apa nama proses mengubah data menjadi bentuk yang hanya dapat dibaca dengan kunci tertentu?", "Enkripsi", "Teknologi"],
  ["Berapa hasil dari 36 × 5?", "180", "Matematika"],
  ["Apa kepanjangan dari CPU?", "Central Processing Unit", "Teknologi"],
  ["Apa nama dasar negara Republik Indonesia?", "Pancasila", "Indonesia"],
  ["Apa istilah untuk salinan data yang disimpan agar data dapat dipulihkan?", "Backup", "Teknologi", ["Cache", "Backup", "Cookie", "Browser"]],
  ["Berapa jumlah sisi pada bangun segi enam?", "6", "Matematika"],
  ["Lengkapi tema acara: Bersama, Melangkah Lebih ...", "Kuat", "BGI"]
];
const regularB: typeof regular = [
  ["Lengkapi tema acara: Satu Tujuan, Satu Tim untuk ...", "Indonesia", "BGI"],
  ["Apa nama perangkat untuk mencetak dokumen dari komputer ke kertas?", "Printer", "Teknologi", ["Printer", "Router", "Monitor", "Mikrofon"]],
  ["Apa nama ibu kota Provinsi Jawa Timur?", "Surabaya", "Indonesia"],
  ["Apa istilah proses memeriksa identitas pengguna sebelum masuk ke aplikasi?", "Autentikasi", "Teknologi"],
  ["Berapa hasil dari 24 × 5?", "120", "Matematika"],
  ["Apa kepanjangan dari RAM?", "Random Access Memory", "Teknologi"],
  ["Berapa jumlah sila dalam Pancasila?", "5", "Indonesia"],
  ["Apa nama perangkat lunak untuk membuka situs web?", "Browser", "Teknologi", ["Browser", "Folder", "Database", "Spreadsheet"]],
  ["Berapa jumlah sudut pada bangun persegi panjang?", "4", "Matematika"],
  ["Apa dua warna pada bendera negara Indonesia?", "Merah dan putih", "Indonesia"]
];
const regularC: typeof regular = [
  ["Berapa usia BGI yang dirayakan dalam acara kuis ini?", "36 tahun", "BGI"],
  ["Apa nama perangkat komputer untuk mengetik teks?", "Keyboard", "Teknologi", ["Keyboard", "Monitor", "Speaker", "Printer"]],
  ["Di pulau manakah Kota Surabaya berada?", "Jawa", "Indonesia"],
  ["Apa istilah untuk pemberian hak akses kepada pengguna dalam aplikasi?", "Otorisasi", "Teknologi"],
  ["Berapa hasil dari 18 × 5?", "90", "Matematika"],
  ["Apa kepanjangan dari USB?", "Universal Serial Bus", "Teknologi"],
  ["Apa nama lambang negara Indonesia?", "Garuda Pancasila", "Indonesia"],
  ["Apa istilah untuk kumpulan data terstruktur yang dikelola oleh sistem?", "Database", "Teknologi", ["Database", "Browser", "Keyboard", "Monitor"]],
  ["Berapa jumlah sisi pada bangun segitiga?", "3", "Matematika"],
  ["Berapa jumlah bulan dalam satu tahun?", "12", "Pengetahuan umum"]
];
const scramble: [string,string,string,string[]?][] = [
  ["Planet apakah yang dikenal sebagai Planet Merah?", "Mars", "Pengetahuan umum", ["Venus", "Mars", "Jupiter", "Saturnus"]],
  ["Berapa jumlah bit dalam satu byte?", "8", "Teknologi"],
  ["Apa nama samudra terluas di dunia?", "Samudra Pasifik", "Pengetahuan umum"],
  ["Apa kepanjangan dari URL?", "Uniform Resource Locator", "Teknologi"],
  ["Siapa pencipta lagu Indonesia Raya?", "Wage Rudolf Supratman", "Indonesia"],
  ["Jika 3 tim masing-masing memiliki 3 peserta, berapa jumlah seluruh peserta?", "9", "Matematika"],
  ["Apa nama protokol untuk mengakses situs web melalui koneksi terenkripsi?", "HTTPS", "Teknologi", ["HTTP", "FTP", "HTTPS", "SMTP"]],
  ["Apa nama semboyan persatuan yang tertera pada lambang Garuda Pancasila?", "Bhinneka Tunggal Ika", "Indonesia"],
  ["Apa nama satuan dasar kuat arus listrik dalam SI?", "Ampere", "Pengetahuan umum"],
  ["Berapa hasil dari 144 dibagi 12?", "12", "Matematika"]
];
function questions(data: typeof regular, prefix: string): Question[] { return data.map(([text,answer,category,options],i) => ({ id:`${prefix}-${i+1}`,number:i+1,text,answer,category,options:options??[],points:10,duration:null,notes:i===0?"Bacakan pertanyaan dengan jelas. Terima jawaban dengan makna yang sama.":"Terima jawaban dengan makna yang sama." })); }
export function seedQuiz(): Quiz {
  return { schemaVersion:3,eventName:"Quiz Night", sound:true, rounds:[
    {id:"reguler",type:"reguler",batchNumber:1,name:"Babak Reguler · Batch 1",order:1,questionCount:10,duration:30,points:10,scoringMode:"round",questions:questions(regular,"reg")},
    {id:"reguler-b",type:"reguler",batchNumber:2,name:"Babak Reguler · Batch 2",order:2,questionCount:10,duration:30,points:10,scoringMode:"round",questions:questions(regularB,"reg-b")},
    {id:"reguler-c",type:"reguler",batchNumber:3,name:"Babak Reguler · Batch 3",order:3,questionCount:10,duration:30,points:10,scoringMode:"round",questions:questions(regularC,"reg-c")},
    {id:"rebutan",type:"rebutan",name:"Babak Rebutan",order:4,questionCount:10,duration:20,points:10,scoringMode:"round",questions:questions(scramble,"reb")}
  ],teams:(["A","B","C"] as const).map(id => ({id,name:`Grup ${id}`,photo:"",participants:"",score:0,key:crypto.randomUUID()+crypto.randomUUID()})),game:{answerVisible:false,roundId:"reguler",index:0,selectedTeam:null,activeTeam:null,phase:"ready",deadline:null,remaining:null,openedAt:null,epoch:crypto.randomUUID(),buzzes:[],feedback:null,progress:{},sessionId:crypto.randomUUID()},results:[] };
}
