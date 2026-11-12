// Entry point for demo mode: fictional in-memory data, no Azure DevOps or PAT needed.
process.env.AZDO_DEMO = '1';
process.env.APP_LANG ??= 'en';
await import('./index.js');
