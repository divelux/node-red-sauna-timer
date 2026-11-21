// "The sauna is ready" check. (c) 2026 DIVELUX Inc. MIT License.
// In:  msg.payload = a temperature reading (number or numeric string), in the same unit as the target.
// Out: one message when the reading first reaches the target. It re-arms only after the
//      room has cooled 5 degrees below the target, so a reading that wobbles around the
//      target does not send a stream of notifications.
// Target and unit come from flow context: saunaTarget (default 80) and saunaUnit (default "°C").
// Set them with the "Set target" change node.
const target = Number(flow.get('saunaTarget'));
const t = isFinite(target) && target > 0 ? target : 80;
const unit = flow.get('saunaUnit') || '°C';
const rearmBelow = t - 5;

const reading = typeof msg.payload === 'number' ? msg.payload : parseFloat(msg.payload);
if (!isFinite(reading)) {
    node.status({ fill: 'yellow', shape: 'ring', text: 'not a number: ' + String(msg.payload).slice(0, 20) });
    return null;
}

let armed = context.get('armed');
if (armed === undefined) armed = true;

if (armed && reading >= t) {
    context.set('armed', false);
    node.status({ fill: 'green', shape: 'dot', text: 'ready ' + reading + ' ' + unit });
    msg.topic = 'sauna/ready';
    msg.title = 'Sauna is ready';
    msg.payload = 'Sauna is ready: ' + Math.round(reading) + ' ' + unit + ' (target ' + t + ' ' + unit + ').';
    return msg;
}
if (!armed && reading < rearmBelow) {
    context.set('armed', true);
}
node.status({ fill: armed ? 'red' : 'green', shape: armed ? 'ring' : 'dot', text: reading + ' ' + unit + (armed ? ' heating' : ' ready') });
return null;
