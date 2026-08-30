# Hiking Gear deployment

Hiking Gear runs from an immutable GitHub Container Registry image. The image
contains the built client and the Node API. It reads its SQLite data at runtime.

## Runtime data

The Compose service mounts `HIKING_GEAR_DATA_DIR` at `/data`. The directory
contains `hiking-gear.db` and its SQLite write-ahead log files. The service sets
`DB_PATH=/data/hiking-gear.db`.

Before a candidate starts, create a consistent backup with SQLite:

```sh
sqlite3 /srv/beebaby/data/hiking-gear/hiking-gear.db ".backup '/srv/beebaby/backups/hiking-gear/hiking-gear.db'"
```

The data directory owner must be UID and GID `1000`. Do not copy a live
database file without its SQLite backup operation.

## Build and verify an image

Set the following values before rendering `compose.beebaby.yaml`:

```sh
IMAGE_DIGEST=ghcr.io/breeze4/hiking-gear@sha256:IMAGE_SHA256
HIKING_GEAR_DATA_DIR=/srv/beebaby/data/hiking-gear
```

The candidate listens on loopback port `18082`. Confirm `/api/health`, the
root page, and a retained client route after the container becomes healthy.

## Roll back a candidate

While Factory owns the source deployment, stop the candidate Compose service.
The bridge does not move traffic, remove Factory contracts, or change the
source deployment service.
