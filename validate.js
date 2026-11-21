// Checks sauna-timer-flow.json without Node-RED. Run: node validate.js
// 1. Structure of a Node-RED flow export: one tab, unique ids, every node on the
//    tab, every wire points at a node that exists, wires match outputs, core nodes only.
// 2. Runs each function node's code in a sandbox shaped like the Node-RED function
//    node (msg, node, context, flow, global, env, setTimeout with fake timers).
// (c) 2026 DIVELUX Inc. MIT License.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let checks = 0;
const fails = [];
const ok = (c, m) => { checks++; if (!c) fails.push(m); };

const flow = JSON.parse(fs.readFileSync(path.join(__dirname, 'sauna-timer-flow.json'), 'utf8'));
ok(Array.isArray(flow), 'export must be a JSON array');
const tabs = flow.filter((n) => n.type === 'tab');
ok(tabs.length === 1, 'exactly one tab');
const tab = tabs[0];
const ids = new Map();
for (const n of flow) {
  ok(typeof n.id === 'string' && /^[0-9a-f]{16}$/.test(n.id), 'id format ' + n.id);
  ok(!ids.has(n.id), 'duplicate id ' + n.id);
  ids.set(n.id, n);
}
const CORE = new Set(['tab', 'inject', 'function', 'debug', 'change', 'switch', 'delay', 'trigger', 'comment']);
const OUTPUTS = { inject: 1, change: 1, switch: null, delay: 1, trigger: 1, debug: 0, comment: 0 };
for (const n of flow) {
  if (n.type === 'tab') continue;
  ok(CORE.has(n.type), n.id + ': not a core node: ' + n.type);
  ok(n.z === tab.id, n.id + ': not on the tab');
  ok(typeof n.x === 'number' && typeof n.y === 'number', n.id + ': missing x/y');
  ok(Array.isArray(n.wires), n.id + ': wires must be an array');
  const want = n.type === 'function' ? n.outputs : OUTPUTS[n.type];
  if (want != null) ok(n.wires.length === want, n.id + ' (' + n.type + '): ' + n.wires.length + ' output ports, expected ' + want);
  for (const port of n.wires) {
    ok(Array.isArray(port), n.id + ': each port is an array');
    for (const target of port) {
      ok(ids.has(target), n.id + ': wire to missing node ' + target);
      if (ids.has(target)) ok(!['inject', 'comment', 'tab'].includes(ids.get(target).type), n.id + ': wire into a node with no input: ' + target);
    }
  }
  if (n.type === 'inject') {
    ok(Array.isArray(n.props) && n.props.some((p) => p.p === 'payload'), n.id + ': inject props');
    if (n.payloadType === 'json') { try { JSON.parse(n.payload); } catch (e) { ok(false, n.id + ': inject payload is not JSON'); } }
  }
  if (n.type === 'function') {
    try { new Function('msg', 'node', 'context', 'flow', 'global', 'env', n.func); } catch (e) { ok(false, n.id + ': function does not compile: ' + e.message); }
  }
  if (n.type === 'change') for (const r of n.rules) ok(['set', 'change', 'delete', 'move'].includes(r.t) && r.p, n.id + ': change rule');
}
// Everything is reachable from an inject (no orphan processing nodes)
const reach = new Set();
const walk = (id) => { if (reach.has(id)) return; reach.add(id); for (const port of ids.get(id).wires || []) port.forEach(walk); };
flow.filter((n) => n.type === 'inject').forEach((n) => walk(n.id));
for (const n of flow) if (!['tab', 'comment'].includes(n.type)) ok(reach.has(n.id), 'unreachable node ' + n.name);
// No network or file access in the code
for (const n of flow.filter((x) => x.type === 'function')) ok(!/require\(|fetch\(|http|fs\./.test(n.func.replace(/https:\/\/diveluxsaunahat\.com/g, '')), n.name + ': unexpected I/O');

/* ---------- sandbox like the Node-RED function node ---------- */
function makeNode(fnNode, clock) {
  const store = new Map(), flowStore = clock.flow;
  const sent = [], statuses = [], warnings = [];
  const ctx = { get: (k) => store.get(k), set: (k, v) => store.set(k, v), keys: () => [...store.keys()] };
  const flowCtx = { get: (k) => flowStore.get(k), set: (k, v) => flowStore.set(k, v), keys: () => [...flowStore.keys()] };
  const node = {
    id: fnNode.id, name: fnNode.name,
    send: (m) => { sent.push(m); }, status: (s) => statuses.push(s), warn: (w) => warnings.push(w),
    error: (e) => warnings.push('error: ' + e), log: () => {}, done: () => {}
  };
  const sandbox = {
    node, context: ctx, flow: flowCtx, global: ctx, env: { get: () => undefined }, console, Date: clock.Date, Math, JSON, Object, Number, String, parseFloat, isFinite, Array,
    setTimeout: (f, ms) => clock.setTimeout(f, ms), clearTimeout: (t) => clock.clearTimeout(t)
  };
  vm.createContext(sandbox);
  const run = vm.runInContext('(function (msg) {\n' + fnNode.func + '\n})', sandbox);
  return { input: (msg) => { const r = run(JSON.parse(JSON.stringify(msg))); if (r) sent.push(r); return r; }, sent, statuses, warnings, store };
}
function fakeClock() {
  let now = 1e12, seq = 0; const q = [];
  const D = function () { return new Date(now); }; D.now = () => now;
  return {
    flow: new Map(), Date: D,
    setTimeout(f, ms) { const t = { at: now + ms, f, id: ++seq }; q.push(t); return t; },
    clearTimeout(t) { const i = q.indexOf(t); if (i >= 0) q.splice(i, 1); },
    advance(ms) { const end = now + ms; for (;;) { q.sort((a, b) => a.at - b.at || a.id - b.id); const t = q[0]; if (!t || t.at > end) break; q.shift(); now = t.at; t.f(); } now = end; },
    pending: () => q.length
  };
}
const byName = (name) => flow.find((n) => n.name === name);

// Round timer: 2 rounds of 3 min, 2 min break, test speed 1 min = 1 s
{
  const clock = fakeClock();
  const timer = makeNode(byName('Round timer'), clock);
  const fmt = makeNode(byName('Phase message'), clock);
  const startInject = byName('Test run (1 min = 1 s)');
  timer.input({ payload: JSON.parse(startInject.payload), minuteMs: 1000 });
  ok(timer.sent.length === 1 && timer.sent[0].payload.kind === 'heat' && timer.sent[0].payload.label === 'Round 1 of 2', 'first part sent at once');
  clock.advance(2999);
  ok(timer.sent.length === 1, 'nothing before 3 s');
  clock.advance(1);
  ok(timer.sent.length === 2 && timer.sent[1].payload.kind === 'rest', 'break after 3 s');
  clock.advance(2000 + 3000 + 2000);
  const kinds = timer.sent.map((m) => m.payload.kind).join();
  ok(kinds === 'heat,rest,heat,cool,done', 'sequence ' + kinds);
  ok(clock.pending() === 0, 'no timers left after done');
  const texts = timer.sent.map((m) => fmt.input(Object.assign({}, m)).payload);
  ok(texts[0] === 'Sauna session started. Round 1 of 2: 3 min in the heat.', texts[0]);
  ok(texts[1] === 'Round 1 of 2 is over. Time to step out: 2 min break.', texts[1]);
  ok(texts[2] === 'Break over. Round 2 of 2: 3 min in the heat.', texts[2]);
  ok(texts[3] === 'Last round is over. Step out for the final cool-down: 2 min.', texts[3]);
  ok(texts[4] === 'Sauna session done. All 2 rounds and the final cool-down are over.', texts[4]);

  // Stop in the middle clears the timer; restart replaces the old session
  const t2 = makeNode(byName('Round timer'), clock);
  t2.input({ payload: { cmd: 'start', rounds: 3, heat: 10, rest: 10 } });
  clock.advance(5 * 60000);
  t2.input({ payload: { cmd: 'stop' } });
  ok(t2.sent.length === 2 && t2.sent[1].payload.kind === 'stopped' && clock.pending() === 0, 'stop clears the timer');
  clock.advance(3600000);
  ok(t2.sent.length === 2, 'nothing after stop');
  t2.input({ payload: { cmd: 'start', rounds: 1, heat: 5 } });
  t2.input({ payload: { cmd: 'start', rounds: 1, heat: 5 } });
  ok(clock.pending() === 1, 'restart keeps one timer');
  // Clamping and the default real-time minute
  const t3 = makeNode(byName('Round timer'), clock);
  t3.input({ payload: { cmd: 'start', rounds: 99, heat: 0, rest: 'x' } });
  const first = t3.sent[0].payload;
  ok(first.rounds === 6 && first.minutes === 1 && first.parts === 12, 'clamped ' + JSON.stringify(first));
  clock.advance(59999); ok(t3.sent.length === 1, '1 minute is 60000 ms by default');
  clock.advance(1); ok(t3.sent.length === 2 && t3.sent[1].payload.minutes === 10, 'break defaults to 10');
  const t4 = makeNode(byName('Round timer'), clock);
  t4.input({ payload: 'hello' });
  ok(t4.sent.length === 0 && t4.warnings.length === 1, 'unknown command warns');
  ok(makeNode(byName('Phase message'), clock).input({ payload: { kind: 'other' } }) == null, 'unknown phase dropped');
}

// Ready check with the change node's flow values
{
  const clock = fakeClock();
  const change = byName('Set target: 80 °C');
  for (const r of change.rules) clock.flow.set(r.p, r.tot === 'num' ? Number(r.to) : r.to);
  const ready = makeNode(byName('Sauna is ready?'), clock);
  const out = (v) => { const r = ready.input({ payload: v }); return r ? r.payload : null; };
  ok(out(72) === null, '72 is not ready');
  ok(out(80) === 'Sauna is ready: 80 °C (target 80 °C).', 'ready at target');
  ok(out(83) === null && out(78) === null, 'no repeat while near the target');
  ok(out(74.9) === null && out('81.2') === 'Sauna is ready: 81 °C (target 80 °C).', 're-arms below target - 5, accepts strings');
  ok(out('abc') === null && out(null) === null, 'junk ignored');
  clock.flow.set('saunaTarget', 176); clock.flow.set('saunaUnit', '°F');
  const r2 = makeNode(byName('Sauna is ready?'), clock);
  ok(r2.input({ payload: 180 }).payload === 'Sauna is ready: 180 °F (target 176 °F).', 'Fahrenheit target');
  const r3 = makeNode(byName('Sauna is ready?'), fakeClock());
  ok(r3.input({ payload: 80 }) && r3.input({ payload: 80 }) === null, 'default target 80 without the change node');
  // The test injects reach the ready node
  ok(byName('Test reading: 81').wires[0][0] === byName('Sauna is ready?').id, 'test inject wired');
}

if (fails.length) { console.log('FAIL\n - ' + fails.join('\n - ')); process.exit(1); }
console.log(checks + ' checks passed: ' + flow.length + ' nodes, ' + flow.filter((n) => n.type === 'function').length + ' function nodes run in a sandbox');
