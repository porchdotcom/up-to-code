import newrelic from 'newrelic';
import assert from 'assert';
import { omit } from 'lodash';

const blacklist = [
    'githubOrg',
    'githubToken',
    'gitlabOrg',
    'gitlabToken',
    'gitlabHost',
    'gitlabUser'
];
export default fn => ({ logger: parentLogger, ...rest }) => {
    assert(parentLogger, 'function expected logger argument');
    const params = omit(rest, blacklist);
    const logger = parentLogger.child(params);
    return fn({ logger, ...rest }).catch(err => {
        logger.warn({ err });
        throw err;
    });
};
