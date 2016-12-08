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
    const logger = parentLogger.child(omit(rest, blacklist));
    return fn({ logger, ...rest }).catch(err => {
        logger.error({ err });
        throw err;
    });
};
