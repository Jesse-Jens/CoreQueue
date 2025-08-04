#!/usr/bin/env bash
set -e
TARGET=/var/www/corequeue
CONF=/etc/nginx/sites-available/corequeue
LINK=/etc/nginx/sites-enabled/corequeue
PORT=80

if [[ $EUID -ne 0 ]]; then
  echo "Please run as root" >&2
  exit 1
fi

while [[ $# -gt 0 ]]; do
  case $1 in
    --clean)
      rm -rf "$TARGET"
      rm -f "$CONF" "$LINK"
      systemctl reload nginx || true
      echo "Cleaned previous install"
      exit 0
      ;;
    --port)
      PORT=$2
      shift 2
      ;;
    *)
      shift
      ;;
  esac
done
apt-get update
apt-get install -y nginx
mkdir -p "$TARGET"
cp -r frontend/* "$TARGET"
cat > "$CONF" <<NGINX
server {
    listen $PORT;
    server_name _;
    root $TARGET;
    index login.html;
    location / {
        try_files \$uri \$uri.html \$uri/ =404;
    }
}
NGINX
ln -sf "$CONF" "$LINK"
systemctl restart nginx
echo "Deployment finished. Browse http://localhost:$PORT/login"
