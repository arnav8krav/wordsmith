import type { SessionWordRow, WordRow } from "./db";

/** What the browser needs to know about a word in a conversation. */
export type PublicWord = {
  id: number;
  lemma: string;
  kind: string;
  pos: string;
  definition: string;
  example: string;
  nuance_note: string;
  revealed: boolean;
  reveal_source: "user" | "auto" | null;
};

export function toPublic(w: WordRow | SessionWordRow): PublicWord {
  const sw = w as Partial<SessionWordRow>;
  return {
    id: w.id,
    lemma: w.lemma,
    kind: w.kind,
    pos: w.pos,
    definition: w.definition,
    example: w.example,
    nuance_note: w.nuance_note,
    revealed: !!sw.revealed,
    reveal_source: sw.reveal_source ?? null,
  };
}
