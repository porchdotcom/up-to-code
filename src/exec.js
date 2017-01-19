import Q from 'q';
import childProcess from 'child_process';
import VError from 'verror';

export default (cmd, { logger, ...options } = {}) => {
    const defer = Q.defer();
    logger.trace(`exec ${cmd}`);
    childProcess.exec(cmd, {
        ...options
    }, (err, stdout, stderr) => {
        logger.trace({ stdout, stderr });

        if (err) {
            defer.reject(new VError({
                cause: err,
                info: {
                    stdout,
                    stderr
                }
            }));
        } else {
            defer.resolve(stdout);
        }
    });
    return defer.promise;
};
