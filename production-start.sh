#!/bin/bash

set -e

export PATH="./node_modules/.bin:$PATH"

# -------------------------------
# 0️⃣ Check or install pm2 locally
# -------------------------------
if ! command -v pm2 > /dev/null 2>&1; then
  echo "pm2 not found, installing locally..."
  npm install pm2
else
  echo "pm2 is already installed."
fi

# -------------------------------
# 1️⃣ Load .env and .env.local
# -------------------------------
if [ -f .env ]; then
  set -a
  source .env
  set +a
fi

if [ -f .env.local ]; then
  set -a
  source .env.local
  set +a
fi

# -------------------------------
# 2️⃣ Check or install pm2-logrotate / Check or install pm2-windows-startup (only on Windows)
# -------------------------------
pm2 list | grep pm2-logrotate > /dev/null 2>&1
if [ $? -ne 0 ]; then
  echo "pm2-logrotate not found, installing ..."
  pm2 install pm2-logrotate
else
  echo "pm2-logrotate is already installed."
fi

if [[ "$OSTYPE" == "msys" || "$OSTYPE" == "cygwin" || "$OSTYPE" == "win32" ]]; then
  if ! npx --no-install pm2-startup --help > /dev/null 2>&1; then
    echo "pm2-windows-startup not found, installing ..."
    npm install pm2-windows-startup
    npx pm2-startup install
  else
    echo "pm2-windows-startup is already installed."
  fi
fipm2 

# -------------------------------
# 3️⃣ Create logs directory
# -------------------------------
mkdir -p logs

# -------------------------------
# 4️⃣ Start PM2 Ecosystem
# -------------------------------
pm2 start production.config.js

# -------------------------------
# 5️⃣ Save all processes for autostart on boot
# -------------------------------
pm2 save
pm2 startup

echo "✅ PM2 Setup completed!"