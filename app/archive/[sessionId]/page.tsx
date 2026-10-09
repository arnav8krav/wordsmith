import Link from "next/link";
import { notFound } from "next/navigation";
import type { SessionWordRow } from "@/lib/db";
import { getSession, getSessionWords } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function ArchiveSession(props: PageProps<"/archive/[sessionId]">) {
  const { sessionId } = await props.params;
  const session = getSession(Number(sessionId));
  if (!session) notFound();
  const words = getSessionWords(session.id);
  const revealed = words.filter((w) => w.revealed);
  const unrevealed = words.filter((w) => !w.revealed);

  return (
    <main className="mx-auto w-full max-w-2xl px-5 py-12">
      <Link href="/" className="text-sm text-muted hover:text-ink">
        &larr; Wordsmith
      </Link>
      <h1 className="mt-4 font-serif text-3xl tracking-tight">{session.theme || "Open conversation"}</h1>
      <p className="mt-1 text-sm text-muted">
        {new Date(session.started_at).toLocaleString()} &middot;{" "}
        {session.mode === "wordsmith_led" ? "Wordsmith led" : "You led"} &middot; {words.length} words
      </p>
      {session.status === "active" && (
        <p className="mt-4 text-sm">
          This conversation is still open.{" "}
          <Link className="text-accent underline" href={`/chat/${session.id}`}>
            Return to it
          </Link>
        </p>
      )}

      <Group
        title="Revealed"
        hint="You asked for the definition, or Wordsmith saw you were unsure. Worth another look."
        words={revealed}
      />
      <Group
        title="Not revealed"
        hint="You met these in context without checking. Did you really get them? Here are the definitions."
        words={unrevealed}
      />
    </main>
  );
}

function Group({ title, hint, words }: { title: string; hint: string; words: SessionWordRow[] }) {
  return (
    <section className="mt-10">
      <h2 className="font-serif text-2xl">
        {title} <span className="text-base text-muted">({words.length})</span>
      </h2>
      <p className="mt-1 text-sm text-muted">{hint}</p>
      {words.length === 0 ? (
        <p className="mt-4 text-sm text-muted">None.</p>
      ) : (
        <ul className="mt-4 space-y-3">
          {words.map((w) => (
            <li key={w.id} className="rounded-xl border border-line bg-card p-4">
              <div className="flex items-baseline justify-between gap-3">
                <span className="font-serif text-xl">{w.lemma}</span>
                <span className="text-sm text-muted">
                  {w.pos}
                  {w.revealed ? (w.reveal_source === "auto" ? " · flagged by Wordsmith" : " · you revealed it") : ""}
                </span>
              </div>
              <p className="mt-1.5 leading-relaxed">{w.definition}</p>
              {w.context_sentence && (
                <p className="mt-2 text-sm italic text-muted">In this conversation: &ldquo;{w.context_sentence}&rdquo;</p>
              )}
              {w.example && !w.context_sentence && (
                <p className="mt-2 text-sm italic text-muted">&ldquo;{w.example}&rdquo;</p>
              )}
              {w.nuance_note && <p className="mt-2 text-xs text-muted">{w.nuance_note}</p>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
