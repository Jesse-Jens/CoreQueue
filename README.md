# CoreQueue

This repository contains the frontend and lightweight server for the CoreQueue ticket system. All data is persisted on the host
machine in `data/storage.json` so that multiple users share the same database instead of relying on browser local storage.

## Default account

Only a single administrator account exists by default:

| Role       | Email                   | Password  |
|------------|-------------------------|-----------|
| Admin/Tech | `admin@corequeue.local` | `admin123`|

All other users are created by inviting contacts under an organisation. An invite explicitly grants portal access and may be blocked later. Each invite may specify a password or generate one automatically, which can then be shared with the recipient.
Contacts logged in as **controller** can view every ticket for their organisation, including archived ones; those with the **customer** role only see their own tickets.

## Deployment

Run the provided `deploy.sh` script on an Ubuntu LTS machine to install Node.js, Nginx and the CoreQueue service. By default the server listens on port `80`, but you can choose a custom port with the `--port` option:

```bash
sudo ./deploy.sh
# custom port example
sudo ./deploy.sh --port 8080
```

For a clean reinstall you can pass `--clean` and optionally combine it with
`--port` to choose the listening port:

```bash
sudo ./deploy.sh --clean           # reinstall on the default port 80
sudo ./deploy.sh --clean --port 8000
```

After deployment browse to `http://localhost/login` (or `http://localhost:<port>/login` if you changed the port) to access the login page. All state is stored in `/opt/corequeue/data/storage.json` so it is shared across browsers and survives restarts.

The deploy script also installs a Cloudflare tunnel agent (`cloudflared`). The service forwards the chosen port to Cloudflare and reads its token from `/opt/corequeue/data/cloudflare-token`. The default admin can update this token from the **Cloudflare** section in Settings, which also reports the current tunnel status.

## Theme preferences

Every page supports light or dark mode. Use the moon/sun toggle on the dashboard (or the option in Settings) to switch modes. Your choice is stored in the browser so it persists across visits.

## Organisations

Use the Organisations section to manage customer companies. Creating an organisation requires a name and primary contact; optional address, phone, email and notes can also be recorded. Additional contacts can be added from the organisation detail view.
