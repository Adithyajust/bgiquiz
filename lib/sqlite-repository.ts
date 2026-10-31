import type { QuizRepository, QuizCommit, StoredQuiz, StoredQuizEvent } from "./persistence";
// SQLite remains exclusively for the hosted preview and isolated regression tests.
export function sqliteRepository(db: D1Database): QuizRepository {
  return {
    async read() {
      return db.prepare("SELECT document, revision FROM quiz_rooms WHERE id = ?")
        .bind("main").first<StoredQuiz>();
    },
    async initialize(document, at) {
      await db.prepare("INSERT OR IGNORE INTO quiz_rooms (id, document, revision, updated_at) VALUES (?, ?, 0, ?)")
        .bind("main", document, at).run();
    },
    async readRecentEvents(maxRevision) {
      const result = await db.prepare("SELECT id, revision, kind, payload, created_at FROM quiz_events WHERE revision <= ? AND revision > ? AND kind IN ('buzz', 'judge') ORDER BY revision DESC LIMIT 32")
        .bind(maxRevision, Math.max(0, maxRevision - 64)).all<StoredQuizEvent>();
      return result.results;
    },
    async getOwner() {
      const row = await db.prepare("SELECT user_id FROM quiz_owners WHERE id = ?")
        .bind("main").first<{ user_id: string }>();
      return row?.user_id ?? null;
    },
    async claimOwner(userId, at) {
      await db.prepare("INSERT OR IGNORE INTO quiz_owners (id, user_id, created_at) VALUES (?, ?, ?)")
        .bind("main", userId, at).run();
    },
    async compareAndSwap(change: QuizCommit) {
      const result = await db.batch([
        db.prepare("UPDATE quiz_rooms SET document = ?, revision = revision + 1, updated_at = ? WHERE id = ? AND revision = ?")
          .bind(change.document, change.at, "main", change.expectedRevision),
        db.prepare("INSERT INTO quiz_events (id, revision, kind, payload, created_at) SELECT ?, ?, ?, ?, ? WHERE changes() = 1")
          .bind(change.eventId, change.expectedRevision + 1, change.kind, change.payload, change.at),
      ]);
      return result[0].meta.changes === 1;
    },
  };
}
