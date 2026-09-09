const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const source = fs.readFileSync('coi-serviceworker.js', 'utf8');
async function run({blocked = false, interact = false} = {}) {
  const events = {};
  const registrations = {};
  const notices = [];
  const storage = new Map();
  let reloads = 0, registered = 0;
  const document = {
    currentScript: {src: 'https://example.test/coi-serviceworker.js'},
    body: {prepend: node => notices.push(node)},
    getElementById: id => notices.find(node => node.id === id),
    createElement: () => ({setAttribute(){}}),
  };
  const window = {
    crossOriginIsolated: false, isSecureContext: true,
    location: {reload: () => reloads++},
    addEventListener: (name, handler) => {events[name] = handler;},
    sessionStorage: {
      getItem: key => storage.get(key) || null,
      setItem: (key, value) => {if(blocked) throw Error('Blocked');storage.set(key, value);},
      removeItem: key => storage.delete(key),
    },
  };
  const navigator = {serviceWorker: {register: async() => {
    registered++;
    return {active: false, addEventListener: (name, handler) => {registrations[name] = handler;}};
  }}};
  vm.runInNewContext(source, {window, navigator, document, console: {log(){},warn(){}}});
  await Promise.resolve();await Promise.resolve();
  if(interact) events.pointerdown();
  if(registrations.updatefound) {registrations.updatefound(); if(interact) registrations.updatefound();}
  return {reloads, registered, notices};
}
(async()=>{
  assert.equal((await run()).reloads, 1);
  const active = await run({interact:true});
  assert.equal(active.reloads, 0);assert.equal(active.notices.length,1);
  assert.match(active.notices[0].textContent,/연습을 마치고/);
  const blocked = await run({blocked:true});
  assert.equal(blocked.registered,0);assert.equal(blocked.reloads,0);
  console.log('PASS: initial isolation reload, no reload after interaction, deduplicated notice, blocked storage prevents reload loop');
})().catch(error=>{console.error(error);process.exitCode=1;});
