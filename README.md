# CoreQueue

This repository contains the static frontend for the CoreQueue ticket system.

## Default accounts

The login screen accepts a few built in accounts used for testing:

| Role        | Email example              | Password  |
|-------------|----------------------------|-----------|
| Admin/Tech  | `admin@corequeue.local`    | `admin123`|
| Technician  | `anything@tech.com`        | `tech123` |
| Customer    | any email                  | `customer123` |

After login a technician will be sent to the technician dashboard and a customer to the customer dashboard.

## Deployment

Run the provided `deploy.sh` script on an Ubuntu LTS machine to install Nginx and copy the static files. By default the server listens on port `80`, but you can choose a custom port with the `--port` option:

```bash
sudo ./deploy.sh
# custom port example
sudo ./deploy.sh --port 8080
```

For a clean reinstall use:

```bash
sudo ./deploy.sh --clean
```

After deployment browse to `http://localhost/login` (or `http://localhost:<port>/login` if you changed the port) to access the login page.

## Theme preferences

Every page supports light or dark mode. Use the moon/sun toggle on the dashboard (or the option in Settings) to switch modes. Your choice is stored in the browser so it persists across visits.

## Organisations

Use the Organisations section to manage customer companies. Creating an organisation requires a name and primary contact; optional address, phone, email and notes can also be recorded. Additional contacts can be added from the organisation detail view.
