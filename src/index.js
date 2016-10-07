import Q from 'q';
import path from 'path';
import GitHub from './github';
import GitLab from './gitlab';
import debug from 'debug';
import assert from 'assert';
import exec from './exec';
import url from 'url';
import updateDependency from './pkg';
import { major } from 'semver';

const log = debug('porch:uptocode');

const GITHUB_HOSTNAME = 'github.com';

const getPackageBranchName = packageName => `up-to-code-${packageName}`;

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
    return Q.fcall(() => (
        exec(`git clone --depth 1 https://${githubToken}@github.com/${githubOrg}/${name}.git ${cwd}`)
    )).then(() => (
        exec(`git checkout -B ${getPackageBranchName(packageName)}`, { cwd })
    )).then(() => (
        updateDependency(path.resolve(cwd, 'package.json'), packageName)
    )).then(([before, after]) => (
        getPackageChangeMarkdown({
            packageName,
            base: `v${before}`,
            head: `v${after}`,
            gitlabHost,
            githubOrg,
            githubToken,
            gitlabOrg,
            gitlabToken
        })
    )).then(body => (
        Q.fcall(() => (
            exec(`git commit -a -m "Up-to-code bump of ${packageName}"`, { cwd })
        )).then(() => (
            exec('git push -fu origin HEAD', { cwd })
        )).then(() => {
            const github = new GitHub({ org: githubOrg, token: githubToken });
            return github.createPullRequest({
                body,
                title: `Up to code - ${packageName}`,
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
    return Q.fcall(() => (
        exec(`git clone --depth 1 https://${gitlabUser}:${gitlabToken}@${gitlabHost}/${gitlabOrg}/${name}.git ${cwd}`)
    )).then(() => (
        exec(`git checkout -B ${getPackageBranchName(packageName)}`, { cwd })
    )).then(() => (
        updateDependency(path.resolve(cwd, 'package.json'), packageName)
    )).then(([before, after]) => (
        Q.fcall(() => (
            getPackageChangeMarkdown({
                packageName,
                base: `v${before}`,
                head: `v${after}`,
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
                exec(`git commit -a -m "Up to code bump of ${packageName}"`, { cwd })
            )).then(() => (
                exec('git push -fu origin HEAD', { cwd })
            )).then(() => {
                const gitlab = new GitLab({ org: gitlabOrg, token: gitlabToken, host: gitlabHost });
                return gitlab.createMergeRequest({
                    body,
                    title: `Up to code - ${packageName}`,
                    head: getPackageBranchName(packageName),
                    repo: name,
                    accept: major(before) === major(after)
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
    log(`uptocode ${packageName}`);

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
