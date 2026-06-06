/**
 * =============================================================================================
 * CredentialEngine
 * ================
 * Centralised persistence helper for external provider integration state.
 * Uses the global `database` (better-sqlite3) set up by server/app.js.
 *
 * Tables used:
 *   integrations_accounts  — one row per provider account with encrypted-at-rest tokens
 *   integrations_cursors   — one row per account (UPSERT), tracks the sync bookmark
 *   integrations_dedupe    — one row per (accountID, key), prevents duplicate event emission
 *   integrations_sync_runs — audit log of every sync cycle attempt
 *
 * Encryption note:
 *   Access tokens and refresh tokens are stored AES-256-GCM encrypted.
 *   The encryption key is derived from CONF_credentialEngineSecret in .env.local.
 *   If the secret is not configured the engine falls back to plain text with a warning
 *   (this matches development usage patterns in the rest of the project).
 */

const crypto = require("crypto");

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // bytes for GCM

/**
 * Derives a 32-byte key from the configured secret via SHA-256.
 * Returns null if no secret is configured (plain-text fallback).
 */
function getEncryptionKey() {
  const secret = process.env.CONF_credentialEngineSecret;
  if (!secret)
  {
    return null;
  }
  return crypto.createHash("sha256").update(secret).digest(); // 32 bytes
}

/**
 * Encrypts a string value using AES-256-GCM.
 * Returns the ciphertext as "iv:authTag:ciphertext" (all hex-encoded).
 * Falls back to plain text if no key is configured.
 * @param {string} plaintext
 * @returns {string}
 */
function encrypt(plaintext) {
  const key = getEncryptionKey();

  if (!key)
  {
    return plaintext; // plain-text fallback (dev mode)
  }

  const iv         = crypto.randomBytes(IV_LENGTH);
  const cipher     = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted  = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag    = cipher.getAuthTag();

  return iv.toString("hex") + ":" + authTag.toString("hex") + ":" + encrypted.toString("hex");
}

/**
 * Decrypts a value encrypted by encrypt().
 * Returns the original plaintext.
 * Falls back to returning the value as-is if no key is configured.
 * @param {string} value
 * @returns {string}
 */
function decrypt(value) {
  const key = getEncryptionKey();
  if (!key)
  {
    return value; // plain-text fallback (dev mode)
  }

  const parts = value.split(":");
  if (parts.length !== 3) // Treat as plain text if not in expected encrypted format (e.g. legacy rows)
  {
    return value;
  }

  const iv         = Buffer.from(parts[0], "hex");
  const authTag    = Buffer.from(parts[1], "hex");
  const ciphertext = Buffer.from(parts[2], "hex");

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return decrypted.toString("utf8");
}

/**
 * Returns all enabled integration accounts from the database.
 * Tokens are decrypted before being returned to the caller.
 * @returns {Object[]} Array of account objects.
 */
function listAccounts() {
  const db          = global.database;
  const accountRows = db.prepare("SELECT * FROM integrations_accounts WHERE enabled = 1").all();

  return accountRows.map(function (account) {
    return {
      accountID:    account.accountID,
      provider:     account.provider,
      enabled:      account.enabled === 1,
      accessToken:  account.accessToken  ? decrypt(account.accessToken)  : null,
      refreshToken: account.refreshToken ? decrypt(account.refreshToken) : null,
      expiresAt:    account.expiresAt    || null,
      metadata:     account.metadata     ? JSON.parse(account.metadata)  : {},
    };
  });
}

/**
 * Persists a refreshed access token (and optional expiry) for an account.
 * The token is encrypted before storage.
 * @param {string}      accountID
 * @param {string}      accessToken
 * @param {string|null} expiresAt  - ISO timestamp or null.
 */
function setToken(accountID, accessToken, expiresAt) {
  const db            = global.database;
  const encryptedToken = encrypt(accessToken);

  db.prepare("UPDATE integrations_accounts SET accessToken = ?, expiresAt = ? WHERE accountID = ?").run(encryptedToken, expiresAt || null, accountID);
}

/**
 * Returns the current cursor for an account, or null if none exists.
 * @param {string} accountID
 * @returns {string|null}
 */
function getCursor(accountID) {
  const db  = global.database;
  const row = db.prepare("SELECT cursor FROM integrations_cursors WHERE accountID = ?").get(accountID);
  return row ? row.cursor : null;
}

/**
 * Upserts the cursor for an account.
 * @param {string} accountID
 * @param {string} cursor
 */
function setCursor(accountID, cursor) {
  const db = global.database;
  db.prepare("INSERT INTO integrations_cursors (accountID, cursor, dateTimeUpdated) VALUES (?, ?, datetime('now', 'localtime')) ON CONFLICT(accountID) DO UPDATE SET cursor = excluded.cursor, dateTimeUpdated = excluded.dateTimeUpdated").run(accountID, cursor);
}

/**
 * Checks whether a dedupe key already exists for an account.
 * @param {string} accountID
 * @param {string} key
 * @returns {boolean}
 */
function dedupeCheck(accountID, key) {
  const db  = global.database;
  const row = db.prepare("SELECT 1 FROM integrations_dedupe WHERE accountID = ? AND key = ? LIMIT 1").get(accountID, key);
  return !!row;
}

/**
 * Inserts a dedupe key for an account.
 * Silently ignores duplicate inserts (UNIQUE constraint).
 * @param {string} accountID
 * @param {string} key
 */
function dedupeAdd(accountID, key) {
  const db = global.database;
  db.prepare("INSERT OR IGNORE INTO integrations_dedupe (accountID, key) VALUES (?, ?)").run(accountID, key);
}

/**
 * Records the start of a sync run and returns the new syncRunID.
 * @param {string} accountID
 * @returns {number} syncRunID (SQLite AUTOINCREMENT rowid)
 */
function syncRunStart(accountID) {
  const db     = global.database;
  const result = db.prepare("INSERT INTO integrations_sync_runs (accountID, startedAt) VALUES (?, datetime('now', 'localtime'))").run(accountID);
  return result.lastInsertRowid;
}

/**
 * Marks a sync run as finished with success or error.
 * @param {number}      syncRunID
 * @param {string|null} error - Error message or null for success.
 */
function syncRunFinish(syncRunID, error) {
  const db = global.database;
  db.prepare("UPDATE integrations_sync_runs SET finishedAt = datetime('now', 'localtime'), success = ?, error= ? WHERE syncRunID = ?").run(error ? 0 : 1, error || null, syncRunID);  // success = 0 if error, 1 if success
}

module.exports = { listAccounts, setToken, getCursor, setCursor, dedupeCheck, dedupeAdd, syncRunStart, syncRunFinish};
