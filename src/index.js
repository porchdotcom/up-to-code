import Q from 'q';
import parseArgs from 'minimist';
import path from 'path';
import GitHub from './github';
import debug from 'debug';
import assert from 'assert';
import semverRegex from 'semver-regex';
import exec from './exec';
import { filter } from './promises';

const HELPSCORE_SCM = 'helpscore-scm';
const log = debug('porch:goldcatcher');

const {
    module: packageName,
    org,
    token,
    user
} = parseArgs(process.argv.slice(2));

assert(packageName, 'npm module not defined');
assert(org, 'github organization not defined');
assert(token, 'github token not defined');
assert(user, 'github huser name not defined');

log(`goldcatcher ${packageName}`);

const github = new GitHub({ org, token });

Q.fcall(() => (
    github.fetchRepos()
)).then(repos => (
    repos.filter(({ language }) => /javascript/i.test(language))
)).then(repos => (
    repos.filter(({ permissions: { push }}) => !!push)
)).then(repos => (
    filter(repos, ({ name: repo }) => (
        Q.fcall(() => (
            github.fetchRepoPackage({ repo })
        )).then(({ dependencies = {}, devDependencies = {}, peerDependencies = {} }) => (
            dependencies.hasOwnProperty(packageName) ||
            devDependencies.hasOwnProperty(packageName) ||
            peerDependencies.hasOwnProperty(packageName)
        )).catch(() => false)
    ))
)).then(repos => (
    Q.all(repos.map(({ name }) => {
        log(`updating ${name} ${packageName}`);

        log(`time to clone and update repo ${name}`);
        const branch = `goldcatcher-${packageName}`;
        const cwd = `repos/${name}`;
        const ncu = path.resolve(__dirname, '../node_modules/.bin/ncu');
        return Q.fcall(() => (
            exec(`git clone --depth 1 https://${token}@github.com/${org}/${name}.git repos/${name}`)
        )).then(() => (
            exec(`git checkout -B ${branch}`, { cwd })
        )).then(() => (
            exec(`${ncu} -a --packageFile package.json ${packageName}`, { cwd })
        )).then(stdout => {
            const versions = stdout.match(semverRegex());
            assert(versions, `invalid npm-check-updates output ${stdout}`);

            const diff = `[v${versions[0]}...v${versions[1]}](http://github.com/${org}/${packageName}/compare/v${versions[0]}...v${versions[1]})`;

            return Q.fcall(() => (
                github.compareCommits({
                    base: `v${versions[0]}`,
                    head: `v${versions[1]}`,
                    repo: packageName
                })
            )).then(res => {
                const commits = res.commits.map(({ author, ...commit }) => ({
                    ...commit,
                    author: author || { login: 'unknown' }
                })).reverse();

                const body = [
                    '### Diff',
                    diff,
                    '### Commits',
                    commits.map(({ commit, html_url }) => ( // eslint-disable-line camelcase
                        `${(
                            commit.author.name === HELPSCORE_SCM ? '' : `- __${commit.author.name}__`
                        )}- [${commit.message.split('\n')[0]}](${html_url})` // eslint-disable-line camelcase
                    )).join('\n')
                ].join('\n\n');

                return body;
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
        )).catch(err => (
            log(`err ${name} ${err.message} ${err.stack}`)
        )).finally(() => (
            exec(`rm -rf ${path.resolve(__dirname, cwd)}`)
        ));
    }))
)).then(() => (
    log('success')
)).catch(err => (
    log(`err ${err.message} ${err.stack}`)
));
