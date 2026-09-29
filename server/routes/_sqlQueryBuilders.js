/**
 * =============================================================================================
 * SQL query builder helpers
 * =========================
 */

/**
 * Validates that a name (table or column) contains only safe characters.
 * @param {string} name - The name to validate.
 * @returns {boolean} - Returns true if the name is safe, false otherwise.
 */
function validateSqlIdentifier(name) {
    return typeof name === "string" && /^[a-zA-Z0-9_]+$/.test(name);
}

/**
 * This function builds an SQL statement for INSERT or UPDATE operations based on the provided payload.
 * @function buildSqlMutationFragment
 * @param {string} table - The name of the table to build the statement for.
 * @param {object} payload - The JSON payload containing the data to be inserted or updated.
 * @param {string} [type="INSERT"] - The type of SQL statement to build, either "INSERT" or "UPDATE".
 * @returns {object} - An object containing the status of the operation, any error messages, and the constructed SQL statement.
 */
function buildSqlMutationFragment(table, payload, type="INSERT") {
    let response = {};

    if (!validateSqlIdentifier(table)) {
        response.status = "error";
        response.error  = "Invalid table name";
        return response;
    }

    const results     = database.pragma("table_info('" + table + "')"); // get all columns for the table
    const columnsList = results.map(result => result.name);

    let parameters = {};
    let fields     = [];
    let values     = [];
    let updates    = [];

    if ((payload !== undefined) && (Object.keys(payload).length > 0)) {
        for (const [key, value] of Object.entries(payload)) { // loop through all keys of the JSON payload
            if (columnsList.includes(key)) { // if key is an existing table column ...
                response.status = "ok"; // ... return ok

                parameters[key] = value; // add to parameters

                if (type === "INSERT") {
                    fields.push(key);
                    values.push("@" + key);
                } else {
                    updates.push(key + "=@" + key);
                }
            }
            else { // if key is not an existing table column ...
                response.status = "error"; // ... return error
                response.error  = "Given column '" + key + "' does not exists in table";
                parameters = {}; // reset
                break;
            }
        }

        if (response.status === "ok") {
            response.parameters = parameters;
            if (type === "INSERT") { // build INSERT statement
                response.statement = " (" + fields.join(", ") + ") VALUES (" + values.join(", ") + ")";
            }
            else { // build UPDATE statement
                response.statement = updates.join(", ");
            }
        }
    }
    else {
        response.status = "error";
        response.error  = "Payload is empty";
    }
    return (response);
}

/**
 * This function builds a WHERE condition for SQL queries based on the provided payload.
 * @function buildWhereClause
 * @param {string} table - The name of the table to build the condition for.
 * @param {object} payload - The JSON payload containing the conditions to be applied.
 * @returns {object} - An object containing the status of the operation, any error messages, and the constructed WHERE condition.
 */
function buildWhereClause(table, payload) {
    let response = {};

    if (!validateSqlIdentifier(table)) {
        response.status = "error";
        response.error  = "Invalid table name";
        return response;
    }

    const results     = database.pragma("table_info('" + table + "')"); // get all columns for the table
    const columnsList = results.map(result => result.name);

    let orderByString = ""; // if payload contains orderBy block, remove it from payload and save it for later processing
    if (payload.orderBy !== undefined) {
        orderByString = payload.orderBy;
        delete payload.orderBy;
    }

    let limitString = ""; // if payload contains limit block, remove it from payload and save it for later processing
    if (payload.limit !== undefined) {
        limitString = payload.limit;
        delete payload.limit;
    }

    response.condition  = "";
    response.parameters = {};

    let conditions = [];

    if ((payload !== undefined) && (Object.keys(payload).length > 0)) {
        for (const [key, value] of Object.entries(payload)) { // loop through all keys of the JSON payload
            if (columnsList.includes(key)) { // if key is an existing table column ...
                response.status = "ok"; // ... return ok

                const paramKey = "cond_" + key; // unique param name for condition
                conditions.push(key + "=@" + paramKey);
                response.parameters[paramKey] = value;
            }
            else { // if key is not an existing table column
                response.status    = "error"; // ... return error
                response.error     = "Given column '" + key + "' in condition block does not exists in table";
                response.parameters = {}; // reset
                break;
            }
        }

        if (response.status === "ok" && conditions.length > 0) {
            response.condition = " WHERE " + conditions.join(" AND ");
        }
        else if (response.status === "error") {
            // error already set
        }
        else {
            response.status = "ok";
        }
    }
    else {
        response.status = "ok"; // if payload is empty it's also ok, no WHERE condition returned
    }

    if (response.status === "ok") { // if status is ok ...
        if (orderByString !== "") { // ... process orderBy block
            const orderByResponse = buildOrderByClause(orderByString, table);
            if (orderByResponse.status === "ok") {
                response.condition = response.condition + orderByResponse.statement;
            }
            else {
                response.status = "error";
                response.error  = orderByResponse.error;
            }
        }

        if (limitString !== "") { // ... process limit block
            const limitResponse = buildLimitClause(limitString);
            if (limitResponse.status === "ok") {
                response.condition = response.condition + limitResponse.statement;
            }
            else {
                response.status = "error";
                response.error  = limitResponse.error;
            }
        }
    }

    return (response);
}

/**
 * This function builds a LIMIT clause for SQL queries based on the provided limit value.
 * @function buildLimitClause
 * @param {string|number} limitValue - The limit value for the SQL query.
 * @returns {object} - An object containing the status of the operation, any error messages, and the constructed LIMIT clause.
 */
function buildLimitClause(limitValue) {
    let response = {};
    const limitNumber = parseInt(limitValue, 10);

    if (!isNaN(limitNumber) && limitNumber > 0) { // if limit is a valid positive integer ...
        response.status    = "ok"; // ... return ok and ...
        response.statement = " LIMIT " + limitNumber;
    }
    else { // if limit is not a valid positive integer
        response.statement   = "";
        response.status      = "error"; // ... return error
        response.error       = "Given limit value '" + limitValue + "' is not a valid positive integer";
    }
    return (response);
}

/**
 * This function builds an ORDER BY clause for SQL queries based on the provided orderBy string.
 * @function buildOrderByClause
 * @param {string} orderByString - The orderBy string in the format "column,direction" (e.g., "dateTime,DESC").
 * @param {string} table - The name of the table to validate the column against.
 * @returns {object} - An object containing the status of the operation, any error messages, and the constructed ORDER BY clause.
 */
function buildOrderByClause(orderByString, table) {
    const column   = orderByString.split(",")[0]; // first part column name
    let direction  = orderByString.split(",")[1]; // second part direction (ASC or DESC)

    direction = (direction && direction.toUpperCase() === "DESC") ? "DESC" : "ASC"; // default direction

    let response = {};

    if (!validateSqlIdentifier(column)) {
        response.status = "error";
        response.error  = "Invalid column name in orderBy";
        return response;
    }

    const results     = database.pragma("table_info('" + table + "')"); // get all columns for the table
    const columnsList = results.map(result => result.name);

    if (columnsList.includes(column)) { // if key is an existing table column ...
        response.status    = "ok"; // ... return ok and ...
        response.statement = " ORDER BY " + column + " " + direction;
    }
    else { // if key is not an existing table column
        response.statement   = "";
        response.status      = "error"; // ... return error
        response.error       = "Given column '" + column + "' in orderBy block does not exists in table";
    }
    return (response);
}

module.exports = { validateSqlIdentifier, buildSqlMutationFragment, buildWhereClause, buildLimitClause, buildOrderByClause };