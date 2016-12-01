import bunyan from 'bunyan';
import PrettyStream from 'bunyan-prettystream';
import { isString, truncate } from 'lodash';

const prettyStdOut = new PrettyStream();
prettyStdOut.pipe(process.stdout);

export default bunyan.createLogger({
    name: 'up-to-code',
    streams: [{
        level: 'trace',
        type: 'raw',
        stream: prettyStdOut
    }],
    src: true,
    serializers: {
        ...bunyan.stdSerializers,
        body: body => isString(body) ? truncate(body) : body
    }
});
