import Anthropic from "@anthropic-ai/sdk";

const g = globalThis as unknown as { __anthropic?: Anthropic };

export function anthropic(): Anthropic {
  return (g.__anthropic ??= new Anthropic());
}

export const MODELS = {
  /** The conversational tutor and the word-cluster author (definitions must be accurate). */
  tutor: "claude-sonnet-5-5",
  /** Cheap, fast per-turn comprehension grading and theme picking. */
  fast: "claude-haiku-5-5",
} as const;
