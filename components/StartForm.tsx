"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const OPTIONS = [
  {
    mode: "user_led",
    title: "I'll lead",
    body: "Start talking about whatever's on your mind. Wordsmith follows your lead.",
  },
  {
    mode: "wordsmith_led",
    title: "Wordsmith leads",
    body: "Wordsmith opens with a theme you haven't talked about lately, so different words get a chance to surface.",
  },
] as const;

export default function StartForm() {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function start(mode: string) {
    setBusy(mode);
    setError("");
    try {
      const res = await fetch("/api/sessions", { method: "POST", body: JSON.stringify({ mode }) });
      if (!res.ok) throw new Error(`Could not start (${res.status})`);
      const { id } = (await res.json()) as { id: number };
      router.push(`/chat/${id}`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(null);
    }
  }

  return (
    <div>
      <div className="grid gap-4 sm:grid-cols-2">
        {OPTIONS.map((o) => (
          <button
            key={o.mode}
            onClick={() => start(o.mode)}
            disabled={busy !== null}
            className="rounded-xl border border-line bg-card p-5 text-left transition hover:border-accent disabled:opacity-60"
          >
            <span className="font-serif text-xl">{busy === o.mode ? "Starting..." : o.title}</span>
            <span className="mt-2 block text-sm leading-relaxed text-muted">{o.body}</span>
          </button>
        ))}
      </div>
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
    </div>
  );
}
