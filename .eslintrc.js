module.exports = {
  extends: "eslint:recommended",
  parserOptions: {
    ecmaVersion: 8,
    sourceType: "module",
    ecmaFeatures: {
      modules: true,
      es6: true
    },
    env: {
      browser: true
    }
  }
};