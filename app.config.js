// Optional per-environment overrides. Defaults remain the local laptop setup.
module.exports = ({ config }) => ({
  ...config,
  extra: {
    ...config.extra,
    apiHost: process.env.EXPO_PUBLIC_API_HOST?.trim() || config.extra.apiHost,
    corridorKey: process.env.EXPO_PUBLIC_CORRIDOR_KEY?.trim() || config.extra.corridorKey,
  },
});
