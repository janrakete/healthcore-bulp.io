/**
 * =============================================================================================
 * Healthcheck Dashboard — Main JavaScript
 * ========================================
 *
 * Drives the Healthcheck dashboard: fetches read-only data from the Healthcore server,
 * renders it into the DOM using Bulma components, and keeps data fresh via polling.
 *
 * Dependencies (loaded before this script in dashboard.html):
 *   - Chart.js   (libs/chart.umd.min.js)
 *   - i18n module (i18n.js)
 *
 * Sections:
 *   A — Constants and state          E — Tab navigation
 *   B — Runtime config fetch         F — Overview rendering
 *   C — API fetch functions          G — Care Insights rendering
 *   D — Central data refresh         H — Devices rendering
 *                                    I — People rendering
 *                                    J — Rooms rendering
 *                                    K — Notifications rendering
 *                                    L — Status rendering
 *                                    M — Utility functions
 *                                    N — Initialisation
 */


/**
 * =============================================================================================
 * Section A — Constants and central state
 * ========================================
 */

/**
 * @type {number} REFRESH_INTERVAL_MS
 * How often (in milliseconds) the dashboard automatically re-fetches all data.
 * Initialised to the .env default; overridden at runtime from /api/config.
 */
let REFRESH_INTERVAL_MS = 30000;

/**
 * @type {number} OVERVIEW_RECENT_INSIGHTS_COUNT
 * Maximum number of Care Insights shown in the Overview recent-insights panel.
 * Initialised to the .env default; overridden at runtime from /api/config.
 */
let OVERVIEW_RECENT_INSIGHTS_COUNT = 3;

/**
 * @type {number} OVERVIEW_RECENT_NOTIFICATIONS_COUNT
 * Maximum number of Notifications shown in the Overview recent-notifications panel.
 * Initialised to the .env default; overridden at runtime from /api/config.
 */
let OVERVIEW_RECENT_NOTIFICATIONS_COUNT = 3;


/**
 * @type {string|null} serverBaseUrl
 * Base URL of the main Healthcore server (e.g. "http://localhost:9998").
 * Populated once during initialisation by fetchConfig(). All Healthcore API
 * calls must use this variable — never hard-code the URL.
 */
let serverBaseUrl = null;

/**
 * @type {string} serverApiKey
 * Optional API key for the Healthcore server. Empty string means no key is required
 * (default development setup). Set via the /api/config endpoint.
 */
let serverApiKey = "";

/**
 * @type {Object} dashboardState
 * Central in-memory state for all data fetched from the Healthcore server.
 * All render functions read from here; fetch functions write to here.
 *
 * @property {Array}  devices              - All devices from GET /devices/all
 * @property {Array}  individuals          - All people from GET /data/individuals
 * @property {Array}  rooms                - All rooms from GET /data/rooms
 * @property {Array}  insights             - Care Insights matching current filter
 * @property {Object} insightStats         - Counts from GET /care-insights/stats
 * @property {Array}  notifications        - Notifications from GET /data/notifications
 * @property {string} activeTab            - data-tab value of the currently visible tab
 * @property {string} filterInsightStatus  - Current value of the insights status dropdown
 * @property {string} filterDeviceBridge   - Current value of the devices bridge dropdown
 * @property {Object|null} serverInfo      - Response from GET /info (server + bridge status)
 */
const dashboardState = {
    devices:             [],
    individuals:         [],
    rooms:               [],
    insights:            [],
    insightStats:        { open: 0, acknowledged: 0, resolved: 0, critical: 0 },
    notifications:       [],
    serverInfo:          null,
    activeTab:           "overview",
    filterInsightStatus: "",
    filterDeviceBridge:  ""
};

/**
 * @type {Object} chartInstances
 * Holds Chart.js instance references so they can be destroyed before being
 * recreated on each refresh cycle. Destroying before recreating is necessary
 * because Chart.js does not support clean partial updates on doughnut charts.
 *
 * @property {Chart|null} insightStatus   - Doughnut: Care Insight status distribution
 * @property {Chart|null} deviceStatus    - Doughnut: device connection status
 * @property {Object}     signalCharts    - Map of insightID → Chart (line charts)
 */
const chartInstances = {
    insightStatus: null,
    deviceStatus:  null,
    signalCharts:  {}
};


/**
 * =============================================================================================
 * Section B — Runtime configuration fetch
 * =========================================
 */

/**
 * Fetches the runtime configuration from the healthcheck server.
 * The healthcheck server (same origin, port 9990) exposes GET /api/config which returns
 * the Healthcore server URL, API key, and dashboard display settings read from .env.
 * Must be called first during initialisation before any other API fetch or timer setup.
 * @async
 * @function fetchConfig
 * @returns {Promise<void>}
 * @description On success: populates serverBaseUrl, serverApiKey, and the three
 *   dashboard tuning variables (REFRESH_INTERVAL_MS, OVERVIEW_RECENT_INSIGHTS_COUNT,
 *   OVERVIEW_RECENT_NOTIFICATIONS_COUNT). On failure: shows an error in the status bar;
 *   the dashboard still loads using the hardcoded fallback values.
 */
async function fetchConfig() {
    try {
        const response = await fetch("/api/config");
        const data     = await response.json();

        serverBaseUrl  = data.serverBaseUrl || null;
        serverApiKey   = data.apiKey        || "";

        // Override the module-level variables with values from .env (via server)
        if (data.dashboardRefreshIntervalMs)        { REFRESH_INTERVAL_MS                = data.dashboardRefreshIntervalMs;        }
        if (data.dashboardRecentInsightsCount)      { OVERVIEW_RECENT_INSIGHTS_COUNT     = data.dashboardRecentInsightsCount;      }
        if (data.dashboardRecentNotificationsCount) { OVERVIEW_RECENT_NOTIFICATIONS_COUNT = data.dashboardRecentNotificationsCount; }
    }
    catch (error) {
        console.error("fetchConfig failed:", error);
    }
}

/**
 * Builds the HTTP headers object for Healthcore server API requests.
 * When an API key is configured it is added as the "x-api-key" header.
 * All fetch functions call this helper so there is only one place to update
 * if authentication requirements change.
 * @function buildApiHeaders
 * @returns {Object} An object suitable for passing to fetch() as the "headers" option.
 */
function buildApiHeaders() {
    const headers = {};
    if (serverApiKey) {
        headers["x-api-key"] = serverApiKey;
    }
    return headers;
}


/**
 * =============================================================================================
 * Section C — Healthcore server API fetch functions
 * ==================================================
 */

/**
 * Fetches a JSON array from a Healthcore API endpoint.
 * Returns data.results as an array, or [] on error.
 * @async
 * @param {string} path - Path appended to serverBaseUrl (e.g. "/devices/all").
 * @returns {Promise<Array>}
 */
async function fetchArray(path) {
    try {
        const data = await (await fetch(serverBaseUrl + path, { headers: buildApiHeaders() })).json();
        return Array.isArray(data.results) ? data.results : [];
    } catch (error) {
        console.error("fetchArray failed [" + path + "]:", error);
        return [];
    }
}

/**
 * Fetches all registered devices from the Healthcore server.
 * Each device object is enriched by the server with individual and room data.
 * @async
 * @function fetchDevices
 * @returns {Promise<Array>} Array of enriched device objects, or an empty array on error.
 * @description Calls GET {serverBaseUrl}/devices/all. Returns data.results on success.
 */
async function fetchDevices()       { return fetchArray("/devices/all"); }

/**
 * Fetches all individuals (people) from the Healthcore server.
 * @async
 * @function fetchIndividuals
 * @returns {Promise<Array>} Array of individual objects, or an empty array on error.
 * @description Calls GET {serverBaseUrl}/data/individuals.
 */
async function fetchIndividuals()   { return fetchArray("/data/individuals"); }

/**
 * Fetches all rooms from the Healthcore server.
 * @async
 * @function fetchRooms
 * @returns {Promise<Array>} Array of room objects, or an empty array on error.
 * @description Calls GET {serverBaseUrl}/data/rooms.
 */
async function fetchRooms()         { return fetchArray("/data/rooms"); }

/**
 * Fetches Care Insights from the Healthcore server, optionally filtered by status.
 * Results are always ordered newest-first (dateTimeUpdated DESC).
 * @async
 * @function fetchInsights
 * @param {string} [statusFilter=""] - If non-empty, only insights with this status are returned.
 *   Valid values: "open", "acknowledged", "resolved", "critical".
 * @returns {Promise<Array>} Array of enriched Care Insight objects, or empty array on error.
 * @description Calls GET {serverBaseUrl}/care-insights with optional ?status= query param.
 */
async function fetchInsights(statusFilter = "") {
    try {
        let url = serverBaseUrl + "/care-insights?orderBy=dateTimeUpdated,DESC";
        if (statusFilter !== "") {
            url += "&status=" + encodeURIComponent(statusFilter);
        }
        const response = await fetch(url, { headers: buildApiHeaders() });
        const data     = await response.json();
        return Array.isArray(data.results) ? data.results : [];
    }
    catch (error) {
        console.error("fetchInsights failed:", error);
        return [];
    }
}

/**
 * Fetches Care Insight summary statistics from the Healthcore server.
 * Returns counts for open, acknowledged, resolved, and critical insights.
 * @async
 * @function fetchInsightStats
 * @returns {Promise<Object>} Stats object with keys open/acknowledged/resolved/critical,
 *   or an object with all zeroes on error.
 * @description Calls GET {serverBaseUrl}/care-insights/stats.
 */
async function fetchInsightStats() {
    try {
        const response = await fetch(serverBaseUrl + "/care-insights/stats", { headers: buildApiHeaders() });
        const data     = await response.json();
        return data.data || { open: 0, acknowledged: 0, resolved: 0, critical: 0 };
    }
    catch (error) {
        console.error("fetchInsightStats failed:", error);
        return { open: 0, acknowledged: 0, resolved: 0, critical: 0 };
    }
}

/**
 * Fetches the full detail of a single Care Insight including its signals array.
 * Called lazily when the user expands an insight card for the first time.
 * @async
 * @function fetchInsightDetail
 * @param {number} insightID - The numeric ID of the Care Insight to load.
 * @returns {Promise<Object|null>} Object with {insight, signals} on success, or null on error.
 * @description Calls GET {serverBaseUrl}/care-insights/{insightID}.
 *   The signals array is ordered by signalID DESC (newest first) by the server;
 *   renderSignalChart() reverses this to ascending for the time axis.
 */
async function fetchInsightDetail(insightID) {
    try {
        const response = await fetch(serverBaseUrl + "/care-insights/" + insightID, { headers: buildApiHeaders() });
        const data     = await response.json();
        if (data.status === "ok" && data.insight) {
            return { insight: data.insight, signals: Array.isArray(data.signals) ? data.signals : [] };
        }
        return null;
    }
    catch (error) {
        console.error("fetchInsightDetail failed for ID " + insightID + ":", error);
        return null;
    }
}

/**
 * Fetches server info from the Healthcore server.
 * Returns the server name, version, Bonjour ID, and connectivity status for each bridge.
 * @async
 * @function fetchInfo
 * @returns {Promise<Object|null>} Info object on success, or null on error.
 * @description Calls GET {serverBaseUrl}/info.
 *   Response shape: { status, serverName, serverVersion, serverIDBonjour, bridges[] }
 *   Each bridge: { bridge, port, status } where status is "online" or "offline".
 */
async function fetchInfo() {
    try {
        const response = await fetch(serverBaseUrl + "/info", { headers: buildApiHeaders() });
        return await response.json();
    }
    catch (error) {
        console.error("fetchInfo failed:", error);
        return null;
    }
}

/**
 * Fetches notifications from the Healthcore server, newest first.
 * @async
 * @function fetchNotifications
 * @returns {Promise<Array>} Array of notification objects, or empty array on error.
 * @description Calls GET {serverBaseUrl}/data/notifications?orderBy=dateTime,DESC.
 *   Notification columns: ID, text, description, scenarioID, icon, dateTime.
 */
async function fetchNotifications() { return fetchArray("/data/notifications?orderBy=dateTime,DESC"); }




/**
 * =============================================================================================
 * Section E — Central data refresh
 * ==================================
 */

/**
 * Fetches all Healthcore data sources in parallel and updates dashboardState.
 * Called once during initialisation and then every REFRESH_INTERVAL_MS milliseconds.
 * @async
 * @function refreshAllData
 * @returns {Promise<void>}
 * @description Uses Promise.all to fetch devices, individuals, rooms, insights, insight
 *   stats, and notifications simultaneously. After all fetches complete, calls
 *   renderActiveTab() and updateLastUpdatedTimestamp() to reflect the fresh data.
 *   Individual fetch errors are handled inside each fetch function — a single failing
 *   endpoint does not prevent the others from updating.
 */
async function refreshAllData() {

    const [devices, individuals, rooms, insights, insightStats, notifications, serverInfo] = await Promise.all([
        fetchDevices(),
        fetchIndividuals(),
        fetchRooms(),
        fetchInsights(dashboardState.filterInsightStatus),
        fetchInsightStats(),
        fetchNotifications(),
        fetchInfo()
    ]);

    dashboardState.devices       = devices;
    dashboardState.individuals   = individuals;
    dashboardState.rooms         = rooms;
    dashboardState.insights      = insights;
    dashboardState.insightStats  = insightStats;
    dashboardState.notifications = notifications;
    dashboardState.serverInfo    = serverInfo;

    // Clear the loading message on successful refresh
    renderActiveTab();
    updateLastUpdatedTimestamp();
}


/**
 * =============================================================================================
 * Section F — Tab navigation
 * ===========================
 */

/**
 * Initialises tab switching by attaching click handlers to all [data-tab] list items
 * in the tab bar. Manages the is-active class on tab items and is-hidden on panels.
 * @function initTabNavigation
 * @returns {void}
 */
function initTabNavigation() {
    const tabItems  = document.querySelectorAll("#hc-dashboard-tabs [data-tab]");
    const tabPanels = document.querySelectorAll(".hc-tab-panel");

    tabItems.forEach(function (tabItem) {
        tabItem.addEventListener("click", function () {
            const targetTab = tabItem.getAttribute("data-tab");

            // Deactivate all tabs and hide all panels
            tabItems.forEach(item => item.classList.remove("is-active"));
            tabPanels.forEach(panel => panel.classList.add("is-hidden"));

            // Activate the clicked tab and show its panel
            tabItem.classList.add("is-active");
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
    else if (tab === "care-insights") {
        renderInsights();
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
    else if (tab === "notifications") {
        renderNotifications();
    }
    else if (tab === "status") {
        renderStatus();
    }
}


/**
 * =============================================================================================
 * Section G — Overview tab rendering
 * =====================================
 */

/**
 * Renders the Overview tab: stat cards, two doughnut charts, and the recent-data row
 * (latest Care Insights + latest three Notifications).
 * @function renderOverview
 * @returns {void}
 * @description Reads dashboardState.insightStats, devices, individuals, rooms, insights,
 *   and notifications to build six stat cards, two charts, and two recent-data lists.
 */
function renderOverview() {
    const cardsContainer = document.getElementById("overview-stats-cards");
    if (!cardsContainer) { return; }
    cardsContainer.innerHTML = "";

    // Build stat cards — open and critical insights only
    cardsContainer.appendChild(buildStatCard("Critical", dashboardState.insightStats.critical, "hc-box-color-critical"));
    cardsContainer.appendChild(buildStatCard("Open",     dashboardState.insightStats.open,     "hc-box-color-open"));

    // Update the two doughnut charts
    renderInsightStatusChart();
    renderDeviceStatusChart();

    // Render the recent-data panels below the charts
    renderOverviewRecentInsights();
    renderOverviewRecentNotifications();
}

/**
 * Renders the most recent Care Insights into the Overview panel (#overview-recent-insights).
 * Insights are already sorted newest-first in dashboardState (fetched with DESC order).
 * Each entry shows the summary, status tag, score, and the last-updated timestamp.
 * @function renderOverviewRecentInsights
 * @returns {void}
 */
function renderOverviewRecentInsights() {
    const container = document.getElementById("overview-recent-insights");
    if (!container) { 
        return; 
    }
    container.innerHTML = "";

    const recent = dashboardState.insights.slice(0, OVERVIEW_RECENT_INSIGHTS_COUNT);

    if (recent.length === 0) {
        const empty = document.createElement("p");
        empty.className   = "has-text-grey is-size-7";
        empty.textContent = i18n.t("NoData");
        container.appendChild(empty);
        return;
    }

    for (const insight of recent) {
        // Outer wrapper — one row per insight, separated by a hairline border
        const row = document.createElement("div");
        row.className = "hc-overview-recent-row";

        // Top line: status tag + summary text
        const topLine = document.createElement("div");
        topLine.className = "is-flex is-align-items-center mb-1 hc-flex-gap-xs";

        topLine.appendChild(buildInsightStatusTag(insight.status));

        const summary = document.createElement("span");
        summary.className   = "is-small has-text-weight-bold";
        summary.textContent = insight.summary || i18n.t("Unknown");
        topLine.appendChild(summary);

        // Bottom line: last-updated timestamp (muted, right-aligned)
        const bottomLine = document.createElement("div");
        bottomLine.className   = "is-small";
        bottomLine.textContent = insight.dateTimeUpdated
            ? formatDateTime(insight.dateTimeUpdated) + ":"
            : "";

        row.appendChild(bottomLine);
        row.appendChild(topLine);
        container.appendChild(row);
    }
}

/**
 * Renders the most recent Notifications into the Overview panel (#overview-recent-notifications).
 * Notifications are already sorted newest-first in dashboardState (fetched with DESC order).
 * Each entry shows the title, description (truncated), and timestamp.
 * @function renderOverviewRecentNotifications
 * @returns {void}
 */
function renderOverviewRecentNotifications() {
    const container = document.getElementById("overview-recent-notifications");
    if (!container) { 
        return;
    }
    container.innerHTML = "";

    const recent = dashboardState.notifications.slice(0, OVERVIEW_RECENT_NOTIFICATIONS_COUNT);

    if (recent.length === 0) {
        const empty = document.createElement("p");
        empty.className   = "has-text-grey is-size-7";
        empty.textContent = i18n.t("NoData");
        container.appendChild(empty);
        return;
    }

    for (const notification of recent) {
        const row = document.createElement("div");
        row.className = "hc-overview-recent-row";

        if (notification.dateTime) {
            const ts = document.createElement("div");
            ts.className   = "";
            ts.textContent = formatDateTime(notification.dateTime) + ":";
            row.appendChild(ts);
        }


        const title = document.createElement("div");
        title.className   = "has-text-weight-bold";
        title.textContent = notification.text || i18n.t("Unknown");
        row.appendChild(title);

        if (notification.description) {
            const desc = document.createElement("div");
            desc.className   = "";
            const fullText   = notification.description;
            desc.textContent = fullText.length > 80 ? fullText.substring(0, 80) + "…" : fullText;
            row.appendChild(desc);
        }


        container.appendChild(row);
    }
}

/**
 * Builds a single stat card DOM element for the Overview grid.
 * The card is a Bulma column > box > custom .hc-stat-card structure.
 * @function buildStatCard
 * @param {string} labelKey    - i18n key for the card's label text.
 * @param {number} value       - The numeric value to display prominently.
 * @param {string} [colorClass=""] - Optional CSS modifier class on the number element.
 * @returns {HTMLElement} A column element containing the stat card box.
 */
function buildStatCard(labelKey, value, colorClass = "") {
    const column = document.createElement("div");
    column.className = "column is-2";

    const box = document.createElement("div");
    box.className = "box has-text-centered" + (colorClass ? " " + colorClass : "");

    const number = document.createElement("span");
    number.className   = "hc-stat-number" + (colorClass ? " " + colorClass : "");
    number.textContent = String(value);

    const label = document.createElement("span");
    label.className   = "hc-stat-label is-uppercase has-text-weight-bold";
    label.textContent = i18n.t(labelKey);

    box.appendChild(label);
    box.appendChild(number);
    column.appendChild(box);
    return column;
}

/**
 * Creates or re-creates the Care Insight status doughnut chart.
 * Destroys the previous Chart.js instance if one exists to prevent canvas reuse errors.
 * @function renderInsightStatusChart
 * @returns {void}
 * @description Data: open / acknowledged / resolved counts from dashboardState.insightStats.
 *   Colours: open=#ff9800, acknowledged=#2196f3, resolved=#4caf50.
 */
function renderInsightStatusChart() {
    if (chartInstances.insightStatus) { chartInstances.insightStatus.destroy(); }
    const s = dashboardState.insightStats;
    chartInstances.insightStatus = buildDoughnutChart(
        "chart-insights-status",
        [i18n.t("Open"), i18n.t("Acknowledged"), i18n.t("Resolved"), i18n.t("Critical")],
        [s.open, s.acknowledged, s.resolved, s.critical],
        [cssVar("--hc-color-insight-open"), cssVar("--hc-color-insight-acknowledged"),
         cssVar("--hc-color-insight-resolved"), cssVar("--hc-color-insight-critical")]
    );
}

/**
 * Creates or re-creates the Device connection status doughnut chart.
 * Destroys the previous Chart.js instance if one exists to prevent canvas reuse errors.
 * @function renderDeviceStatusChart
 * @returns {void}
 * @description Data: connected vs. disconnected device counts derived from dashboardState.devices.
 *   A device is considered connected if Number(device.connected) === 1.
 *   Colours: connected=#4caf50, disconnected=#ff5722.
 */
function renderDeviceStatusChart() {
    if (chartInstances.deviceStatus) { chartInstances.deviceStatus.destroy(); }
    const connected = dashboardState.devices.filter(d => Number(d.connected) === 1).length;
    chartInstances.deviceStatus = buildDoughnutChart(
        "chart-devices-status",
        [i18n.t("Connected"), i18n.t("Disconnected")],
        [connected, dashboardState.devices.length - connected],
        [cssVar("--hc-color-connected"), cssVar("--hc-color-disconnected")]
    );
}


/**
 * =============================================================================================
 * Section H — Care Insights tab rendering
 * =========================================
 */

/**
 * Renders all Care Insight cards into the #insights-list container.
 * Clears the container first, then calls buildInsightCard() for each insight in
 * dashboardState.insights. Shows a "no data" message if the array is empty.
 * @function renderInsights
 * @returns {void}
 */
function renderInsights() {
    renderList("insights-list", dashboardState.insights, buildInsightCard);
}

/**
 * Builds a single Care Insight card DOM element.
 * The card uses Bulma's card component structure. The detail section is hidden by
 * default and loaded lazily when the user expands the card for the first time.
 * @function buildInsightCard
 * @param {Object} insight - An enriched Care Insight object from the API.
 *   Relevant fields: insightID, summary, status, score, type, dateTimeUpdated,
 *   dateTimeAdded, device (optional), individual (optional), room (optional).
 * @returns {HTMLElement} A .card element ready to append to the insights list.
 */
function buildInsightCard(insight) {
    const card      = document.createElement("div");
    card.className  = "card mb-4 hc-insight-card";

    // --- Card header: summary text + status/score tags + expand button ---
    const cardHeader = document.createElement("div");
    cardHeader.className = "card-header";

    const metaWrapper = document.createElement("div");
    metaWrapper.className = "is-flex is-align-items-center is-flex-wrap-wrap" +
                            " card-header-title" +
                            " is-flex-grow-1 py-2 hc-flex-gap-sm";

    const summaryText = document.createElement("span");
    summaryText.className   = "has-text-weight-bold mr-2";
    summaryText.textContent = insight.summary || i18n.t("Unknown");

    const statusTag  = buildInsightStatusTag(insight.status);

    metaWrapper.appendChild(summaryText);
    metaWrapper.appendChild(statusTag);

    // Expand / collapse toggle button
    const expandBtn = document.createElement("button");
    expandBtn.className   = "button is-small is-outlined is-primary ml-auto mr-3 my-auto";
    expandBtn.textContent = i18n.t("ExpandDetails");

    cardHeader.appendChild(metaWrapper);
    cardHeader.appendChild(expandBtn);

    // --- Card content: always-visible metadata ---
    const cardContent = document.createElement("div");
    cardContent.className = "card-content";

    const metaGrid = document.createElement("div");
    metaGrid.className = "hc-insight-meta-grid is-size-7 has-text-grey";

    // Individual (person)
    if (insight.individual) {
        metaGrid.appendChild(buildMetaItem(i18n.t("AssignedPerson"), insight.individual.firstname + " " + insight.individual.lastname));
    }

    // Device
    if (insight.device) {
        metaGrid.appendChild(buildMetaItem(i18n.t("Device"), insight.device.name || insight.device.deviceID));
    }

    // Room
    if (insight.room) {
        metaGrid.appendChild(buildMetaItem(i18n.t("Room"), insight.room.name));
    }

    // Type
    if (insight.type) {
        metaGrid.appendChild(buildMetaItem(i18n.t("Type"), insight.type));
    }

    // Last updated timestamp — formatted for the active language
    if (insight.dateTimeUpdated) {
        metaGrid.appendChild(buildMetaItem(i18n.t("UpdatedOn"), formatDateTime(insight.dateTimeUpdated)));
    }

    cardContent.appendChild(metaGrid);

    // --- Detail section: hidden until the user expands the card ---
    const detailSection = document.createElement("div");
    detailSection.className = "hc-insight-detail";

    // Wire up the expand/collapse toggle
    expandBtn.addEventListener("click", function () {
        toggleInsightDetail(insight.insightID, detailSection, expandBtn);
    });

    // Clicking the header row also toggles the detail
    cardHeader.addEventListener("click", function (event) {
        if (event.target !== expandBtn) {
            toggleInsightDetail(insight.insightID, detailSection, expandBtn);
        }
    });

    card.appendChild(cardHeader);
    card.appendChild(cardContent);
    card.appendChild(detailSection);
    return card;
}

/**
 * Builds a small "key: value" metadata item element for the insight card content area.
 * @function buildMetaItem
 * @param {string} label - The label text.
 * @param {string} value - The value text.
 * @returns {HTMLElement} A <div> with the label in muted colour and the value in normal colour.
 */
function buildMetaItem(label, value) {
    const item = document.createElement("div");

    const labelSpan = document.createElement("span");
    labelSpan.className   = "has-text-grey-light mr-1";
    labelSpan.textContent = label + ":";

    const valueSpan = document.createElement("span");
    valueSpan.textContent = value || "—";

    item.appendChild(labelSpan);
    item.appendChild(valueSpan);
    return item;
}

/**
 * Toggles the expand/collapse state of a Care Insight card's detail section.
 * On the first expand, the full detail (including signals) is loaded lazily via
 * loadAndShowInsightDetail(). Subsequent toggles simply show or hide the already-
 * populated section without making another network request.
 * @function toggleInsightDetail
 * @param {number}      insightID     - The numeric ID of the Care Insight.
 * @param {HTMLElement} detailSection - The .hc-insight-detail element inside the card.
 * @param {HTMLElement} toggleButton  - The expand/collapse button whose label is updated.
 * @returns {void}
 * @description Uses the attribute data-loaded="true" on detailSection to track whether
 *   the detail content has already been fetched. This prevents duplicate network requests.
 */
function toggleInsightDetail(insightID, detailSection, toggleButton) {
    const isVisible = detailSection.classList.contains("is-visible");

    if (isVisible) {
        // Collapse: just hide the already-loaded section
        detailSection.classList.remove("is-visible");
        toggleButton.textContent = i18n.t("ExpandDetails");
    }
    else {
        // Expand: load detail lazily on first open, then show
        if (detailSection.getAttribute("data-loaded") === "true") {
            detailSection.classList.add("is-visible");
            toggleButton.textContent = i18n.t("CollapseDetails");
        }
        else {
            toggleButton.textContent = i18n.t("Loading");
            loadAndShowInsightDetail(insightID, detailSection, toggleButton);
        }
    }
}

/**
 * Fetches the full Care Insight detail (explanation, recommendation, signals) and
 * populates the given detail section element. Called lazily on first card expand.
 * @async
 * @function loadAndShowInsightDetail
 * @param {number}      insightID     - The numeric ID of the Care Insight to load.
 * @param {HTMLElement} detailSection - The .hc-insight-detail div to populate.
 * @param {HTMLElement} toggleButton  - The button to update with the collapse label.
 * @returns {Promise<void>}
 */
async function loadAndShowInsightDetail(insightID, detailSection, toggleButton) {
    const result = await fetchInsightDetail(insightID);

    if (!result) {
        // Show an error message inside the detail section
        detailSection.innerHTML = "<p class='notification is-danger is-light'>" + i18n.t("ErrorServerUnreachable") + "</p>";
        detailSection.classList.add("is-visible");
        toggleButton.textContent = i18n.t("CollapseDetails");
        detailSection.setAttribute("data-loaded", "true");
        return;
    }

    const insight = result.insight;
    const signals = result.signals;

    // Clear any existing content
    detailSection.innerHTML = "";

    // Explanation section
    if (insight.explanation) {
        const explanationLabel = document.createElement("div");
        explanationLabel.className   = "label is-small has-text-primary mb-1 mt-3";
        explanationLabel.textContent = i18n.t("Explanation");
        detailSection.appendChild(explanationLabel);

        const explanationText = document.createElement("p");
        explanationText.textContent = insight.explanation;
        detailSection.appendChild(explanationText);
    }

    // Recommendation section
    if (insight.recommendation) {
        const recommendationLabel       = document.createElement("div");
        recommendationLabel.className   = "label is-small has-text-primary mb-1 mt-3";
        recommendationLabel.textContent = i18n.t("Recommendation");
        detailSection.appendChild(recommendationLabel);

        const recommendationText        = document.createElement("p");
        recommendationText.textContent  = insight.recommendation;
        detailSection.appendChild(recommendationText);
    }

    // Signal chart section (only shown when there are signals to plot)
    if (signals.length > 0) {
        const signalsLabel          = document.createElement("div");
        signalsLabel.className      = "label is-small has-text-primary mb-1 mt-3";
        signalsLabel.textContent    = i18n.t("Signals") + " (" + signals.length + ")";
        detailSection.appendChild(signalsLabel);

        const chartContainer = document.createElement("div");
        chartContainer.className = "hc-signal-chart-container";

        const canvas = document.createElement("canvas");
        canvas.id = "signal-chart-" + insightID;
        chartContainer.appendChild(canvas);
        detailSection.appendChild(chartContainer);

        // Render the chart after the canvas is in the DOM
        renderSignalChart("signal-chart-" + insightID, insightID, signals);
    }
    else {
        const noSignals = document.createElement("p");
        noSignals.className   = "is-size-7 has-text-grey is-italic";
        noSignals.textContent = i18n.t("NoData");
        detailSection.appendChild(noSignals);
    }

    // Mark as loaded and make the section visible
    detailSection.setAttribute("data-loaded", "true");
    detailSection.classList.add("is-visible");
    toggleButton.textContent = i18n.t("CollapseDetails");
}

/**
 * Creates a signal line chart for the given Care Insight using Chart.js.
 * Signals are sorted into ascending chronological order before plotting so the
 * time axis reads correctly left-to-right (the server returns them newest-first).
 * @function renderSignalChart
 * @param {string} canvasID  - The id of the <canvas> element to draw on.
 * @param {number} insightID - The ID of the Care Insight (used as the chart storage key).
 * @param {Array}  signals   - Array of signal objects: {signalID, insightID, value, dateTime}.
 * @returns {void}
 * @description Uses Chart.js line chart with tension 0.3, fill, and the primary
 *   deep-purple colour. The container has a fixed height of 220px (set in CSS) and
 *   maintainAspectRatio is set to false so the chart respects that height.
 */
function renderSignalChart(canvasID, insightID, signals) {
    // Destroy any existing chart instance for this insight
    if (chartInstances.signalCharts[insightID]) {
        chartInstances.signalCharts[insightID].destroy();
        chartInstances.signalCharts[insightID] = null;
    }

    // Sort signals ascending by dateTime so the chart reads left-to-right
    const sortedSignals = [...signals].sort(function (a, b) {
        return new Date(a.dateTime) - new Date(b.dateTime);
    });

    const labels = sortedSignals.map(s => formatSignalDateTime(s.dateTime));
    const values = sortedSignals.map(s => parseFloat(s.value));

    const canvas = document.getElementById(canvasID);
    if (!canvas) { 
        return; 
    }

    chartInstances.signalCharts[insightID] = new Chart(canvas, {
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
 * The server stores dates as "YYYY-MM-DD HH:MM:SS" (SQLite localtime format).
 * The output format depends on the currently active language:
 *   de → "DD.MM.YYYY, HH:MM"   (e.g. "15.01.2025, 14:35")
 *   en → "MM/DD/YYYY, HH:MM"   (e.g. "01/15/2025, 14:35")
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

    const dateSections = datePart.split("-");
    const year  = dateSections[0] || "";
    const month = dateSections[1] || "";
    const day   = dateSections[2] || "";
    const time  = timePart.substring(0, 5); // "HH:MM"

    const suffix = i18n.t("TimeSuffix");
    if (i18n.getLanguage() === "de") {
        return day + "." + month + "." + year + ", " + time + (suffix ? " " + suffix : "");
    }
    return month + "/" + day + "/" + year + ", " + time + (suffix ? " " + suffix : "");
}

/**
 * Formats a signal dateTime string into a compact two-line label for Chart.js tick display.
 * The server stores dates as "YYYY-MM-DD HH:MM:SS" (SQLite localtime format).
 * Output format depends on the active language:
 *   de → "HH:MM\nDD.MM"   (e.g. "14:35\n15.01")
 *   en → "HH:MM\nMM/DD"   (e.g. "14:35\n01/15")
 * @function formatSignalDateTime
 * @param {string} dateTimeString - A date/time string such as "2025-01-15 14:35:00".
 * @returns {string} Compact two-line label string.
 */
function formatSignalDateTime(dateTimeString) {
    if (!dateTimeString) { 
        return ""; 
    }

    const parts = String(dateTimeString).split(" ");
    const datePart = parts[0] || ""; // "YYYY-MM-DD"
    const timePart = parts[1] || ""; // "HH:MM:SS"

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
 * Section I — Devices tab rendering
 * ====================================
 */

/**
 * Renders the devices table filtered by dashboardState.filterDeviceBridge.
 * The filtering is done client-side since all devices are always loaded into state.
 * Clears the table body first, then calls buildDeviceRow() for each matching device.
 * @function renderDevices
 * @returns {void}
 */
function renderDevices() {
    const tableBody = document.getElementById("devices-table-body");

    if (!tableBody) { 
        return; 
    }

    tableBody.innerHTML = "";

    const bridgeFilter  = dashboardState.filterDeviceBridge;
    const filteredDevices = dashboardState.devices.filter(function (device) {
        if (bridgeFilter === "")
        { 
            return true; 
        }
        return String(device.bridge || "").toLowerCase() === bridgeFilter.toLowerCase();
    });

    if (filteredDevices.length === 0) {
        const emptyRow = document.createElement("tr");
        emptyRow.className = "hc-table-empty-row";

        const emptyCell    = document.createElement("td");
        emptyCell.setAttribute("colspan", "7");
        emptyCell.textContent = i18n.t("NoData");
        emptyRow.appendChild(emptyCell);
        tableBody.appendChild(emptyRow);
        
        return;
    }

    for (const device of filteredDevices) {
        tableBody.appendChild(buildDeviceRow(device));
    }
}

/**
 * Builds a single <tr> table row for a device.
 * @function buildDeviceRow
 * @param {Object} device - An enriched device object from GET /devices/all.
 *   Relevant fields: name, productName, bridge, connected, individual, room, powerType.
 * @returns {HTMLElement} A <tr> element with seven cells.
 */
function buildDeviceRow(device) {
    const row = document.createElement("tr");

    // Helper to create a simple text <td>
    function td(text) {
        const cell       = document.createElement("td");
        cell.textContent = text || "—";
        return cell;
    }

    // Name
    row.appendChild(td(device.name));

    // Product name
    row.appendChild(td(device.productName));

    // Bridge (capitalise for display)
    row.appendChild(td(capitalise(device.bridge)));

    // Connection status tag
    const statusCell = document.createElement("td");
    const isConnected = Number(device.connected) === 1;
    statusCell.appendChild(buildConnectionTag(isConnected));
    row.appendChild(statusCell);

    // Assigned person (from enriched individual sub-object)
    const personName = device.individual ? (device.individual.firstname + " " + device.individual.lastname).trim(): "—";
    row.appendChild(td(personName));

    // Assigned room (from enriched room sub-object)
    const roomName = device.room ? device.room.name : "—";
    row.appendChild(td(roomName));

    // Power type
    row.appendChild(td(device.powerType));

    return row;
}


/**
 * =============================================================================================
 * Section J — People tab rendering
 * ===================================
 */

/**
 * Renders person cards into #people-list for every individual in dashboardState.
 * Each card resolves the person's room name and lists their assigned devices
 * by looking up dashboardState.rooms and dashboardState.devices.
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
    const room        = dashboardState.rooms.find(r => r.roomID === individual.roomID);
    const roomName    = room ? room.name : "—";
    const deviceNames = dashboardState.devices
        .filter(d => d.individualID === individual.individualID)
        .map(d => d.name || d.deviceID);
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
 * Section K — Rooms tab rendering
 * ==================================
 */

/**
 * Renders room cards into #rooms-list for every room in dashboardState.rooms.
 * Each card resolves the people and devices in the room.
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
    const personNames = dashboardState.individuals
        .filter(ind => ind.roomID === room.roomID)
        .map(ind => (ind.firstname + " " + ind.lastname).trim());
    const deviceNames = dashboardState.devices
        .filter(d => d.roomID === room.roomID)
        .map(d => d.name || d.deviceID);
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
    wrapper.className   = "mb-2";

    const labelEl       = document.createElement("div");
    labelEl.className   = "is-size-7 has-text-grey has-text-weight-semibold is-uppercase";
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
 * Section L — Notifications tab rendering
 * ==========================================
 */

/**
 * Renders notification cards into #notifications-list.
 * Notifications come from the Healthcore scenario engine and are shown newest-first.
 * @function renderNotifications
 * @returns {void}
 */
function renderNotifications() {
    renderList("notifications-list", dashboardState.notifications, buildNotificationCard);
}

/**
 * Builds a single notification card DOM element.
 * @function buildNotificationCard
 * @param {Object} notification - A notification object from the database.
 *   Relevant fields: ID, text (title), description, dateTime, icon, scenarioID.
 * @returns {HTMLElement} A .hc-notification-card div element.
 */
function buildNotificationCard(notification) {
    // Use a Bulma message component for each notification
    const card      = document.createElement("article");
    card.className  = "message is-primary mb-3";

    // Header: title + scenario reference (stored in the "text" column by the scenario engine)
    const cardHeader        = document.createElement("div");
    cardHeader.className    = "message-header";

    const titleSpan         = document.createElement("span");
    titleSpan.textContent   = notification.text || i18n.t("Unknown");
    cardHeader.appendChild(titleSpan);

    if (notification.scenarioID) {
        const scenarioBadge         = document.createElement("span");
        scenarioBadge.className     = "tag is-light is-small ml-2";
        scenarioBadge.textContent   = "Scenario #" + notification.scenarioID;
        cardHeader.appendChild(scenarioBadge);
    }

    card.appendChild(cardHeader);

    // Body: description + timestamp
    const cardBody      = document.createElement("div");
    cardBody.className  = "message-body";

    if (notification.description) {
        const description       = document.createElement("p");
        description.textContent = notification.description;
        cardBody.appendChild(description);
    }

    if (notification.dateTime) {
        const timestamp       = document.createElement("p");
        timestamp.className   = "is-size-7 has-text-grey mt-2";
        timestamp.textContent = formatDateTime(notification.dateTime);
        cardBody.appendChild(timestamp);
    }

    card.appendChild(cardBody);

    return card;
}


/**
 * =============================================================================================
 * Section M — Status tab rendering
 * ==================================
 */

/**
 * Renders the Status tab into #status-content.
 * Shows server identity information (name, version, Bonjour ID) and the connectivity
 * status of each configured bridge, based on dashboardState.serverInfo from GET /info.
 * @function renderStatus
 * @returns {void}
 */
function renderStatus() {
    const container = document.getElementById("status-content");
    if (!container) { 
        return; 
    }
    container.innerHTML = "";

    const info = dashboardState.serverInfo;

    if (!info) { 
        const error         = document.createElement("p");
        error.className     = "notification is-danger is-light";
        error.textContent   = i18n.t("ErrorServerUnreachable");
        container.appendChild(error);
        return;
    }

    // ── Server info card ───────────────────────────────────────────────────────
    const serverCard        = document.createElement("div");
    serverCard.className    = "box mb-5";

    const serverTitle       = document.createElement("h3");
    serverTitle.className   = "title mb-4";
    serverTitle.textContent = i18n.t("StatusServerInfo");
    serverCard.appendChild(serverTitle);

    // Use a Bulma table for the key/value pairs
    const table     = document.createElement("table");
    table.className = "table is-narrow is-fullwidth";

    const rows = [
        [i18n.t("Name"),           info.serverName       || "—"],
        [i18n.t("StatusVersion"),  info.serverVersion    || "—"],
        ["Bonjour ID",             info.serverIDBonjour  || "—"],
        ["Status",                 info.status           || "—"]
    ];

    for (const [label, value] of rows) {
        const tr = document.createElement("tr");

        const th        = document.createElement("th");
        th.className    = "has-text-weight-bold has-text-white hc-status-table-th";
        th.textContent  = label;

        const td        = document.createElement("td");
        td.className    = "";
        td.textContent  = value;

        tr.appendChild(th);
        tr.appendChild(td);
        table.appendChild(tr);
    }

    serverCard.appendChild(table);
    container.appendChild(serverCard);

    // ── Bridge status cards ────────────────────────────────────────────────────
    const bridgesTitle          = document.createElement("h3");
    bridgesTitle.className      = "title mb-3";

    const bridgesGrid       = document.createElement("div");
    bridgesGrid.className   = "columns is-multiline";

    const bridges = Array.isArray(info.bridges) ? info.bridges : [];

    if (bridges.length === 0) {
        const empty         = document.createElement("p");
        empty.className     = "notification is-light";
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

        // Bridge name + status tag on one line
        const header        = document.createElement("div");
        header.className    = "is-flex is-align-items-center mb-2 hc-flex-gap-sm";

        const nameSpan          = document.createElement("span");
        nameSpan.className      = "has-text-weight-bold";
        nameSpan.textContent    = capitalise(bridge.bridge);

        const statusTag         = document.createElement("span");
        statusTag.className     = isOnline ? "tag hc-tag-connected" : "tag hc-tag-disconnected";
        statusTag.textContent   = isOnline ? i18n.t("Online") : i18n.t("Offline");

        header.appendChild(nameSpan);
        header.appendChild(statusTag);
        card.appendChild(header);

        // Port number
        const portLine          = document.createElement("p");
        portLine.className      = "is-size-7 has-text-white-ter";
        portLine.textContent    = i18n.t("StatusPort") + ": " + (bridge.port || "—");
        card.appendChild(portLine);

        col.appendChild(card);
        bridgesGrid.appendChild(col);
    }

    container.appendChild(bridgesGrid);
}


/**
 * =============================================================================================
 * Section N — Utility functions
 * ================================
 */

/**
 * Reads a CSS custom property value from the document root element.
 * Used by chart rendering functions to source all colours from dashboard.css
 * instead of hard-coding hex values in JavaScript.
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
    const p = document.createElement("p");
    p.className   = "notification is-light";
    p.textContent = i18n.t("NoData");
    return p;
}

/**
 * Generic list renderer. Clears containerID, shows buildNoDataMessage() when items
 * is empty, otherwise calls buildFn(item) for each item and appends the result.
 * @param {string}   containerID - ID of the target DOM element.
 * @param {Array}    items       - Data array to render.
 * @param {Function} buildFn     - Called with each item; must return an HTMLElement.
 */
function renderList(containerID, items, buildFn) {
    const container = document.getElementById(containerID);
    if (!container) { return; }
    container.innerHTML = "";
    if (items.length === 0) { container.appendChild(buildNoDataMessage()); return; }
    for (const item of items) { container.appendChild(buildFn(item)); }
}

/**
 * Builds a generic data card (used for People and Rooms tabs).
 * @param {string} title    - Text shown in the card header.
 * @param {Array}  sections - Array of {label, value} objects for the card body.
 * @returns {HTMLElement} A Bulma column > .card element.
 */
function buildDataCard(title, sections) {
    const column = document.createElement("div");
    column.className = "column is-3";

    const card = document.createElement("div");
    card.className = "card hc-data-card";

    const cardHeader = document.createElement("header");
    cardHeader.className = "card-header";
    const headerTitle = document.createElement("p");
    headerTitle.className   = "card-header-title";
    headerTitle.textContent = title;
    cardHeader.appendChild(headerTitle);

    const cardContent = document.createElement("div");
    cardContent.className = "card-content";
    for (const { label, value } of sections) {
        cardContent.appendChild(buildDataCardSection(label, value));
    }

    card.appendChild(cardHeader);
    card.appendChild(cardContent);
    column.appendChild(card);
    return column;
}

/**
 * Builds a doughnut Chart.js instance. Destroys any previous instance stored in
 * the provided ref object under the given key before creating a new one.
 * @param {string} canvasID - ID of the <canvas> element.
 * @param {Array}  labels   - Chart legend labels.
 * @param {Array}  data     - Numeric data values.
 * @param {Array}  colors   - Background colours matching data.
 * @returns {Chart|null}
 */
function buildDoughnutChart(canvasID, labels, data, colors) {
    const canvas = document.getElementById(canvasID);
    if (!canvas) { return null; }
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
 * Builds a Bulma tag <span> for a Care Insight status value.
 * The CSS class determines the colour (see dashboard.css hc-tag-* rules).
 * @function buildInsightStatusTag
 * @param {string} status - One of: "open", "acknowledged", "resolved", "critical".
 * @returns {HTMLElement} A <span class="tag hc-tag-{status}"> element.
 */
function buildInsightStatusTag(status) {
    const tag       = document.createElement("span");
    tag.className   = "tag hc-tag-" + (status || "open");

    // Translate the status value to the current language
    const keyMap = {
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
    const tag   = document.createElement("span");
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
 * @description Formats the current Date as HH:MM:SS and writes it into #hc-last-updated,
 *   prefixed with the translated "LastUpdated" label.
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
 * Initialises the filter dropdown event listeners for the Care Insights and Devices tabs.
 * @function initFilters
 * @returns {void}
 * @description The insights status filter triggers a full refreshAllData() because the
 *   filter is applied server-side. The devices bridge filter triggers a client-side
 *   renderDevices() only, since all device data is already loaded in dashboardState.
 */
function initFilters() {
    const insightFilterSelect = document.getElementById("filter-insights-status");
    if (insightFilterSelect) {
        insightFilterSelect.addEventListener("change", function () {
            dashboardState.filterInsightStatus = insightFilterSelect.value;
            refreshAllData(); // re-fetch with the new filter applied server-side
        });
    }

    const deviceFilterSelect = document.getElementById("filter-devices-bridge");
    if (deviceFilterSelect) {
        deviceFilterSelect.addEventListener("change", function () {
            dashboardState.filterDeviceBridge = deviceFilterSelect.value;
            renderDevices(); // client-side filter — no re-fetch needed
        });
    }
}

/**
 * Initialises the DE / EN language toggle buttons in the navigation bar.
 * On click: switches the active language and re-renders the current tab
 * so any dynamically generated i18n strings are also updated.
 * @function initLanguageToggle
 * @returns {void}
 */
function initLanguageToggle() {
    const btnDe = document.getElementById("hc-lang-de");
    const btnEn = document.getElementById("hc-lang-en");

    // Helper to update the visual active state on the language buttons
    function updateLangButtons() {
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

    // Set the initial visual state based on the persisted language
    updateLangButtons();
}


/**
 * =============================================================================================
 * Section O — Initialisation entry point
 * =========================================
 */

/**
 * Dashboard entry point. Runs once after the DOM is fully loaded.
 * Performs the following steps in order:
 *   1. Fetches runtime config (server URL, API key) from the healthcheck server.
 *   2. Applies translations to all static [data-i18n] elements.
 *   3. Initialises tab navigation, filters, language toggle, and services tab.
 *   4. Performs the initial data fetch and renders the Overview tab.
 *   5. Sets up the auto-refresh interval for subsequent data updates.
 * @async
 * @function init
 * @returns {Promise<void>}
 */
async function init() {
    // Step 1: get the server URL from the healthcheck server
    await fetchConfig();

    // Step 2: load translations from i18n.json, then apply to the DOM
    await i18n.load();
    i18n.applyToDOM();

    // Step 3: wire up all interactive elements
    initTabNavigation();
    initFilters();
    initLanguageToggle();

    // Step 4: load all data and render the default (Overview) tab
    await refreshAllData();

    // Step 5: keep data fresh automatically every REFRESH_INTERVAL_MS milliseconds
    setInterval(refreshAllData, REFRESH_INTERVAL_MS);
}

// Start the dashboard once the browser has fully parsed the HTML
document.addEventListener("DOMContentLoaded", init);
