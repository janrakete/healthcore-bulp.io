/**
 * =============================================================================================
 * Healthcheck Dashboard — Main JavaScript
 * =======================================
 */

/**
 * =============================================================================================
 * Constants and central state
 * ===========================
 */

let CONF_dashboardRefreshIntervalMs;
let CONF_dashboardRecentAlertsCount;
let CONF_serverBaseUrl;
let CONF_serverApiKey;

/**
 * @type {Object} dashboardState
 * Central in-memory state for all data fetched from the Healthcore server. All render functions read from here; fetch functions write to here.
 *
 * @property {Array}  devices              - All devices from GET /devices/all
 * @property {Array}  individuals          - All people from GET /data/individuals
 * @property {Array}  rooms                - All rooms from GET /data/rooms
 * @property {Array}  alerts               - Alerts matching current filter
 * @property {Object} alertStats           - Counts from GET /alerts/stats
 * @property {string} activeTab            - data-tab value of the currently visible tab
 * @property {Object|null} serverInfo      - Response from GET /info (server + bridge status)
 */
const dashboardState = {
    devices:             [],
    individuals:         [],
    rooms:               [],
    alerts:              [],
    alertStats:          { open: 0, acknowledged: 0, resolved: 0, critical: 0 },
    serverInfo:          null,
    activeTab:           "overview"
};

/**
 * @type {Object} chartInstances
 * Holds Chart.js instance references so they can be destroyed before being re-created with new data.
 * @property {Chart|null} alertStatus    - Doughnut: Alert status distribution
 * @property {Chart|null} deviceStatus   - Doughnut: device connection status
 * @property {Object}     signalCharts   - Map of alertID → Chart (line charts)
 */
const chartInstances = {
    alertStatus:  null,
    deviceStatus: null,
    signalCharts: {}
};

/**
 * =============================================================================================
 * Runtime configuration fetch
 * ===========================
 */

/**
 * Fetches the runtime configuration from the healthcheck server.
 * @async
 * @function fetchConfig
 * @returns {Promise<void>}
 * @description On success: populates serverBaseUrl, serverApiKey, and the dashboard tuning variables.
 */
async function fetchConfig() {
    try {
        const response = await fetch("/api/config");
        const data     = await response.json();

        CONF_serverBaseUrl                  = data.CONF_serverBaseUrl;
        CONF_serverApiKey                   = data.CONF_apiKey || "";
        CONF_dashboardRefreshIntervalMs     = data.CONF_dashboardRefreshIntervalMs;
        CONF_dashboardRecentAlertsCount     = data.CONF_dashboardRecentAlertsCount;
    }
    catch (error) {
        console.error("API call for config failed:", error);
    }
}

/**
 * Builds the HTTP headers object for Healthcore server API requests.
 * @function buildApiHeaders
 * @returns {Object} An object suitable for passing to fetch() as the "headers" option.
 */
function buildApiHeaders() {
    const headers = {};
    if (CONF_serverApiKey) {
        headers["x-api-key"] = CONF_serverApiKey;
    }
    return headers;
}

/**
 * =============================================================================================
 * Healthcore server API fetch functions
 * =====================================
 */

/**
 * Fetches a JSON array from a Healthcore API endpoint. Returns data.results as an array, or [] on error.
 * @async
 * @param {string} path - Path appended to CONF_serverBaseUrl (e.g. "/devices/all").
 * @returns {Promise<Array>}
 */
async function fetchArray(path) {
    try {
        const data = await (await fetch(CONF_serverBaseUrl + path, { headers: buildApiHeaders() })).json();
        return Array.isArray(data.results) ? data.results : [];
    }
    catch (error) {
        console.error("API call failed [" + path + "]:", error);
        return [];
    }
}

/**
 * Fetches all registered devices from the Healthcore server. Each device object is enriched by the server with individual and room data.
 * @async
 * @function fetchDevices
 * @returns {Promise<Array>} Array of enriched device objects, or an empty array on error.
 * @description Calls GET {CONF_serverBaseUrl}/devices/all. Returns data.results on success.
 */
async function fetchDevices() {
    return fetchArray("/devices/all");
}

/**
 * Fetches all individuals (people) from the Healthcore server.
 * @async
 * @function fetchIndividuals
 * @returns {Promise<Array>} Array of individual objects, or an empty array on error.
 * @description Calls GET {CONF_serverBaseUrl}/data/individuals.
 */
async function fetchIndividuals() {
    return fetchArray("/data/individuals");
}

/**
 * Fetches all rooms from the Healthcore server.
 * @async
 * @function fetchRooms
 * @returns {Promise<Array>} Array of room objects, or an empty array on error.
 * @description Calls GET {CONF_serverBaseUrl}/data/rooms.
 */
async function fetchRooms() {
    return fetchArray("/data/rooms");
}

/**
 * Fetches Alerts from the Healthcore server. Results are always ordered newest-first (dateTimeUpdated DESC).
 * @async
 * @function fetchAlerts
 * @returns {Promise<Array>} Array of enriched Alert objects, or empty array on error.
 * @description Calls GET {CONF_serverBaseUrl}/alerts?orderBy=dateTimeUpdated,DESC.
 */
async function fetchAlerts() {
    try {
        const url      = CONF_serverBaseUrl + "/alerts?orderBy=dateTimeUpdated,DESC";
        const response = await fetch(url, { headers: buildApiHeaders() });
        const data     = await response.json();
        return Array.isArray(data.results) ? data.results : [];
    }
    catch (error) {
        console.error("API call for alerts failed:", error);
        return [];
    }
}

/**
 * Fetches Alert summary statistics from the Healthcore server. Returns counts for open, acknowledged, resolved, and critical alerts.
 * @async
 * @function fetchAlertStats
 * @returns {Promise<Object>} Stats object with keys open/acknowledged/resolved/critical, or an object with all zeroes on error.
 * @description Calls GET {CONF_serverBaseUrl}/alerts/stats.
 */
async function fetchAlertStats() {
    try {
        const response = await fetch(CONF_serverBaseUrl + "/alerts/stats", { headers: buildApiHeaders() });
        const data     = await response.json();
        return data.data || { open: 0, acknowledged: 0, resolved: 0, critical: 0 };
    }
    catch (error) {
        console.error("API call for alert stats failed:", error);
        return { open: 0, acknowledged: 0, resolved: 0, critical: 0 };
    }
}

/**
 * Fetches the full detail of a single Alert including its signals array. Called lazily when the user expands an alert card for the first time.
 * @async
 * @function fetchAlertDetail
 * @param {number} alertID - The numeric ID of the Alert to load.
 * @returns {Promise<Object|null>} Object with {alert, signals} on success, or null on error.
 * @description Calls GET {serverBaseUrl}/alerts/{alertID}.
 */
async function fetchAlertDetail(alertID) {
    try {
        const response = await fetch(CONF_serverBaseUrl + "/alerts/" + alertID, { headers: buildApiHeaders() });
        const data     = await response.json();
        if (data.status === "ok" && data.alert) {
            return { alert: data.alert, signals: Array.isArray(data.signals) ? data.signals : [] };
        }
        return null;
    }
    catch (error) {
        console.error("API call for alert detail failed for ID " + alertID + ":", error);
        return null;
    }
}

/**
 * Fetches server info from the Healthcore server.
 * @async
 * @function fetchInfo
 * @returns {Promise<Object|null>} Info object on success, or null on error.
 * @description Calls GET {CONF_serverBaseUrl}/info.
 */
async function fetchInfo() {
    try {
        const response = await fetch(CONF_serverBaseUrl + "/info", { headers: buildApiHeaders() });
        return await response.json();
    }
    catch (error) {
        console.error("API call for server info failed:", error);
        return null;
    }
}


/**
 * =============================================================================================
 * Central data refresh
 * ====================
 */

/**
 * Fetches all Healthcore data sources in parallel and updates dashboardState. Called once during initialisation and then every CONF_refreshInterval milliseconds.
 * @async
 * @function refreshAllData
 * @returns {Promise<void>}
 * @description Uses Promise.all to fetch devices, individuals, rooms, alerts, alert stats, and server info simultaneously.
 */
async function refreshAllData() {
    const [devices, individuals, rooms, alerts, alertStats, serverInfo] = await Promise.all([
        fetchDevices(),
        fetchIndividuals(),
        fetchRooms(),
        fetchAlerts(),
        fetchAlertStats(),
        fetchInfo()
    ]);

    dashboardState.devices      = devices;
    dashboardState.individuals  = individuals;
    dashboardState.rooms        = rooms;
    dashboardState.alerts       = alerts;
    dashboardState.alertStats   = alertStats;
    dashboardState.serverInfo   = serverInfo;
    
    renderActiveTab(); // Clear the loading message on successful refresh

    updateLastUpdatedTimestamp(); // Update the "last updated" timestamp in the header after every refresh
}

/**
 * =============================================================================================
 * Tab navigation
 * ==============
 */

/**
 * Initialises tab switching by attaching click handlers to all [data-tab] list items in the tab bar. Manages the is-active class on tab items and is-hidden on panels.
 * @function initTabNavigation
 * @returns {void}
 */
function initTabNavigation() {
    const tabItems  = document.querySelectorAll("#hc-dashboard-tabs [data-tab]");
    const tabPanels = document.querySelectorAll(".hc-tab-panel");

    tabItems.forEach(function (tabItem) {
        tabItem.addEventListener("click", function () {
            const targetTab = tabItem.getAttribute("data-tab");
            
            tabItems.forEach(item => item.classList.remove("is-active")); // Deactivate all tabs and hide all panels
            tabPanels.forEach(panel => panel.classList.add("is-hidden"));
            
            tabItem.classList.add("is-active"); // Activate the clicked tab and show its panel

            const targetPanel = document.getElementById("tab-" + targetTab);
            if (targetPanel) {
                targetPanel.classList.remove("is-hidden");
            }

            dashboardState.activeTab = targetTab;
            renderActiveTab();
        });
    });
}

/**
 * Calls the appropriate render function for whichever tab is currently active.
 * @function renderActiveTab
 * @returns {void}
 */
function renderActiveTab() {
    const tab = dashboardState.activeTab;

    if (tab === "overview") {
        renderOverview();
    }
    else if (tab === "alerts") {
        renderAlerts();
    }
    else if (tab === "devices") {
        renderDevices();
    }
    else if (tab === "people") {
        renderPeople();
    }
    else if (tab === "rooms") {
        renderRooms();
    }
    else if (tab === "status") {
        renderStatus();
    }
}

/**
 * =============================================================================================
 * Overview tab rendering
 * ======================
 */

/**
 * Renders the Overview tab: stat cards, two doughnut charts, and the recent-data row.
 * @function renderOverview
 * @returns {void}
 * @description Reads dashboardState.alertStats, devices, individuals, and rooms to build stat cards, two charts, and the recent alerts list.
 */
function renderOverview() {
    const cardsContainer = document.getElementById("overview-stats-cards");

    if (!cardsContainer) {
        return;
    }

    cardsContainer.innerHTML = "";

    cardsContainer.appendChild(buildStatCard("Critical", dashboardState.alertStats.critical, "hc-box-color-critical"));
    cardsContainer.appendChild(buildStatCard("Open",     dashboardState.alertStats.open,     "hc-box-color-open"));

    renderAlertStatusChart();
    renderDeviceStatusChart();

    renderOverviewRecentAlerts();
}

/**
 * Renders the most recent Alerts into the Overview panel (#overview-recent-alerts).
 * @function renderOverviewRecentAlerts
 * @returns {void}
 */
function renderOverviewRecentAlerts() {
    const container = document.getElementById("overview-recent-alerts");
    if (!container) {
        return;
    }
    container.innerHTML = "";

    const recent = dashboardState.alerts.slice(0, CONF_dashboardRecentAlertsCount);

    if (recent.length === 0) {
        const empty       = document.createElement("p");
        empty.className   = "has-text-white";
        empty.textContent = i18n.t("NoData");
        container.appendChild(empty);
        return;
    }

    for (const alert of recent) {
        const row       = document.createElement("div");
        row.className   = "hc-overview-recent-row";

        const topLine       = document.createElement("div");
        topLine.className   = "is-flex is-align-items-center mb-3 hc-flex-gap-xs";
        topLine.appendChild(buildAlertStatusTag(alert.status));

        const summary       = document.createElement("span");
        summary.className   = "is-small has-text-weight-bold";
        summary.textContent = alert.summary || i18n.t("Unknown");
        topLine.appendChild(summary);

        const ts       = document.createElement("div");
        ts.className   = "is-size-7 has-text-white is-uppercase has-text-weight-bold";
        ts.textContent = alert.dateTimeUpdated ? formatDateTime(alert.dateTimeUpdated) + ":" : "";

        row.appendChild(ts);
        row.appendChild(topLine);
        container.appendChild(row);
    }
}

/**
 * Builds a single stat card DOM element for the Overview grid.
 * @function buildStatCard
 * @param {string} labelKey    - i18n key for the card's label text.
 * @param {number} value       - The numeric value to display prominently.
 * @param {string} [colorClass=""] - Optional CSS modifier class on the number element.
 * @returns {HTMLElement} A column element containing the stat card box.
 */
function buildStatCard(labelKey, value, colorClass = "") {
    const column        = document.createElement("div");
    column.className    = "column is-2";

    const box           = document.createElement("div");
    box.className       = "box has-text-centered" + (colorClass ? " " + colorClass : "");

    const number        = document.createElement("span");
    number.className    = "hc-stat-number" + (colorClass ? " " + colorClass : "");
    number.textContent  = String(value);

    const label         = document.createElement("span");
    label.className     = "hc-stat-label is-uppercase has-text-weight-bold";
    label.textContent   = i18n.t(labelKey);

    box.appendChild(label);
    box.appendChild(number);
    column.appendChild(box);
    return column;
}

/**
 * Creates or re-creates the Alert status doughnut chart. Destroys the previous Chart.js instance if one exists to prevent canvas reuse errors.
 * @function renderAlertStatusChart
 * @returns {void}
 * @description Data: open / acknowledged / resolved / critical counts from dashboardState.alertStats.
 */
function renderAlertStatusChart() {
    if (chartInstances.alertStatus) {
        chartInstances.alertStatus.destroy();
    }

    const stats = dashboardState.alertStats;
    chartInstances.alertStatus = buildDoughnutChart(
        "chart-alerts-status",
        [i18n.t("Open"), i18n.t("Acknowledged"), i18n.t("Resolved"), i18n.t("Critical")],
        [stats.open, stats.acknowledged, stats.resolved, stats.critical],
        [cssVar("--hc-color-alert-open"), cssVar("--hc-color-alert-acknowledged"), cssVar("--hc-color-alert-resolved"), cssVar("--hc-color-alert-critical")]
    );
}

/**
 * Creates or re-creates the Device connection status doughnut chart. Destroys the previous Chart.js instance if one exists to prevent canvas reuse errors.
 * @function renderDeviceStatusChart
 * @returns {void}
 * @description Data: connected vs. disconnected device counts derived from dashboardState.devices.
 */
function renderDeviceStatusChart() {
    if (chartInstances.deviceStatus) {
        chartInstances.deviceStatus.destroy();
    }
    
    const connected = dashboardState.devices.filter(device => Number(device.connected) === 1).length;
    chartInstances.deviceStatus = buildDoughnutChart(
        "chart-devices-status",
        [i18n.t("Connected"), i18n.t("Disconnected")],
        [connected, dashboardState.devices.length - connected],
        [cssVar("--hc-color-connected"), cssVar("--hc-color-disconnected")]
    );
}

/**
 * =============================================================================================
 * Alerts tab rendering
 * ====================
 */

/**
 * Renders all Alert cards into the #alerts-list container.
 * @function renderAlerts
 * @returns {void}
 */
function renderAlerts() {
    renderList("alerts-list", dashboardState.alerts, buildAlertCard);
}

/**
 * Builds a single Alert card DOM element.
 * @function buildAlertCard
 * @param {Object} alert - An enriched Alert object from the API.
 * @returns {HTMLElement} A .card element ready to append to the alerts list.
 */
function buildAlertCard(alert) {
    const card              = document.createElement("div");
    card.className          = "card";

    const cardHeader        = document.createElement("div");
    cardHeader.className    = "card-header";

    const metaWrapper       = document.createElement("div");
    metaWrapper.className   = "card-header-title hc-flex-gap-sm";

    const summaryText       = document.createElement("span");
    summaryText.className   = "has-text-weight-bold";
    summaryText.textContent = alert.summary || i18n.t("Unknown");

    const statusTag = buildAlertStatusTag(alert.status);
    metaWrapper.appendChild(statusTag);

    const expandBtn       = document.createElement("button");
    expandBtn.className   = "button is-small is-outlined hc-alert-expand-btn";
    expandBtn.textContent = i18n.t("ExpandDetails");
    metaWrapper.appendChild(expandBtn);
    metaWrapper.appendChild(summaryText);

    cardHeader.appendChild(metaWrapper);

    const cardContent     = document.createElement("div");
    cardContent.className = "card-content";

    const metaGrid = document.createElement("div");

    if (alert.dateTimeUpdated) {
        metaGrid.appendChild(buildMetaItem(i18n.t("UpdatedOn"), formatDateTime(alert.dateTimeUpdated)));
    }

    if (alert.individual) {
        metaGrid.appendChild(buildMetaItem(i18n.t("AssignedPerson"), alert.individual.firstname + " " + alert.individual.lastname));
    }

    if (alert.device) {
        metaGrid.appendChild(buildMetaItem(i18n.t("Device"), alert.device.name || alert.device.uuid));
    }

    if (alert.room) {
        metaGrid.appendChild(buildMetaItem(i18n.t("Room"), alert.room.name));
    }

    if (alert.scenario) {
        metaGrid.appendChild(buildMetaItem(i18n.t("Scenario"), alert.scenario.name));
    }

    if (alert.type) {
        metaGrid.appendChild(buildMetaItem(i18n.t("Type"), alert.type));
    }

    cardContent.appendChild(metaGrid);

    const detailSection     = document.createElement("div");
    detailSection.className = "hc-alert-detail";

    expandBtn.addEventListener("click", function () {
        toggleAlertDetail(alert.alertID, detailSection, expandBtn);
    });

    card.appendChild(cardHeader);
    card.appendChild(cardContent);
    card.appendChild(detailSection);
    return card;
}

/**
 * Builds a small "key: value" metadata item element for the alert card content area.
 * @function buildMetaItem
 * @param {string} label - The label text.
 * @param {string} value - The value text.
 * @returns {HTMLElement} A <div> with the label in muted colour and the value in normal colour.
 */
function buildMetaItem(label, value) {
    const item = document.createElement("div");
    item.className = "mb-3";

    const labelSpan = document.createElement("div");
    labelSpan.className   = "is-size-7 has-text-grey has-text-weight-bold is-uppercase";
    labelSpan.textContent = label;

    const valueSpan = document.createElement("div");
    valueSpan.textContent = value || "—";

    item.appendChild(labelSpan);
    item.appendChild(valueSpan);
    return item;
}

/**
 * Toggles the expand/collapse state of an Alert card's detail section.
 * @function toggleAlertDetail
 * @param {number}      alertID       - The numeric ID of the Alert.
 * @param {HTMLElement} detailSection - The .hc-alert-detail element inside the card.
 * @param {HTMLElement} toggleButton  - The expand/collapse button whose label is updated.
 * @returns {void}
 * @description Uses the attribute data-loaded="true" on detailSection to track whether the detail content has already been fetched. This prevents duplicate network requests.
 */
function toggleAlertDetail(alertID, detailSection, toggleButton) {
    const isVisible = detailSection.classList.contains("is-visible");

    if (isVisible) { // Collapse: just hide the already-loaded section
        detailSection.classList.remove("is-visible");
        toggleButton.textContent = i18n.t("ExpandDetails");
    }
    else {
        if (detailSection.getAttribute("data-loaded") === "true") { // Expand: load detail lazily on first open, then show
            detailSection.classList.add("is-visible");
            toggleButton.textContent = i18n.t("CollapseDetails");
        }
        else {
            toggleButton.textContent = i18n.t("Loading");
            loadAndShowAlertDetail(alertID, detailSection, toggleButton);
        }
    }
}

/**
 * Fetches the full Alert detail (explanation, recommendation, signals) and populates the given detail section element. Called lazily on first card expand.
 * @async
 * @function loadAndShowAlertDetail
 * @param {number}      alertID       - The numeric ID of the Alert to load.
 * @param {HTMLElement} detailSection - The .hc-alert-detail div to populate.
 * @param {HTMLElement} toggleButton  - The button to update with the collapse label.
 * @returns {Promise<void>}
 */
async function loadAndShowAlertDetail(alertID, detailSection, toggleButton) {
    const result = await fetchAlertDetail(alertID);

    const alert   = result.alert;
    const signals = result.signals;

    detailSection.innerHTML = ""; // Clear any existing content

    if (alert.explanation) { // Explanation section
        const explanationLabel       = document.createElement("div");
        explanationLabel.className   = "is-size-7 has-text-grey has-text-weight-bold is-uppercase mt-3";
        explanationLabel.textContent = i18n.t("Explanation");
        detailSection.appendChild(explanationLabel);

        const explanationText        = document.createElement("div");
        explanationText.textContent  = alert.explanation;
        detailSection.appendChild(explanationText);
    }

    if (alert.recommendation) { // Recommendation section
        const recommendationLabel       = document.createElement("div");
        recommendationLabel.className   = "is-size-7 has-text-grey has-text-weight-bold is-uppercase mt-3";
        recommendationLabel.textContent = i18n.t("Recommendation");
        detailSection.appendChild(recommendationLabel);

        const recommendationText        = document.createElement("div");
        recommendationText.textContent  = alert.recommendation;
        detailSection.appendChild(recommendationText);
    }

    if (signals.length > 0) { // Signal chart section (only shown when there are signals to plot)
        const signalsLabel          = document.createElement("div");
        signalsLabel.className      = "is-size-7 has-text-grey has-text-weight-bold is-uppercase mt-3";
        signalsLabel.textContent    = i18n.t("Signals") + " (" + signals.length + ")";
        detailSection.appendChild(signalsLabel);

        const chartContainer     = document.createElement("div");
        chartContainer.className = "hc-signal-chart-container";

        const canvas = document.createElement("canvas");
        canvas.id    = "signal-chart-" + alertID;
        chartContainer.appendChild(canvas);
        detailSection.appendChild(chartContainer);

        renderSignalChart("signal-chart-" + alertID, alertID, signals); // Render the chart after the canvas is in the DOM
    }
    else {
        const noSignals       = document.createElement("p");
        noSignals.className   = "notification is-danger mt-3";
        noSignals.textContent = i18n.t("NoData");
        detailSection.appendChild(noSignals);
    }

    detailSection.setAttribute("data-loaded", "true"); // Mark as loaded and make the section visible
    detailSection.classList.add("is-visible");
    toggleButton.textContent = i18n.t("CollapseDetails");
}

/**
 * Creates a signal line chart for the given Alert using Chart.js. Signals are sorted into ascending chronological order before plotting so the time axis reads correctly left-to-right (the server returns them newest-first).
 * @function renderSignalChart
 * @param {string} canvasID - The id of the <canvas> element to draw on.
 * @param {number} alertID  - The ID of the Alert (used as the chart storage key).
 * @param {Array}  signals  - Array of signal objects: {signalID, alertID, value, dateTime}.
 * @returns {void}
 * @description Uses Chart.js line chart with tension 0.3, fill, and the primary deep-purple colour. The container has a fixed height of 220px (set in CSS) and maintainAspectRatio is set to false so the chart respects that height.
 */
function renderSignalChart(canvasID, alertID, signals) {
    if (chartInstances.signalCharts[alertID]) { // Destroy any existing chart instance for this alert
        chartInstances.signalCharts[alertID].destroy();
        chartInstances.signalCharts[alertID] = null;
    }

    const sortedSignals = [...signals].sort(function (a, b) { // Sort signals ascending by dateTime so the chart reads left-to-right
        return new Date(a.dateTime) - new Date(b.dateTime);
    });

    const labels = sortedSignals.map(signal => formatSignalDateTime(signal.dateTime));
    const values = sortedSignals.map(signal => parseFloat(signal.value));

    const canvas = document.getElementById(canvasID);
    if (!canvas) { 
        return; 
    }

    chartInstances.signalCharts[alertID] = new Chart(canvas, {
        type: "line",
        data: {
            labels: labels,
            datasets: [{
                label:           i18n.t("Signals"),
                data:            values,
                borderColor:     cssVar("--hc-color-primary"),
                backgroundColor: cssVar("--hc-color-primary-alpha"),
                tension:         0.3,
                pointRadius:     3,
                fill:            true
            }]
        },
        options: {
            responsive:          true,
            maintainAspectRatio: false,
            scales: {
                x: { ticks: { maxTicksLimit: 8, font: { family: "Poppins", size: 11 } } },
                y: { ticks: { font: { family: "Poppins", size: 11 } } }
            },
            plugins: {
                legend: { display: false }
            }
        }
    });
}

/**
 * Formats a full dateTime string from the database into a human-readable string.
 * @function formatDateTime
 * @param {string} dateTimeString - A date/time string such as "2025-01-15 14:35:00".
 * @returns {string} Locale-formatted date/time string, or "—" if the input is empty.
 */
function formatDateTime(dateTimeString) {
    if (!dateTimeString) { 
        return "—"; 
    }

    const parts = String(dateTimeString).split(" ");
    const datePart = parts[0] || ""; // "YYYY-MM-DD"
    const timePart = parts[1] || ""; // "HH:MM:SS"

    const dateSections  = datePart.split("-");
    const year          = dateSections[0] || "";
    const month         = dateSections[1] || "";
    const day           = dateSections[2] || "";
    const time          = timePart.substring(0, 5); // "HH:MM"

    const suffix = i18n.t("TimeSuffix");
    if (i18n.getLanguage() === "de") {
        return day + "." + month + "." + year + ", " + time + (suffix ? " " + suffix : "");
    }
    return month + "/" + day + "/" + year + ", " + time + (suffix ? " " + suffix : "");
}

/**
 * Formats a signal dateTime string into a compact two-line label for Chart.js tick display.
 * @function formatSignalDateTime
 * @param {string} dateTimeString - A date/time string such as "2025-01-15 14:35:00".
 * @returns {string} Compact two-line label string.
 */
function formatSignalDateTime(dateTimeString) {
    if (!dateTimeString) { 
        return ""; 
    }

    const parts     = String(dateTimeString).split(" ");
    const datePart  = parts[0] || ""; // "YYYY-MM-DD"
    const timePart  = parts[1] || ""; // "HH:MM:SS"

    const time         = timePart.substring(0, 5); // "HH:MM"
    const dateSections = datePart.split("-");

    if (i18n.getLanguage() === "de") {
        const dateFormatted = dateSections.length >= 3 ? dateSections[2] + "." + dateSections[1] : datePart;
        const suffix = i18n.t("TimeSuffix");
        return time + (suffix ? " " + suffix : "") + "\n" + dateFormatted;
    }

    const dateFormatted = dateSections.length >= 3 ? dateSections[1] + "/" + dateSections[2] : datePart;
    return time + "\n" + dateFormatted;
}

/**
 * =============================================================================================
 * Devices tab rendering
 * =====================
 */

/**
 * Renders the devices table.
 * @function renderDevices
 * @returns {void}
 */
function renderDevices() {
    const tableBody = document.getElementById("devices-table-body");

    if (!tableBody) { 
        return; 
    }

    tableBody.innerHTML = ""; // Clear existing rows

    const devicesList = dashboardState.devices;

    if (devicesList.length === 0) {
        const table = document.getElementById("devices-table");
        if (table) {
            table.remove();
        }

        const container = document.getElementById("devices-list");
        container.appendChild(buildNoDataMessage());
    }
    else {
        for (const device of devicesList) {
            tableBody.appendChild(buildDeviceRow(device));
        }
    }
}

/**
 * Builds a single <tr> table row for a device.
 * @function buildDeviceRow
 * @param {Object} device - An enriched device object from GET /devices/all.
 * @returns {HTMLElement} A <tr> element with seven cells.
 */
function buildDeviceRow(device) {
    const row = document.createElement("tr");

    function td(text) { // Helper to create a simple text <td>
        const cell       = document.createElement("td");
        cell.textContent = text || "—";
        return cell;
    }

    row.appendChild(td(device.name));
    row.appendChild(td(device.productName));
    row.appendChild(td(capitalise(device.bridge)));

    const statusCell = document.createElement("td");
    const isConnected = Number(device.connected) === 1;
    statusCell.appendChild(buildConnectionTag(isConnected));
    row.appendChild(statusCell);

    const personName = device.individual ? (device.individual.firstname + " " + device.individual.lastname).trim(): "—";
    row.appendChild(td(personName));

    const roomName = device.room ? device.room.name : "—";
    row.appendChild(td(roomName));

    row.appendChild(td(device.powerType));

    return row;
}

/**
 * =============================================================================================
 * People tab rendering
 * ====================
 */

/**
 * Renders person cards into #people-list for every individual in dashboardState.
 * @function renderPeople
 * @returns {void}
 */
function renderPeople() {
    renderList("people-list", dashboardState.individuals, buildPersonCard);
}

/**
 * Builds a single person card DOM element.
 * @function buildPersonCard
 * @param {Object} individual - Individual object {individualID, firstname, lastname, roomID}.
 * @returns {HTMLElement} A Bulma column > .card element.
 */
function buildPersonCard(individual) {
    const room        = dashboardState.rooms.find(room => room.roomID === individual.roomID);

    const roomName    = room ? room.name : "—";

    const deviceNames = dashboardState.devices.filter(device => device.individualID === individual.individualID).map(device => device.name || device.uuid);

    return buildDataCard(
        (individual.firstname + " " + individual.lastname).trim(),
        [
            { label: i18n.t("Room"),        value: roomName },
            { label: i18n.t("DevicesTitle"), value: deviceNames.length > 0 ? deviceNames.join(", ") : "—" }
        ]
    );
}

/**
 * =============================================================================================
 * Rooms tab rendering
 * ===================
 */

/**
 * Renders room cards into #rooms-list for every room in dashboardState.rooms.
 * @function renderRooms
 * @returns {void}
 */
function renderRooms() {
    renderList("rooms-list", dashboardState.rooms, buildRoomCard);
}

/**
 * Builds a single room card DOM element.
 * @function buildRoomCard
 * @param {Object} room - Room object {roomID, name}.
 * @returns {HTMLElement} A Bulma column > .card element.
 */
function buildRoomCard(room) {
    const personNames = dashboardState.individuals.filter(individual => individual.roomID === room.roomID).map(individual => (individual.firstname + " " + individual.lastname).trim());

    const deviceNames = dashboardState.devices.filter(device => device.roomID === room.roomID).map(device => device.name || device.uuid);

    return buildDataCard(
        room.name,
        [
            { label: i18n.t("IndividualsTitle"), value: personNames.length > 0 ? personNames.join(", ") : "—" },
            { label: i18n.t("DevicesTitle"),     value: deviceNames.length > 0 ? deviceNames.join(", ") : "—" }
        ]
    );
}

/**
 * Builds a label + value section for use inside person and room cards.
 * @function buildDataCardSection
 * @param {string} label - The section label text.
 * @param {string} value - The value text to display below the label.
 * @returns {HTMLElement} A <div> with a muted label and a value paragraph.
 */
function buildDataCardSection(label, value) {
    const wrapper       = document.createElement("div");
    wrapper.className   = "mb-3";

    const labelEl       = document.createElement("div");
    labelEl.className   = "is-size-7 has-text-grey has-text-weight-bold is-uppercase";
    labelEl.textContent = label;

    const valueEl       = document.createElement("div");
    valueEl.className   = value === "—" ? "has-text-grey-light" : "";
    valueEl.textContent = value;

    wrapper.appendChild(labelEl);
    wrapper.appendChild(valueEl);
    return wrapper;
}

/**
 * =============================================================================================
 * Status tab rendering
 * ====================
 */

/**
 * Renders the Status tab into #status-content.
  * @function renderStatus
 * @returns {void}
 */
function renderStatus() {
    const container = document.getElementById("status-content");
    if (!container) { 
        return; 
    }
    container.innerHTML = "";

    const info              = dashboardState.serverInfo;
    const serverCard        = document.createElement("div");
    serverCard.className    = "card";

    const serverCardHeader       = document.createElement("header");
    serverCardHeader.className   = "card-header";

    const serverTitle       = document.createElement("p");
    serverTitle.className   = "card-header-title";
    serverTitle.textContent = i18n.t("StatusServerInfo");
    serverCardHeader.appendChild(serverTitle);
    serverCard.appendChild(serverCardHeader);

    const rows = [
        [i18n.t("Name"),           info.serverName       || "—"],
        [i18n.t("StatusVersion"),  info.serverVersion    || "—"],
        ["Bonjour ID",             info.serverIDBonjour  || "—"],
        ["Status",                 info.status           || "—"]
    ];

    const serverContent     = document.createElement("div");
    serverContent.className = "card-content";

    for (const [label, value] of rows) { // Build a table row for each label/value pair

        const contentLabel = document.createElement("div");
        contentLabel.className    = "is-size-7 has-text-grey has-text-weight-bold is-uppercase mt-3";
        contentLabel.textContent  = label;

        const contentValue        = document.createElement("div");
        contentValue.textContent  = value;

        serverContent.appendChild(contentLabel);
        serverContent.appendChild(contentValue);
    }

    serverCard.appendChild(serverContent);
    container.appendChild(serverCard);

    const bridgesGrid       = document.createElement("div");
    bridgesGrid.className   = "columns is-multiline";

    const bridges = Array.isArray(info.bridges) ? info.bridges : [];

    if (bridges.length === 0) {
        const empty         = document.createElement("p");
        empty.className     = "notification is-danger";
        empty.textContent   = i18n.t("NoData");
        container.appendChild(empty);
        return;
    }

    for (const bridge of bridges) {
        const isOnline = String(bridge.status).toLowerCase() === "online";

        const col       = document.createElement("div");
        col.className   = "column is-narrow";

        const card      = document.createElement("div");
        card.className  = "box hc-status-bridge-card";

        const header        = document.createElement("div");
        header.className    = "is-flex is-align-items-center mb-3 hc-flex-gap-sm";

        const nameSpan          = document.createElement("span");
        nameSpan.className      = "has-text-weight-bold";
        nameSpan.textContent    = capitalise(bridge.bridge);

        const statusTag         = document.createElement("span");
        statusTag.className     = isOnline ? "tag hc-tag-connected" : "tag hc-tag-disconnected";
        statusTag.textContent   = isOnline ? i18n.t("Online") : i18n.t("Offline");

        header.appendChild(nameSpan);
        header.appendChild(statusTag);
        card.appendChild(header);

        const portLine          = document.createElement("p");
        portLine.className      = "is-size-7 has-text-white";
        portLine.textContent    = i18n.t("StatusPort") + ": " + (bridge.port || "—");
        card.appendChild(portLine);

        col.appendChild(card);
        bridgesGrid.appendChild(col);
    }

    container.appendChild(bridgesGrid);
}

/**
 * =============================================================================================
 * Utility functions
 * =================
 */

/**
 * Reads a CSS custom property value from the document root element. Used by chart rendering functions to source all colours from dashboard.css instead of hard-coding hex values in JavaScript.
 * @function cssVar
 * @param {string} name - The CSS variable name including the leading "--" (e.g. "--hc-color-primary").
 * @returns {string} The trimmed string value of the CSS variable.
 */
function cssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/**
 * Builds a "no data" notification element used by all list renderers.
 * @returns {HTMLElement}
 */
function buildNoDataMessage() {
    const wrapper = document.createElement("div");
    wrapper.id    = "status-content";

    const p       = document.createElement("p");
    p.className   = "notification is-danger";
    p.textContent = i18n.t("NoData");

    wrapper.appendChild(p);
    return wrapper;
}

/**
 * Generic list renderer. Clears containerID, shows buildNoDataMessage() when items is empty, otherwise calls buildFn(item) for each item and appends the result.
 * @param {string}   containerID - ID of the target DOM element.
 * @param {Array}    items       - Data array to render.
 * @param {Function} buildFn     - Called with each item; must return an HTMLElement.
 */
function renderList(containerID, items, buildFn) {
    const container = document.getElementById(containerID);
    if (!container) {
        return; 
    }

    container.innerHTML = "";
    if (items.length === 0) { 
        container.classList.remove("columns");
        container.appendChild(buildNoDataMessage());
        return;
    }

    for (const item of items) {
        container.appendChild(buildFn(item));
    }
}

/**
 * Builds a generic data card (used for People and Rooms tabs).
 * @param {string} title    - Text shown in the card header.
 * @param {Array}  sections - Array of {label, value} objects for the card body.
 * @returns {HTMLElement} A Bulma column > .card element.
 */
function buildDataCard(title, sections) {
    const column            = document.createElement("div");
    column.className        = "column is-3";

    const card              = document.createElement("div");
    card.className          = "card";

    const cardHeader        = document.createElement("header");
    cardHeader.className    = "card-header";

    const headerTitle       = document.createElement("p");
    headerTitle.className   = "card-header-title";
    headerTitle.textContent = title;
    cardHeader.appendChild(headerTitle);

    const cardContent       = document.createElement("div");
    cardContent.className   = "card-content";

    for (const { label, value } of sections) {
        cardContent.appendChild(buildDataCardSection(label, value));
    }

    card.appendChild(cardHeader);
    card.appendChild(cardContent);
    column.appendChild(card);
    return column;
}

/**
 * Builds a doughnut Chart.js instance. Destroys any previous instance stored in the provided ref object under the given key before creating a new one.
 * @param {string} canvasID - ID of the <canvas> element.
 * @param {Array}  labels   - Chart legend labels.
 * @param {Array}  data     - Numeric data values.
 * @param {Array}  colors   - Background colours matching data.
 * @returns {Chart|null}
 */
function buildDoughnutChart(canvasID, labels, data, colors) {
    const canvas = document.getElementById(canvasID);

    if (!canvas)
    {
        return null;
    }

    return new Chart(canvas, {
        type: "doughnut",
        data: { labels, datasets: [{ data, backgroundColor: colors, borderWidth: 2 }] },
        options: {
            responsive: true,
            plugins: { legend: { position: "bottom", labels: { color: cssVar("--hc-color-text-contrast") } } }
        }
    });
}

/**
 * Builds a Bulma tag <span> for an Alert status value. The CSS class determines the colour (see dashboard.css hc-tag-* rules).
 * @function buildAlertStatusTag
 * @param {string} status - One of: "open", "acknowledged", "resolved", "critical".
 * @returns {HTMLElement} A <span class="tag hc-tag-{status}"> element.
 */
function buildAlertStatusTag(status) {
    const tag       = document.createElement("span");
    tag.className   = "tag hc-tag-" + (status || "open");
    
    const keyMap = { // Translate the status value to the current language
        "open":         "Open",
        "acknowledged": "Acknowledged",
        "resolved":     "Resolved",
        "critical":     "Critical"
    };
    tag.textContent = i18n.t(keyMap[status] || "Unknown");
    return tag;
}

/**
 * Builds a Bulma tag <span> for a device connection status.
 * @function buildConnectionTag
 * @param {boolean} isConnected - Whether the device is currently connected.
 * @returns {HTMLElement} A <span class="tag hc-tag-connected|disconnected"> element.
 */
function buildConnectionTag(isConnected) {
    const tag       = document.createElement("span");
    tag.className   = isConnected ? "tag hc-tag-connected" : "tag hc-tag-disconnected";
    tag.textContent = isConnected ? i18n.t("Connected") : i18n.t("Disconnected");
    return tag;
}

/**
 * Capitalises the first letter of a string. Used to format bridge names for display.
 * @function capitalise
 * @param {string} str - The string to capitalise.
 * @returns {string} The input string with its first character in upper case.
 */
function capitalise(str) {
    if (!str) { 
        return ""; 
    }
    return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Updates the "last updated" timestamp in the status bar to the current local time.
 * @function updateLastUpdatedTimestamp
 * @returns {void}
 * @description Formats the current Date as HH:MM:SS and writes it into #hc-last-updated, prefixed with the translated "LastUpdated" label.
 */
function updateLastUpdatedTimestamp() {
    const element = document.getElementById("hc-last-updated");
    if (!element) {
        return; 
    }

    const now     = new Date();
    const hours   = String(now.getHours()).padStart(2, "0");
    const minutes = String(now.getMinutes()).padStart(2, "0");
    const seconds = String(now.getSeconds()).padStart(2, "0");

    element.textContent = i18n.t("LastUpdated") + ": " + hours + ":" + minutes + ":" + seconds;
}


/**
 * Initialises the DE / EN language toggle buttons in the navigation bar.
 * @function initLanguageToggle
 * @returns {void}
 */
function initLanguageToggle() {
    const btnDe = document.getElementById("hc-lang-de");
    const btnEn = document.getElementById("hc-lang-en");

    
    function updateLangButtons() { // Helper to update the visual active state on the language buttons
        const lang = i18n.getLanguage();
        if (btnDe) {
            btnDe.classList.toggle("is-active", lang === "de");
        }
        
        if (btnEn) { 
            btnEn.classList.toggle("is-active", lang === "en");
        }
    }

    if (btnDe) {
        btnDe.addEventListener("click", function () {
            i18n.setLanguage("de");
            updateLangButtons();
            i18n.applyToDOM();
            renderActiveTab();
            updateLastUpdatedTimestamp();
        });
    }

    if (btnEn) {
        btnEn.addEventListener("click", function () {
            i18n.setLanguage("en");
            updateLangButtons();
            i18n.applyToDOM();
            renderActiveTab();
            updateLastUpdatedTimestamp();
        });
    }

    updateLangButtons(); // Set the initial visual state based on the persisted language
}

/**
 * Dashboard entry point. Runs once after the DOM is fully loaded.
 * @async
 * @function init
 * @returns {Promise<void>}
 */
async function init() {
    await fetchConfig(); // Step 1: get the server URL from the healthcheck server
    
    await i18n.load(); // Step 2: load translations from i18n.json, then apply to the DOM
    i18n.applyToDOM();
    
    initTabNavigation(); // Step 3: wire up all interactive elements
    initLanguageToggle();
    
    await refreshAllData(); // Step 4: load all data and render the default (Overview) tab
    
    setInterval(refreshAllData, CONF_dashboardRefreshIntervalMs); // Step 5: keep data fresh automatically every REFRESH_INTERVAL_MS milliseconds
}

document.addEventListener("DOMContentLoaded", init); // Start the dashboard once the browser has fully parsed the HTML
