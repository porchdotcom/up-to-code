import assert from 'assert';
import { omit } from 'lodash';
import newrelic from 'newrelic';

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
        newrelic.noticeError(err, logger.fields);
        throw err;
    });
};
