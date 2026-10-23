const { jest: base } = require("./package.json");
module.exports = {
  ...base,
  rootDir: ".",
  testRegex: "test/account-deletion\\.integration\\.test\\.ts$",
  moduleNameMapper: { "^@/(.*)$": "<rootDir>/src/$1" },
};
