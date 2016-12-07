import assert from 'assert';
import parseArgs from 'minimist';
import uptocode from '../src';
import logger from '../src/logger';

const {
    'package-name': packageName,
    'github-org': githubOrg,
    'github-token': githubToken,
    'gitlab-org': gitlabOrg,
    'gitlab-user': gitlabUser,
    'gitlab-token': gitlabToken,
    'gitlab-host': gitlabHost,
    metadata
} = parseArgs(process.argv.slice(2));

assert(packageName, 'npm module required');
assert(githubOrg, 'github organization required');
assert(githubToken, 'github token required');
assert(gitlabOrg, 'gitlab organization required');
assert(gitlabToken, 'gitlab authentication token required');
assert(gitlabHost, 'gitlab host required');
assert(gitlabUser, 'gitlab user required');

uptocode({
    packageName,
    githubOrg,
    githubToken,
    gitlabOrg,
    gitlabToken,
    gitlabHost,
    gitlabUser,
    metadata,
    logger
}).then(() => {
    logger.info('success');
    process.exit(0);
}).catch(err => {
    logger.info(`err ${err.stack}`);
    process.exit(1);
});
