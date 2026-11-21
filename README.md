# Sauna timer for Node-RED

A Node-RED flow with two jobs:

1. **Round timer.** Heat, break, heat … final cool-down. One message at the start of each part ("Round 1 of 3 is over. Time to step out: 10 min break."), ready for any notification node.
2. **Sauna is ready.** Feed it the sauna temperature; it sends **one** notification when the room reaches your target, and re-arms only after the room has cooled 5 degrees below it, so a reading that wobbles around the target does not spam you.

Core nodes only (inject, function, change, debug, comment). No extra palettes, no network calls.

Made by [DIVELUX](https://diveluxsaunahat.com), a small family brand in Irvine, California that makes handmade wool sauna hats. More free tools: <https://diveluxsaunahat.com/pages/sauna-tools>

> **Not medical advice.** The timer limits (1–6 rounds, 1–35 minutes per round, 1–30 minutes of break) are bounds for a timer, not recommendations. Step out sooner if you feel dizzy, sick or faint. The ready notification is a convenience; your heater's own thermostat and safety cut-out stay in charge.

## Import

1. Open `sauna-timer-flow.json` and copy all of it.
2. In Node-RED: menu (☰) → **Import** → paste → **Import**. A new tab "Sauna timer" appears.
3. **Deploy.**

Try it: press the button on **"Test run (1 min = 1 s)"**. A two-round session plays out in about 12 seconds in the Debug sidebar. Press **"Test reading: 72"** and **"Test reading: 81"** to see the ready check.

## Make it yours

| Node | Change |
| --- | --- |
| **Start: 3 x 10 min** | Edit the JSON: `{"cmd":"start","rounds":3,"heat":10,"rest":10}`. Add `"cooldown": 15` for a longer final cool-down (default: same as `rest`) |
| **Stop** | Sends `{"cmd":"stop"}` |
| **Set target: 80 °C** | The ready temperature and its unit (`flow.saunaTarget`, `flow.saunaUnit`). For Fahrenheit: 176 and `°F`. Your sensor must report in the same unit |
| **Test reading** injects | Replace with your temperature source: a Home Assistant "events: state" node, an MQTT in node, a Zigbee2MQTT node. `msg.payload` must be the number |
| **Notify** debug nodes | Replace with your notifier: Home Assistant "action" (notify.mobile_app_…), Telegram, Pushover, e-mail. Each message has `msg.title` and a plain-text `msg.payload` |

You can also start the timer from anything else (a dashboard button, a Home Assistant event, an HTTP endpoint) by sending `msg.payload = {"cmd":"start", ...}` into **Round timer**.

### Messages out of "Round timer"

`msg.topic = "sauna/phase"`, `msg.payload = { kind, round, rounds, minutes, index, parts, label }`, where `kind` is `heat`, `rest`, `cool`, `done` or `stopped`. "Phase message" turns that into `msg.title` and a sentence.

### How the timer keeps time

Each part schedules the next with `setTimeout` inside the function node; the node's status shows the current part. Node-RED clears these timers when you redeploy or stop the flow, so a redeploy ends a running session. The timer handle lives in the node's context, so keep the default in-memory context store for this node.

## Files

| File | What it is |
| --- | --- |
| `sauna-timer-flow.json` | The flow to import |
| `src/*.js` | The code of the three function nodes, readable |
| `build.js` | Writes the flow JSON from `src/` (`node build.js`) |
| `validate.js` | Checks without Node-RED (`node validate.js`) |

## Checks

`node validate.js` checks that the file is a valid flow export: a JSON array with one tab, unique 16-character ids, every node on that tab, every wire pointing at a node that exists and has an input, wire ports matching each node's outputs, JSON payloads that parse, only core node types, no orphan nodes. Then it runs the code of each function node in a sandbox shaped like the Node-RED function node (`msg`, `node.send`, `node.status`, `context`, `flow`, fake `setTimeout`) and checks the full timer sequence, the default 60-second minute, stop and restart, clamping, the notification texts, and the ready check with its re-arm rule in °C and °F. Last run: 179 checks passed.

**Not yet run inside a live Node-RED.** The node fields follow current Node-RED exports (function nodes with `initialize`, `finalize` and `libs`, so Node-RED 3.0 or newer). Please open an issue if the import complains.

## License

MIT, © 2026 DIVELUX Inc.
