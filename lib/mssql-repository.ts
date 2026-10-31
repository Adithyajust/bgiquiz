import { loadSqlServerDriver, type SqlDriver, type SqlPool, type SqlTransaction } from "./mssql-driver";
import type { Quiz } from "./engine";
import type { QuizRepository, QuizCommit, StoredQuizEvent } from "./persistence";
import { emptyQuizRows, jsonColumns, keyJoin, quizTables, quizToRows, rowChanges, rowsToQuiz, type QuizRows, type SqlRow } from "./relational-quiz";
import { sqlServerConfig } from "../scripts/mssql-config.mjs";

type Header = { id: string; document: string | null; revision: number; updated_at: number | string; storage_version: number };
const room = "main";
// Run before any SELECT of the new table; existing game columns are unchanged.
export const CHAMPIONSHIP_SCHEMA_SQL = `IF OBJECT_ID(N'dbo.quiz_championships', N'U') IS NULL
BEGIN
  BEGIN TRY
    CREATE TABLE dbo.quiz_championships (
      room_id nvarchar(40) NOT NULL PRIMARY KEY,
      session_id nvarchar(128) NOT NULL,
      declared_at bigint NOT NULL,
      team_ids nvarchar(30) NOT NULL,
      final_score int NOT NULL CHECK (final_score >= 0),
      CONSTRAINT FK_quiz_championships_room FOREIGN KEY (room_id) REFERENCES dbo.quiz_rooms(id),
      CONSTRAINT CK_quiz_championships_json CHECK (ISJSON(team_ids) = 1)
    );
  END TRY
  BEGIN CATCH
    IF ERROR_NUMBER() <> 2714 OR OBJECT_ID(N'dbo.quiz_championships', N'U') IS NULL THROW;
  END CATCH
END;`;
export const ROUND_EXCLUSIONS_SCHEMA_SQL = `IF OBJECT_ID(N'dbo.quiz_round_exclusions', N'U') IS NULL
BEGIN
  BEGIN TRY
    CREATE TABLE dbo.quiz_round_exclusions (
      room_id nvarchar(40) NOT NULL,
      round_id nvarchar(128) NOT NULL,
      session_id nvarchar(128) NOT NULL,
      CONSTRAINT PK_quiz_round_exclusions PRIMARY KEY (room_id, round_id),
      CONSTRAINT FK_quiz_round_exclusions_room FOREIGN KEY (room_id) REFERENCES dbo.quiz_rooms(id),
      CONSTRAINT FK_quiz_round_exclusions_round FOREIGN KEY (room_id, round_id) REFERENCES dbo.quiz_rounds(room_id, id)
    );
  END TRY
  BEGIN CATCH
    IF ERROR_NUMBER() <> 2714 OR OBJECT_ID(N'dbo.quiz_round_exclusions', N'U') IS NULL THROW;
  END CATCH
END;`;
export async function ensureChampionshipTable(pool: SqlPool, driver: SqlDriver) {
  await new driver.Request(pool).query(CHAMPIONSHIP_SCHEMA_SQL);
  await new driver.Request(pool).query(ROUND_EXCLUSIONS_SCHEMA_SQL);
}

export function sqlServerRepository(pool: SqlPool, driver: SqlDriver): QuizRepository {
  const request = (connection: SqlPool | SqlTransaction) => new driver.Request(connection);
  const scoped = (connection: SqlPool | SqlTransaction) => request(connection).input("room", driver.NVarChar(40), room);
  async function transaction<T>(work: (tx: SqlTransaction) => Promise<T>): Promise<T> {
    const tx = new driver.Transaction(pool);
    let began = false, rolledBack = false;
    tx.on("rollback", () => { rolledBack = true; });
    try {
      await tx.begin(driver.ISOLATION_LEVEL.READ_COMMITTED);
      began = true;
      const result = await work(tx);
      await tx.commit();
      return result;
    } catch (error) {
      if (began && !rolledBack) await tx.rollback().catch(() => undefined);
      throw error;
    }
  }
  async function readTables(tx: SqlTransaction) {
    // Every application writer locks this parent first. HOLDLOCK keeps a shared
    // parent lock until commit, so one read cannot combine different revisions.
    const result = await scoped(tx).query<Header>(`SELECT id, document, revision, updated_at, storage_version
      FROM dbo.quiz_rooms WITH (HOLDLOCK) WHERE id = @room;
      ${quizTables.map(t => `SELECT ${Object.keys(t.columns).map(c => `[${c}]`).join(", ")} FROM dbo.[${t.name}] WHERE room_id = @room;`).join("\n")}`);
    const header = result.recordset[0] ?? null;
    const rows = emptyQuizRows();
    if (header?.storage_version === 2) {
      if (!result.recordsets || result.recordsets.length !== quizTables.length + 1) throw new Error("Hasil pembacaan tabel SQL Server tidak lengkap.");
      quizTables.forEach((t, i) => { rows[t.name] = result.recordsets![i + 1] as SqlRow[]; });
    }
    return { header, rows };
  }
  async function writeTables(tx: SqlTransaction, before: QuizRows, after: QuizRows) {
    const changes = rowChanges(before, after);
    // Detach the singleton before deleting its old active batch. Reinsert it
    // after the new parent exists. Other FK children follow reverse table order.
    const oldGame = before.quiz_game_state[0], newGame = after.quiz_game_state[0];
    if (oldGame && newGame && oldGame.round_id !== newGame.round_id) {
      const state = changes.find(c => c.table.name === "quiz_game_state")!;
      state.deleted = [oldGame]; state.changed = [newGame];
    }
    for (const { table, deleted } of [...changes].reverse()) {
      if (!deleted.length) continue;
      await scoped(tx).input("rows", driver.NVarChar(driver.MAX), JSON.stringify(deleted)).query(
        `DELETE target FROM dbo.[${table.name}] AS target
         INNER JOIN OPENJSON(@rows) WITH (${jsonColumns(table)}) AS source ON ${keyJoin(table, "target", "source")}
         WHERE target.room_id = @room;`);
    }
    for (const { table, changed } of changes) {
      if (!changed.length) continue;
      const columns = Object.keys(table.columns), values = columns.filter(c => !table.keys.includes(c));
      const update = values.length ? `UPDATE target SET ${values.map(c => `[${c}] = source.[${c}]`).join(", ")}
        FROM dbo.[${table.name}] AS target INNER JOIN OPENJSON(@rows) WITH (${jsonColumns(table)}) AS source
        ON ${keyJoin(table, "target", "source")} WHERE target.room_id = @room;` : "";
      await scoped(tx).input("rows", driver.NVarChar(driver.MAX), JSON.stringify(changed)).query(
        `${update}
         INSERT INTO dbo.[${table.name}] (${columns.map(c => `[${c}]`).join(", ")})
         SELECT ${columns.map(c => `source.[${c}]`).join(", ")} FROM OPENJSON(@rows) WITH (${jsonColumns(table)}) AS source
         WHERE source.room_id = @room AND NOT EXISTS (SELECT 1 FROM dbo.[${table.name}] AS target WHERE ${keyJoin(table, "target", "source")});`);
    }
  }
  async function migrateLegacy() {
    await transaction(async tx => {
      const result = await scoped(tx).query<Header>(`SELECT id, document, revision, updated_at, storage_version
        FROM dbo.quiz_rooms WITH (UPDLOCK, HOLDLOCK) WHERE id = @room;`);
      const row = result.recordset[0];
      if (!row || row.storage_version === 2) return;
      if (row.storage_version !== 1 || !row.document) throw new Error("Versi penyimpanan kuis tidak dikenali. Periksa cadangan database.");
      await scoped(tx).query(`IF ${quizTables.map(t => `EXISTS (SELECT 1 FROM dbo.[${t.name}] WHERE room_id = @room)`).join(" OR ")}
        THROW 51000, 'Relational rows already exist for a legacy room. Review the database before migration.', 1;`);
      const quiz = JSON.parse(row.document) as Quiz;
      // Engine schema upgrades still run through the existing audited loadQuiz.
      const converted = quizToRows(quiz, room);
      rowsToQuiz(converted);
      await scoped(tx).input("revision", driver.Int, row.revision)
        .input("document", driver.NVarChar(driver.MAX), row.document).input("at", driver.BigInt, Date.now())
        .query(`INSERT INTO dbo.quiz_legacy_snapshots (room_id, revision, document, archived_at)
          VALUES (@room, @revision, @document, @at);`);
      await writeTables(tx, emptyQuizRows(), converted);
      await scoped(tx).query(`UPDATE dbo.quiz_rooms SET document = NULL, storage_version = 2 WHERE id = @room;`);
    });
  }
  const repository: QuizRepository = {
    async read() {
      const { header, rows } = await transaction(readTables);
      if (!header) return null;
      if (header.storage_version === 1) {
        // Release the shared lock before acquiring a migration update lock.
        await migrateLegacy();
        return repository.read();
      }
      if (header.storage_version !== 2) throw new Error("Versi penyimpanan kuis lebih baru. Gunakan aplikasi yang sesuai.");
      return { document: JSON.stringify(rowsToQuiz(rows)), revision: header.revision };
    },
    async initialize(document, at) {
      const rows = quizToRows(JSON.parse(document) as Quiz, room);
      await transaction(async tx => {
        const result = await scoped(tx).input("at", driver.BigInt, at).query<{ created: number }>(
          `IF NOT EXISTS (SELECT 1 FROM dbo.quiz_rooms WITH (UPDLOCK, HOLDLOCK) WHERE id = @room)
           BEGIN
             INSERT INTO dbo.quiz_rooms (id, document, revision, updated_at, storage_version) VALUES (@room, NULL, 0, @at, 2);
             SELECT 1 AS created;
           END ELSE SELECT 0 AS created;`);
        if (result.recordset[0]?.created === 1) await writeTables(tx, emptyQuizRows(), rows);
      });
    },
    async readRecentEvents(maxRevision) {
      const result = await request(pool).input("maxRevision", driver.Int, maxRevision)
        .input("minRevision", driver.Int, Math.max(0, maxRevision - 64))
        .query<StoredQuizEvent>("SELECT TOP (32) id, revision, kind, payload, created_at FROM dbo.quiz_events WHERE revision <= @maxRevision AND revision > @minRevision AND kind IN ('buzz', 'judge') ORDER BY revision DESC");
      return result.recordset;
    },
    async getOwner() {
      const result = await scoped(pool).query<{ user_id: string }>("SELECT user_id FROM dbo.quiz_owners WHERE id = @room");
      return result.recordset[0]?.user_id ?? null;
    },
    async claimOwner(userId, at) {
      await transaction(async tx => {
        await scoped(tx).input("userId", driver.NVarChar(256), userId).input("at", driver.BigInt, at)
          .query(`IF NOT EXISTS (SELECT 1 FROM dbo.quiz_owners WITH (UPDLOCK, HOLDLOCK) WHERE id = @room)
                    INSERT INTO dbo.quiz_owners (id, user_id, created_at) VALUES (@room, @userId, @at);`);
      });
    },
    async compareAndSwap(change: QuizCommit) {
      const after = quizToRows(JSON.parse(change.document) as Quiz, room);
      return transaction(async tx => {
        const result = await scoped(tx).input("revision", driver.Int, change.expectedRevision).input("at", driver.BigInt, change.at)
          .query<{ changed: number }>(`UPDATE dbo.quiz_rooms SET revision = revision + 1, updated_at = @at
            WHERE id = @room AND revision = @revision AND storage_version = 2;
            SELECT @@ROWCOUNT AS changed;`);
        if (result.recordset[0]?.changed !== 1) return false;
        const current = await readTables(tx);
        if (!current.header) throw new Error("Ruang kuis tidak ditemukan.");
        await writeTables(tx, quizToRows(rowsToQuiz(current.rows), room), after);
        await request(tx).input("eventId", driver.NVarChar(80), change.eventId)
          .input("revision", driver.Int, change.expectedRevision + 1).input("kind", driver.NVarChar(80), change.kind)
          .input("payload", driver.NVarChar(driver.MAX), change.payload).input("at", driver.BigInt, change.at)
          .query("INSERT INTO dbo.quiz_events (id, revision, kind, payload, created_at) VALUES (@eventId, @revision, @kind, @payload, @at)");
        return true;
      });
    },
  };
  return repository;
}

declare global { var bgiSqlServerPool: Promise<SqlPool> | undefined; }
export async function getSqlServerRepository(): Promise<QuizRepository> {
  if (!globalThis.bgiSqlServerPool) {
    const driver = loadSqlServerDriver();
    const pool = new driver.ConnectionPool(sqlServerConfig());
    pool.on("error", error => console.error("SQL Server connection failed", (error as { code?: string }).code ?? "ESQL"));
    globalThis.bgiSqlServerPool = pool.connect().then(async connected => {
      await ensureChampionshipTable(connected, driver);
      return connected;
    }).catch(async error => {
      globalThis.bgiSqlServerPool = undefined;
      await pool.close().catch(() => undefined);
      throw error;
    });
  }
  return sqlServerRepository(await globalThis.bgiSqlServerPool, loadSqlServerDriver());
}
