'use strict';
/* Local dev/test server: serves server/Index.html and answers google.script.run calls with the REAL Code.gs
 * running inside tools/gas-emulator.js.   node tools/dev-server.js [port]   (PORT env also works) */
const http = require('http'), fs = require('fs'), path = require('path');
const { createGas } = require('./gas-emulator');

function start(opts) {
  opts = opts || {};
  const gas = createGas({ now: opts.now || '2026-11-12T16:05:00+03:00' });
  gas.call('setupSheets');
  const shim = `<script>
window.google={script:{run:new Proxy({},{get:(_,fn)=>{
  if(fn==='withSuccessHandler'||fn==='withFailureHandler')return;
  return undefined}})}};
(function(){
  function mk(ok,no){return new Proxy({},{get:(_,fn)=>{
    if(fn==='withSuccessHandler')return h=>mk(h,no);
    if(fn==='withFailureHandler')return h=>mk(ok,h);
    return (...args)=>fetch('/rpc',{method:'POST',body:JSON.stringify({fn,args})}).then(r=>r.json()).then(j=>{
      if(j.error){no&&no({message:j.error})}else{ok&&ok(j.result)}}).catch(e=>no&&no(e));}})}
  window.google={script:{run:mk(function(){},function(){})}};
})();
</script>`;
  const html = fs.readFileSync(path.join(__dirname, '..', 'server', 'Index.html'), 'utf8').replace('<head>', '<head>' + shim);
  const srv = http.createServer((req, res) => {
    if (req.method === 'POST' && req.url === '/rpc') {
      let b = ''; req.on('data', c => (b += c)); req.on('end', () => {
        let out;
        try { const q = JSON.parse(b); const v = gas.call(q.fn, ...(q.args || [])); out = { result: v === undefined ? null : JSON.parse(JSON.stringify(v)) }; }
        catch (e) { out = { error: e.message }; }
        res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(out));
      }); return;
    }
    if (req.url === '/__now' ) { res.end(String(gas.now())); return; }
    res.setHeader('content-type', 'text/html; charset=utf-8'); res.end(html);
  });
  return new Promise(ok => srv.listen(opts.port || 0, '127.0.0.1', () => ok({ gas, srv, url: 'http://127.0.0.1:' + srv.address().port })));
}
module.exports = { start };
if (require.main === module) start({ port: Number(process.env.PORT || process.argv[2] || 8787) }).then(s => console.log('dev server', s.url));
