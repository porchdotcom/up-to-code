import bunyan from 'bunyan';
import PrettyStream from 'bunyan-prettystream';
import NewRelicStream from 'bunyan-newrelic-stream';
import errorSerializer from 'bunyan-error-serializer';
import truncateSerializer from './bunyan-truncate-serializer';

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
        err: errorSerializer,
        body: truncateSerializer
    }
});
