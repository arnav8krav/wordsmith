import Link from "next/link";
import StartForm from "@/components/StartForm";
import { allWords, listSessions } from "@/lib/store";

export const dynamic = "force-dynamic";

export default function Home() {
  const active = listSessions("active");
  const done = listSessions("terminated");
  const words = allWords();
  const revealed = words.filter((w) => w.times_revealed > 0).length;

  return (
    <main className="mx-auto w-full max-w-2xl px-5 py-14">
      <h1 className="font-serif text-4xl tracking-tight">Wordsmith</h1>
      <p className="mt-3 max-w-prose leading-relaxed text-muted">
        Talk. Unfamiliar words will turn up in the conversation, and you work out what they mean from context. Peek at a
        definition only if you need to.
      </p>

      <section className="mt-10">
        <h2 className="mb-3 text-sm font-medium uppercase tracking-wider text-muted">Start a conversation</h2>
        <StartForm />
      </section>

      {active.length > 0 && (
        <section className="mt-10">
          <h2 className="mb-3 text-sm font-medium uppercase tracking-wider text-muted">In progress</h2>
          <ul className="divide-y divide-line rounded-xl border border-line bg-card">
            {active.map((s) => (
              <li key={s.id}>
                <Link href={`/chat/${s.id}`} className="flex items-center justify-between px-4 py-3 hover:bg-hl-soft">
                  <span>{s.theme || "Open conversation"}</span>
                  <span className="text-sm text-accent">Resume</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mt-10">
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-sm font-medium uppercase tracking-wider text-muted">Archive</h2>
          <span className="text-sm text-muted">
            {words.length} words met, {revealed} needed a peek
          </span>
        </div>
        {done.length === 0 ? (
          <p className="text-sm text-muted">Finished conversations and their words will be kept here.</p>
        ) : (
          <ul className="divide-y divide-line rounded-xl border border-line bg-card">
            {done.map((s) => (
              <li key={s.id}>
                <Link href={`/archive/${s.id}`} className="flex items-center justify-between px-4 py-3 hover:bg-hl-soft">
                  <span>
                    {s.theme || "Open conversation"}
                    <span className="ml-2 text-sm text-muted">{new Date(s.started_at).toLocaleDateString()}</span>
                  </span>
                  <span className="text-sm text-muted">
                    {s.word_count} words, {s.revealed_count} revealed
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
