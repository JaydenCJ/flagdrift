# shipctl

A toy release helper. These docs match its `--help` exactly — flagdrift
reports zero drift against them.

## Quickstart

```bash
shipctl build --out dist -t v2.4.0
shipctl push --registry http://127.0.0.1:5000 --dry-run
shipctl status --format json
```

## Flag reference

| Flag | Default | Effect |
|---|---|---|
| `-o, --out <DIR>` | `dist` | write artifacts to this directory |
| `--retries <N>` | `3` | retry failed uploads |
| `--registry <URL>` | `http://127.0.0.1:5000` | registry to push to |
| `--format <FMT>` | `table` | output format: `table` or `json` |
| `--[no-]color` | — | force or disable colored output |
| `-t, --tag <TAG>` | — | tag to publish; repeatable |
| `--dry-run` | — | print what would happen without doing it |
| `--timeout <SECS>` | `30` | per-request timeout (deprecated — use `--retries`) |
| `-q, --quiet` | — | only errors |
