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

function getRepoMetaFromConfig() {
    const raw   = String(appConfig.CONF_repositoryURL || "").replace(/^\/+|\/+$/g, "");
    const parts = raw.split("/");

    if (parts.length < 2) {
        return null;
    }

    const owner  = parts[0];
    const repo   = parts[1];
    const branch = parts[4] || "master";

    return { owner, repo, branch };
}

function runProcess(command, args, options = {}) {
    return new Promise((resolve, reject) => {
        const process = spawn(command, args, options);
        process.on("error", reject);
        process.on("close", (code) => {
            if (code !== 0) {
                reject(new Error(command + " failed with exit code " + code));
                return;
            }
            resolve();
        });
    });
}

async function runDetachedUpdateAndRestart(latestCommit) {
    const rootPath = path.resolve(__dirname, "../..");
    const repoMeta = getRepoMetaFromConfig();

    if (!repoMeta) {
        throw new Error("Invalid CONF_repositoryURL. Expected at least '<owner>/<repo>'");
    }

    const zipUrl = "https://github.com/" + repoMeta.owner + "/" + repoMeta.repo + "/archive/refs/heads/" + repoMeta.branch + ".zip";
    const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "healthcore-update-"));
    const zipPath = path.join(tempDir, "update.zip");
    const unzipDir = path.join(tempDir, "unzipped");

    try {
        const zipResponse = await fetch(zipUrl);
        if (!zipResponse.ok) {
            throw new Error("GitHub ZIP download failed with HTTP " + zipResponse.status);
        }

        const zipBuffer = Buffer.from(await zipResponse.arrayBuffer());
        await fs.promises.writeFile(zipPath, zipBuffer);
        await fs.promises.mkdir(unzipDir, { recursive: true });

        await runProcess("unzip", ["-q", zipPath, "-d", unzipDir], { stdio: "ignore" });

        const extractedFolder = path.join(unzipDir, repoMeta.repo + "-" + repoMeta.branch);
        const databaseFileName = path.basename(String(appConfig.CONF_databaseFilename || "").trim());
        const rsyncArgs = [
            "-a",
            "--delete",
            "--exclude", ".git",
            "--exclude", ".env",
            "--exclude", ".env.local",
            "--exclude", "logs",
            "--exclude", "node_modules",
            "--exclude", "*.db",
            "--exclude", "*.sqlite",
            "--exclude", "*.sqlite3",
            extractedFolder + "/",
            rootPath + "/"
        ];

        if (databaseFileName && databaseFileName !== "." && databaseFileName !== "..") {
            rsyncArgs.splice(6, 0, "--exclude", databaseFileName);
        }

        await runProcess("rsync", rsyncArgs, { cwd: rootPath, stdio: "ignore" });

        const startScript = path.join(rootPath, "production-start.sh");
        await runProcess("chmod", ["+x", startScript], { cwd: rootPath, stdio: "ignore" });

        // Start script handles PM2 restart/replace internally.
        spawn("./production-start.sh", [], { cwd: rootPath, detached: true, stdio: "ignore" }).unref();

        common.conLog("Update installed. Restart command executed for commit " + latestCommit, "gre");
    }
    finally {
        await fs.promises.rm(tempDir, { recursive: true, force: true });
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
    data.latestCommit       = appConfig.CONF_settings.codeLastCommit;

    try {
        const responseFetch    = await fetch("https://api.github.com/repos/" + appConfig.CONF_repositoryURL);
        const dataFetch        = await responseFetch.json();
        const latestCommitHash = dataFetch.sha || null;

        if (latestCommitHash && latestCommitHash !== appConfig.CONF_settings.codeLastCommit) {
            data.updateAvailable = true;
            data.latestCommit    = latestCommitHash;
        }
    }
    catch (error) {
        common.conLog("Error checking for updates: " + error.message, "red");
    }

    common.conLog("Update check response: " + JSON.stringify(data), "std", false);
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
 *                message:
 *                  type: string
 *                  example: "Update installation started"
 *      "400":
 *        description: Bad request, e.g. if no update is available.
 *       content:
 *        application/json:
 *         schema:
 *          type: object
 *         properties:
 *          status:
 *            type: string
 *            example: "error"
 *          message:
 *            type: string
 *            example: "No update available"
 */
router.post("/install", async function (request, response) {
    try {
        const updateInfo = {
            status: "ok",
            updateAvailable: false,
            latestCommit: appConfig.CONF_settings.codeLastCommit,
        };

        const responseFetch    = await fetch("https://api.github.com/repos/" + appConfig.CONF_repositoryURL);
        const dataFetch        = await responseFetch.json();
        const latestCommitHash = dataFetch.sha || null;

        if (latestCommitHash && latestCommitHash !== appConfig.CONF_settings.codeLastCommit) {
            updateInfo.updateAvailable = true;
            updateInfo.latestCommit    = latestCommitHash;
        }

        if (!updateInfo.updateAvailable) {
            return common.sendResponse(response, updateInfo, "Server route 'Update'", "POST request install update");
        }

        common.sendResponse(
            response,
            { status: "ok", message: "Update installation started", latestCommit: updateInfo.latestCommit },
            "Server route 'Update'",
            "POST request install update"
        );

        runDetachedUpdateAndRestart(updateInfo.latestCommit)
            .catch((error) => {
                common.conLog("Detached update failed: " + error.message, "red");
            });

        return;

    }
    catch (error) {
        common.conLog("Error installing update: " + error.message, "red");
        return common.sendResponse(response, { status: "error", message: "An error occurred while trying to install the update" }, "Server route 'Update'", "POST request install update");
    }
});

module.exports = router;