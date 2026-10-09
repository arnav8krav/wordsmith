import Database from "better-sqlite3";
import fs from "fs";
import path from "path";

const DB_PATH = process.env.WORDSMITH_DB ?? path.join(process.cwd(), "data", "wordsmith.db");

const SCHEMA = `
CREATE TABLE IF NOT EXISTS words (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  lemma TEXT NOT NULL UNIQUE COLLATE NOCASE,
  kind TEXT NOT NULL DEFAULT 'word',
  pos TEXT NOT NULL DEFAULT '',
  definition TEXT NOT NULL,
  example TEXT NOT NULL DEFAULT '',
  nuance_note TEXT NOT NULL DEFAULT '',
  register TEXT NOT NULL DEFAULT '',
  cluster_theme TEXT NOT NULL DEFAULT '',
  times_seen INTEGER NOT NULL DEFAULT 0,
  times_revealed INTEGER NOT NULL DEFAULT 0,
  times_used_correctly INTEGER NOT NULL DEFAULT 0,
  last_seen_at INTEGER
);
CREATE TABLE IF NOT EXISTS sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  mode TEXT NOT NULL,
  theme TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active',
  started_at INTEGER NOT NULL,
  ended_at INTEGER
);
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER NOT NULL REFERENCES sessions(id),
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS session_words (
  session_id INTEGER NOT NULL REFERENCES sessions(id),
  word_id INTEGER NOT NULL REFERENCES words(id),
  introduced_at INTEGER NOT NULL,
  revealed INTEGER NOT NULL DEFAULT 0,
  reveal_source TEXT,
  context_sentence TEXT NOT NULL DEFAULT '',
  usage_outcome TEXT NOT NULL DEFAULT 'not_addressed',
  PRIMARY KEY (session_id, word_id)
);
`;

// Reuse one connection across Next dev hot reloads.
const g = globalThis as unknown as { __wordsmithDb?: Database.Database };

export function db(): Database.Database {
  if (!g.__wordsmithDb) {
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
    const d = new Database(DB_PATH);
    d.pragma("journal_mode = WAL");
    d.pragma("foreign_keys = ON");
    d.exec(SCHEMA);
    g.__wordsmithDb = d;
  }
  return g.__wordsmithDb;
}

export type WordRow = {
  id: number;
  lemma: string;
  kind: string;
  pos: string;
  definition: string;
  example: string;
  nuance_note: string;
  register: string;
  cluster_theme: string;
  times_seen: number;
  times_revealed: number;
  times_used_correctly: number;
  last_seen_at: number | null;
};

export type SessionRow = {
  id: number;
  mode: "user_led" | "wordsmith_led";
  theme: string;
  status: "active" | "terminated";
  started_at: number;
  ended_at: number | null;
};

export type SessionWordRow = WordRow & {
  introduced_at: number;
  revealed: number;
  reveal_source: "user" | "auto" | null;
  context_sentence: string;
  usage_outcome: string;
};
