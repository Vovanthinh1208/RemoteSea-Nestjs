const { jest: base } = require("./package.json");
module.exports = {
  ...base,
  rootDir: ".",
  testRegex: "test/sprint4\\.integration\\.test\\.ts$",
  moduleNameMapper: { "^@/(.*)$": "<rootDir>/src/$1" },
  testTimeout: 60000,
};
