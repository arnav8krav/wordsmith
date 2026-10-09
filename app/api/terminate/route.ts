import { getSession, terminateSession } from "@/lib/store";

export async function POST(req: Request) {
  const { sessionId } = (await req.json()) as { sessionId: number };
  if (!getSession(sessionId)) return Response.json({ error: "no such session" }, { status: 404 });
  terminateSession(sessionId);
  return Response.json({ ok: true });
}
