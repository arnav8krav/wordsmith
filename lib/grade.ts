import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { anthropic, MODELS } from "./anthropic";
import { GRADER_SYSTEM } from "./prompts";
import { markedWordIds, stripMarkers } from "./highlight";
import { getMessages, getSessionWords, markRevealed, recordOutcome } from "./store";

const GradeSchema = z.object({
  results: z.array(
    z.object({
      word_id: z.number(),
      outcome: z.enum(["used_correctly", "used_incorrectly", "shows_confusion"]),
      note: z.string(),
    }),
  ),
});

export type GradeResult = {
  /** Words newly auto-flagged as revealed because the reply showed confusion. */
  flagged: number[];
  /** Tutor-facing notes to act on in the next reply. */
  notes: string[];
};

/**
 * Judge the learner's latest reply against the target words the tutor has
 * actually used so far. Confusion counts as an automatic reveal.
 */
export async function gradeLatestReply(sessionId: number): Promise<GradeResult> {
  const messages = getMessages(sessionId);
  const last = messages.at(-1);
  if (!last || last.role !== "user") return { flagged: [], notes: [] };

  const usedIds = new Set(messages.filter((m) => m.role === "assistant").flatMap((m) => markedWordIds(m.content)));
  const inPlay = getSessionWords(sessionId).filter((w) => usedIds.has(w.id));
  if (inPlay.length === 0) return { flagged: [], notes: [] };

  const transcript = messages
    .slice(-7)
    .map((m) => `${m.role === "user" ? "LEARNER" : "TUTOR"}: ${stripMarkers(m.content)}`)
    .join("\n\n");
  const wordList = inPlay.map((w) => `- id ${w.id}: "${w.lemma}" - ${w.definition}`).join("\n");

  const res = await anthropic().messages.parse({
    model: MODELS.fast,
    max_tokens: 2000,
    system: GRADER_SYSTEM,
    output_config: { effort: "low", format: zodOutputFormat(GradeSchema) },
    messages: [
      {
        role: "user",
        content: `Target words the tutor has used so far:\n${wordList}\n\nRecent conversation (the learner's latest reply is last):\n${transcript}`,
      },
    ],
  });

  const flagged: number[] = [];
  const notes: string[] = [];
  const byId = new Map(inPlay.map((w) => [w.id, w]));
  for (const r of res.parsed_output?.results ?? []) {
    const word = byId.get(r.word_id);
    if (!word) continue;
    recordOutcome(sessionId, word.id, r.outcome);
    if (r.outcome === "shows_confusion") {
      if (markRevealed(sessionId, word.id, "auto")) flagged.push(word.id);
      notes.push(
        `The learner seems not to understand "${word.lemma}" (${r.note}). Without breaking the flow or quizzing, clarify it gently in passing with a plain rephrase.`,
      );
    } else if (r.outcome === "used_incorrectly") {
      notes.push(
        `The learner used "${word.lemma}" off-target (${r.note}). Give a brief, kind, in-voice correction that models the right usage.`,
      );
    } else {
      notes.push(`The learner used "${word.lemma}" correctly; you may acknowledge it lightly, if natural.`);
    }
  }
  return { flagged, notes };
}
