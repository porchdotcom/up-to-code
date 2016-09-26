import Q from 'q';
import parseArgs from 'minimist';
import path from 'path';
import GitHub from './github';
import GitLab from './gitlab';
import debug from 'debug';
import assert from 'assert';
import semverRegex from 'semver-regex';
import exec from './exec';
import url from 'url';

const log = debug('porch:goldcatcher');

const GITHUB_HOSTNAME = 'github.com';

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

log(`goldcatcher ${packageName}`);

const github = new GitHub({ org: githubOrg, token: githubToken });
const gitlab = new GitLab({ org: gitlabOrg, token: gitlabToken, host: gitlabHost });

const getPackageChangeMarkdown = ({ base, head }) => (
    Q.fcall(() => (
        exec(`npm view ${packageName} repository.url`)
    )).then(stdout => (
        url.parse(stdout).hostname
    )).then(hostname => {
        const isGithubHosted = hostname === GITHUB_HOSTNAME;
        const isGitlabHosted = hostname === gitlabHost;

        assert(isGithubHosted || isGitlabHosted, 'git repo not found');
        assert(!!isGithubHosted ^ !!isGitlabHosted, 'multiple git repos found');

        if (isGithubHosted) {
            return github.createPackageChangeMarkdown({ repo: packageName, base, head });
        }
        if (isGitlabHosted) {
            return gitlab.createPackageChangeMarkdown({ repo: packageName, base, head });
        }

        // redundant...should be caught above
        throw new Error('git repo not found');
    })
);

const branch = `goldcatcher-${packageName}`;

Q.all([
    Q.fcall(() => (
        github.fetchDependantRepos({ packageName })
    )).then(githubRepos => Q.allSettled(githubRepos.map(({ name }) => {
        log(`time to clone and update github repo ${name}`);
        const cwd = `repos/github/${name}`;
        const ncu = path.resolve(__dirname, '../node_modules/.bin/ncu');
        return Q.fcall(() => (
            exec(`git clone --depth 1 https://${githubToken}@github.com/${githubOrg}/${name}.git ${cwd}`)
        )).then(() => (
            exec(`git checkout -B ${branch}`, { cwd })
        )).then(() => (
            exec(`${ncu} -a --packageFile package.json ${packageName}`, { cwd })
        )).then(stdout => {
            const versions = stdout.match(semverRegex());
            assert(versions, `invalid npm-check-updates output ${stdout}`);

            return getPackageChangeMarkdown({
                packageName,
                base: `v${versions[0]}`,
                head: `v${versions[1]}`
            });
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
        ));
    }))),
    Q.fcall(() => (
        gitlab.fetchDependantRepos({ packageName })
    )).then(gitlabRepos => Q.allSettled(gitlabRepos.map(({ name }) => {
        log(`time to clone and update gitlab repo ${name}`);
        const cwd = `repos/gitlab/${name}`;
        const ncu = path.resolve(__dirname, '../node_modules/.bin/ncu');
        return Q.fcall(() => (
            exec(`git clone --depth 1 https://${gitlabUser}:${gitlabToken}@${gitlabHost}/${gitlabOrg}/${name}.git ${cwd}`)
        )).then(() => (
            exec(`git checkout -B ${branch}`, { cwd })
        )).then(() => (
            exec(`${ncu} -a --packageFile package.json ${packageName}`, { cwd })
        )).then(stdout => {
            const versions = stdout.match(semverRegex());
            assert(versions, `invalid npm-check-updates output ${stdout}`);

            return getPackageChangeMarkdown({
                repo: packageName,
                base: `v${versions[0]}`,
                head: `v${versions[1]}`
            });
        }).then(body => (
            Q.fcall(() => (
                exec(`git commit -a -m "Goldcatcher bump of ${packageName}"`, { cwd })
            )).then(() => (
                exec('git push -fu origin HEAD', { cwd })
            )).then(() => (
                gitlab.createMergeRequest({
                    body,
                    title: `Goldcatcher - ${packageName}`,
                    head: branch,
                    repo: name
                })
            ))
        ));
    })))
]).then(() => {
    log('success');
    process.exit(0);
}).catch(err => {
    log(`err ${err.stack}`);
    process.exit(1);
});
