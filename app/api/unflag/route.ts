import { unflag } from "@/lib/store";

export async function POST(req: Request) {
  const { sessionId, wordId } = (await req.json()) as { sessionId: number; wordId: number };
  return Response.json({ ok: unflag(sessionId, wordId) });
}
