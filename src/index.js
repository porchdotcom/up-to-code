import Q from 'q';
import parseArgs from 'minimist';
import path from 'path';
import GitHub from './github';
import debug from 'debug';
import assert from 'assert';
import semverRegex from 'semver-regex';
import exec from './exec';

const HELPSCORE_SCM = 'helpscore-scm';
const log = debug('porch:goldcatcher');

const {
    dependency,
    org,
    token,
    user
} = parseArgs(process.argv.slice(2));

assert(dependency, 'node dependency not defined');
assert(org, 'github organization not defined');
assert(token, 'github token not defined');
assert(user, 'github huser name not defined');

log(`goldcatcher ${dependency}`);

const github = new GitHub({ org, token });

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

Q.fcall(() => (
    github.fetchRepos()
)).then(repos => (
    repos.filter(({ language }) => /javascript/i.test(language))
)).then(repos => (
    repos.filter(({ permissions: { push }}) => !!push)
)).then(repos => (
    promiseFilter(repos, ({ name: repo }) => (
        Q.fcall(() => (
            github.fetchRepoDependencies({ repo })
        )).then(({ dependencies = {}, devDependencies = {}, peerDependencies = {} }) => (
            dependencies.hasOwnProperty(dependency) ||
            devDependencies.hasOwnProperty(dependency) ||
            peerDependencies.hasOwnProperty(dependency)
        )).catch(() => false)
    ))
)).then(repos => (
    Q.all(repos.map(({ name }) => {
        // this repo depends on PACKAGE. update this repo
        log(`updating ${name} ${dependency}`);

        log(`time to clone and update repo ${name}`);
        const branch = `goldcatcher-${dependency}`;
        const cwd = `repos/${name}`;
        const ncu = path.resolve(__dirname, '../node_modules/.bin/ncu');
        return Q.fcall(() => (
            exec(`git clone --depth 1 https://${token}@github.com/${org}/${name}.git repos/${name}`)
        )).then(() => (
            exec(`git checkout -B ${branch}`, { cwd })
        )).then(() => (
            exec(`${ncu} -a --packageFile package.json ${dependency}`, { cwd })
        )).then(stdout => {
            const versions = stdout.match(semverRegex());
            assert(versions, `invalid npm-check-updates output ${stdout}`);

            const diff = `[v${versions[0]}...v${versions[1]}](http://github.com/${org}/${dependency}/compare/v${versions[0]}...v${versions[1]})`;

            return Q.fcall(() => (
                github.compareCommits({
                    base: `v${versions[0]}`,
                    head: `v${versions[1]}`,
                    repo: dependency
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
                exec(`git commit -a -m "Goldcatcher bump of ${dependency}"`, { cwd })
            )).then(() => (
                exec('git push -fu origin HEAD', { cwd })
            )).then(() => (
                github.createPullRequest({
                    body,
                    title: `Goldcatcher - ${dependency}`,
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
