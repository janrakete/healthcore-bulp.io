#!/bin/bash

set -e

export PATH="./node_modules/.bin:$PATH"

echo "🔧 Checking PM2 installation..."
if ! command -v pm2 > /dev/null 2>&1; then
  echo "pm2 not found, installing locally..."
  npm install -g pm2
else
  echo "pm2 is already installed."
fi

echo "🚫 Killing existing PM2 processes..."
pm2 kill || true

echo "📁 Loading environment variables..."
if [ -f .env ]; then
  set -a
  source .env
  set +a
  echo ".env loaded"
fi

if [ -f .env.local ]; then
  set -a
  source .env.local
  set +a
  echo ".env.local loaded"
fi

echo "🔄 Installing PM2 modules..."
if ! pm2 describe pm2-logrotate > /dev/null 2>&1; then
  echo "pm2-logrotate not found, installing ..."
  pm2 install pm2-logrotate
else
  echo "pm2-logrotate is already installed."
fi

if [[ "$OSTYPE" == "msys" || "$OSTYPE" == "cygwin" || "$OSTYPE" == "win32" ]]; then
  if ! npm list pm2-windows-startup > /dev/null 2>&1; then
    echo "pm2-windows-startup not found, installing ..."
    npm install pm2-windows-startup
    npx pm2-startup install
  else
    echo "pm2-windows-startup is already installed."
  fi
fi

echo "📂 Creating logs directory..."
mkdir -p logs

echo "🚀 Starting services..."
pm2 start production.config.js

echo "💾 Saving PM2 process list..."
pm2 save

if [[ "$OSTYPE" != "msys" && "$OSTYPE" != "cygwin" && "$OSTYPE" != "win32" ]]; then
  echo "🔄 Setting up autostart..."
  pm2 startup
fi

echo "✅ PM2 Setup completed!"