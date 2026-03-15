#!/bin/bash

# =============================================================================
# Healthcore start script 
# =============================================================================
# Starts all microservices (bridges, broker, server, healthcheck) via PM2.
#
# Supported platforms:
#   - macOS / Linux: runs natively in bash
#   - Windows: requires Git Bash (OSTYPE=msys) or Cygwin (OSTYPE=cygwin)
#
# Usage:
#   chmod +x production-start.sh
#   ./production-start.sh
# =============================================================================

# Exit immediately if any command fails
set -e

# Ensure locally installed npm binaries are available in PATH
export PATH="./node_modules/.bin:$PATH"

# --- Step 1: PM2 Process Manager -------------------------------------------
# PM2 is used to manage, monitor and keep all services alive in production.
echo "🔧 Checking PM2 installation ..."
if ! command -v pm2 > /dev/null 2>&1; then
  echo "pm2 not found, installing globally ..."
  npm install -g pm2
else
  echo "pm2 is already installed."
fi

# Kill any previously running PM2 processes to ensure a clean start.
# "|| true" prevents the script from exiting if no processes are running.
echo "🚫 Killing existing PM2 processes ..."
pm2 kill || true

# --- Step 2: Install Dependencies -------------------------------------------
# Install production npm dependencies (skips devDependencies).
echo "📦 Installing dependencies ..."
npm install --production

# --- Step 3: Environment Variables ------------------------------------------
# Load .env and .env.local files into the current shell environment.
# "set -a" auto-exports all variables; "set +a" stops auto-exporting.
# .env.local overrides .env values (loaded second).
echo "📁 Loading environment variables ..."
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

# --- Step 4: PM2 Modules ---------------------------------------------------
# pm2-logrotate: automatically rotates and compresses PM2 log files
# to prevent them from growing indefinitely.
echo "🔄 Installing PM2 modules ..."
if ! pm2 ls 2>/dev/null | grep -q pm2-logrotate; then
  echo "pm2-logrotate not found, installing ..."
  pm2 install pm2-logrotate
else
  echo "pm2-logrotate is already installed."
fi

# Windows only (Git Bash / Cygwin): install pm2-windows-startup
# so PM2 services auto-start after a Windows reboot.
if [[ "$OSTYPE" == "msys" || "$OSTYPE" == "cygwin" ]]; then
  if ! npm list pm2-windows-startup > /dev/null 2>&1; then
    echo "pm2-windows-startup not found, installing ..."
    npm install pm2-windows-startup
    npx pm2-startup install
  else
    echo "pm2-windows-startup is already installed."
  fi
fi

# --- Step 5: Create Logs Directory ------------------------------------------
# PM2 writes stdout/stderr logs here (configured in production.config.js).
echo "📂 Creating logs directory ..."
mkdir -p logs

# --- Step 6: Start All Services --------------------------------------------
# Reads service definitions from production.config.js and starts them.
echo "🚀 Starting services..."
pm2 start production.config.js

# Save the current process list so PM2 can restore it after a system restart.
echo "💾 Saving PM2 process list..."
pm2 save

# --- Step 7: Autostart (macOS / Linux only) ---------------------------------
# "pm2 startup" generates a system init script (systemd, launchd, etc.)
# so PM2 and its managed processes start automatically on boot.
# Not needed on Windows — handled by pm2-windows-startup above.
if [[ "$OSTYPE" != "msys" && "$OSTYPE" != "cygwin" ]]; then
  echo "🔄 Setting up autostart..."
  pm2 startup
fi

echo "✅ PM2 Setup completed!"