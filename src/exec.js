import Q from 'q';
import childProcess from 'child_process';
import debug from 'debug';
const log = debug('porch:uptocode:exec');

export default (cmd, options = {}) => {
    log(`EXEC: ${cmd}`);
    const defer = Q.defer();
    childProcess.exec(cmd, {
        ...options
    }, defer.makeNodeResolver());
    return defer.promise.spread((stdout, stderr) => {
        log(`stdout ${stdout}`);
        log(`stderr ${stderr}`);
        return stdout;
    }).catch(err => {
        log(`EXEC FAILURE: ${cmd} ${err.message} ${err.stack}`);
        throw err;
    });
};
