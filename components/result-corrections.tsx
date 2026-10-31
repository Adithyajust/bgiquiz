"use client";

import { useState, type FormEvent } from "react";
import { Download, Info, ListChecks, Pencil, Save, Search } from "lucide-react";
import { resultPossiblePoints, type Result, type Snapshot } from "@/lib/engine";
import { Modal, PageTitle, cx, type QuizConnection } from "./core";

const time = (at: number) => new Date(at).toLocaleString("id-ID", { timeZone: "Asia/Jakarta", hour12: false });
export function resultsCsv(s: Snapshot) {
  const rows = [["Babak", "Pertanyaan", "Grup", "Hasil", "Poin", "Waktu", "Nilai jawaban benar", "Jumlah koreksi", "Waktu koreksi", "Alasan koreksi terakhir"],
    ...s.quiz.results.map(r => [r.round, r.question, s.quiz.teams.find(t => t.id === r.teamId)?.name ?? r.teamId,
      r.correct ? "Benar" : "Salah", String(r.points), new Date(r.at).toISOString(), String(resultPossiblePoints(r) ?? ""),
      String(r.correction?.count ?? 0), r.correction ? new Date(r.correction.at).toISOString() : "", r.correction?.reason ?? ""])];
  return "\uFEFF" + rows.map(row => row.map(value => '"' + (/^[=+@-]/.test(value) ? "'" : "") + value.replaceAll('"', '""') + '"').join(",")).join("\r\n");
}
function downloadResults(s: Snapshot) {
  const url = URL.createObjectURL(new Blob([resultsCsv(s)], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a"); a.href = url; a.download = "hasil-kuis-bgi.csv"; a.click(); URL.revokeObjectURL(url);
}
function ResultTable({ rows, c, edit }: { rows: Result[]; c: QuizConnection; edit: (r: Result) => void }) {
  return <div className="history-table result-table"><table><thead><tr><th>Grup</th><th>Pertanyaan dan babak</th><th>Hasil</th><th>Poin</th><th>Koreksi</th></tr></thead><tbody>{rows.map(r => <tr key={r.id}>
    <td><span className={cx("small-team", `color-${r.teamId}`)}>{c.data!.quiz.teams.find(t => t.id === r.teamId)?.name}</span></td>
    <td className="result-question"><strong>{r.question}</strong><small>{r.round} · {time(r.at)} WIB</small>{r.correction && <small className="result-correction-note">Koreksi {r.correction.count} kali · {time(r.correction.at)} WIB<br/>{r.correction.reason}</small>}</td>
    <td><span className={cx("result-badge", r.correct && "correct")}>{r.correct ? "Benar" : "Salah"}</span></td>
    <td className="tabular">+{r.points}</td>
    <td><button className="button secondary small" disabled={c.busy || !c.online} onClick={() => edit(structuredClone(r))} aria-label={`Koreksi penilaian ${c.data!.quiz.teams.find(t => t.id === r.teamId)?.name} untuk ${r.question}`}><Pencil size={14}/> Koreksi</button></td>
  </tr>)}</tbody></table></div>;
}

export function CorrectionForm({ result, c, close }: { result: Result; c: QuizConnection; close: () => void }) {
  const [correct, setCorrect] = useState(!result.correct), [reason, setReason] = useState(""), [legacyPoints, setLegacyPoints] = useState("");
  const team = c.data!.quiz.teams.find(t => t.id === result.teamId)!;
  const live = c.data!.quiz.results.find(r => r.id === result.id);
  const stale = !live || live.correct !== result.correct || live.points !== result.points || (live.correction?.count ?? 0) !== (result.correction?.count ?? 0);
  const fixedPoints = resultPossiblePoints(result), possiblePoints = fixedPoints ?? (legacyPoints === "" ? null : Number(legacyPoints));
  const validPoints = possiblePoints !== null && Number.isInteger(possiblePoints) && possiblePoints >= 0 && possiblePoints <= 1000;
  const nextPoints = correct ? possiblePoints : 0;
  const delta = nextPoints === null ? null : nextPoints - result.points;
  async function save(e: FormEvent) {
    e.preventDefault();
    if (stale || !validPoints || correct === result.correct || !reason.trim()) return;
    if (await c.act({ type: "correctResult", resultId: result.id, correct, reason: reason.trim(),
      expectedCorrect: result.correct, expectedPoints: result.points, expectedCorrectionCount: result.correction?.count ?? 0,
      ...(fixedPoints === null ? { possiblePoints } : {}) })) {
      close(); c.setNotice(`Koreksi ${team.name} tersimpan. Hasil menjadi ${correct ? "Benar" : "Salah"} dan skor Arena sudah disesuaikan.${c.data!.quiz.championship?" Tetapkan juara ulang melalui Kontrol Kuis.":""}`);
    }
  }
  return <Modal title="Koreksi penilaian" subtitle="Periksa soal dan grup, lalu konfirmasikan hasil yang benar." onClose={close}><form onSubmit={save}>
    <div className="modal-body correction-form">
      <p className="correction-context"><strong>{team.name}</strong><span>{result.round} · {time(result.at)} WIB</span></p>
      <p>{result.question}</p>
      <p>Hasil saat ini: <strong>{result.correct ? "Benar" : "Salah"} · +{result.points} poin</strong></p>
      <label className="field">Hasil yang benar<select value={correct ? "correct" : "wrong"} onChange={e => setCorrect(e.target.value === "correct")}><option value="correct">Benar</option><option value="wrong">Salah</option></select></label>
      {fixedPoints === null ? <label className="field">Nilai jawaban benar untuk hasil lama<input type="number" min={0} max={1000} required value={legacyPoints} onChange={e => setLegacyPoints(e.target.value)} placeholder="Isi nilai soal saat pertama dimainkan"/><span className="field-hint">Versi lama tidak mencatat nilai soal saat jawaban Salah. Konfirmasikan nilai aslinya. Aplikasi akan menyimpannya untuk koreksi berikutnya.</span></label> : <p className="settings-help">Nilai jawaban benar: <strong>{fixedPoints} poin</strong>, mengikuti nilai saat penilaian awal.</p>}
      <label className="field">Alasan koreksi<textarea required rows={2} maxLength={500} value={reason} onChange={e => setReason(e.target.value)} placeholder="Contoh: Host salah menekan Salah, jawaban peserta seharusnya Benar."/></label>
      <p className="correction-score" role="status">Skor {team.name}: <strong>{team.score} → {validPoints && delta !== null ? team.score + delta : "…"} poin</strong>{validPoints && delta !== null && <span>{delta >= 0 ? "+" : ""}{delta} poin dari koreksi ini</span>}</p>
      <p className="settings-help">Koreksi memperbarui hasil dan selisih skor. Soal aktif, progres, serta timer tetap berjalan sesuai statusnya. Jeda timer melalui Kontrol Kuis bila perlu.</p>
      {stale && <p className="field-error" role="alert"><Info size={15}/> Hasil telah berubah atau sesi sudah direset. Tutup form lalu buka kembali hasil terbaru.</p>}
      {c.error && <p className="field-error" role="alert"><Info size={15}/>{c.error}</p>}
    </div>
    <div className="modal-actions"><button type="button" className="button secondary" onClick={close}>Batal</button><button className="button primary" disabled={c.busy || !c.online || stale || !validPoints || correct === result.correct || !reason.trim()}><Save size={16}/> Simpan koreksi</button></div>
  </form></Modal>;
}

export function ResultHistory({ c, showAll = false, onShowAll = () => {}, onCloseAll = () => {}, standalone = false }: { c: QuizConnection; showAll?: boolean; onShowAll?: () => void; onCloseAll?: () => void; standalone?: boolean }) {
  const [editing, setEditing] = useState<Result | null>(null), [search, setSearch] = useState(""), [teamId, setTeamId] = useState("");
  const results = [...c.data!.quiz.results].reverse(), query = search.trim().toLocaleLowerCase("id-ID");
  const filtered = results.filter(r => (!teamId || r.teamId === teamId) && (!query || `${r.question} ${r.round} ${c.data!.quiz.teams.find(t => t.id === r.teamId)?.name}`.toLocaleLowerCase("id-ID").includes(query)));
  function edit(r: Result) { c.setError(""); setEditing(r); }
  const contents = <>
    <div className="result-history-filters"><label className="search-box"><Search size={16}/><input aria-label="Cari hasil penilaian" value={search} onChange={e => setSearch(e.target.value)} placeholder="Cari soal, batch, atau grup…"/></label><label className="field">Grup<select value={teamId} onChange={e => setTeamId(e.target.value)}><option value="">Semua grup</option>{c.data!.quiz.teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label></div>
    <p className="settings-help">{filtered.length} dari {results.length} hasil. Koreksi berlaku pada reguler dan rebutan, termasuk setelah berpindah soal. Alasan dan perubahan skor masuk ke catatan koreksi server.</p>
    {filtered.length ? <ResultTable rows={filtered} c={c} edit={edit}/> : results.length ? <p className="empty-history">Tidak ada hasil yang sesuai.</p> : <div className="empty-history"><strong>Belum ada hasil untuk dikoreksi.</strong><p>Beri penilaian Benar atau Salah pada satu soal melalui Kontrol Kuis. Setelah itu, hasil akan muncul di halaman ini.</p><a className="button secondary" href="/host">Buka Kontrol Kuis</a></div>}
  </>;
  return <>
    <section className="panel history-panel"><div className="panel-heading result-history-heading"><h2><ListChecks size={17}/> {standalone ? "Daftar hasil sesi" : "Riwayat penilaian"}</h2><div className="result-history-actions">{!standalone && <button className="button secondary small" onClick={onShowAll}><Pencil size={14}/> Semua hasil & koreksi</button>}<button className="text-button" disabled={!results.length} onClick={() => downloadResults(c.data!)}><Download size={14}/> Ekspor hasil</button></div></div>
      {standalone ? <div className="corrections-page-body">{contents}</div> : results.length ? <><ResultTable rows={results.slice(0, 5)} c={c} edit={edit}/><p className="history-summary">Menampilkan {Math.min(5, results.length)} dari {results.length} hasil. Gunakan menu Koreksi Nilai untuk mencari hasil yang lebih lama.</p></> : <div className="empty-history">Belum ada jawaban yang dinilai. Riwayat akan muncul setelah penilaian pertama.</div>}
    </section>
    {editing ? <CorrectionForm key={editing.id} result={editing} c={c} close={() => setEditing(null)}/> : showAll && !standalone && <Modal wide title="Koreksi penilaian" subtitle="Cari hasil sesi ini, lalu klik Koreksi pada soal yang ingin diperbaiki." onClose={onCloseAll}>
      <div className="modal-body result-history-modal">{contents}</div><div className="modal-actions"><button className="button secondary" onClick={() => downloadResults(c.data!)} disabled={!results.length}><Download size={15}/> Ekspor hasil terbaru</button><button className="button primary" onClick={onCloseAll}>Selesai</button></div>
    </Modal>}
  </>;
}

export function CorrectionsScreen({ c }: { c: QuizConnection }) {
  return <><PageTitle eyebrow="KOREKSI NILAI" title="Koreksi penilaian" description="Pilih hasil yang ingin diperbaiki. Aplikasi menyesuaikan selisih poin dan skor Arena setelah Anda menyimpan koreksi." actions={<a className="button secondary" href="/host">Kembali ke Kontrol Kuis</a>}/><ResultHistory c={c} standalone/></>;
}
