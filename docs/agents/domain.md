# Domain Docs

How the engineering skills consume this repo's domain documentation when
exploring the codebase. This repo is single-context.

## Before exploring, read these

- **`CONTEXT.md`** at the repo root: the glossary.
- **`docs/adr/`**: the ADRs that touch the area you are about to work in.
  An ADR may be paired by number with a product-side record in
  `docs/design/`.

What goes in each of these, and how a record is written (numbering, front
matter, the design/ADR pairing), is in `MEMORY/docs.md`; follow it
whenever a skill, `/domain-modeling` among them, writes one.

## File structure

```
/
├── CONTEXT.md
├── docs/
│   ├── adr/        ← engineering records, 0001-…
│   └── design/     ← product records, paired with adr/ by number
└── src/
```

## Use the glossary's vocabulary

When your output names a domain concept (in an issue title, a refactor
proposal, a hypothesis, a test name), use the term as defined in
`CONTEXT.md`. Don't drift to synonyms the glossary explicitly avoids.

If the concept you need isn't in the glossary yet, that's a signal: either
you're inventing language the project doesn't use (reconsider) or there's
a real gap (note it for `/domain-modeling`).

## Flag ADR conflicts

If your output contradicts an existing ADR, surface it explicitly rather
than silently overriding:

> _Contradicts ADR-0007 (Zotero's own player stays in the page, hidden),
> but worth reopening because…_
