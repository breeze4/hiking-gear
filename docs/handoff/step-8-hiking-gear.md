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
The Woodpecker check workflow passed for pipeline `1`. The first publication
workflow failed because the pinned Node image already owns GID `1000`, while
the initial Dockerfile tried to create that group again. The recovery removes
the redundant group and user creation. The second publication workflow passes,
and publishes `ghcr.io/breeze4/hiking-gear@sha256:9e26b6dbc9d3bf0e43064487639488696828af81bcdc1e18714ac81719820c7d`
with revision `dc820848f789a4b5b428e5e40ac37cb7268c7f66`.

The first candidate used a production-data SQLite backup and preserved the
source service, but its process failed before health because Corepack tried to
write its package-manager cache to the read-only root filesystem. The second
candidate still invoked Corepack through its pnpm shim. The final recovery
starts the already-installed `tsx` runtime directly. The build and all package
operations continue to use pnpm. This removes the source `npm start` command
without giving the runtime a writable package-manager cache. The candidate and
image gates run again from this recovery commit. The production dependency set
now includes `tsx`, because the TypeScript server starts at runtime.

The Woodpecker webhook did not create a pipeline for the startup recovery until
the public listener was reapplied. After preserving the absent delivery as an
edge recovery, one empty trigger commit created pipeline `4`. Pipeline `4`
passed for commit `8c28125c22b8fdedf5819228ff0e974df3e9cdaa` and published
`ghcr.io/breeze4/hiking-gear@sha256:15c5f74eafbc7ba63d0973eec03990cbf8433a15e5e94b63868afb1256d77626`.
Its production-data candidate then proved that `tsx` must be a production
dependency. The focused image and candidate gates run again after that repair.

The GitHub delivery for the production-dependency recovery received HTTP `502`
with `failed to connect to host`, so Woodpecker had no pipeline for
`b8fae038dbc528bf9161b21ac04c3a7c3e408d51`. After the delivery evidence was
recorded, this step creates one empty trigger commit for the unchanged recovery
tree and monitors the resulting pipeline through the Woodpecker API.

## Final bridge evidence

The trigger pipeline passed as Woodpecker pipeline `5` for commit
`dbf65b3d4000d0db67676ecf3b517c79b8de5d25`. It published
`ghcr.io/breeze4/hiking-gear@sha256:db21fb33a1d51fdfccdedfdea855f0389c677f541dc1ae30f118eef106d12539`.
The OCI revision label equals that commit, and the image user is `1000:1000`.

The isolated candidate restored its database by SQLite backup, then passed
`/api/health` and returned 26 retained lists. The candidate database reports
`ok` and `wal`. Docker inspection proves `ReadonlyRootfs=true`, `CapDrop=[ALL]`,
and the only bind is the candidate data directory at `/data`. The source
`hiking-gear.service` stayed active throughout the candidate test.

The normal commit hook recorded Factory compatibility deployment
`ff510e58-b03d-4257-b332-0d65c24f0847` for the final bridge commit. Stopping
the candidate restored the source response from port `8002`, which returned
`{"status":"ok"}`. The candidate never received production traffic.

## Remaining verification

A fresh-context verifier must inspect this committed bridge and repeat the
repository, image, production-data candidate, source-service, and rollback
criteria without repairing this step.

## Rollback

Stop the candidate Compose service before route cutover. Factory continues to
own the source deployment and the active service remains available for rollback.
