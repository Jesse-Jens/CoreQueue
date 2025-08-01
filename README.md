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

Run the provided `deploy.sh` script on an Ubuntu LTS machine to install Nginx and copy the static files:

```bash
sudo ./deploy.sh
```

For a clean reinstall use:

```bash
sudo ./deploy.sh --clean
```

After deployment browse to `http://localhost/Login.html` to access the login page.
