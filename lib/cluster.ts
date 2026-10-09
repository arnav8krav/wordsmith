import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { anthropic, MODELS } from "./anthropic";
import type { WordRow } from "./db";
import { CLUSTER_SYSTEM, THEME_SYSTEM } from "./prompts";
import { sampleWeighted } from "./selection";
import { allWords, attachWord, getSessionWords, recentThemes, setSessionTheme, upsertWord } from "./store";

const ClusterSchema = z.object({
  words: z.array(
    z.object({
      lemma: z.string(),
      kind: z.enum(["word", "phrase", "idiom"]),
      pos: z.string(),
      definition: z.string(),
      example: z.string(),
      nuance_note: z.string(),
      register: z.string(),
    }),
  ),
});

/**
 * Build a themed cluster for a session. The model is shown a weighted sample of
 * previously met words it MAY reuse when they fit the theme (archived words are
 * never banned), plus the words already in this session, which it must avoid.
 */
export async function generateCluster(opts: {
  sessionId: number;
  theme: string;
  mood: string;
  count: number;
}): Promise<WordRow[]> {
  const count = Math.min(Math.max(opts.count, 3), 5);
  const inSession = getSessionWords(opts.sessionId);
  const inSessionIds = new Set(inSession.map((w) => w.id));
  const history = sampleWeighted(
    allWords().filter((w) => !inSessionIds.has(w.id)),
    12,
  );

  const prompt = [
    `Theme: ${opts.theme}`,
    `Mood: ${opts.mood}`,
    `Cluster size: ${count}`,
    inSession.length ? `Do not use any of these (already in this conversation): ${inSession.map((w) => w.lemma).join(", ")}` : "",
    history.length
      ? `Words the learner has met before. Reuse up to 2 of them ONLY if they fit this theme and mood naturally (use the exact lemma); otherwise ignore this list: ${history.map((w) => w.lemma).join(", ")}`
      : "",
    "Prefer words the learner has not met before for the rest of the cluster.",
  ]
    .filter(Boolean)
    .join("\n");

  const res = await anthropic().messages.parse({
    model: MODELS.tutor,
    max_tokens: 4000,
    system: CLUSTER_SYSTEM,
    output_config: { effort: "low", format: zodOutputFormat(ClusterSchema) },
    messages: [{ role: "user", content: prompt }],
  });
  const parsed = res.parsed_output;
  if (!parsed) throw new Error("cluster generation returned no parsable output");

  setSessionTheme(opts.sessionId, opts.theme);
  const out: WordRow[] = [];
  for (const entry of parsed.words.slice(0, count)) {
    const lemma = entry.lemma.trim();
    if (!lemma) continue;
    const row = upsertWord({ ...entry, lemma }, opts.theme);
    if (inSessionIds.has(row.id)) continue;
    attachWord(opts.sessionId, row.id);
    out.push(row);
  }
  return out;
}

const ThemeSchema = z.object({ theme: z.string(), mood: z.string(), angle: z.string() });

/** Pick a theme for a Wordsmith-led conversation that differs from recent ones. */
export async function pickTheme(): Promise<z.infer<typeof ThemeSchema>> {
  const recent = recentThemes(15);
  const res = await anthropic().messages.parse({
    model: MODELS.fast,
    max_tokens: 1000,
    system: THEME_SYSTEM,
    output_config: { effort: "low", format: zodOutputFormat(ThemeSchema) },
    messages: [
      {
        role: "user",
        content: recent.length
          ? `Recent themes (avoid anything similar):\n${recent.map((t) => `- ${t}`).join("\n")}`
          : "No previous conversations yet. Pick any engaging theme.",
      },
    ],
  });
  return res.parsed_output ?? { theme: "an unexpected change of plans", mood: "wry", angle: "ask about a time plans fell apart" };
}
