# shipctl

A toy release helper. These docs have drifted from its `--help` — every
seeded lie below maps to one flagdrift code (D101–D108).

## Quickstart

```bash
shipctl build --out dist
shipctl deploy --concurrency 4
shipctl push --dry-run=fast
```

## Flag reference

| Flag | Default | Effect |
|---|---|---|
| `--out <DIR>` | `dist` | write artifacts to this directory |
| `--registry <URL>` | `http://127.0.0.1:5000` | registry to push to |
| `--format <FMT>` | `table` | output format: `table` or `json` |
| `--[no-]color` | — | force or disable colored output |
| `--tag <TAG>` | — | tag to publish; repeatable |
| `--dry-run` | — | print what would happen without doing it |
| `--timeout <SECS>` | `60` | per-request timeout |
| `-q, --quiet` | — | only errors |
