import bunyan from 'bunyan';
import PrettyStream from 'bunyan-prettystream';
import NewRelicStream from './bunyan-newrelic-stream';
import { isString, isPlainObject, truncate } from 'lodash';

const prettyStdOut = new PrettyStream();
prettyStdOut.pipe(process.stdout);

export default bunyan.createLogger({
    name: 'up-to-code',
    streams: [{
        level: 'trace',
        type: 'raw',
        stream: prettyStdOut
    }, {
        level: 'error',
        type: 'raw',
        stream: new NewRelicStream()
    }],
    src: true,
    serializers: {
        ...bunyan.stdSerializers,
        body: body => {
            if (isString(body)) {
                return truncate(body);
            } else if (isPlainObject(body)) {
                return JSON.parse(JSON.stringify(body, (k, v) => isString(v) ? truncate(v) : v));
            }
            return body;
        }
    }
});
