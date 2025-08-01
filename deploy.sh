#!/usr/bin/env bash
set -e
TARGET=/var/www/corequeue
CONF=/etc/nginx/sites-available/corequeue
LINK=/etc/nginx/sites-enabled/corequeue
if [[ $EUID -ne 0 ]]; then
  echo "Please run as root" >&2
  exit 1
fi
if [[ $1 == "--clean" ]]; then
  rm -rf "$TARGET"
  rm -f "$CONF" "$LINK"
  systemctl reload nginx || true
  echo "Cleaned previous install"
  exit 0
fi
apt-get update
apt-get install -y nginx
mkdir -p "$TARGET"
cp -r frontend/* "$TARGET"
cat > "$CONF" <<NGINX
server {
    listen 80;
    server_name _;
    root $TARGET;
    index Login.html;
    location / {
        try_files \$uri \$uri/ =404;
    }
}
NGINX
ln -sf "$CONF" "$LINK"
systemctl restart nginx
echo "Deployment finished. Browse http://localhost/Login.html"
