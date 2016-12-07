import newrelic from 'newrelic';
import { EventEmitter } from 'events';

export default class extends EventEmitter {
    write({ msg, ...options }) {
        newrelic.noticeError(new Error(msg), options);
    }
}
