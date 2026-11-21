// Sauna round timer. (c) 2026 DIVELUX Inc. MIT License. https://diveluxsaunahat.com
// In:  msg.payload = { cmd: "start", rounds, heat, rest, cooldown }  or  { cmd: "stop" }
// Out: one message at the start of each part, then one when the session is done:
//      msg.topic = "sauna/phase", msg.payload = { kind, round, rounds, minutes, index, parts, label }
// Rules are the same as the <sauna-timer> element: 1-6 rounds, 1-35 min per round,
// 1-30 min of break, a final cool-down that defaults to the break length.
// These are bounds for a timer, not advice. Not medical advice.
const p = (msg.payload && typeof msg.payload === 'object') ? msg.payload : { cmd: String(msg.payload || '') };
const cmd = String(p.cmd || '').toLowerCase();

function clamp(v, min, max, def) {
    const n = typeof v === 'number' ? v : parseFloat(v);
    if (!isFinite(n)) return def;
    return Math.min(max, Math.max(min, Math.round(n)));
}

function stop(reason) {
    const t = context.get('timer');
    if (t) clearTimeout(t);
    context.set('timer', null);
    context.set('session', null);
    node.status({ fill: 'grey', shape: 'ring', text: reason || 'stopped' });
}

if (cmd === 'stop') {
    const was = context.get('session');
    stop('stopped');
    if (!was) return null;
    return { topic: 'sauna/phase', payload: { kind: 'stopped', label: 'Session stopped' } };
}
if (cmd !== 'start') {
    node.warn('round timer: send { "cmd": "start" } or { "cmd": "stop" }');
    return null;
}

const rounds = clamp(p.rounds, 1, 6, 3);
const heat = clamp(p.heat, 1, 35, 10);
const rest = clamp(p.rest, 1, 30, 10);
const cooldown = clamp(p.cooldown, 1, 30, rest);
// One "minute" in ms. Leave it at 60000; a smaller number speeds the timer up for a test run.
const minuteMs = clamp(msg.minuteMs, 10, 60000, 60000);

const parts = [];
for (let i = 1; i <= rounds; i++) {
    parts.push({ kind: 'heat', round: i, minutes: heat, label: 'Round ' + i + ' of ' + rounds });
    if (i < rounds) parts.push({ kind: 'rest', round: i, minutes: rest, label: 'Break' });
}
parts.push({ kind: 'cool', round: rounds, minutes: cooldown, label: 'Final cool-down' });

stop('starting');
const id = Date.now();
context.set('session', id);

function run(index) {
    if (context.get('session') !== id) return; // stopped or restarted
    if (index >= parts.length) {
        context.set('timer', null);
        context.set('session', null);
        node.status({ fill: 'green', shape: 'dot', text: 'done' });
        node.send({ topic: 'sauna/phase', payload: { kind: 'done', round: rounds, rounds: rounds, minutes: 0, index: index, parts: parts.length, label: 'Session done' } });
        return;
    }
    const part = parts[index];
    node.status({ fill: part.kind === 'heat' ? 'red' : 'blue', shape: 'dot', text: part.label + ', ' + part.minutes + ' min' });
    node.send({ topic: 'sauna/phase', payload: Object.assign({ rounds: rounds, index: index, parts: parts.length }, part) });
    context.set('timer', setTimeout(function () { run(index + 1); }, part.minutes * minuteMs));
}
run(0);
return null;
