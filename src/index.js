import Q from 'q';
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

const getPackageBranchName = packageName => `goldcatcher-${packageName}`;

const getPackageChangeMarkdown = ({ base, head, packageName, gitlabHost, githubOrg, githubToken, gitlabOrg, gitlabToken }) => (
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
            const github = new GitHub({ org: githubOrg, token: githubToken });
            return github.createPackageChangeMarkdown({ repo: packageName, base, head });
        }
        if (isGitlabHosted) {
            const gitlab = new GitLab({ org: gitlabOrg, token: gitlabToken, host: gitlabHost });
            return gitlab.createPackageChangeMarkdown({ repo: packageName, base, head });
        }

        // redundant...should be caught above
        throw new Error('git repo not found');
    })
);

const updateGithubRepoDependency = ({
    name,
    packageName,
    githubToken,
    githubOrg,
    gitlabHost,
    gitlabOrg,
    gitlabToken
}) => {
    log(`time to clone and update github repo ${name}`);
    const cwd = `repos/github/${name}`;
    const ncu = path.resolve(__dirname, '../node_modules/.bin/ncu');
    return Q.fcall(() => (
        exec(`git clone --depth 1 https://${githubToken}@github.com/${githubOrg}/${name}.git ${cwd}`)
    )).then(() => (
        exec(`git checkout -B ${getPackageBranchName(packageName)}`, { cwd })
    )).then(() => (
        exec(`${ncu} -a --packageFile package.json ${packageName}`, { cwd })
    )).then(stdout => {
        const versions = stdout.match(semverRegex());
        assert(versions, `invalid npm-check-updates output ${stdout}`);

        return getPackageChangeMarkdown({
            packageName,
            base: `v${versions[0]}`,
            head: `v${versions[1]}`,
            gitlabHost,
            githubOrg,
            githubToken,
            gitlabOrg,
            gitlabToken
        });
    }).then(body => (
        Q.fcall(() => (
            exec(`git commit -a -m "Goldcatcher bump of ${packageName}"`, { cwd })
        )).then(() => (
            exec('git push -fu origin HEAD', { cwd })
        )).then(() => {
            const github = new GitHub({ org: githubOrg, token: githubToken });
            return github.createPullRequest({
                body,
                title: `Goldcatcher - ${packageName}`,
                head: getPackageBranchName(packageName),
                repo: name
            });
        })
    ));
};

export const updateGitlabRepoDependency = ({
    name,
    packageName,
    githubToken,
    githubOrg,
    gitlabHost,
    gitlabOrg,
    gitlabToken,
    gitlabUser
}) => {
    log(`time to clone and update gitlab repo ${name}`);
    const cwd = `repos/gitlab/${name}`;
    const ncu = path.resolve(__dirname, '../node_modules/.bin/ncu');
    return Q.fcall(() => (
        exec(`git clone --depth 1 https://${gitlabUser}:${gitlabToken}@${gitlabHost}/${gitlabOrg}/${name}.git ${cwd}`)
    )).then(() => (
        exec(`git checkout -B ${getPackageBranchName(packageName)}`, { cwd })
    )).then(() => (
        // determine if this is an update within the existing semver, auto accept the merge request if it is
        exec(`${ncu} -e 2 --packageFile package.json ${packageName}`, { cwd }).then(() => true, () => false)
    )).then(accept => (
        Q.fcall(() => (
            // upgrade and grab versions
            exec(`${ncu} -a --packageFile package.json ${packageName}`, { cwd }).then(stdout => {
                const versions = stdout.match(semverRegex());
                assert(versions, `invalid npm-check-updates output ${stdout}`);
                return versions;
            })
        )).then(versions => (
            getPackageChangeMarkdown({
                packageName,
                base: `v${versions[0]}`,
                head: `v${versions[1]}`,
                gitlabHost,
                githubOrg,
                githubToken,
                gitlabOrg,
                gitlabToken
            })
        )).then(body => (
            Q.fcall(() => (
                exec('git diff', { cwd })
            )).then(() => (
                exec(`git commit -a -m "Goldcatcher bump of ${packageName}"`, { cwd })
            )).then(() => (
                exec('git push -fu origin HEAD', { cwd })
            )).then(() => {
                const gitlab = new GitLab({ org: gitlabOrg, token: gitlabToken, host: gitlabHost });
                return gitlab.createMergeRequest({
                    body,
                    title: `Goldcatcher - ${packageName}`,
                    head: getPackageBranchName(packageName),
                    repo: name,
                    accept
                });
            })
        ))
    ));
};

export default ({
    packageName,
    githubOrg,
    githubToken,
    gitlabOrg,
    gitlabToken,
    gitlabHost,
    gitlabUser
}) => {
    log(`goldcatcher ${packageName}`);

    const github = new GitHub({ org: githubOrg, token: githubToken });
    const gitlab = new GitLab({ org: gitlabOrg, token: gitlabToken, host: gitlabHost });


    return Q.all([
        Q.fcall(() => (
            github.fetchDependantRepos({ packageName })
        )).then(githubRepos => Q.allSettled(githubRepos.map(({ name }) => (
            updateGithubRepoDependency({
                name,
                packageName,
                githubToken,
                githubOrg,
                gitlabHost,
                gitlabOrg,
                gitlabToken
            })
        )))),
        Q.fcall(() => (
            gitlab.fetchDependantRepos({ packageName })
        )).then(gitlabRepos => Q.allSettled(gitlabRepos.map(({ name }) => (
            updateGitlabRepoDependency({
                name,
                packageName,
                githubToken,
                githubOrg,
                gitlabHost,
                gitlabOrg,
                gitlabToken,
                gitlabUser
            })
        ))))
    ]);
};
