import { pickTheme } from "@/lib/cluster";
import { createSession } from "@/lib/store";

export async function POST(req: Request) {
  const { mode } = (await req.json()) as { mode?: string };
  if (mode === "wordsmith_led") {
    const t = await pickTheme();
    const session = createSession("wordsmith_led", t.theme);
    return Response.json({ id: session.id, mood: t.mood, angle: t.angle });
  }
  const session = createSession("user_led");
  return Response.json({ id: session.id });
}
