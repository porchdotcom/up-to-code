import assert from 'assert';
import parseArgs from 'minimist';
import uptocode from '../src';
import debug from 'debug';

const log = debug('porch:uptocode');

const {
    'package-name': packageName,
    'github-org': githubOrg,
    'github-token': githubToken,
    'gitlab-org': gitlabOrg,
    'gitlab-user': gitlabUser,
    'gitlab-token': gitlabToken,
    'gitlab-host': gitlabHost
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
    gitlabUser
}).then(() => {
    log('success');
    process.exit(0);
}).catch(err => {
    log(`err ${err.stack}`);
    process.exit(1);
});
