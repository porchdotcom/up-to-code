import Q from 'q';
import parseArgs from 'minimist';
import path from 'path';
import GitHub from './github';
import GitLab from './gitlab';
import debug from 'debug';
import assert from 'assert';
import semverRegex from 'semver-regex';
import exec from './exec';

const log = debug('porch:goldcatcher');

const {
    'package-name': packageName,
    'github-org': githubOrg,
    'github-token': githubToken,
    'gitlab-org': gitlabOrg,
    'gitlab-token': gitlabToken,
    'gitlab-host': gitlabHost
} = parseArgs(process.argv.slice(2));

assert(packageName, 'npm module required');
assert(githubOrg, 'github organization required');
assert(githubToken, 'github token required');
assert(gitlabOrg, 'gitlab organization required');
assert(gitlabToken, 'gitlab authentication token required');
assert(gitlabHost, 'gitlab host required');

log(`goldcatcher ${packageName}`);

const github = new GitHub({ org: githubOrg, token: githubToken });
const gitlab = new GitLab({ org: gitlabOrg, token: gitlabToken, host: gitlabHost });

Q.fcall(() => Q.all([
    github.fetchDependantRepos({ packageName }),
    github.isRepo({ repo: packageName }),
    gitlab.isRepo({ repo: packageName })
])).spread((repos, isGithubHosted, isGitlabHosted) => {
    assert(isGithubHosted || isGitlabHosted, 'git repo not found');
    assert(!!isGithubHosted ^ !!isGitlabHosted, 'multiple git repos found');

    Q.all(repos.map(({ name }) => {
        log(`time to clone and update repo ${name}`);
        const branch = `goldcatcher-${packageName}`;
        const cwd = `repos/${name}`;
        const ncu = path.resolve(__dirname, '../node_modules/.bin/ncu');
        return Q.fcall(() => (
            exec(`git clone --depth 1 https://${githubToken}@github.com/${githubOrg}/${name}.git repos/${name}`)
        )).then(() => (
            exec(`git checkout -B ${branch}`, { cwd })
        )).then(() => (
            exec(`${ncu} -a --packageFile package.json ${packageName}`, { cwd })
        )).then(stdout => {
            const versions = stdout.match(semverRegex());
            assert(versions, `invalid npm-check-updates output ${stdout}`);

            if (isGithubHosted) {
                return github.createPackageChangeMarkdown({
                    repo: packageName,
                    base: `v${versions[0]}`,
                    head: `v${versions[1]}`
                });
            }
            if (isGitlabHosted) {
                return gitlab.createPackageChangeMarkdown({
                    repo: packageName,
                    base: `v${versions[0]}`,
                    head: `v${versions[1]}`
                });
            }

            // redundant...should be caught above
            throw new Error('git repo not found');
        }).then(body => (
            Q.fcall(() => (
                exec(`git commit -a -m "Goldcatcher bump of ${packageName}"`, { cwd })
            )).then(() => (
                exec('git push -fu origin HEAD', { cwd })
            )).then(() => (
                github.createPullRequest({
                    body,
                    title: `Goldcatcher - ${packageName}`,
                    head: branch,
                    repo: name
                })
            ))
        )).catch(err => (
            log(`err ${name} ${err.message} ${err.stack}`)
        )).finally(() => (
            exec(`rm -rf ${path.resolve(__dirname, cwd)}`)
        ));
    }))
}).then(() => (
    log('success')
)).catch(err => (
    log(`err ${err.stack}`)
));
