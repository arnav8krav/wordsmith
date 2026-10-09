# Wordsmith

Learn vocabulary by talking. A tutor (Claude) holds a real conversation and weaves in unfamiliar, theme-matched words; you infer them from context and peek at definitions only if you need to.

## Run

```bash
export ANTHROPIC_API_KEY=...   # or put it in .env.local
npm install
npm run dev                    # http://localhost:3000
npm test                       # parser + selection unit tests
```

Data lives in `data/wordsmith.db` (SQLite, git-ignored).

## How it works

- Choose who leads: you, or Wordsmith (which picks a theme unlike your recent ones).
- The tutor calls `get_word_cluster(theme, mood)` for a coherent cluster of words, weaving in 1-2 per message. You never pick the words.
- Target words are highlighted as one unit (multi-word expressions included). Hover, then "Show definition" to reveal.
- A fast grader checks each reply. If it shows you didn't understand a word, that word is auto-revealed ("flagged by Wordsmith"; "I knew it" undoes it).
- "Terminate conversation" archives the session: words split into revealed / not revealed, each with its definition. Archived words are never banned; they resurface via weighted selection (`lib/selection.ts`).
