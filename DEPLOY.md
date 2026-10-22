# Deploying AT Ice

Production runs as one **Docker Compose** stack built from
`docker-compose.yml` on the `main` branch. A push to `main` redeploys
automatically through the hosting platform's GitHub App; if that build fails,
the running version stays up. GitHub Actions
(`.github/workflows/ci.yml`) builds both images on every push and PR as a check.

```
Internet ─▶ reverse proxy (TLS) ─▶ frontend (nginx :80)
                                     ├─ /          React SPA
                                     ├─ /storage/  delivery-proof photos (shared volume, read-only)
                                     └─ /api, /up ─FastCGI─▶ backend (php-fpm :9000) ─▶ mysql
                                                            worker (queue:work) ───────┘
```

| Service    | Image / build              | Notes |
|------------|----------------------------|-------|
| `frontend` | `at-ice-frontend/Dockerfile` | Only public service. Domains: `https://www.atice.cloud` (canonical) and `https://atice.cloud` (301 to www). |
| `backend`  | `at-ice-backend/Dockerfile`  | Runs `migrate --force` and caches config/routes on every start. |
| `worker`   | same as backend              | Required: broadcast events and every email are queued. |
| `scheduler` | same as backend             | Required: `php artisan schedule:work` runs the time-based jobs every minute (driver reassignment and delay notices, missed-Time-Out memos, payroll cut-off notice, archive expiry). |
| `mysql`    | `mysql:8.4`                  | Must be MySQL; BI queries use `MONTH()`. Data in the `mysql-data` volume. |

## Environment

All variables are listed in `.env.production.example`. Set them in the hosting
panel's environment variables for the stack. `PUSHER_APP_KEY` is compiled into
the frontend, so **redeploy** after changing it. The maps use OpenStreetMap and
need no key.

Realtime channels are private: the browser signs each subscription at `POST /api/broadcasting/auth` with its login token (roles in `routes/channels.php`).
Realtime stays on `BROADCAST_CONNECTION=log` until `PUSHER_APP_ID` and
`PUSHER_APP_SECRET` are set; then switch it to `pusher`.

## First deploy

After the stack is healthy, create the first admin from a terminal in the
`backend` container:

```sh
php artisan admin:create owner@example.com --name="Owner"
```

It prints a one-time password. Running it again for the same email resets the password.

## Backups

A **scheduled task** (`mysql-backup`, container `mysql`) runs nightly at
02:00 Philippine time (`0 18 * * *` UTC). It writes a consistent, gzipped
`mysqldump` to the `mysql-backups` volume (`/backups` in the mysql container)
and deletes dumps older than 14 days:

```sh
mysqldump -uroot -p"$MYSQL_ROOT_PASSWORD" --single-transaction --routines --triggers atice | gzip > /backups/atice-$(date +%F-%H%M).sql.gz && find /backups -name 'atice-*.sql.gz' -mtime +14 -delete && ls -lh /backups
```

These dumps live on the same server. To survive losing the server, add an S3
destination in the hosting panel and a storage backup of the `mysql-backups`,
`public-storage` (delivery photos) and `private-storage` (applicants' resumes) volumes.

**Restore** (mysql container terminal; overwrites current data):

```sh
ls -lh /backups
gunzip < /backups/atice-YYYY-MM-DD-HHMM.sql.gz | mysql -uroot -p"$MYSQL_ROOT_PASSWORD" atice
```
