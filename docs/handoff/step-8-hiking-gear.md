# Step 8: Hiking Gear Woodpecker bridge

## Baseline

The bridge starts from `main` at `96e6fc7e615cc5cf9ab31efd198087e61fc6e956`.
The checkout contains unrelated untracked `.claude/skills/gear-shopping-agent/`
and `.vscode/` paths. This step does not stage or change either path.

The source `hiking-gear.service` remains active on BeeBaby port `8002`. It
runs `npm start` with `DB_PATH=/home/beeadmin/dev/hiking-gear/data/hiking-gear.db`.
The production data contains the database, write-ahead log, and shared-memory
files. SQLite reports `ok` for `PRAGMA integrity_check` and `wal` for
`PRAGMA journal_mode`. The database file checksum before the bridge is
`7aa0dbccf65088cfe36cc976b87b70f6ae05f93cc406c950d96b535c92e2a903`.

## Bridge

The bridge adds a digest-pinned Node 22 container image, a hardened candidate
Compose service, Woodpecker checks and image publication, the common gate, and
container deployment instructions. The runtime uses `pnpm start`, runs as UID
and GID `1000`, and receives only the declared `/data` mount. It has no Docker
socket or host filesystem mount.

The candidate Compose service uses loopback port `18082`. It does not move
production traffic or stop the Factory source service. The mounted data path is
`/srv/beebaby/data/hiking-gear`. Create and restore SQLite backups with the
SQLite backup operation, not file copies of a live database.

## Gates

`scripts/ci-gates.sh` passes: 32 Node tests pass, and the Vite production build
passes. The local Docker daemon is unavailable on the Mac because its OrbStack
socket does not exist. This environment failure is recorded before recovery.
The Woodpecker publication pipeline is the authoritative remote image gate.

## Rollback

Stop the candidate Compose service before route cutover. Factory continues to
own the source deployment and the active service remains available for rollback.
