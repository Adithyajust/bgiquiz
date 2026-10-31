export type StoredQuiz = { document: string; revision: number };
export type StoredQuizEvent = { id: string; revision: number; kind: string; payload: string; created_at: number | string };
export type QuizCommit = {
  document: string;
  expectedRevision: number;
  eventId: string;
  kind: string;
  payload: string;
  at: number;
};
export interface QuizRepository {
  read(): Promise<StoredQuiz | null>;
  readRecentEvents?(maxRevision: number): Promise<StoredQuizEvent[]>;
  initialize(document: string, at: number): Promise<void>;
  getOwner(): Promise<string | null>;
  claimOwner(userId: string, at: number): Promise<void>;
  compareAndSwap(change: QuizCommit): Promise<boolean>;
}
