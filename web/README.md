# Teams Auto Report Web

Next.js UI for the Teams daily report workspace.

## Local setup

1. Copy `.env.example` to `.env.local` and replace `AUTH_SECRET` with a random value of at least 32 characters.
2. Set `JSON_DATA_ROOT` to the absolute path of the `teams-auto-report` directory.
3. Create the first linked member account:

   ```bash
   npm run user:create -- --username=le_cong_tuan --member-id=le_cong_tuan
   ```

   The CLI stores only a bcrypt hash in `users/<member_id>/account.json`. The
   directory name and `account.id` remain the stable member ID; `username` may
   be changed independently. Member config, Teams credentials, and generated
   state live beside the account as `config.json`, `credentials.json`, and
   `state.json`.

   Reset a password with a hidden prompt:

   ```bash
   npm run user:password -- --username=le_cong_tuan
   ```

4. Start the application:

   ```bash
   npm run dev
   ```

## Verification

```bash
npm test
npm run lint
npm run build
```

Runtime JSON (`users/`, `groups/`, `audit/`, `.state/`) and browser profiles
are intentionally excluded from Git. Back them up and deploy them separately
from the application source.
