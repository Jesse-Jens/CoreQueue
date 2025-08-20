#!/usr/bin/env bash
set -e
wait_for_apt() {
  while fuser /var/lib/dpkg/lock-frontend >/dev/null 2>&1 \
        || fuser /var/lib/apt/lists/lock >/dev/null 2>&1 \
        || fuser /var/cache/apt/archives/lock >/dev/null 2>&1; do
    echo "Waiting for other apt processes to finish..."
    sleep 1
  done
}
APP=/opt/corequeue
SERVICE=/etc/systemd/system/corequeue.service
CONF=/etc/nginx/sites-available/corequeue
LINK=/etc/nginx/sites-enabled/corequeue
PORT=80
API_PORT=3001
CLEAN=false

if [[ $EUID -ne 0 ]]; then
  echo "Please run as root" >&2
  exit 1
fi

while [[ $# -gt 0 ]]; do
  case $1 in
    --clean)
      CLEAN=true
      shift
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

if $CLEAN; then
  systemctl stop corequeue.service 2>/dev/null || true
  systemctl disable corequeue.service 2>/dev/null || true
  rm -f "$SERVICE"
  rm -rf "$APP"
  rm -f "$CONF" "$LINK"
  systemctl stop corequeue-cloudflared.service 2>/dev/null || true
  systemctl disable corequeue-cloudflared.service 2>/dev/null || true
  rm -f /etc/systemd/system/corequeue-cloudflared.service /usr/local/bin/corequeue-cloudflared.sh
  systemctl reload nginx 2>/dev/null || true
  echo "Cleaned previous install"
fi
wait_for_apt
apt-get update
wait_for_apt
apt-get install -y nginx nodejs npm curl

# install cloudflared if missing
if ! command -v cloudflared >/dev/null 2>&1; then
  curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb -o /tmp/cloudflared.deb
  wait_for_apt
  dpkg -i /tmp/cloudflared.deb || (wait_for_apt && apt-get install -f -y)
fi
mkdir -p "$APP"
cp -r frontend server.js package.json data "$APP" 2>/dev/null || true
npm --prefix "$APP" install --production
touch "$APP/data/cloudflare-token"
cat > "$SERVICE" <<SERVICE
[Unit]
Description=CoreQueue server
After=network.target

[Service]
Type=simple
WorkingDirectory=$APP
ExecStart=/usr/bin/node server.js
Environment=PORT=$API_PORT
Restart=always

[Install]
WantedBy=multi-user.target
SERVICE
systemctl enable --now corequeue.service

# cloudflared tunnel service
cat > /usr/local/bin/corequeue-cloudflared.sh <<CFSH
#!/bin/bash
TOKEN_FILE="$APP/data/cloudflare-token"
TOKEN=""
[ -f "\$TOKEN_FILE" ] && TOKEN=\$(cat "\$TOKEN_FILE")
if [ -z "\$TOKEN" ]; then
  echo "Missing Cloudflare token" >&2
  exit 1
fi
exec /usr/local/bin/cloudflared tunnel --no-autoupdate run --token "\$TOKEN" --url http://localhost:$PORT
CFSH
chmod +x /usr/local/bin/corequeue-cloudflared.sh

cat > /etc/systemd/system/corequeue-cloudflared.service <<CFSERVICE
[Unit]
Description=Cloudflare Tunnel for CoreQueue
After=network.target
StartLimitIntervalSec=0

[Service]
Type=simple
ExecStart=/usr/local/bin/corequeue-cloudflared.sh
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
CFSERVICE
systemctl daemon-reload
systemctl disable corequeue-cloudflared.service >/dev/null 2>&1 || true
echo "Cloudflare tunnel installed. Use Settings to provide a token and enable the tunnel."

cat > "$CONF" <<NGINX
server {
    listen $PORT;
    server_name _;
    location / {
        proxy_pass http://localhost:$API_PORT;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
NGINX
ln -sf "$CONF" "$LINK"
systemctl restart nginx
echo "Deployment finished. Browse http://localhost:$PORT/login"
