/**
 * =============================================================================================
 * Routes for Updates
 * ==================
 */
const appConfig       = require("../../config");
const router          = require("express").Router();
const fs              = require("fs");
const os              = require("os");
const path            = require("path");
const { spawn }       = require("child_process");
const extractZip      = require("extract-zip");

/**
 * =============================================================================================
 * Helper functions
 * ================
 */

/**
 * A helper function to run a command as a child process and return a promise that resolves when the
 * process exits successfully or rejects if it fails.
 * @param {string} command 
 * @param {string[]} args 
 * @param {object} options 
 * @returns {Promise<void>}
 */
function runProcess(command, args, options = {}) {
    return new Promise((resolve, reject) => {
        const process = spawn(command, args, options);
        process.on("error", reject);
        process.on("close", (code) => { // Ignore non-zero exit codes if stdio is ignored, as some commands may return non-zero codes even on success when output is not captured.
            if (code !== 0) {
                reject(new Error(command + " failed with exit code " + code));
                return;
            }
            resolve();
        });
    });
}

/**
 * Runs the update process by downloading the latest code from GitHub, extracting it, copying it to the server directory
 * while excluding certain files, and then restarting the server using a detached process. 
 * @param {string} latestCommit 
 * @returns {Promise<void>}
 */
async function updateRunAndRestart(latestCommit) {
    const rootPath = path.resolve(__dirname, "../..");

    const repoURLFixed = String(appConfig.CONF_repositoryURL || "").replace(/^\/+|\/+$/g, ""); // Trim leading/trailing slashes
    const repoURLParts = repoURLFixed.split("/");

    if (repoURLParts.length < 3) {
        common.conLog("Server route 'Update': Invalid CONF_repositoryURL: " + appConfig.CONF_repositoryURL, "red");
        throw new Error("Invalid CONF_repositoryURL. Expected format '<owner>/<repo>/commits/<branch>'");
    }
    else {
        const repoMeta  = {};
        repoMeta.owner  = repoURLParts[0];
        repoMeta.repo   = repoURLParts[1];
        repoMeta.branch = repoURLParts[3];

        common.conLog("Server route 'Update': Starting update process for commit " + latestCommit + " in repository:", "yel");
        common.conLog("Repository: " + repoMeta.owner + "/" + repoMeta.repo, "std", false);
        common.conLog("Branch: " + repoMeta.branch, "std", false);

        const zipUrl    = "https://github.com/" + repoMeta.owner + "/" + repoMeta.repo + "/archive/refs/heads/" + repoMeta.branch + ".zip";
        const tempDir   = await fs.promises.mkdtemp(path.join(os.tmpdir(), "healthcore-update-")); // Create a unique temporary directory for the update process
        const zipPath   = path.join(tempDir, "update.zip");
        const unzipDir  = path.join(tempDir, "unzipped");

        try {
            const zipResponse = await fetch(zipUrl);
            if (!zipResponse.ok) {
                throw new Error("GitHub ZIP download failed with HTTP " + zipResponse.status);
            }

            const zipBuffer = Buffer.from(await zipResponse.arrayBuffer());
            await fs.promises.writeFile(zipPath, zipBuffer);
            await fs.promises.mkdir(unzipDir, { recursive: true });

            await extractZip(zipPath, { dir: unzipDir }); // Extract the ZIP file to the temporary directory

            const extractedFolder   = path.join(unzipDir, repoMeta.repo + "-" + repoMeta.branch);
            const databaseFileName  = path.basename("../healthcore_database.db").trim();
            const rsyncArgs = [
                "-a",
                "--delete",
                "--exclude", ".git",
                "--exclude", ".env.local",
                "--exclude", "logs",
                "--exclude", "node_modules",
                "--exclude", "*.db",
                extractedFolder + "/",
                rootPath + "/"
            ];

            if (databaseFileName && databaseFileName !== "." && databaseFileName !== "..") { // Exclude the database file if it's specified and valid
                 rsyncArgs.splice(rsyncArgs.length - 2, 0, "--exclude", databaseFileName);
            }

            await runProcess("rsync", rsyncArgs, { cwd: rootPath, stdio: "ignore" });

            const startScript = path.join(rootPath, "production-start.sh");
            await runProcess("chmod", ["+x", startScript], { cwd: rootPath, stdio: "ignore" });

            const restartLogPath = path.join(rootPath, "logs", "update-restart-" + Date.now() + ".log");
            spawn("nohup", [ "bash", "-c", `sleep 2 && cd "${rootPath}" && ./production-start.sh >> "${restartLogPath}" 2>&1 &`], { cwd: rootPath, detached: true, stdio: "ignore"}).unref(); // Start the restart process in a detached child process that runs independently of the main server process, allowing it to continue even if the main process exits during the update.

            common.conLog("Server route 'Update': Services restarting in 2 seconds (see " + restartLogPath + " for details)", "gre");
        }
        finally {
            await fs.promises.rm(tempDir, { recursive: true, force: true }); // Clean up the temporary directory after the update process is complete, regardless of success or failure
        }
    }
}

/**
 * @swagger
 * /update/info:
 *   get:
 *     summary: Check for server updates
 *     description: This endpoint checks if there is a newer version of the server code available on GitHub by comparing the latest commit hash with the one stored in the server configuration.
 *     tags:
 *       - Update
 *     responses:
 *       "200":
 *         description: Successfully checked for updates.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: "ok"
 *                 updateAvailable:
 *                   type: boolean
 *                   example: false
 *                 latestCommit:
 *                   type: string
 *                   example: "abc123def456"
 */
router.get("/info", async function (request, response) {
    const data              = {};
    data.status             = "ok";
    data.updateAvailable    = false;

    const latestCommitUpdate = await database.prepare("SELECT * FROM update_history WHERE type='commit' ORDER BY dateTimeApplied DESC LIMIT 1").get();
    if (latestCommitUpdate) {
        data.latestCommit = latestCommitUpdate.migrationID;
    }
    else {
        data.latestCommit = null;
    }

    try {
        const fetchResponse    = await fetch("https://api.github.com/repos/" + appConfig.CONF_repositoryURL);
        if (!fetchResponse.ok) {
            throw new Error("GitHub API returned status " + fetchResponse.status);
        }
        const fetchData        = await fetchResponse.json();
        const latestCommitHash = fetchData.sha || null;

        if (latestCommitHash && latestCommitHash !== data.latestCommit) {
            data.updateAvailable = true;
            data.latestCommit    = latestCommitHash;
        }
    }
    catch (error) {
        common.conLog("Server route 'Update': Error checking for updates: " + error.message, "red");
        data.status = "error";
        data.error  = error.message;
    }

    common.conLog("Server route 'Update': Update check response: " + JSON.stringify(data), "std", false);
    return common.sendResponse(response, data, "Server route 'Update'", "GET request update info");
});

/**
 * @swagger
 * /update/install:
 *   post:
 *     summary: Install the latest code from GitHub
 *     description: This endpoint initiates the installation of the latest update by pulling the latest code from GitHub and restarting all services. It should only be called if an update is available.
 *     tags:
 *       - Update
 *     responses:
 *       "200":
 *         description: Successfully started the update installation process.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: "ok"
 *                 message:
 *                   type: string
 *                   example: "Update installation started"
 *       "400":
 *         description: Bad request, e.g. if no update is available.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: "error"
 *                 message:
 *                   type: string
 *                   example: "No update available"
 */
router.post("/install", async function (request, response) {
    let data    = {};

    try {
        data.status          = "ok";
        data.updateAvailable = false;

        const latestCommitUpdate = await database.prepare("SELECT * FROM update_history WHERE type='commit' ORDER BY dateTimeApplied DESC LIMIT 1").get();
        if (latestCommitUpdate) {
            data.latestCommit = latestCommitUpdate.migrationID;
        }
        else {
            data.latestCommit = null;
        }


        const fetchResponse    = await fetch("https://api.github.com/repos/" + appConfig.CONF_repositoryURL);
        if (!fetchResponse.ok) {
            throw new Error("GitHub API returned status " + fetchResponse.status);
        }
        const fetchData        = await fetchResponse.json();
        const latestCommitHash = fetchData.sha || null;

        if (latestCommitHash && latestCommitHash !== data.latestCommit) {
            data.updateAvailable = true;
            data.latestCommit    = latestCommitHash;
        }

        if (data.updateAvailable === false) {
            common.sendResponse(response, data, "Server route 'Update'", "POST request install update");
        }
        else {
            common.sendResponse(response, data, "Server route 'Update'", "POST request install update");

            database.prepare("INSERT INTO update_history (migrationID, type) VALUES (?, 'commit')").run(data.latestCommit);
 
            updateRunAndRestart(data.latestCommit).catch((error) => {
                common.conLog("Server route 'Update': Detached update failed: " + error.message, "red");
            });

            return;
        }

    }
    catch (error) {
        common.conLog("Server route 'Update': Error installing update: " + error.message, "red");

        data.status = "error";
        data.error  = error.message;

        return common.sendResponse(response, data, "Server route 'Update'", "POST request install update");
    }
});

module.exports = router;