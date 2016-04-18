import Q from 'q';
import nconf from 'nconf';
import path from 'path';
import {
    fetchRepos,
    fetchRepoPackage,
    fetchRepoPackagePullRequest,
    updatePullRequestComment,
    fetchRepoPackageReleases,
    compareCommits,
    getContributors,
    getMembers
} from './github';
import debug from 'debug';
import childProcess from 'child_process';
import assert from 'assert';
import {
    noop
} from 'lodash';
import semverRegex from 'semver-regex';
import compareVersions from 'compare-versions';

const log = debug('porch:goldkeeper');

const exec = (cmd, options = {}) => {
    log(`EXEC: ${cmd}`);
    const defer = Q.defer();
    childProcess.exec(cmd, {
        ...options,
        env: nconf.get()
    }, defer.makeNodeResolver());
    return defer.promise.spread((stdout, stderr) => {
        log(`stdout ${stdout}`);
        log(`stderr ${stderr}`);
        return stdout;
    }).catch(err => {
        log(`EXEC FAILURE: ${cmd} ${err.message} ${err.stack}`);
        throw err;
    });
};

nconf.env().file({
    file: path.resolve(__dirname, '../config.json')
});

assert(nconf.get('PACKAGE'), 'PACKAGE not defined');

log(`goldkeeper ${nconf.get('PACKAGE')}`);

// promise version of filter...resolve to boolean
const promiseFilter = (arr, fn) => {
    const ret = [];
    return Q.all(arr.map(elem => {
        return Q.fcall(() => {
            return fn(elem);
        }).then(include => {
            if (include) {
                ret.push(elem);
            }
        });
    })).thenResolve(ret);
};

Q.fcall(() => {
    return fetchRepos();
}).then(repos => {
    return repos.filter(({ language }) => /javascript/i.test(language));
}).then(repos => {
    return promiseFilter(repos, ({ name }) => {
        return Q.fcall(() => {
            return fetchRepoPackage(name);
        }).then(({ dependencies = {}, devDependencies = {}, peerDependencies = {} }) => {
            return (
                dependencies.hasOwnProperty(nconf.get('PACKAGE')) ||
                devDependencies.hasOwnProperty(nconf.get('PACKAGE')) ||
                peerDependencies.hasOwnProperty(nconf.get('PACKAGE'))
            );
        }).catch(() => false);
    });
}).then(repos => {
    const pullRequests = [];
    const diffs = {};
    const commits = {};
    const releaseNotes = {};
    const reviewers = {};
    return Q.all(repos.map(({ name }) => {
        // this repo depends on PACKAGE. update this repo
        log(`updating ${name} ${nconf.get('PACKAGE')}`);

        log(`time to clone and update repo ${name}`);
        const cwd = `repos/${name}`;
        const ncu = path.resolve(__dirname, '../node_modules/.bin/ncu');
        return Q.fcall(() => (
            exec(`git clone --depth 1 git@github.com:${nconf.get('PORCH_REPO_BASE')}/${name}.git repos/${name}`)
        )).then(() => (
            exec(`git checkout -B goldkeeper-${nconf.get('PACKAGE')}`, { cwd })
        )).then(() => (
            exec(`${ncu} -a -r http://npm.mgmt.porch.com --packageFile package.json ${nconf.get('PACKAGE')}`, { cwd })
        )).then(stdout => {
            const versions = stdout.match(semverRegex());
            assert(versions, `invalid npm-check-updates output ${stdout}`);

            diffs[name] = `[v${versions[0]}...v${versions[1]}](http://github.com/porchdotcom/${nconf.get('PACKAGE')}/compare/v${versions[0]}...v${versions[1]})`;

            const fetchReleaseCommits = Q.fcall(() => (
                compareCommits(`v${versions[0]}`, `v${versions[1]}`)
            )).then(res => {
                commits[name] = res.commits;
            });

            const fetchReleaseNotes = Q.fcall(() => (
                fetchRepoPackageReleases()
            )).then(releases => (
                releases.filter(release => semverRegex().test(release.tag_name)) // eslint-disable-line camelcase
            )).then(releases => (
                releases.sort((a, b) => compareVersions(a.tag_name, b.tag_name)) // eslint-disable-line camelcase
            )).then(releases => (
                releases.filter(({ tag_name }) => {
                    // trim the leading v off of the version tag name (eg v4.0.0)
                    const match = tag_name.match(/^v?(.*)/);
                    assert(match, `invalid release tag ${tag_name}`); // eslint-disable-line camelcase

                    const tagVersion = match[1];
                    return (
                        compareVersions(tagVersion, versions[0]) > 0 &&
                        compareVersions(tagVersion, versions[1]) <= 0
                    );
                })
            )).then(releases => {
                releaseNotes[name] = releases;
            });

            return Q.all([
                fetchReleaseCommits,
                fetchReleaseNotes
            ]);
        }).then(() => (
            exec(`git commit -a -m "Goldkeeper bump of ${nconf.get('PACKAGE')}"`, { cwd })
        )).then(() => (
            exec('git push -fu origin HEAD', { cwd })
        )).then(() => (
            exec(`hub pull-request -m "Goldkeeper - ${nconf.get('PACKAGE')}"`, { cwd }).catch(noop)
        )).then(() => (
            fetchRepoPackagePullRequest(name).then(packagePullRequests => {
                packagePullRequests.forEach(pr => pullRequests.push(pr));
            })
        )).then(() => (
            Q.all([
                getContributors(name),
                getMembers()
            ]).spread((contributors, members) => {
                const contributorLogins = contributors.map(({ login }) => login);
                const memberLogins = members.map(({ login }) => login);
                // only include folks that still work here
                reviewers[name] = contributorLogins.filter(login => memberLogins.includes(login)).slice(0, 3);
            })
        )).catch(err => (
            log(`err ${name} ${err.message} ${err.stack}`)
        )).finally(() => (
            exec(`rm -rf ${path.resolve(__dirname, cwd)}`)
        ));
    })).then(() => {
        return Q.all(pullRequests.map(pr => {
            return updatePullRequestComment(pr, [
                reviewers[pr.head.repo.name].map(reviewer => `@${reviewer}`).join(', '),
                '### Diff',
                diffs[pr.head.repo.name],
                '### Commits',
                commits[pr.head.repo.name].map(({ commit, author, html_url }) => ( // eslint-disable-line camelcase
                    `- @${author.login} - [${commit.message.split('\n')[0]}](${html_url})` // eslint-disable-line camelcase
                )).join('\n'),
                '### Release Notes',
                releaseNotes[pr.head.repo.name].map(({ tag_name, name, body, author}) => ( // eslint-disable-line camelcase
                    `##### ${tag_name} - ${name}\n${body}\n@${author.login}\n\n`  // eslint-disable-line camelcase
                )),
                '### Related',
                `${pullRequests.filter(({ id }) => id !== pr.id).map(({ html_url }) => `- ${html_url}`).join('\n')}` // eslint-disable-line camelcase
            ].join('\n\n'));
        }));
    });
}).then(() => (
    log('success')
)).catch(err => (
    log(`err ${err.message} ${err.stack}`)
));
