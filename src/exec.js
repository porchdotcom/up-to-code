import Q from 'q';
import childProcess from 'child_process';

export default (cmd, { logger, ...options } = {}) => {
    const defer = Q.defer();
    logger.trace(`exec ${cmd}`);
    childProcess.exec(cmd, {
        ...options
    }, defer.makeNodeResolver());
    return defer.promise.spread((stdout, stderr) => {
        logger.trace({ stdout, stderr });
        return stdout;
    });
};
