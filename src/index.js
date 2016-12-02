import Q from 'q';
import path from 'path';
import GitHub from './github';
import GitLab from './gitlab';
import assert from 'assert';
import exec from './exec';
import url from 'url';
import updateDependency from './pkg';
import { major } from 'semver';
import log from './log';

const GITHUB_HOSTNAME = 'github.com';

const getPackageBranchName = packageName => `up-to-code-${packageName}`;

const getPackageChangeMarkdown = log(async ({ base, head, packageName, gitlabHost, githubOrg, githubToken, gitlabOrg, gitlabToken, logger }) => {
    const stdout = await exec(`npm view ${packageName} repository.url`, { logger });
    const { hostname } = url.parse(stdout);

    const isGithubHosted = hostname === GITHUB_HOSTNAME;
    const isGitlabHosted = hostname === gitlabHost;

    assert(isGithubHosted || isGitlabHosted, 'git repo not found');
    assert(!!isGithubHosted ^ !!isGitlabHosted, 'multiple git repos found');

    if (isGithubHosted) {
        const github = new GitHub({ org: githubOrg, token: githubToken });
        return github.createPackageChangeMarkdown({ repo: packageName, base, head, logger });
    }
    if (isGitlabHosted) {
        const gitlab = new GitLab({ org: gitlabOrg, token: gitlabToken, host: gitlabHost });
        return gitlab.createPackageChangeMarkdown({ repo: packageName, base, head, logger });
    }

    // redundant...should be caught above
    logger.error('git repo not found');
    throw new Error('git repo not found');
});

const updateGithubRepoDependency = log(async ({
    repo,
    packageName,
    githubToken,
    githubOrg,
    gitlabHost,
    gitlabOrg,
    gitlabToken,
    logger
}) => {
    const cwd = `repos/github/${repo}`;
    await exec(`git clone --depth 1 https://${githubToken}@github.com/${githubOrg}/${repo}.git ${cwd}`, { logger });
    await exec(`git checkout -B ${getPackageBranchName(packageName)}`, { cwd, logger });
    const [ before, after ] = await updateDependency({
        path: path.resolve(cwd, 'package.json'),
        packageName,
        logger
    });
    const body = await getPackageChangeMarkdown({
        packageName,
        base: `v${before}`,
        head: `v${after}`,
        gitlabHost,
        githubOrg,
        githubToken,
        gitlabOrg,
        gitlabToken,
        logger
    });
    await exec(`git commit -a -m "Up-to-code bump of ${packageName}"`, { cwd, logger });
    await exec('git push -fu origin HEAD', { cwd, logger });
    const github = new GitHub({ org: githubOrg, token: githubToken, logger });
    return github.createPullRequest({
        body,
        title: `Up to code - ${packageName}`,
        head: getPackageBranchName(packageName),
        repo,
        logger
    });
});

export const updateGitlabRepoDependency = log(async ({
    repo,
    packageName,
    githubToken,
    githubOrg,
    gitlabHost,
    gitlabOrg,
    gitlabToken,
    gitlabUser,
    logger
}) => {
    const cwd = `repos/gitlab/${repo}`;
    await exec(`git clone --depth 1 https://${gitlabUser}:${gitlabToken}@${gitlabHost}/${gitlabOrg}/${repo}.git ${cwd}`, { logger });
    await exec(`git checkout -B ${getPackageBranchName(packageName)}`, { cwd, logger });
    const [ before, after ] = await updateDependency({
        path: path.resolve(cwd, 'package.json'),
        packageName,
        logger
    });
    const body = await getPackageChangeMarkdown({
        packageName,
        base: `v${before}`,
        head: `v${after}`,
        gitlabHost,
        githubOrg,
        githubToken,
        gitlabOrg,
        gitlabToken,
        logger
    });
    await exec('git diff', { cwd, logger });
    await exec(`git commit -a -m "Up to code bump of ${packageName}"`, { cwd, logger });
    await exec('git push -fu origin HEAD', { cwd, logger });
    const gitlab = new GitLab({ org: gitlabOrg, token: gitlabToken, host: gitlabHost, logger });
    return gitlab.createMergeRequest({
        body,
        title: `Up to code - ${packageName}`,
        head: getPackageBranchName(packageName),
        repo,
        accept: major(before) === major(after),
        logger
    });
});

export default log(({
    packageName,
    githubOrg,
    githubToken,
    gitlabOrg,
    gitlabToken,
    gitlabHost,
    gitlabUser,
    logger
}) => {
    logger.trace(`${packageName}`);

    const github = new GitHub({ org: githubOrg, token: githubToken });
    const gitlab = new GitLab({ org: gitlabOrg, token: gitlabToken, host: gitlabHost });

    return Q.all([
        Q.fcall(async () => {
            const githubRepos = await github.fetchDependantRepos({ packageName, logger });
            return Q.allSettled(githubRepos.map(({ name: repo }) => (
                updateGithubRepoDependency({
                    repo,
                    packageName,
                    githubToken,
                    githubOrg,
                    gitlabHost,
                    gitlabOrg,
                    gitlabToken,
                    logger
                })
            )));
        }),
        Q.fcall(async () => {
            const gitlabRepos = await gitlab.fetchDependantRepos({ packageName, logger });
            return Q.allSettled(gitlabRepos.map(({ name: repo }) => (
                updateGitlabRepoDependency({
                    repo,
                    packageName,
                    githubToken,
                    githubOrg,
                    gitlabHost,
                    gitlabOrg,
                    gitlabToken,
                    gitlabUser,
                    logger
                })
            )));
        })
    ]);
});
