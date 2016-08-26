import Q from 'q';
import parseArgs from 'minimist';
import path from 'path';
import GitHub from './github';
import debug from 'debug';
import assert from 'assert';
import semverRegex from 'semver-regex';
import exec from './exec';

const log = debug('porch:goldcatcher');

const {
    'package-name': packageName,
    'github-org': githubOrg,
    'github-token': githubToken
} = parseArgs(process.argv.slice(2));

assert(packageName, 'npm module not defined');
assert(githubOrg, 'github organization not defined');
assert(githubToken, 'github token not defined');

log(`goldcatcher ${packageName}`);

const github = new GitHub({ org: githubOrg, token: githubToken });

Q.fcall(() => (
    github.fetchDependantRepos({ packageName })
)).then(repos => (
    Q.all(repos.map(({ name }) => {
        log(`updating ${name} ${packageName}`);

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

            return github.createPackageChangeMarkdown({
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
