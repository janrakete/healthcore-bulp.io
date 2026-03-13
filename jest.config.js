module.exports = {
  testEnvironment: "node",
  testTimeout: 30000,
  moduleDirectories: ["node_modules", "<rootDir>"],
  projects: [
    {
      displayName: "all",
      testMatch: ["<rootDir>/tests/**/*.test.js"],
      testEnvironment: "node",
      moduleDirectories: ["node_modules", "<rootDir>"],
    }
  ],
};
