"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import type { PublicWord } from "@/lib/public";
import RichText from "./RichText";

type Msg = { role: "user" | "assistant"; content: string };
type StreamEvent =
  | { t: "text"; d: string }
  | { t: "words"; words: PublicWord[] }
  | { t: "flags"; words: PublicWord[] }
  | { t: "done" }
  | { t: "error"; message: string };

type Props = {
  sessionId: number;
  initialMessages: Msg[];
  initialWords: PublicWord[];
  /** Wordsmith-led conversations with no messages yet: ask the tutor to open. */
  autoOpen: boolean;
};

export default function Chat({ sessionId, initialMessages, initialWords, autoOpen }: Props) {
  const router = useRouter();
  const [messages, setMessages] = useState<Msg[]>(initialMessages);
  const [streaming, setStreaming] = useState<string | null>(null);
  const [words, setWords] = useState<Record<number, PublicWord>>(() =>
    Object.fromEntries(initialWords.map((w) => [w.id, w])),
  );
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [ending, setEnding] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const started = useRef(false);

  const mergeWords = useCallback((incoming: PublicWord[]) => {
    setWords((prev) => {
      const next = { ...prev };
      for (const w of incoming) next[w.id] = { ...next[w.id], ...w };
      return next;
    });
  }, []);

  /** Talk to the tutor. With no text, asks for the next reply to the existing history (opener or retry). */
  const send = useCallback(
    async (text?: string) => {
      setBusy(true);
      setError("");
      if (text) setMessages((m) => [...m, { role: "user", content: text }]);
      let reply = "";
      setStreaming("");
      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          body: JSON.stringify({ sessionId, message: text }),
        });
        if (!res.ok || !res.body) throw new Error(`Request failed (${res.status})`);
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = "";
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          let nl: number;
          while ((nl = buf.indexOf("\n")) !== -1) {
            const line = buf.slice(0, nl).trim();
            buf = buf.slice(nl + 1);
            if (!line) continue;
            const ev = JSON.parse(line) as StreamEvent;
            if (ev.t === "text") {
              reply += ev.d;
              setStreaming(reply);
            } else if (ev.t === "words") mergeWords(ev.words);
            else if (ev.t === "flags") mergeWords(ev.words);
            else if (ev.t === "error") throw new Error(ev.message);
          }
        }
        if (reply.trim()) setMessages((m) => [...m, { role: "assistant", content: reply.trim() }]);
      } catch (e) {
        setError((e as Error).message);
        if (reply.trim()) setMessages((m) => [...m, { role: "assistant", content: reply.trim() }]);
      } finally {
        setStreaming(null);
        setBusy(false);
      }
    },
    [sessionId, mergeWords],
  );

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    if (autoOpen) setTimeout(() => void send(), 0);
  }, [autoOpen, send]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, streaming]);

  const reveal = useCallback(
    (wordId: number) => {
      setWords((p) => ({ ...p, [wordId]: { ...p[wordId], revealed: true, reveal_source: p[wordId].reveal_source ?? "user" } }));
      void fetch("/api/reveal", { method: "POST", body: JSON.stringify({ sessionId, wordId }) });
    },
    [sessionId],
  );

  const unflag = useCallback(
    (wordId: number) => {
      setWords((p) => ({ ...p, [wordId]: { ...p[wordId], revealed: false, reveal_source: null } }));
      void fetch("/api/unflag", { method: "POST", body: JSON.stringify({ sessionId, wordId }) });
    },
    [sessionId],
  );

  async function terminate() {
    if (!window.confirm("End this conversation and move its words to the archive?")) return;
    setEnding(true);
    await fetch("/api/terminate", { method: "POST", body: JSON.stringify({ sessionId }) });
    router.push(`/archive/${sessionId}`);
  }

  function submit() {
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    void send(text);
  }

  const wordCount = Object.keys(words).length;
  const richProps = { words, onReveal: reveal, onUnflag: unflag };

  return (
    <div className="mx-auto flex h-dvh w-full max-w-2xl flex-col px-5">
      <header className="flex items-center justify-between py-4">
        <Link href="/" className="font-serif text-xl">
          Wordsmith
        </Link>
        <div className="flex items-center gap-4 text-sm">
          {wordCount > 0 && <span className="text-muted">{wordCount} words in play</span>}
          <button
            onClick={terminate}
            disabled={ending || busy}
            className="rounded-md border border-line px-3 py-1.5 hover:border-accent disabled:opacity-50"
          >
            Terminate conversation
          </button>
        </div>
      </header>

      <div className="flex-1 space-y-5 overflow-y-auto pb-6 pr-1">
        {messages.length === 0 && streaming === null && (
          <p className="pt-10 text-center text-muted">Say something to begin. Anything at all.</p>
        )}
        {messages.map((m, i) => (
          <Bubble key={i} role={m.role}>
            {m.role === "assistant" ? <RichText text={m.content} {...richProps} /> : m.content}
          </Bubble>
        ))}
        {streaming !== null && (
          <Bubble role="assistant">
            {streaming ? <RichText text={streaming} streaming {...richProps} /> : <span className="text-muted">...</span>}
          </Bubble>
        )}
        {error && (
          <div className="rounded-lg border border-red-400/50 p-3 text-sm text-red-600">
            {error}{" "}
            <button className="underline" onClick={() => send()}>
              Retry
            </button>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="pb-5 pt-2">
        <div className="flex items-end gap-2 rounded-xl border border-line bg-card p-2 focus-within:border-accent">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            rows={1}
            placeholder="Write a reply..."
            className="max-h-40 min-h-10 flex-1 resize-none bg-transparent px-2 py-2 outline-none"
          />
          <button
            onClick={submit}
            disabled={busy || !input.trim()}
            className="rounded-lg bg-ink px-4 py-2 text-paper disabled:opacity-40"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}

function Bubble({ role, children }: { role: "user" | "assistant"; children: React.ReactNode }) {
  return role === "user" ? (
    <div className="flex justify-end">
      <p className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-sm bg-hl-soft px-4 py-2.5 leading-relaxed">
        {children}
      </p>
    </div>
  ) : (
    <p className="max-w-[92%] whitespace-pre-wrap font-serif text-lg leading-8">{children}</p>
  );
}
