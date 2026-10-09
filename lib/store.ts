import { db, type SessionRow, type SessionWordRow, type WordRow } from "./db";
import { contextSentence, markedWordIds } from "./highlight";

export type NewWord = {
  lemma: string;
  kind: "word" | "phrase" | "idiom";
  pos: string;
  definition: string;
  example: string;
  nuance_note: string;
  register: string;
};

export type Message = { id: number; role: "user" | "assistant"; content: string; created_at: number };

export function createSession(mode: SessionRow["mode"], theme = ""): SessionRow {
  const info = db()
    .prepare("INSERT INTO sessions (mode, theme, started_at) VALUES (?, ?, ?)")
    .run(mode, theme, Date.now());
  return getSession(Number(info.lastInsertRowid))!;
}

export function getSession(id: number): SessionRow | undefined {
  return db().prepare("SELECT * FROM sessions WHERE id = ?").get(id) as SessionRow | undefined;
}

export function listSessions(status?: SessionRow["status"]): (SessionRow & { word_count: number; revealed_count: number })[] {
  const where = status ? "WHERE s.status = ?" : "";
  const sql = `
    SELECT s.*, COUNT(sw.word_id) AS word_count, COALESCE(SUM(sw.revealed), 0) AS revealed_count
    FROM sessions s LEFT JOIN session_words sw ON sw.session_id = s.id
    ${where} GROUP BY s.id ORDER BY s.started_at DESC`;
  const stmt = db().prepare(sql);
  return (status ? stmt.all(status) : stmt.all()) as never;
}

export function recentThemes(n: number): string[] {
  const rows = db()
    .prepare("SELECT theme FROM sessions WHERE theme != '' ORDER BY started_at DESC LIMIT ?")
    .all(n) as { theme: string }[];
  return rows.map((r) => r.theme);
}

export function setSessionTheme(id: number, theme: string) {
  db().prepare("UPDATE sessions SET theme = ? WHERE id = ? AND theme = ''").run(theme, id);
}

export function addMessage(sessionId: number, role: Message["role"], content: string) {
  db()
    .prepare("INSERT INTO messages (session_id, role, content, created_at) VALUES (?, ?, ?, ?)")
    .run(sessionId, role, content, Date.now());
}

export function getMessages(sessionId: number): Message[] {
  return db()
    .prepare("SELECT id, role, content, created_at FROM messages WHERE session_id = ? ORDER BY id")
    .all(sessionId) as Message[];
}

/** Insert a word, or return the existing row (history and stats are kept). */
export function upsertWord(w: NewWord, theme: string): WordRow {
  const existing = db().prepare("SELECT * FROM words WHERE lemma = ?").get(w.lemma) as WordRow | undefined;
  if (existing) return existing;
  const info = db()
    .prepare(
      `INSERT INTO words (lemma, kind, pos, definition, example, nuance_note, register, cluster_theme)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(w.lemma, w.kind, w.pos, w.definition, w.example, w.nuance_note, w.register, theme);
  return db().prepare("SELECT * FROM words WHERE id = ?").get(Number(info.lastInsertRowid)) as WordRow;
}

/** Bring a word into a session. Returns false if it was already there. */
export function attachWord(sessionId: number, wordId: number): boolean {
  const now = Date.now();
  const info = db()
    .prepare("INSERT OR IGNORE INTO session_words (session_id, word_id, introduced_at) VALUES (?, ?, ?)")
    .run(sessionId, wordId, now);
  if (info.changes === 0) return false;
  db().prepare("UPDATE words SET times_seen = times_seen + 1, last_seen_at = ? WHERE id = ?").run(now, wordId);
  return true;
}

export function getSessionWords(sessionId: number): SessionWordRow[] {
  return db()
    .prepare(
      `SELECT w.*, sw.introduced_at, sw.revealed, sw.reveal_source, sw.context_sentence, sw.usage_outcome
       FROM session_words sw JOIN words w ON w.id = sw.word_id
       WHERE sw.session_id = ? ORDER BY sw.introduced_at, w.id`,
    )
    .all(sessionId) as SessionWordRow[];
}

export function allWords(): WordRow[] {
  return db().prepare("SELECT * FROM words").all() as WordRow[];
}

/** Returns true if this call newly revealed the word. */
export function markRevealed(sessionId: number, wordId: number, source: "user" | "auto"): boolean {
  const info = db()
    .prepare(
      "UPDATE session_words SET revealed = 1, reveal_source = ? WHERE session_id = ? AND word_id = ? AND revealed = 0",
    )
    .run(source, sessionId, wordId);
  if (info.changes === 0) return false;
  db().prepare("UPDATE words SET times_revealed = times_revealed + 1 WHERE id = ?").run(wordId);
  return true;
}

/** Undo an auto-flag (the grader got it wrong). User-initiated reveals stay. */
export function unflag(sessionId: number, wordId: number): boolean {
  const info = db()
    .prepare(
      "UPDATE session_words SET revealed = 0, reveal_source = NULL WHERE session_id = ? AND word_id = ? AND reveal_source = 'auto'",
    )
    .run(sessionId, wordId);
  if (info.changes === 0) return false;
  db().prepare("UPDATE words SET times_revealed = MAX(times_revealed - 1, 0) WHERE id = ?").run(wordId);
  return true;
}

export function recordOutcome(sessionId: number, wordId: number, outcome: string) {
  if (outcome === "not_addressed") return;
  const prev = db()
    .prepare("SELECT usage_outcome FROM session_words WHERE session_id = ? AND word_id = ?")
    .get(sessionId, wordId) as { usage_outcome: string } | undefined;
  if (!prev) return;
  db()
    .prepare("UPDATE session_words SET usage_outcome = ? WHERE session_id = ? AND word_id = ?")
    .run(outcome, sessionId, wordId);
  if (outcome === "used_correctly" && prev.usage_outcome !== "used_correctly") {
    db().prepare("UPDATE words SET times_used_correctly = times_used_correctly + 1 WHERE id = ?").run(wordId);
  }
}

export function terminateSession(sessionId: number) {
  const msgs = getMessages(sessionId).filter((m) => m.role === "assistant");
  const words = getSessionWords(sessionId);
  const setCtx = db().prepare("UPDATE session_words SET context_sentence = ? WHERE session_id = ? AND word_id = ?");
  const surfaced = new Set(msgs.flatMap((m) => markedWordIds(m.content)));
  db().transaction(() => {
    for (const w of words) {
      // A word fetched for the cluster but never actually used in the chat wasn't "brought up":
      // drop it from the archive and leave it available for future conversations.
      if (!surfaced.has(w.id)) {
        db().prepare("DELETE FROM session_words WHERE session_id = ? AND word_id = ?").run(sessionId, w.id);
        db().prepare("UPDATE words SET times_seen = MAX(times_seen - 1, 0), times_revealed = MAX(times_revealed - ?, 0) WHERE id = ?").run(w.revealed ? 1 : 0, w.id);
        continue;
      }
      for (const m of msgs) {
        const s = contextSentence(m.content, w.id);
        if (s) {
          setCtx.run(s, sessionId, w.id);
          break;
        }
      }
    }
    db().prepare("UPDATE sessions SET status = 'terminated', ended_at = ? WHERE id = ?").run(Date.now(), sessionId);
  })();
}
