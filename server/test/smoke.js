const { createGas } = require('../../tools/gas-emulator');
const g = createGas({ now: '2026-11-11T16:05:00+03:00' });
console.log('loaded; version', g.run('CONFIG.VERSION'));
console.log('setup:', JSON.stringify(g.call('setupSheets')).slice(0, 160));
console.log('ping:', JSON.stringify(g.api({ action: 'ping' })));
