import Q from 'q';
import nconf from 'nconf';
import path from 'path';
import {
    fetchRepos,
    fetchRepoPackage,
    fetchRepoPackagePullRequest,
    updatePullRequestComment
} from './github';
import debug from 'debug';
import childProcess from 'child_process';
import assert from 'assert';
import {
    concat,
    flatten,
    noop
} from 'lodash';

const log = debug('porch:goldkeeper');

const exec = (cmd, options = {}) => {
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
        log(`FAILURE: ${cmd} ${err.message} ${err.stack}`);
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
    return Q.all(repos.map(({ name }) => {
        // this repo depends on PACKAGE. update this repo
        log(name, nconf.get('PACKAGE'));

        log(`time to clone and update repo ${name}`);
        const cwd = `repos/${name}`;
        const ncu = path.resolve(__dirname, '../node_modules/.bin/ncu');
        return Q.fcall(() => (
            exec(`git clone --depth 1 git@github.com:${nconf.get('PORCH_REPO_BASE')}/${name}.git repos/${name}`)
        )).then(() => (
            exec(`git checkout -B goldkeeper-${nconf.get('PACKAGE')}`, { cwd })
        )).then(() => (
            exec(`${ncu} -a -r http://npm.mgmt.porch.com --packageFile package.json ${nconf.get('PACKAGE')}`, { cwd })
        )).then(() => (
            exec(`git commit -a -m "Goldkeeper bump of ${nconf.get('PACKAGE')}"`, { cwd })
        )).then(() => (
            exec('git push -fu origin HEAD', { cwd })
        )).then(() => (
            exec(`hub pull-request -m "Goldkeeper bump of ${nconf.get('PACKAGE')}"`, { cwd }).catch(noop)
        )).then(() => (
            fetchRepoPackagePullRequest(name)
        ));
    }));
}).then(prs => {
    return Q.all(concat(flatten(prs)).map(pr => {
        const otherPRs = prs.filter(({ id }) => id !== pr.id);
        return updatePullRequestComment(pr, `related\n\n${otherPRs.map(({ html_url }) => html_url).join('\n')}`); // eslint-disable-line camelcase
    }));
}).catch(err => log(`err ${err.message} ${err.stack}`));
