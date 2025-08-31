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
      error_file: "./logs/errors.log",
      out_file: "./logs/output.log",
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
      error_file: "./logs/errors.log",
      out_file: "./logs/output.log",
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
      error_file: "./logs/errors.log",
      out_file: "./logs/output.log",
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
      error_file: "./logs/errors.log",
      out_file: "./logs/output.log",
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
      error_file: "./logs/errors.log",
      out_file: "./logs/output.log",
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
      error_file: "./logs/errors.log",
      out_file: "./logs/output.log",
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
      error_file: "./logs/errors.log",
      out_file: "./logs/output.log",
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
      error_file: "./logs/errors.log",
      out_file: "./logs/output.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss"      
    }
  ]
};