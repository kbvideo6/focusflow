# FocusFlow

FocusFlow is a personal dashboard for attendance, finance, fitness, skincare, projects, and timetable tracking.

## Local development

### Requirements

- Node.js 20+
- npm

Install dependencies:

```powershell
npm run install-all
```

Start backend and frontend separately:

```powershell
npm run dev:backend
npm run dev:frontend
```

The frontend runs on the Vite development URL and uses `http://localhost:5000/api` unless `VITE_API_URL` is configured.

## Docker deployment

Create a `.env` file in the project root. Do not commit it:

```env
JWT_SECRET=replace-with-a-long-random-secret
```

Build and start the production stack:

```bash
docker compose up -d --build
```

The frontend is served by Nginx on port `80`; API requests under `/api` are proxied to the backend. Open `http://YOUR_SERVER_IP` in a browser.

View service status and logs:

```bash
docker compose ps
docker compose logs -f
```

Stop the stack:

```bash
docker compose down
```

The SQLite database is persisted at `backend/database.sqlite`. Back it up before server maintenance.

## VPS deployment from Git

```bash
git clone YOUR_PUBLIC_REPOSITORY_URL focusflow
cd focusflow
printf 'JWT_SECRET=replace-with-a-long-random-secret\n' > .env
docker compose up -d --build
```

Make sure the VPS firewall allows TCP port `80`:

```bash
sudo ufw allow 80/tcp
```

## Timetable data

The current semester timetable is stored in `EES_2nd_Year_2nd_Semester_Timetable.csv`. The older semester file is retained as historical source data and is not used by the current seed configuration.
