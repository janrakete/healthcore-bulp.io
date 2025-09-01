module.exports = {
  apps: [
    {
      name: "bridge - bluetooth",
      script: "./bridge - bluetooth/app.js",
      instances: 1,
      autorestart: true,
      watch: false,
      env: {
        NODE_ENV: "production",
        PORT: process.env.CONF_portBridgeBluetooth
      },
      cwd: "./bridge - bluetooth",
      error_file: "../logs/bridge - bluetooth - errors.log",
      out_file: "../logs/bridge - bluetooth - output.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss"      
    },
    {
      name: "bridge - http",
      script: "./bridge - http/app.js",
      instances: 1,
      autorestart: true,
      watch: false,
      env: {
        NODE_ENV: "production",
        PORT: process.env.CONF_portBridgeHTTP
      },
      cwd: "./bridge - http",
      error_file: "../logs/bridge - http - errors.log",
      out_file: "../logs/bridge - http - output.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss"      
    },
    {
      name: "bridge - lora",
      script: "./bridge - lora/app.js",
      instances: 1,
      autorestart: true,
      watch: false,
      env: {
        NODE_ENV: "production",
        PORT: process.env.CONF_portBridgeLoRa
      },
      cwd: "./bridge - lora",
      error_file: "../logs/bridge - lora - errors.log",
      out_file: "../logs/bridge - lora - output.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss"      
    },
    {
      name: "bridge - thread",
      script: "./bridge - thread/app.js",
      instances: 1,
      autorestart: true,
      watch: false,
      env: {
        NODE_ENV: "production",
        PORT: process.env.CONF_portBridgeThread
      },
      cwd: "./bridge - thread",
      error_file: "../logs/bridge - thread - errors.log",
      out_file: "../logs/bridge - thread - output.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss"      
    },       
    {
      name: "bridge - zigbee",
      script: "./bridge - zigbee/app.js",
      instances: 1,
      autorestart: true,
      watch: false,
      env: {
        NODE_ENV: "production",
        PORT: process.env.CONF_portBridgeZigbBee
      },
      cwd: "./bridge - zigbee",
      error_file: "../logs/bridge - zigbee - errors.log",
      out_file: "../logs/bridge - zigbee - output.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss"      
    },    
    {
      name: "server",
      script: "./server/app.js",
      instances: 1,
      autorestart: true,
      watch: false,
      env: {
        NODE_ENV: "production",
        PORT: process.env.CONF_portServer
      },
      cwd: "./server",
      error_file: "../logs/server - errors.log",
      out_file: "../logs/server - output.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss"      
    },   
    {
      name: "broker",
      script: "./broker/app.js",
      instances: 1,
      autorestart: true,
      watch: false,
      env: {
        NODE_ENV: "production",
        PORT: process.env.CONF_portBroker
      },
      cwd: "./broker",
      error_file: "../logs/broker - errors.log",
      out_file: "../logs/broker - output.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss"      
    },
    {
      name: "healthcheck",
      script: "./healthcheck/app.js",
      instances: 1,
      autorestart: true,
      watch: false,
      env: {
        NODE_ENV: "production",
        PORT: process.env.CONF_portHealthcheck
      },
      cwd: "./healthcheck",
      error_file: "../logs/healthcheck - errors.log",
      out_file: "../logs/healthcheck - output.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss"
    }
  ]
};