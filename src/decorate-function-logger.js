import assert from 'assert';
import { omit } from 'lodash';
import cleanStack from 'clean-stack';

const blacklist = [
    'githubOrg',
    'githubToken',
    'gitlabOrg',
    'gitlabToken',
    'gitlabHost',
    'gitlabUser'
];
export default fn => ({ logger, ...rest }) => {
    assert(logger, 'function expected logger argument');
    return fn({ logger: logger.child(omit(rest, blacklist)), ...rest }).catch(err => {
        err.stack = cleanStack(err.stack);
        logger.error({ err });
        throw err;
    });
};
