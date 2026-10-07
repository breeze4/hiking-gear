# Deploy Hiking Gear

Woodpecker on BeeBaby builds, publishes, and deploys this repository. Factory no
longer participates.

## What happens on a push to main

The workflows come from the BeeBaby CI template in `beebaby-infra`, stamped by
its `scripts/stamp-ci.py`. Woodpecker runs four workflows for each commit on
`main`:

1. `.woodpecker/check.yaml` runs `bash scripts/ci-gates.sh all` in the pinned
   BeeBaby CI image. The gate runs `scripts/check-ghcr-token.py` on the
   workflow files, then installs the locked dependencies, runs the tests, and
   builds the client.
2. `.woodpecker/build-image.yaml` builds the runtime image with no secret and
   pushes nothing.
3. After both pass, `.woodpecker/publish.yaml` builds the runtime image again
   and pushes it to `ghcr.io/breeze4/hiking-gear` with the commit SHA as its
   tag. Its `publish-image` step is the only step that reads `ghcr_token`.
4. `.woodpecker/deploy.yaml` calls the restricted deployment command on BeeBaby
   with that tag. The host resolves the tag to its immutable digest with its own
   registry credentials, so the registry token stays limited to the build
   plugin.

A pull request runs the same check and build-image workflows, so a broken image
build fails the pull request. Deployment secrets stay out of pull request
pipelines.

To run the same gate before a local commit:

```sh
bash scripts/ci-gates.sh
```

To run the gate in the pinned BeeBaby CI image, run `sh scripts/ci-local.sh all`.

## Secrets

The `secret-names.yaml` file at the repository root lists the secret names that
the service reads. The values live in the BeeBaby secret store. The list holds
no entries: `cos secrets adopt` found no secret for hiking-gear, and
`HIKING_GEAR_DATA_DIR` in the deploy env file is a setting.

## What the deployment command does

The `deploy` forced command reaches `/usr/local/sbin/beebaby-deploy`, which
accepts only an allowlisted project, repository, commit, image digest, and
action. For each deployment it takes the host lock, confirms that the image
digest belongs to the expected GHCR repository, confirms that the image revision
label equals the pipeline commit, renders the Compose stack with the digest,
waits for container health, probes the service through the Caddy edge, and
records the digest. A failed health or route check restores the previous digest.

## Roll back

To return to the previous digest, read the last two entries in
`/srv/beebaby/deployments/hiking-gear/history.log` on BeeBaby and run the
deployment command with the digest you want:

```sh
ssh beeadmin@beebaby
sudo /usr/local/sbin/beebaby-deploy hiking-gear breeze4/hiking-gear \
  COMMIT_SHA ghcr.io/breeze4/hiking-gear@sha256:DIGEST deploy
```

The active digest and commit stay in
`/srv/beebaby/deployments/hiking-gear/active.env`.

A rollback replaces the image only. The data directory does not change, so an
image that expects a newer schema and an image that expects an older one both
open the same database file. Take a backup before you deploy a commit that
changes the schema in `server/db.ts`.

## Data

The service keeps its gear lists and items in one SQLite database. The Compose
stack binds the host data directory at `/data` and sets
`DB_PATH=/data/hiking-gear.db`. The container runs as UID and GID `1000`, so the
directory owner must match.

The deployment command reads the directory path from
`/srv/beebaby/secrets/deploy-env/hiking-gear.env`, which sets
`HIKING_GEAR_DATA_DIR`. The cutover kept the retained path
`/home/beeadmin/dev/hiking-gear/data`, so the live database, its write-ahead
log, and its shared-memory file stay where the source deployment left them.

Copy a live database only with the SQLite backup operation, never with `cp`:

```sh
ssh beeadmin@beebaby
sqlite3 /home/beeadmin/dev/hiking-gear/data/hiking-gear.db ".backup '/tmp/hiking-gear.db'"
```

The cutover backups stay in
`/srv/beebaby/backups/stateful-cutover/hiking-gear/`.

The local `data/hiking-gear.db` file is development data. The deployed database
is the source of truth.

## Secrets

The application reads no secret. Woodpecker holds the two secrets that the
pipeline needs: `ghcr_token` for the publish plugin and `beebaby_deploy_key` for
the deploy step. The deploy step never reads `ghcr_token`, because Woodpecker
honors an image filter only on a plugin step.

## Verify a deployment

Caddy routes tailnet port `8002` to the container port `8080`. After a
deployment, check the health endpoint and record the status code:

```sh
curl -sS -o /dev/null -w '%{http_code}\n' http://beebaby.tailc65f2f.ts.net:8002/api/health
```

The `version` value in that response reads `dev`, because the retired router
wrote the stamp file that `server/index.ts` looks for. To confirm which commit
is live, read the deployment record:

```sh
ssh beebaby 'sudo -n cat /srv/beebaby/deployments/hiking-gear/active.env'
```

## Retired source deployment

The `deploy/remote-bootstrap.sh` script and the `deploy/hiking-gear.service`
unit describe the retired source-copy deployment. The user unit stays installed
and inactive on BeeBaby. These files stay in the tree until the container
deployment passes one BeeBaby reboot and seven days of normal operation, because
the documented rollback path still needs them. Remove them after that window
closes.
