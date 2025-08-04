#!/usr/bin/env bash
set -e
APP=/opt/corequeue
SERVICE=/etc/systemd/system/corequeue.service
CONF=/etc/nginx/sites-available/corequeue
LINK=/etc/nginx/sites-enabled/corequeue
PORT=80
API_PORT=3001

if [[ $EUID -ne 0 ]]; then
  echo "Please run as root" >&2
  exit 1
fi

while [[ $# -gt 0 ]]; do
  case $1 in
    --clean)
      systemctl stop corequeue.service 2>/dev/null || true
      systemctl disable corequeue.service 2>/dev/null || true
      rm -f "$SERVICE"
      rm -rf "$APP"
      rm -f "$CONF" "$LINK"
      systemctl reload nginx 2>/dev/null || true
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
apt-get install -y nginx nodejs npm
mkdir -p "$APP"
cp -r frontend server.js package.json data "$APP" 2>/dev/null || true
npm --prefix "$APP" install --production
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
