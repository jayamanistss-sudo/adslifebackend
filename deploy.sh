#!/bin/bash
# ============================================================
#  AdsLife NestJS Backend — Production Deploy Script
#  Run this ON the server: bash deploy.sh
# ============================================================
set -e

APP_DIR="/var/www/adslife-backend"
APP_NAME="adslife-backend"
NODE_MIN="18"

echo "=============================="
echo " AdsLife Backend Deploy"
echo "=============================="

# ── 1. System packages ───────────────────────────────────
echo "[1/7] Checking system packages..."

if ! command -v node &>/dev/null; then
  echo "Installing Node.js 20..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi

NODE_VER=$(node -e "process.stdout.write(process.version.slice(1).split('.')[0])")
if [ "$NODE_VER" -lt "$NODE_MIN" ]; then
  echo "Node $NODE_VER < $NODE_MIN — upgrading..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi

echo "Node: $(node --version)  npm: $(npm --version)"

if ! command -v pm2 &>/dev/null; then
  echo "Installing PM2..."
  npm install -g pm2
fi

# ── 2. App directory ─────────────────────────────────────
echo "[2/7] Setting up app directory at $APP_DIR..."
mkdir -p "$APP_DIR"
rsync -a --exclude node_modules --exclude dist --exclude .git \
  "$(dirname "$0")/" "$APP_DIR/"

# ── 3. .env file ─────────────────────────────────────────
echo "[3/7] Configuring environment..."
if [ ! -f "$APP_DIR/.env" ]; then
  cp "$APP_DIR/.env.example" "$APP_DIR/.env"
  echo ""
  echo "  ⚠  Created .env from example — fill in your values:"
  echo "     nano $APP_DIR/.env"
  echo ""
  read -p "  Press Enter after editing .env to continue..." _
fi

# ── 4. Install dependencies ───────────────────────────────
echo "[4/7] Installing npm dependencies..."
cd "$APP_DIR"
npm ci --omit=dev 2>/dev/null || npm install --omit=dev

# ── 5. Build ──────────────────────────────────────────────
echo "[5/7] Building TypeScript..."
npm run build

# ── 6. PM2 ecosystem ──────────────────────────────────────
echo "[6/7] Configuring PM2..."
cat > "$APP_DIR/ecosystem.config.js" <<'EOF'
module.exports = {
  apps: [{
    name: 'adslife-backend',
    script: 'dist/main.js',
    cwd: '/var/www/adslife-backend',
    instances: 'max',
    exec_mode: 'cluster',
    env_file: '.env',
    max_memory_restart: '512M',
    error_file: '/var/log/adslife/error.log',
    out_file:   '/var/log/adslife/out.log',
    merge_logs: true,
    restart_delay: 3000,
  }]
};
EOF

mkdir -p /var/log/adslife

# ── 7. Start / reload ─────────────────────────────────────
echo "[7/7] Starting with PM2..."
cd "$APP_DIR"
if pm2 list | grep -q "$APP_NAME"; then
  pm2 reload ecosystem.config.js --update-env
else
  pm2 start ecosystem.config.js
fi

pm2 save
pm2 startup systemd -u root --hp /root 2>/dev/null | tail -1 | bash 2>/dev/null || true

echo ""
echo "=============================="
echo " Deploy complete!"
echo " API: http://$(hostname -I | awk '{print $1}'):3001"
echo " Docs: http://$(hostname -I | awk '{print $1}'):3001/docs"
echo " Logs: pm2 logs adslife-backend"
echo "=============================="
