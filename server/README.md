# Optional Still community service

The editor and bundled Discover collection work entirely from GitHub Pages,
including offline. Publishing community Looks, accounts, likes, and comments
require this separate HTTP service. It does not run on GitHub Pages.

## Run with Node 24

From the repository root:

```sh
ALLOWED_ORIGINS=https://sloth-os.github.io \
STILL_COMMUNITY_DB=/your/persistent/data/community.sqlite \
HOST=127.0.0.1 PORT=8787 \
node server/index.mjs
```

For local development, `npm run community:server` uses port 8787 and allows the
local Vite development/preview origins. SQLite data defaults to `.data/`, which
is ignored by Git. Accounts, sessions, Looks, likes, and comments survive a
restart when the database is stored on a persistent disk.

Put the service behind an HTTPS reverse proxy for public use. For example, a
Caddy configuration can proxy `community.example.com` to `127.0.0.1:8787`.
Set `ALLOWED_ORIGINS` to the editor's **origin**, without its repository path.
Multiple origins are comma-separated. Requests from other browser origins are
rejected; no wildcard is enabled by default.

## Container

```sh
docker build -f server/Dockerfile -t still-community .
docker volume create still-community-data
docker run --rm -p 127.0.0.1:8787:8787 \
  --mount source=still-community-data,target=/data \
  -e ALLOWED_ORIGINS=https://sloth-os.github.io \
  still-community
```

The image runs as the unprivileged Node user. The backend requires only Node's
standard library and the shared color/LUT validation module; it does not install
the frontend's dependencies. Container execution is provided as a deployment
recipe; integration tests run the actual Node service directly.

## Connect from the editor

1. Open **Explore looks → Discover → Connect a community service**.
2. Enter the service's HTTPS base address and select **Connect**.
3. Create an account or sign in, then choose **Share look**.
4. Review the name, description, tags, and preview before publishing.

The original photograph is never uploaded. A reviewed publish request contains
the edit recipe and a small preview; a recipe can itself contain an embedded
double-exposure image, mask, or face coordinates. Shared requests are limited to
1 MB. Larger Looks can be shared as files instead.

Offline publish requests stay in an IndexedDB outbox. Reconnection or **Retry**
resends them with an idempotency key, preventing duplicate publication. They are
sent only for the signed-in account that reviewed them. **Clear outbox** cancels
pending sharing. Changing services drops the old login before contacting the
new address.

## Operations

- `GET /api/health` reports readiness.
- `POST /api/auth/register`, `/login`, `/logout`; `GET /api/me` manage accounts.
- `GET /api/looks?q=…&before=…` browses/searches; `POST /api/looks` publishes.
- `POST /api/looks/:id/like` toggles a like.
- `GET/POST /api/looks/:id/comments` reads/posts comments.
- `DELETE /api/looks/:id` removes an author's own Look.

Passwords use salted scrypt hashes. Bearer sessions expire after seven days and
are stored hashed on the server. SQL statements bind user input. Render data,
image sources, body size, account attempts, and request rates are validated.
No credentials are logged. Back up the SQLite database with a consistent SQLite
backup operation; preserve the persistent volume across deployments.

The service has no email delivery, password-reset mail, Google account linking,
or automatic connection to Google's Discover feed. A public operator remains
responsible for its deployment, backups, account recovery, and moderation.
No hosted service or external account is created automatically.

Run the service integration tests with `node --test server/*.test.mjs`.
