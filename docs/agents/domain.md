# Domain docs

Read before exploring an area, naming a domain concept or writing a
decision record. This repository has one context.

1. Read `CONTEXT.md`, the glossary.
2. Read the area's `docs/adr/` records and their numbered product-side
   partners in `docs/design/`, where present.
3. Use the glossary's term in issues, hypotheses, proposals, code and
   test names. If a needed concept is missing, distinguish a real gap
   from an invented synonym; raise real gaps for domain modeling.
4. Surface a conflict with an existing ADR explicitly, for example:
   _Contradicts ADR-0007 (Zotero's own player stays in the page, hidden),
   but worth reopening because…_

Before writing a term or decision, follow `MEMORY/docs.md` for the
destination, record criteria, numbering, front matter and design/ADR
pairing. `CONTEXT.md` is this repo's glossary; use it when a generic skill
calls that document `GLOSSARY.md`. It holds definitions, not plans or
implementation notes.

Exploration is ready when the area's vocabulary and binding decisions
are read, and any conflict is explicit rather than silently overridden.
