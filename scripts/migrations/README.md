# Historical data migrations

These scripts document one-time schema transitions that have already been applied:

1. `001-unify-members-and-users.js`
2. `002-extract-member-credentials.js`
3. `003-create-initial-group.js`

They are intentionally not exposed as npm scripts. Do not run them on a current
installation unless restoring data from the corresponding legacy schema. Each
script defaults to dry-run; inspect its output and create an independent backup
before using `--apply`.

For the current schema, use:

```bash
npm run data:normalize
npm run data:normalize -- --apply
```
