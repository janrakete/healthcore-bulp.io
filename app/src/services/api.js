/**
 * =============================================================================================
 * API service
 * ===========
 */

/**
 * Generic API request function
 * @param {string} endpoint - The API endpoint URL
 * @param {object} options - Fetch options (method, headers, body, etc.)
 * @return {Promise<object>} - The JSON response
 * @throws {Error} - Throws error if the request fails
 */
async function apiRequest(endpoint, options = {}) {
  const url = window.appConfig.CONF_serverURL + endpoint;
  
  const config = {
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
    ...options,
  };

  try {
    const response = await fetch(url, config);
    return await response.json();
  }
  catch (error) {
    console.error("HTTP request failed:", error);
    throw error;
  }
}

/**
 * GET Request
 * @param {string} endpoint - The API endpoint URL
 * @return {Promise<object>} - The JSON response
 */
export async function apiGET(endpoint) {
  return apiRequest(endpoint, { method: "GET" });
}

/**
 * POST Request
 * @param {string} endpoint - The API endpoint URL
 * @param {object} data - The data to be sent in the request body
 * @return {Promise<object>} - The JSON response
 */
export async function apiPOST(endpoint, data) {
  return apiRequest(endpoint, {
    method: "POST",
    body: JSON.stringify(data),
  });
}

/**
 * PUT Request
 * @param {string} endpoint - The API endpoint URL
 * @param {object} data - The data to be sent in the request body
 * @return {Promise<object>} - The JSON response
 */
export async function apiPUT(endpoint, data) {
  return apiRequest(endpoint, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}

/**
 * DELETE Request
 * @param {string} endpoint - The API endpoint URL
 * @return {Promise<object>} - The JSON response
 */
export async function apiDELETE(endpoint) {
  return apiRequest(endpoint, {
    method: "DELETE"
  });
}

/**
 * PATCH Request
 * @param {string} endpoint - The API endpoint URL
 * @param {object} data - The data to be sent in the request body
 * @return {Promise<object>} - The JSON response
 */
export async function apiPATCH(endpoint, data) {
  return apiRequest(endpoint, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}