/**
 * =============================================================================================
 * Swagger auto-generated API documentation
 * ========================================
 */
const appConfig       = require("../../config");
const swaggerJsdoc    = require("swagger-jsdoc");
const swaggerUi       = require("swagger-ui-express");

const options = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "Healthcore REST API🤘",
      description: "This file is an auto-generated swagger doc from JSDoc comments.",
    },
  },
  apis: ["./routes/info.js", "./routes/data.js", "./routes/devices.js", "./routes/scenarios.js", "./routes/care-insights.js", "./routes/care-insight-rules.js"], // files containing annotations for the OpenAPI Specification
};

const swaggerSpec = swaggerJsdoc(options);

function swaggerDocs(app) {
  app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));
  app.get("/swagger.json", (request, response) => response.json(swaggerSpec));
  common.conLog("Server: Swagger docs available at " + appConfig.CONF_baseURL + ":" + appConfig.CONF_portServer + "/api-docs", "gre");
}

module.exports = swaggerDocs;