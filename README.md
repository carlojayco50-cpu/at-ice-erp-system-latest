# AT Ice ERP

Management system for an ice business: HR and attendance with face recognition,
payroll, supplies inventory and stock-out requests, deliveries with GPS and photo
proof, customers, receipts, and a BI dashboard.

| Folder | What it is |
|---|---|
| `at-ice-backend/` | Laravel 12 JSON API (PHP 8.2+), Sanctum token login |
| `at-ice-frontend/` | React 19 + Vite + Tailwind single-page app |

Roles: **Admin**, **HR**, **Employee** (Checker, Salesman, Maintenance), **Driver**
and **Customer**. Everyone signs in at `/login`. The Attendance Station
(`/attendance-station`) is a kiosk unlocked with an HR PIN.

---

## Requirements

- PHP 8.2 or newer, with the `pdo_sqlite` (local) or `pdo_mysql` extension
- Composer 2
- Node.js 20 or newer and npm
- Git

For production you only need Docker (see [DEPLOY.md](DEPLOY.md)).

---

## Run it on your computer

### 1. Backend

```bash
cd at-ice-backend
composer setup
```

`composer setup` installs the packages, copies `.env.example` to `.env`, makes the
app key, creates the database (SQLite file by default) and runs the migrations.

Then link the photo folder so delivery proofs and attachments can be seen:

```bash
php artisan storage:link
```

### 2. Frontend

```bash
cd at-ice-frontend
cp .env.example .env
npm install
```

### 3. Start everything

In `at-ice-backend` (starts the API on port 8000, the queue worker and the logs):

```bash
composer dev
```

In `at-ice-frontend` (starts the web app on port 5173):

```bash
npm run dev
```

Open http://localhost:5173.

### 4. First accounts

Create the first Admin. It prints a generated password once; sign in with it,
then change it in Account Settings:

```bash
php artisan admin:create you@example.com --name="Your Name"
```

Sign in as Admin, then add the other users (HR, employees, drivers, customers)
from the app. Set the Attendance Station PIN from the HR page **Kiosk PIN**, or:

```bash
php artisan kiosk:set-pin
```

---

## Your own settings (`at-ice-backend/.env`)

The `.env` file holds passwords and keys, so it is **never** committed. Each person
who clones the project makes their own from `.env.example`.

### Email (Forgot password codes and new customer logins)

Without email settings the system still works, but emails are only written to
`at-ice-backend/storage/logs/laravel.log` instead of being sent.

To really send them with a Gmail account:

1. Turn on **2-Step Verification** on the Google account.
2. Create an **App Password** at https://myaccount.google.com/apppasswords
   (16 letters).
3. Put these in `at-ice-backend/.env`:

   ```
   MAIL_MAILER=smtp
   MAIL_HOST=smtp.gmail.com
   MAIL_PORT=587
   MAIL_USERNAME=yourgmail@gmail.com
   MAIL_PASSWORD=your16letterapppassword
   MAIL_FROM_ADDRESS="yourgmail@gmail.com"
   MAIL_FROM_NAME="AT Ice"
   ```

4. Restart the backend (`composer dev`).

Gmail sends up to about 500 emails a day for free.

### Other keys (optional)

| Setting | What it is for |
|---|---|
| `GROQ_API_KEY` | AI summary on the Admin dashboard (free key at https://console.groq.com) |
| `EMAIL_VERIFY_API_KEY` | Checks that a new customer's email really exists (quickemailverification.com) |
| `BROADCAST_CONNECTION=pusher` and `PUSHER_*` | Instant updates through Pusher. Without it, pages still refresh by themselves every few seconds. |
| `APP_TIMEZONE=Asia/Manila` | Philippine time. Keep it. |

Maps use OpenStreetMap, so no map key is needed.

### Camera and GPS need HTTPS

Browsers give the camera (Attendance Station face recognition) and the location
(Driver GPS) only to `https://` sites or `localhost`. Opened as
`http://192.168.x.x:5173` from a phone or another computer, those two features
are blocked; everything else still works. To test them on a phone before
deploying, use an HTTPS tunnel (for example cloudflared or ngrok). The deployed
site runs on HTTPS, so there they work.

---

## Useful commands

| Where | Command | What it does |
|---|---|---|
| backend | `composer test` | Runs the tests |
| backend | `./vendor/bin/pint` | Formats the PHP code |
| backend | `php artisan migrate` | Applies new database changes after a pull |
| frontend | `npm run lint` | Checks the JavaScript code |
| frontend | `npm run build` | Builds the app for production |

After pulling new changes, run `composer install` and `php artisan migrate` in
`at-ice-backend`, and `npm install` in `at-ice-frontend`.

---

## Production

Production runs as one Docker Compose stack (web, API, queue worker, MySQL 8.4).
All production settings are listed in [.env.production.example](.env.production.example).
Deploy, backups and creating the first Admin are in [DEPLOY.md](DEPLOY.md).
