import { getSessionWords, markRevealed } from "@/lib/store";

export async function POST(req: Request) {
  const { sessionId, wordId } = (await req.json()) as { sessionId: number; wordId: number };
  if (!getSessionWords(sessionId).some((w) => w.id === wordId)) {
    return Response.json({ error: "word not in session" }, { status: 404 });
  }
  markRevealed(sessionId, wordId, "user");
  return Response.json({ ok: true });
}
