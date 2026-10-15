#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "用法：install.sh <解压后的发布目录>" >&2
  exit 2
fi

BUNDLE_DIR=$1
APP_ROOT=/home/lighthouse/naiwa-scnu
WEB_CONTAINER=naiwa-scnu
API_CONTAINER=naiwa-scnu-api
NETWORK_NAME=naiwa-scnu-net
API_IMAGE=naiwa-scnu-api:latest
DATA_DIR="$APP_ROOT/api-data"
NGINX_CONFIG="$APP_ROOT/nginx/default.conf"
SEED_FILE="$BUNDLE_DIR/seed/groups.json"
APPLICATIONS_SEED_FILE="$BUNDLE_DIR/seed/applications.json"
TIMESTAMP=$(date -u +%Y%m%dT%H%M%SZ)
NGINX_BACKUP="$NGINX_CONFIG.$TIMESTAMP.bak"

for required_path in \
  "$BUNDLE_DIR/dist/index.html" \
  "$BUNDLE_DIR/dist/assets" \
  "$BUNDLE_DIR/server/Dockerfile" \
  "$BUNDLE_DIR/server/package-lock.json" \
  "$SEED_FILE" \
  "$APPLICATIONS_SEED_FILE" \
  "$NGINX_CONFIG"; do
  if [[ ! -e "$required_path" ]]; then
    echo "缺少发布文件：$required_path" >&2
    exit 1
  fi
done

WEB_ROOT=$(sudo docker inspect "$WEB_CONTAINER" --format '{{range .Mounts}}{{if eq .Destination "/usr/share/nginx/html"}}{{.Source}}{{end}}{{end}}')
if [[ -z "$WEB_ROOT" || ! -d "$WEB_ROOT" ]]; then
  echo "无法确定现有网站目录。" >&2
  exit 1
fi

sudo install -d -m 0750 "$DATA_DIR"
if [[ ! -f "$DATA_DIR/groups.json" ]]; then
  sudo install -m 0640 "$SEED_FILE" "$DATA_DIR/groups.json"
fi
if [[ ! -f "$DATA_DIR/applications.json" ]]; then
  sudo install -m 0640 "$APPLICATIONS_SEED_FILE" "$DATA_DIR/applications.json"
fi
sudo chown -R 1000:1000 "$DATA_DIR"

sudo docker build -t "$API_IMAGE" "$BUNDLE_DIR/server"

if ! sudo docker network inspect "$NETWORK_NAME" >/dev/null 2>&1; then
  sudo docker network create "$NETWORK_NAME" >/dev/null
fi

if sudo docker ps -a --format '{{.Names}}' | grep -Fxq "$API_CONTAINER"; then
  sudo docker rm -f "$API_CONTAINER" >/dev/null
fi

sudo docker run -d \
  --name "$API_CONTAINER" \
  --restart unless-stopped \
  --network "$NETWORK_NAME" \
  --memory 256m \
  --memory-swap 256m \
  --pids-limit 128 \
  --read-only \
  --tmpfs /tmp:rw,noexec,nosuid,size=16m \
  --cap-drop ALL \
  --security-opt no-new-privileges \
  -v "$DATA_DIR:/app/data:rw" \
  "$API_IMAGE" >/dev/null

for attempt in {1..20}; do
  if sudo docker exec "$API_CONTAINER" \
    wget -qO- http://127.0.0.1:3001/api/health | grep -q '"ok":true'; then
    break
  fi
  if [[ "$attempt" -eq 20 ]]; then
    sudo docker logs --tail 80 "$API_CONTAINER" >&2
    echo "Koa 健康检查未通过。" >&2
    exit 1
  fi
  sleep 1
done

if ! sudo docker inspect "$WEB_CONTAINER" \
  --format '{{json .NetworkSettings.Networks}}' | grep -q "\"$NETWORK_NAME\""; then
  sudo docker network connect "$NETWORK_NAME" "$WEB_CONTAINER"
fi

if ! grep -q 'location /api/' "$NGINX_CONFIG"; then
  sudo cp "$NGINX_CONFIG" "$NGINX_BACKUP"
  TEMP_CONFIG=$(mktemp)
  awk '
    /^[[:space:]]*location[[:space:]]+\/[[:space:]]*\{/ {
      print "    location /api/ {"
      print "        proxy_pass http://naiwa-scnu-api:3001;"
      print "        proxy_http_version 1.1;"
      print "        proxy_set_header Host $host;"
      print "        proxy_set_header X-Real-IP $remote_addr;"
      print "        proxy_set_header X-Forwarded-For $remote_addr;"
      print "        proxy_set_header X-Forwarded-Proto $scheme;"
      print "        proxy_connect_timeout 5s;"
      print "        proxy_read_timeout 15s;"
      print "        proxy_send_timeout 15s;"
      print "    }"
      print ""
    }
    { print }
  ' "$NGINX_CONFIG" > "$TEMP_CONFIG"
  sudo cp "$TEMP_CONFIG" "$NGINX_CONFIG"
  rm "$TEMP_CONFIG"
fi

if ! sudo docker run --rm \
  --network "$NETWORK_NAME" \
  -v "$WEB_ROOT:/usr/share/nginx/html:ro" \
  -v "$APP_ROOT/letsencrypt:/etc/letsencrypt:ro" \
  -v "$NGINX_CONFIG:/etc/nginx/conf.d/default.conf:ro" \
  nginx:stable-alpine nginx -t; then
  if [[ -f "$NGINX_BACKUP" ]]; then
    sudo cp "$NGINX_BACKUP" "$NGINX_CONFIG"
  fi
  echo "Nginx 配置检查失败，已恢复备份。" >&2
  exit 1
fi
sudo docker restart "$WEB_CONTAINER" >/dev/null

PROXY_READY=false
for attempt in {1..15}; do
  if curl --max-time 5 --noproxy '*' -kfsS \
    --resolve milk-frog.cn:443:127.0.0.1 \
    https://milk-frog.cn/api/health | grep -q '"ok":true'; then
    PROXY_READY=true
    break
  fi
  sleep 1
done

if [[ "$PROXY_READY" != true ]]; then
  if [[ -f "$NGINX_BACKUP" ]]; then
    sudo cp "$NGINX_BACKUP" "$NGINX_CONFIG"
    sudo docker restart "$WEB_CONTAINER" >/dev/null
  fi
  echo "HTTPS /api 反向代理检查失败。" >&2
  exit 1
fi

sudo install -d -m 0755 "$WEB_ROOT/assets"
sudo cp -a "$BUNDLE_DIR/dist/assets/." "$WEB_ROOT/assets/"
sudo cp "$BUNDLE_DIR/dist/index.html" "$WEB_ROOT/index.html.next"
sudo mv "$WEB_ROOT/index.html.next" "$WEB_ROOT/index.html"

curl --max-time 10 --noproxy '*' -kfsS --resolve milk-frog.cn:443:127.0.0.1 \
  https://milk-frog.cn/api/groups?page=1\&pageSize=20 >/dev/null
curl --max-time 10 --noproxy '*' -kfsS --resolve milk-frog.cn:443:127.0.0.1 \
  https://milk-frog.cn/api/metrics/pv | grep -q '"startDate":"2026-10-15"'

echo "DEPLOY_OK"
echo "Web root: $WEB_ROOT"
echo "API data: $DATA_DIR/groups.json"
echo "Application data: $DATA_DIR/applications.json"
echo "PV data: $DATA_DIR/metrics.json"
