import type Anthropic from "@anthropic-ai/sdk";
import { anthropic, MODELS } from "@/lib/anthropic";
import { generateCluster } from "@/lib/cluster";
import { gradeLatestReply } from "@/lib/grade";
import { tutorSystem } from "@/lib/prompts";
import { toPublic } from "@/lib/public";
import { addMessage, getMessages, getSession, getSessionWords } from "@/lib/store";


const CLUSTER_TOOL: Anthropic.Beta.BetaTool = {
  name: "get_word_cluster",
  description:
    "Get a themed cluster of 3-5 vocabulary words, phrases, or idioms to weave into the conversation, each with an id you must use in [[surface|id]] markers. Call when the conversation's theme and mood are clear, and again only when it has moved to a genuinely new theme or mood.",
  strict: true,
  input_schema: {
    type: "object",
    properties: {
      theme: { type: "string", description: "The conversation's current theme, e.g. 'the pressure of a first job'." },
      mood: { type: "string", description: "The emotional tone, e.g. 'anxious but hopeful'." },
      count: { type: "integer", description: "How many words, 3 to 5." },
    },
    required: ["theme", "mood", "count"],
    additionalProperties: false,
  },
};

const MAX_ITERATIONS = 4;

export async function POST(req: Request) {
  const { sessionId, message } = (await req.json()) as { sessionId: number; message?: string };
  const session = getSession(sessionId);
  if (!session) return Response.json({ error: "no such session" }, { status: 404 });
  if (session.status === "terminated") return Response.json({ error: "session is over" }, { status: 409 });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const emit = (event: object) => controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
      try {
        let notes: string[] = [];
        if (message?.trim()) {
          addMessage(sessionId, "user", message.trim());
          const grade = await gradeLatestReply(sessionId);
          notes = grade.notes;
          if (grade.flagged.length) {
            const flagged = getSessionWords(sessionId).filter((w) => grade.flagged.includes(w.id));
            emit({ t: "flags", words: flagged.map(toPublic) });
          }
        }

        const history = getMessages(sessionId);
        const messages: Anthropic.Beta.BetaMessageParam[] = history.map((m) => ({ role: m.role, content: m.content }));
        if (messages.length === 0 || messages[0].role === "assistant") {
          messages.unshift({ role: "user", content: "(The learner has just joined. Open the conversation.)" });
        }

        let system = tutorSystem(session, getSessionWords(sessionId));
        if (notes.length) system += `\n\n## Notes for your next reply\n${notes.map((n) => `- ${n}`).join("\n")}`;

        let reply = "";
        for (let i = 0; i < MAX_ITERATIONS; i++) {
          const turn = anthropic().beta.messages.stream({
            model: MODELS.tutor,
            max_tokens: 16000,
            betas: ["server-side-fallback-2026-07-01"],
            fallbacks: "default",
            system,
            tools: [CLUSTER_TOOL],
            output_config: { effort: "medium" },
            messages,
          });
          let separated = i === 0 || reply === "";
          turn.on("text", (delta) => {
            if (!separated) {
              separated = true;
              reply += "\n\n";
              emit({ t: "text", d: "\n\n" });
            }
            reply += delta;
            emit({ t: "text", d: delta });
          });
          const final = await turn.finalMessage();

          if (final.stop_reason === "refusal") throw new Error("The model declined to respond to that.");
          if (final.stop_reason !== "tool_use") break;

          messages.push({ role: "assistant", content: final.content as Anthropic.Beta.BetaContentBlockParam[] });
          const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
          for (const block of final.content) {
            if (block.type !== "tool_use") continue;
            try {
              const input = block.input as { theme: string; mood: string; count: number };
              const words = await generateCluster({ sessionId, ...input });
              emit({ t: "words", words: words.map(toPublic) });
              results.push({
                type: "tool_result",
                tool_use_id: block.id,
                content: JSON.stringify(
                  words.map((w) => ({
                    id: w.id,
                    lemma: w.lemma,
                    kind: w.kind,
                    pos: w.pos,
                    definition: w.definition,
                    example: w.example,
                    nuance_note: w.nuance_note,
                  })),
                ),
              });
            } catch (err) {
              results.push({
                type: "tool_result",
                tool_use_id: block.id,
                is_error: true,
                content: `Could not build a cluster: ${(err as Error).message}. Continue the conversation without target words this turn.`,
              });
            }
          }
          messages.push({ role: "user", content: results });
        }

        if (reply.trim()) addMessage(sessionId, "assistant", reply.trim());
        emit({ t: "done" });
      } catch (err) {
        emit({ t: "error", message: (err as Error).message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson", "Cache-Control": "no-store" } });
}
