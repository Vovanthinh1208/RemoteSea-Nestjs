const { jest: base } = require("./package.json");
module.exports = {
  ...base,
  rootDir: ".",
  testRegex: "test/sprint3\\.integration\\.test\\.ts$",
  moduleNameMapper: { "^@/(.*)$": "<rootDir>/src/$1" },
};
