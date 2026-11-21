// Phase to notification text. (c) 2026 DIVELUX Inc. MIT License.
// In:  msg.payload from "Round timer".  Out: msg.title and msg.payload as plain text.
const ph = msg.payload || {};
let title, text;
switch (ph.kind) {
    case 'heat':
        title = ph.round === 1 ? 'Sauna session started' : 'Break over';
        text = ph.label + ': ' + ph.minutes + ' min in the heat.';
        break;
    case 'rest':
        title = 'Round ' + ph.round + ' of ' + ph.rounds + ' is over';
        text = 'Time to step out: ' + ph.minutes + ' min break.';
        break;
    case 'cool':
        title = 'Last round is over';
        text = 'Step out for the final cool-down: ' + ph.minutes + ' min.';
        break;
    case 'done':
        title = 'Sauna session done';
        text = 'All ' + ph.rounds + ' rounds and the final cool-down are over.';
        break;
    case 'stopped':
        title = 'Sauna timer stopped';
        text = 'The session was stopped.';
        break;
    default:
        return null;
}
msg.title = title;
msg.payload = title + '. ' + text;
return msg;
