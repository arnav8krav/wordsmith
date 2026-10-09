import { notFound, redirect } from "next/navigation";
import Chat from "@/components/Chat";
import { toPublic } from "@/lib/public";
import { getMessages, getSession, getSessionWords } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function ChatPage(props: PageProps<"/chat/[sessionId]">) {
  const { sessionId } = await props.params;
  const session = getSession(Number(sessionId));
  if (!session) notFound();
  if (session.status === "terminated") redirect(`/archive/${session.id}`);

  const messages = getMessages(session.id).map((m) => ({ role: m.role, content: m.content }));
  return (
    <Chat
      sessionId={session.id}
      initialMessages={messages}
      initialWords={getSessionWords(session.id).map(toPublic)}
      autoOpen={session.mode === "wordsmith_led" && messages.length === 0}
    />
  );
}
