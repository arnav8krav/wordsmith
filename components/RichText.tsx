"use client";

import { parseSegments } from "@/lib/highlight";
import type { PublicWord } from "@/lib/public";

type Props = {
  text: string;
  streaming?: boolean;
  words: Record<number, PublicWord>;
  onReveal: (wordId: number) => void;
  onUnflag: (wordId: number) => void;
};

export default function RichText({ text, streaming, words, onReveal, onUnflag }: Props) {
  return (
    <>
      {parseSegments(text, { streaming }).map((seg, i) =>
        seg.type === "text" ? (
          <span key={i}>{seg.text}</span>
        ) : (
          <Highlight
            key={i}
            surface={seg.surface}
            word={words[seg.wordId]}
            onReveal={() => onReveal(seg.wordId)}
            onUnflag={() => onUnflag(seg.wordId)}
          />
        ),
      )}
    </>
  );
}

function Highlight({
  surface,
  word,
  onReveal,
  onUnflag,
}: {
  surface: string;
  word: PublicWord | undefined;
  onReveal: () => void;
  onUnflag: () => void;
}) {
  const revealed = !!word?.revealed;
  return (
    <span className="group relative inline">
      {/* One highlight over the whole word or expression. */}
      <mark
        tabIndex={0}
        className={`cursor-help rounded px-1 py-0.5 text-inherit outline-none [box-decoration-break:clone] ${
          revealed ? "bg-hl-soft underline decoration-dotted decoration-accent underline-offset-4" : "bg-hl"
        } focus-visible:ring-2 focus-visible:ring-accent`}
      >
        {surface}
      </mark>
      {/* pt-2 bridges the gap so the pointer can travel from the word to the popover. */}
      <span className="absolute left-0 top-full z-20 hidden w-72 max-w-[80vw] pt-2 group-focus-within:block group-hover:block">
        <span className="block rounded-lg border border-line bg-card p-3 font-sans text-sm leading-snug shadow-lg">
          {!word ? (
            <span className="text-muted">Loading...</span>
          ) : revealed ? (
            <>
              <span className="block font-medium">
                {word.lemma} <span className="font-normal text-muted">{word.pos}</span>
              </span>
              <span className="mt-1 block">{word.definition}</span>
              {word.example && <span className="mt-2 block italic text-muted">&ldquo;{word.example}&rdquo;</span>}
              {word.nuance_note && <span className="mt-2 block text-xs text-muted">{word.nuance_note}</span>}
              {word.reveal_source === "auto" && (
                <span className="mt-2 flex items-center justify-between gap-2 text-xs">
                  <span className="text-accent">Flagged by Wordsmith</span>
                  <button className="underline text-muted hover:text-ink" onClick={onUnflag}>
                    I knew it
                  </button>
                </span>
              )}
            </>
          ) : (
            <button
              onClick={onReveal}
              className="w-full rounded-md bg-ink px-3 py-1.5 text-center text-paper hover:opacity-90"
            >
              Show definition
            </button>
          )}
        </span>
      </span>
    </span>
  );
}
