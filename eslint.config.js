// Flat config, which is the only format eslint 9+ reads. The `lint` script
// previously passed `--ext`, a flag that no longer exists, against an eslint
// that was never installed — so `npm run lint` had never run in this project.
const expoConfig = require('eslint-config-expo/flat');

module.exports = [
  ...expoConfig,
  {
    ignores: ['node_modules/**', '.expo/**', 'dist/**', 'web-build/**', 'ios/**', 'android/**'],
  },
];
