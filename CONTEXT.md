# Domain Glossary

> Single-context repo. See `docs/adr/` for architecture decisions.

## HTTP Schema Validation

Zod is the single validation library for both env config and HTTP request schemas. TypeBox is not used. Type inference uses `z.infer<typeof schema>`.

→ See [ADR 0001](docs/adr/0001-zod-over-typebox.md)
