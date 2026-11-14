// Loaded first by main.ts. On older Node versions the built-in SQLite module
// prints an "experimental" warning each start; hide that one line and pass
// every other warning through untouched.
const printers = process.listeners('warning');
process.removeAllListeners('warning');
process.on('warning', (warning) => {
  if (warning.name === 'ExperimentalWarning' && warning.message.includes('SQLite')) return;
  for (const print of printers) print.call(process, warning);
});
