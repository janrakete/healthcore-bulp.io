#!/bin/bash

# -------------------------------
# 1️⃣ Load .env
# -------------------------------
if [ -f .env ]; then
  export $(grep -v '^#' .env | xargs)
fi

# -------------------------------
# 2️⃣ Check or install pm2-logrotate 
# -------------------------------
pm2 module:list | grep pm2-logrotate > /dev/null 2>&1
if [ $? -ne 0 ]; then
  echo "pm2-logrotate not found, installing ..."
  pm2 install pm2-logrotate
else
  echo "pm2-logrotate is already installed."
fi

# -------------------------------
# 3️⃣ Create logs directory
# -------------------------------
mkdir -p logs

# -------------------------------
# 4️⃣ Start PM2 Ecosystem
# -------------------------------
pm2 start production.config.js --env production

# -------------------------------
# 5️⃣ Save all processes for autostart on boot
# -------------------------------
pm2 save
pm2 startup

echo "✅ PM2 Setup completed!"