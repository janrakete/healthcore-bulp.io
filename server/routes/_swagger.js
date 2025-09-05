/**
 * =============================================================================================
 * Swagger auto-generated API documentation
 * ========================================
 */
const appConfig       = require("../../config");
const swaggerJsdoc    = require("swagger-jsdoc");
const swaggerUi       = require("swagger-ui-express");

const options = {
  failOnErrors: true,
  definition: {
    openapi: "3.0.0",
    info: {
      title: "Healthcore API",
      description: "Auto-generated Swagger doc from JSDoc comments",
    },
  },
  apis: ["./routes/data.js", "./routes/devices.js"]
};

const swaggerSpec = swaggerJsdoc(options);

function swaggerDocs(app) {
  app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));
  app.get("/swagger.json", (request, response) => response.json(swaggerSpec));
  common.conLog("Server: Swagger docs available at " + appConfig.CONF_baseURL + ":" + appConfig.CONF_portServer + "/api-docs", "gre");
}

module.exports = swaggerDocs;