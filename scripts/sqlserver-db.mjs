import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
const requireRoot = createRequire(import.meta.url);
const nextRequire = createRequire(requireRoot.resolve('next/package.json'));
const nextEnv = nextRequire('@next/env');
import { sqlServerConfig } from './mssql-config.mjs';
nextEnv.loadEnvConfig(process.cwd(), process.env.NODE_ENV !== 'production');
const command = process.argv[2] ?? 'check';
if (!['check', 'init'].includes(command)) throw new Error('Gunakan check atau init.');
let pool;
try {
  const requireDriver = createRequire(resolve(process.cwd(), 'drivers/sqlserver/package.json'));
  let sql;
  try { sql = requireDriver('mssql'); } catch { throw new Error('Driver SQL Server belum tersedia. Jalankan pnpm db:driver pada server Next.js.'); }
  pool = await new sql.ConnectionPool(sqlServerConfig()).connect();
  if (command === 'init') {
    await pool.request().batch(readFileSync(new URL('../sql/sqlserver/001_schema.sql', import.meta.url), 'utf8'));
    await pool.request().batch(readFileSync(new URL('../sql/sqlserver/002_relational_schema.sql', import.meta.url), 'utf8'));
    await pool.request().batch(readFileSync(new URL('../sql/sqlserver/005_event_answer_settings.sql', import.meta.url), 'utf8'));
    await pool.request().batch(readFileSync(new URL('../sql/sqlserver/006_result_corrections.sql', import.meta.url), 'utf8'));
    await pool.request().batch(readFileSync(new URL('../sql/sqlserver/007_championship.sql', import.meta.url), 'utf8'));
    await pool.request().batch(readFileSync(new URL('../sql/sqlserver/008_round_participation.sql', import.meta.url), 'utf8'));
    console.log('Skema relasional siap. Dokumen lama akan diarsipkan dan dipindahkan saat aplikasi pertama membaca kuis.');
  }
  const tables = ['quiz_rooms', 'quiz_events', 'quiz_owners', 'quiz_settings', 'quiz_teams', 'quiz_team_scores',
    'quiz_rounds', 'quiz_questions', 'quiz_question_options', 'quiz_game_state', 'quiz_progress', 'quiz_buzzes', 'quiz_results', 'quiz_legacy_snapshots', 'quiz_championships', 'quiz_round_exclusions'];
  const result = await pool.request().query(`SELECT DB_NAME() AS database_name,
    CASE WHEN ${tables.map(t => `OBJECT_ID(N'dbo.${t}', N'U') IS NOT NULL`).join(' AND ')}
      AND COL_LENGTH('dbo.quiz_rooms', 'storage_version') IS NOT NULL
      AND COL_LENGTH('dbo.quiz_settings', 'event_name') IS NOT NULL
      AND COL_LENGTH('dbo.quiz_game_state', 'answer_visible') IS NOT NULL
      AND COL_LENGTH('dbo.quiz_results', 'possible_points') IS NOT NULL
      AND COL_LENGTH('dbo.quiz_results', 'correction_count') IS NOT NULL
      AND COL_LENGTH('dbo.quiz_results', 'corrected_at') IS NOT NULL
      AND COL_LENGTH('dbo.quiz_results', 'correction_reason') IS NOT NULL THEN 1 ELSE 0 END AS schema_ready,
    (SELECT compatibility_level FROM sys.databases WHERE name = DB_NAME()) AS compatibility_level`);
  if (!result.recordset[0]?.schema_ready) throw new Error('Skema relasional belum lengkap. Jalankan pnpm db:init atau skrip 001, 002, 005, 006, 007, dan 008 melalui SSMS pada database kuis.');
  if (result.recordset[0].compatibility_level < 130) throw new Error('Database memerlukan compatibility level minimal 130.');
  const state = await pool.request().query('SELECT storage_version FROM dbo.quiz_rooms WHERE id = N\'main\'');
  if (state.recordset[0]?.storage_version === 1) console.log('Data lama terdeteksi. Jalankan aplikasi dan buka /host untuk melakukan migrasi atomik.');
  else if (state.recordset[0] && state.recordset[0].storage_version !== 2) throw new Error('Versi penyimpanan database tidak didukung aplikasi ini.');
  console.log(`Koneksi dan ${tables.length} tabel kuis berhasil diperiksa. Pemeriksaan ini belum menjalankan skenario permainan.`);
} catch (error) {
  // Driver errors may contain connection details. Configuration errors are safe;
  // do not print a connection string, password, or complete driver diagnostics.
  if (error && typeof error === 'object' && 'code' in error) console.error(`Pemeriksaan SQL Server gagal (${error.code}). Periksa server, autentikasi, izin, dan TLS.`);
  else console.error(error instanceof Error ? error.message : 'Pemeriksaan SQL Server gagal.');
  process.exitCode = 1;
} finally {
  await pool?.close();
}
