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
export default fn => ({ logger, ...rest }) => {
    assert(logger, 'function expected logger argument');
    return fn({ logger: logger.child(omit(rest, blacklist)), ...rest }).catch(err => {
        logger.error({ err });
        throw err;
    });
};
