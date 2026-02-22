/**
 * Unit Tests: SQL Validation
 * ===========================
 * Tests the sqlCheckValidName regex that prevents SQL injection in table/column names.
 * Since the function is not exported, we test the regex directly.
 */

// The regex used in server/routes/data.js
const SQL_NAME_REGEX = /^[a-zA-Z0-9_]+$/;

function sqlCheckValidName(name) {
  return typeof name === "string" && SQL_NAME_REGEX.test(name);
}

describe("sqlCheckValidName", () => {
  // --- Valid names ---
  test("should accept simple table name", () => {
    expect(sqlCheckValidName("devices")).toBe(true);
  });

  test("should accept name with underscores", () => {
    expect(sqlCheckValidName("push_tokens")).toBe(true);
  });

  test("should accept name with numbers", () => {
    expect(sqlCheckValidName("table123")).toBe(true);
  });

  test("should accept single character", () => {
    expect(sqlCheckValidName("a")).toBe(true);
  });

  test("should accept all allowed table names from config", () => {
    const allowed = ["individuals", "rooms", "users", "sos", "settings", "push_tokens", "notifications"];
    allowed.forEach(name => {
      expect(sqlCheckValidName(name)).toBe(true);
    });
  });

  // --- Invalid names (SQL injection attempts) ---
  test("should reject name with semicolon", () => {
    expect(sqlCheckValidName("devices;")).toBe(false);
  });

  test("should reject SQL injection: DROP TABLE", () => {
    expect(sqlCheckValidName("'; DROP TABLE devices--")).toBe(false);
  });

  test("should reject name with spaces", () => {
    expect(sqlCheckValidName("my table")).toBe(false);
  });

  test("should reject name with single quotes", () => {
    expect(sqlCheckValidName("table'name")).toBe(false);
  });

  test("should reject name with double quotes", () => {
    expect(sqlCheckValidName('table"name')).toBe(false);
  });

  test("should reject name with dash", () => {
    expect(sqlCheckValidName("table-name")).toBe(false);
  });

  test("should reject name with dot", () => {
    expect(sqlCheckValidName("table.name")).toBe(false);
  });

  test("should reject name with parentheses", () => {
    expect(sqlCheckValidName("table()")).toBe(false);
  });

  test("should reject name with equals sign", () => {
    expect(sqlCheckValidName("x=1")).toBe(false);
  });

  test("should reject name with backslash", () => {
    expect(sqlCheckValidName("table\\name")).toBe(false);
  });

  test("should reject empty string", () => {
    expect(sqlCheckValidName("")).toBe(false);
  });

  test("should reject null", () => {
    expect(sqlCheckValidName(null)).toBe(false);
  });

  test("should reject undefined", () => {
    expect(sqlCheckValidName(undefined)).toBe(false);
  });

  test("should reject number type", () => {
    expect(sqlCheckValidName(123)).toBe(false);
  });

  test("should reject boolean type", () => {
    expect(sqlCheckValidName(true)).toBe(false);
  });

  test("should reject object type", () => {
    expect(sqlCheckValidName({})).toBe(false);
  });

  test("should reject UNION SELECT injection", () => {
    expect(sqlCheckValidName("devices UNION SELECT * FROM users")).toBe(false);
  });

  test("should reject comment injection", () => {
    expect(sqlCheckValidName("devices--")).toBe(false);
  });

  test("should reject OR injection", () => {
    expect(sqlCheckValidName("1 OR 1=1")).toBe(false);
  });
});
