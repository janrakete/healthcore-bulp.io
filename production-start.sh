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

load_env_file() {
  local env_file="$1"
  local raw_line=""
  local line=""
  local key=""
  local value=""

  [ -f "$env_file" ] || return 0

  while IFS= read -r raw_line || [ -n "$raw_line" ]; do
    line="${raw_line#"${raw_line%%[![:space:]]*}"}"

    if [[ -z "$line" || "${line:0:1}" == "#" ]]; then
      continue
    fi

    key="${line%%=*}"
    value="${line#*=}"

    if [[ "$key" == "$line" ]]; then
      continue
    fi

    key="${key#export }"
    key="${key%"${key##*[![:space:]]}"}"
    key="${key#"${key%%[![:space:]]*}"}"
    value="${value#"${value%%[![:space:]]*}"}"

    if [[ "$value" =~ ^\"(.*)\"$ || "$value" =~ ^\'(.*)\'$ ]]; then
      value="${BASH_REMATCH[1]}"
    else
      value="${value%%[[:space:]]#*}"
      value="${value%"${value##*[![:space:]]}"}"
    fi

    export "$key=$value"
  done < "$env_file"
}

# Resolve deployment user from CONF_rootUser / CONF_osRootUser in .env/.env.local (.env.local overrides .env)
DEPLOY_USER=""
if [ -f .env ]; then
  DEPLOY_USER=$(grep -E '^(CONF_rootUser|CONF_osRootUser)=' .env | tail -n 1 | cut -d= -f2- | tr -d '"' | xargs || true)
fi
if [ -f .env.local ]; then
  DEPLOY_USER=$(grep -E '^(CONF_rootUser|CONF_osRootUser)=' .env.local | tail -n 1 | cut -d= -f2- | tr -d '"' | xargs || true)
fi
if [ -z "$DEPLOY_USER" ]; then
  DEPLOY_USER="bulp"
fi

DEPLOY_HOME=$(getent passwd "$DEPLOY_USER" | cut -d: -f6)
if [ -z "$DEPLOY_HOME" ]; then
  DEPLOY_HOME="/home/$DEPLOY_USER"
fi

if [ "$(id -un)" != "$DEPLOY_USER" ]; then
  echo "❌ This script must be run as '$DEPLOY_USER' (current user: $(id -un))."
  echo "Run it with: su - $DEPLOY_USER"
  exit 1
fi

# Ensure locally installed npm binaries are available in PATH!
export PATH="./node_modules/.bin:$PATH"

# Prevent duplicate PM2 stacks after reboot by removing legacy root autostart.
if [[ "$OSTYPE" != "msys" && "$OSTYPE" != "cygwin" ]]; then
  if systemctl is-enabled pm2-root >/dev/null 2>&1; then
    echo "⚠️ Found enabled pm2-root service. Disabling it to avoid duplicate PM2 daemons ..."
    if command -v sudo >/dev/null 2>&1 && sudo -n systemctl disable --now pm2-root >/dev/null 2>&1; then
      echo "pm2-root disabled."
    else
      echo "❌ pm2-root is enabled and could not be disabled automatically (sudo password required)."
      echo "Run once manually:"
      echo "sudo systemctl disable --now pm2-root"
      echo "sudo rm -f /etc/systemd/system/pm2-root.service"
      exit 1
    fi
  fi
fi

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
# Parse dotenv syntax directly so values with spaces remain valid.
# .env.local overrides .env values (loaded second).
echo "📁 Loading environment variables ..."
if [ -f .env ]; then
  load_env_file .env
  echo ".env loaded"
fi

if [ -f .env.local ]; then
  load_env_file .env.local
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

# Ensure current user can write PM2 log files.
if [[ ! -w logs ]] || find logs -maxdepth 1 -type f ! -writable | grep -q .; then
  echo "🔐 Fixing logs permissions ..."
  sudo chown -R "$DEPLOY_USER":"$DEPLOY_USER" logs
  chmod -R u+rwX logs
fi

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
  if systemctl is-enabled "pm2-$DEPLOY_USER" >/dev/null 2>&1; then
    echo "PM2 autostart is already enabled."
  else
    if command -v sudo >/dev/null 2>&1; then
      PM2_BIN=$(command -v pm2)
      if sudo -n env PATH="$PATH" "$PM2_BIN" startup systemd -u "$DEPLOY_USER" --hp "$DEPLOY_HOME" >/dev/null 2>&1; then
        echo "PM2 autostart enabled."
      else
        echo "Could not enable autostart without interactive sudo."
        echo "Run this once manually:"
        echo "sudo env PATH=\$PATH:/usr/bin $PM2_BIN startup systemd -u $DEPLOY_USER --hp $DEPLOY_HOME"
      fi
    else
      echo "sudo not found. Run this once manually:"
      echo "pm2 startup systemd -u $DEPLOY_USER --hp $DEPLOY_HOME"
    fi
  fi
fi

echo "✅ PM2 Setup completed!"