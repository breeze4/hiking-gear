# Step 26: Hiking Gear Factory cleanup

## Baseline

The cleanup starts from `main` at `4550b831157169576e9887ad6fdd3425c758b1b0`.
The checkout carries unrelated untracked `.claude/skills/gear-shopping-agent/`
and `.vscode/` paths. This step does not stage or change either path.

The container deployment already owns the live service. Before the cleanup,
`/srv/beebaby/deployments/hiking-gear/active.env` records
`ghcr.io/breeze4/hiking-gear@sha256:db21fb33a1d51fdfccdedfdea855f0389c677f541dc1ae30f118eef106d12539`
for commit `dbf65b3d4000d0db67676ecf3b517c79b8de5d25`. The cutover entry in
`history.log` is dated `2026-08-31T00:37:01Z`. Caddy routes tailnet port `8002`
to the container port `8080`, and
`http://beebaby.tailc65f2f.ts.net:8002/api/health` returns `200` with
`{"status":"ok","version":"dev"}`. The retired `hiking-gear.service` user unit
is `inactive` and still `enabled`.

The repository carried both `scripts/ci-gates.sh` and
`scripts/cicd-router-gates.sh`. The two files ran the same three commands.

## Changes

- Remove `factory.project.yml` and `cicd-router.project.yml`. Git history keeps
  both contracts.
- Merge the two gate scripts into one `scripts/ci-gates.sh` and remove
  `scripts/cicd-router-gates.sh`. The merged file runs the whole gate:
  `pnpm install --frozen-lockfile`, `pnpm test`, and `pnpm run build`. The merge
  preserves the gate rather than redefining it, so `pnpm exec tsc --noEmit`
  stays a local pre-commit step that the README names.
- Point `.woodpecker/check.yaml` at `bash scripts/ci-gates.sh`. The workflow
  keeps `corepack enable`, because the toolchain setup belongs to the workflow
  and the gate belongs to the script.
- Add `.woodpecker/deploy.yaml`. It depends on the `publish` workflow and calls
  the restricted deployment command with the commit tag. The host resolves the
  tag to its digest, so the deploy step reads no registry token.
- Rewrite `docs/deployment.md` for the container path, including the retained
  data directory, the secrets, the rollback, and the live check.
- Rewrite the README and `CLAUDE.md` deployment sections. Both described Factory
  and the retired router as the live path.
- Add a dated correction to `docs/lessons.md` that supersedes the 2026-08-28
  Factory entry, and update the `Last-verified` header.

The `deploy/remote-bootstrap.sh` script and the `deploy/hiking-gear.service`
unit stay in the tree. The rollback window stays open until the container
deployment passes one BeeBaby reboot and seven days of normal operation, and the
documented rollback still needs them. `docs/deployment.md` and the README both
record that.

Completed plans, prompts, and the step-8 handoff keep their Factory language,
because they are historical records.

## Gate results

`bash scripts/ci-gates.sh` passes on the Mac: 32 tests pass and the Vite
production build passes.

The first container reproduction failed. Running the pinned image
`node:22.14.0-bookworm-slim@sha256:745403dc46b5ab4c998502b07a12cbf020cf2c30645427a68ec0718f02d647de`
on the arm64 Mac installed the locked dependencies and passed all 32 tests, then
crashed the build:

```
fatal error: lfstack.push
...
✗ Build failed in 303ms
error during build:
[commonjs--resolver] The service was stopped
```

The pinned digest carries only `linux/amd64`, so Docker Desktop emulated the
image. `lfstack.push` is a Go runtime failure under emulation, not a repository
failure. The reproduction ran again on BeeBaby, which is native `x86_64`, with
the same image and the same command. It passed: 32 tests pass and the build
produces the same `dist/assets/index-COQUhcDu.js` bundle as the Mac run. The
temporary extraction directory on BeeBaby was removed after the run.

Reproduce a Woodpecker gate for this repository on BeeBaby, not on an arm64 Mac.

## Pipeline and deployment evidence

Recorded in the follow-up evidence commit, which carries the pipeline number,
the deployed digest, the `active.env` contents, and the live check result.

## Remaining risks

- `server/index.ts` still reads the retired `cicd-router.version.json` stamp
  file for `/api/health`. The file is absent from the image, so `version` reads
  `dev`. This step leaves the application code unchanged and documents the
  behavior. To restore a useful stamp, pass the build argument `VCS_REF` through
  to a runtime file or environment variable in a separate change.
- The retired `hiking-gear.service` user unit stays `enabled` while `beeadmin`
  has lingering enabled. On a BeeBaby reboot the unit starts and binds port
  `8002`, which the edge Caddy container also publishes on the tailnet address.
  Whichever binds first wins. Every cutover service on the host shares this
  state, so the fix belongs to the host, not to this repository.
- The gate does not run `pnpm exec tsc --noEmit`. A type error reaches the image
  build, which runs `vite build` without type checking.
