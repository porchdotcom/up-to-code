import newrelic from 'newrelic';
import Q from 'q';
import path from 'path';
import GitHub from './github';
import GitLab from './gitlab';
import assert from 'assert';
import exec from './exec';
import url from 'url';
import updateDependency from './pkg';
import { major } from 'semver';
import decorateFunctionLogger from './decorate-function-logger';

const GITHUB_HOSTNAME = 'github.com';

const getPackageBranchName = packageName => `up-to-code-${packageName}`;

const getPackageChangeMarkdown = decorateFunctionLogger(({ base, head, packageName, gitlabHost, githubOrg, githubToken, gitlabOrg, gitlabToken, logger }) => (
    Q.fcall(() => (
        exec(`npm view ${packageName} repository.url`, { logger })
    )).then(stdout => (
        url.parse(stdout).hostname
    )).then(hostname => {
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
    })
));

const updateGithubRepoDependency = decorateFunctionLogger(({
    repo,
    packageName,
    githubToken,
    githubOrg,
    gitlabHost,
    gitlabOrg,
    gitlabToken,
    metadata,
    logger
}) => {
    logger.trace(`time to clone and update github repo ${repo}`);
    const cwd = `repos/github/${repo}`;
    return Q.fcall(() => (
        logger.trace('clone')
    )).then(() => (
        exec(`git clone --depth 1 https://${githubToken}@github.com/${githubOrg}/${repo}.git ${cwd}`, { logger })
    )).then(() => (
        logger.trace('checkout')
    )).then(() => (
        exec(`git checkout -B ${getPackageBranchName(packageName)}`, { cwd, logger })
    )).then(() => (
        logger.trace('version bump')
    )).then(() => (
        updateDependency({
            path: path.resolve(cwd, 'package.json'),
            packageName,
            logger
        })
    )).then(([before, after]) => (
        getPackageChangeMarkdown({
            packageName,
            base: `v${before}`,
            head: `v${after}`,
            gitlabHost,
            githubOrg,
            githubToken,
            gitlabOrg,
            gitlabToken,
            logger
        })
    )).then(body => (
        Q.fcall(() => {
            logger.trace('commit');
            return exec(`git commit -a -m "Up-to-code bump of ${packageName}"`, { cwd, logger });
        }).then(() => {
            logger.trace('push');
            return exec('git push -fu origin HEAD', { cwd, logger });
        }).then(() => {
            logger.trace('create pull request');
            const github = new GitHub({ org: githubOrg, token: githubToken, logger });
            return github.createPullRequest({
                body: `${body}${metadata ? `\n\n> ${metadata}` : ''}`,
                title: `Up to code - ${packageName}`,
                head: getPackageBranchName(packageName),
                repo,
                logger
            });
        })
    )).catch(error => (
        logger.error({ error })
    ));
});

export const updateGitlabRepoDependency = decorateFunctionLogger(({
    repo,
    packageName,
    githubToken,
    githubOrg,
    gitlabHost,
    gitlabOrg,
    gitlabToken,
    gitlabUser,
    metadata,
    logger
}) => {
    logger.trace(`time to clone and update gitlab repo ${repo}`);
    const cwd = `repos/gitlab/${repo}`;
    return Q.fcall(() => {
        logger.trace('clone');
        return exec(`git clone --depth 1 https://${gitlabUser}:${gitlabToken}@${gitlabHost}/${gitlabOrg}/${repo}.git ${cwd}`, { logger });
    }).then(() => {
        logger.trace('checkout');
        return exec(`git checkout -B ${getPackageBranchName(packageName)}`, { cwd, logger });
    }).then(() => {
        logger.trace('version bump');
        return updateDependency({
            path: path.resolve(cwd, 'package.json'),
            packageName,
            logger
        });
    }).then(([before, after]) => (
        Q.fcall(() => (
            getPackageChangeMarkdown({
                packageName,
                base: `v${before}`,
                head: `v${after}`,
                gitlabHost,
                githubOrg,
                githubToken,
                gitlabOrg,
                gitlabToken,
                logger
            })
        )).then(body => (
            Q.fcall(() => {
                logger.trace('diff');
                return exec('git diff', { cwd, logger });
            }).then(() => {
                logger.trace('commit');
                return exec(`git commit -a -m "Up to code bump of ${packageName}"`, { cwd, logger });
            }).then(() => {
                logger.trace('push');
                return exec('git push -fu origin HEAD', { cwd, logger });
            }).then(() => {
                logger.trace('create merge request');
                const gitlab = new GitLab({ org: gitlabOrg, token: gitlabToken, host: gitlabHost, logger });
                return gitlab.createMergeRequest({
                    body: `${body}${metadata ? `\n\n> ${metadata}` : ''}`,
                    title: `Up to code - ${packageName}`,
                    head: getPackageBranchName(packageName),
                    repo,
                    accept: major(before) === major(after),
                    logger
                });
            })
        ))
    )).catch(error => (
        logger.error({ error })
    ));
});

const createNewRelicTransaction = fn => (
    newrelic.createBackgroundTransaction('up-to-code', () => (
        Q.fcall(() => (
            fn()
        )).finally(() => (
            newrelic.endTransaction()
        ))
    ))()
);


export default decorateFunctionLogger(({
    packageName,
    githubOrg,
    githubToken,
    gitlabOrg,
    gitlabToken,
    gitlabHost,
    gitlabUser,
    metadata,
    logger
}) => {
    logger.trace(`${packageName}`);

    const github = new GitHub({ org: githubOrg, token: githubToken });
    const gitlab = new GitLab({ org: gitlabOrg, token: gitlabToken, host: gitlabHost });

    return Q.all([
        Q.fcall(() => (
            github.fetchDependantRepos({ packageName, logger })
        )).then(githubRepos => Q.allSettled(githubRepos.map(({ name: repo }) => (
            createNewRelicTransaction(() => (
                updateGithubRepoDependency({
                    repo,
                    packageName,
                    githubToken,
                    githubOrg,
                    gitlabHost,
                    gitlabOrg,
                    gitlabToken,
                    metadata,
                    logger
                })
            ))
        )))),
        Q.fcall(() => (
            gitlab.fetchDependantRepos({ packageName, logger })
        )).then(gitlabRepos => Q.allSettled(gitlabRepos.map(({ name: repo }) => (
            createNewRelicTransaction(() => (
                updateGitlabRepoDependency({
                    repo,
                    packageName,
                    githubToken,
                    githubOrg,
                    gitlabHost,
                    gitlabOrg,
                    gitlabToken,
                    gitlabUser,
                    metadata,
                    logger
                })
            ))
        ))))
    ]).finally(() => {
        const defer = Q.defer();
        newrelic.shutdown({ collectPendingData: true }, defer.makeNodeResolver());
        return defer.promise;
    });
});
