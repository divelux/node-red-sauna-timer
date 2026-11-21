// Builds sauna-timer-flow.json from the function code in src/. Run: node build.js
// (c) 2026 DIVELUX Inc. MIT License.
'use strict';
const fs = require('fs');
const path = require('path');
const src = (f) => fs.readFileSync(path.join(__dirname, 'src', f), 'utf8');

const TAB = 'd1a5e7c0b2f4a000';
const id = (n) => 'd1a5e7c0b2f4' + String(n).padStart(4, '0');

const fn = (n, name, file, x, y, wires) => ({
  id: id(n), type: 'function', z: TAB, name, func: src(file), outputs: 1, timeout: 0, noerr: 0,
  initialize: '', finalize: '', libs: [], x, y, wires
});
const inject = (n, name, payload, payloadType, x, y, wires, extra) => Object.assign({
  id: id(n), type: 'inject', z: TAB, name,
  props: [{ p: 'payload' }, { p: 'topic', vt: 'str' }],
  repeat: '', crontab: '', once: false, onceDelay: 0.1, topic: '', payload, payloadType, x, y, wires
}, extra || {});
const debug = (n, name, x, y) => ({
  id: id(n), type: 'debug', z: TAB, name, active: true, tosidebar: true, console: false, tostatus: true,
  complete: 'payload', targetType: 'msg', statusVal: 'payload', statusType: 'auto', x, y, wires: []
});
const comment = (n, name, info, x, y) => ({ id: id(n), type: 'comment', z: TAB, name, info, x, y, wires: [] });

const flow = [
  {
    id: TAB, type: 'tab', label: 'Sauna timer', disabled: false,
    info: 'Sauna round timer and a "sauna is ready" notification, core nodes only.\n\n' +
      'Made by DIVELUX, handmade wool sauna hats: https://diveluxsaunahat.com\n' +
      'More free sauna tools: https://diveluxsaunahat.com/pages/sauna-tools\n\n' +
      'MIT License, (c) 2026 DIVELUX Inc. Not medical advice: step out sooner if you feel dizzy, sick or faint.'
  },
  comment(1, 'Round timer: heat, break, repeat, final cool-down',
    'Press "Start" to run the session. "Round timer" sends one message at the start of each part.\n' +
    'Change rounds / heat / rest (minutes) in the Start inject. Replace the "Notify" debug node with your\n' +
    'notification node (Home Assistant, Telegram, Pushover, e-mail...). It gets msg.title and msg.payload as text.\n\n' +
    'The "Test run" inject sends msg.minuteMs = 1000, so a whole session takes seconds instead of an hour.', 200, 60),
  inject(2, 'Start: 3 x 10 min', '{"cmd":"start","rounds":3,"heat":10,"rest":10}', 'json', 150, 120, [[id(5)]]),
  inject(3, 'Stop', '{"cmd":"stop"}', 'json', 110, 160, [[id(5)]]),
  inject(4, 'Test run (1 min = 1 s)', '{"cmd":"start","rounds":2,"heat":3,"rest":2}', 'json', 160, 200, [[id(5)]],
    { props: [{ p: 'payload' }, { p: 'topic', vt: 'str' }, { p: 'minuteMs', v: '1000', vt: 'num' }] }),
  fn(5, 'Round timer', 'round-timer.js', 390, 160, [[id(6)]]),
  fn(6, 'Phase message', 'phase-message.js', 580, 160, [[id(7)]]),
  debug(7, 'Notify: phase', 780, 160),

  comment(8, 'Sauna is ready: one notification when the room reaches the target',
    'Wire your temperature reading into "Sauna is ready?" (a Home Assistant state node, an MQTT in node...).\n' +
    'msg.payload must be the number, in the same unit as the target. Set the target and unit in "Set target".\n' +
    'It notifies once, then re-arms after the room cools 5 degrees below the target.', 240, 280),
  inject(9, 'On deploy', '', 'date', 120, 340, [[id(10)]], { once: true, onceDelay: 0.5, props: [{ p: 'payload' }] }),
  {
    id: id(10), type: 'change', z: TAB, name: 'Set target: 80 °C',
    rules: [
      { t: 'set', p: 'saunaTarget', pt: 'flow', to: '80', tot: 'num' },
      { t: 'set', p: 'saunaUnit', pt: 'flow', to: '°C', tot: 'str' }
    ],
    action: '', property: '', from: '', to: '', reg: false, x: 310, y: 340, wires: [[]]
  },
  inject(11, 'Test reading: 72', '72', 'num', 140, 400, [[id(13)]]),
  inject(12, 'Test reading: 81', '81', 'num', 140, 440, [[id(13)]]),
  fn(13, 'Sauna is ready?', 'ready-check.js', 370, 420, [[id(14)]]),
  debug(14, 'Notify: ready', 570, 420)
];

fs.writeFileSync(path.join(__dirname, 'sauna-timer-flow.json'), JSON.stringify(flow, null, 2) + '\n');
console.log('wrote sauna-timer-flow.json, ' + flow.length + ' nodes');
