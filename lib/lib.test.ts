import { describe, expect, it } from "vitest";
import { contextSentence, markedWordIds, parseSegments, stripMarkers } from "./highlight";
import { sampleWeighted, weightWord } from "./selection";

describe("parseSegments", () => {
  it("splits words and text, keeping multi-word expressions as one segment", () => {
    const segs = parseSegments("You should [[bite the bullet|7]] and be [[sanguine|3]] about it.");
    expect(segs).toEqual([
      { type: "text", text: "You should " },
      { type: "word", surface: "bite the bullet", wordId: 7 },
      { type: "text", text: " and be " },
      { type: "word", surface: "sanguine", wordId: 3 },
      { type: "text", text: " about it." },
    ]);
  });

  it("holds back an unfinished marker while streaming", () => {
    expect(parseSegments("Hello [[ephem", { streaming: true })).toEqual([{ type: "text", text: "Hello " }]);
    expect(parseSegments("Hello [[ephemeral|", { streaming: true })).toEqual([{ type: "text", text: "Hello " }]);
    expect(parseSegments("Hello [", { streaming: true })).toEqual([{ type: "text", text: "Hello " }]);
  });

  it("completes the marker once the rest arrives", () => {
    const segs = parseSegments("Hello [[ephemeral|4]] joy", { streaming: true });
    expect(segs[1]).toEqual({ type: "word", surface: "ephemeral", wordId: 4 });
  });

  it("leaves a normal bracket alone", () => {
    expect(parseSegments("a [b] c", { streaming: true })).toEqual([{ type: "text", text: "a [b] c" }]);
  });
});

describe("helpers", () => {
  const text = "That was fine. The mood was [[mercurial|2]], flipping by the minute! Odd day.";
  it("lists marked ids", () => expect(markedWordIds(text)).toEqual([2]));
  it("strips markers", () => expect(stripMarkers(text)).toContain("was mercurial, flipping"));
  it("extracts the context sentence", () =>
    expect(contextSentence(text, 2)).toBe("The mood was mercurial, flipping by the minute!"));
});

describe("selection", () => {
  const now = Date.now();
  const base = { times_seen: 2, times_revealed: 0, times_used_correctly: 0, last_seen_at: now };
  it("weighs revealed words above unrevealed", () => {
    expect(weightWord({ ...base, times_revealed: 2 }, now)).toBeGreaterThan(weightWord(base, now));
  });
  it("weighs stale words above fresh ones", () => {
    expect(weightWord({ ...base, last_seen_at: now - 20 * 86_400_000 }, now)).toBeGreaterThan(weightWord(base, now));
  });
  it("weighs mastered words below others but never bans them", () => {
    const mastered = weightWord({ ...base, times_used_correctly: 2 }, now);
    expect(mastered).toBeLessThan(weightWord(base, now));
    expect(mastered).toBeGreaterThan(0);
  });
  it("samples without replacement", () => {
    const items = Array.from({ length: 5 }, (_, i) => ({ ...base, id: i }));
    const picked = sampleWeighted(items, 3, now);
    expect(new Set(picked.map((p) => p.id)).size).toBe(3);
    expect(sampleWeighted(items, 10, now)).toHaveLength(5);
  });
});
