import Q from 'q';
import GitHubApi from 'github';
import debug from 'debug';
import { uniqBy } from 'lodash';
import assert from 'assert';
import { filter } from './promises';

const log = debug('porch:goldcatcher:github');

const PAGE_LENGTH = 100;
const HELPSCORE_SCM = 'helpscore-scm';

export default class GitHub {
    constructor({ token, org }) {
        this.api = new GitHubApi({
            version: '3.0.0'
        });
        this.api.authenticate({
            type: 'token',
            token: token
        });
        this.org = org;
    }

    isRepo({ repo }) {
        log(`isRepo ${repo}`);
        return Q.fcall(() => (
            this.fetchRepos()
        )).then(repos => (
            repos.filter(({ permissions: { push }}) => !!push)
        )).then(repos => (
            repos.find(({ name }) => name === repo)
        ));
    }

    fetchRepos() {
        log('fetchRepos');

        const getReposPage = page => {
            const defer = Q.defer();
            this.api.repos.getFromOrg({
                org: this.org,
                page: page,
                per_page: PAGE_LENGTH
            }, defer.makeNodeResolver());
            return defer.promise.then(pageRepos => {
                if (pageRepos.length === PAGE_LENGTH) {
                    return getReposPage(page + 1).then(nextPageRepos => [...pageRepos, ...nextPageRepos]);
                }
                return pageRepos;
            });
        };

        return Q.fcall(() => (
            getReposPage(0).then(repos => uniqBy(repos, 'id')).tap(repos => log(`${repos.length} repos found`))
        ));
    }

    fetchDependantRepos({ packageName }) {
        log(`fetchDependantRepos ${packageName}`);

        return Q.fcall(() => (
            this.fetchRepos()
        )).then(repos => (
            repos.filter(({ language }) => /javascript/i.test(language))
        )).then(repos => (
            repos.filter(({ permissions: { push }}) => !!push)
        )).then(repos => (
            filter(repos, ({ name: repo }) => (
                Q.fcall(() => {
                    const defer = Q.defer();
                    this.api.repos.getContent({
                        user: this.org,
                        repo,
                        path: 'package.json'
                    }, defer.makeNodeResolver());
                    return defer.promise.then(({ content, encoding }) => {
                        return JSON.parse(new Buffer(content, encoding).toString());
                    });
                }).then(({ dependencies = {}, devDependencies = {}, peerDependencies = {} }) => (
                    dependencies.hasOwnProperty(packageName) ||
                    devDependencies.hasOwnProperty(packageName) ||
                    peerDependencies.hasOwnProperty(packageName)
                )).catch(() => false)
            ))
        ));
    }

    createPullRequest({ body, title, head, repo }) {
        log(`createPullRequest ${title}, ${head}, ${repo}`);

        return Q.fcall(() => {
            const defer = Q.defer();
            this.api.pullRequests.getAll({
                user: this.org,
                repo,
                state: 'open',
                head: `${this.org}:${head}` // https://mikedeboer.github.io/node-github/#api-pullRequests-getAll
            }, defer.makeNodeResolver());
            return defer.promise;
        }).then(prs => {
            const defer = Q.defer();
            if (!!prs.length) {
                assert.equal(prs.length, 1, `${head} not found`);

                const [{ number }] = prs;
                this.api.pullRequests.update({
                    user: this.org,
                    repo,
                    number,
                    title,
                    body
                }, defer.makeNodeResolver());
            } else {
                this.api.pullRequests.create({
                    user: this.org,
                    repo,
                    title,
                    base: 'master',
                    head,
                    body
                }, defer.makeNodeResolver());
            }
            return defer.promise;
        });
    }

    createPackageChangeMarkdown({ repo, head, base }) {
        log(`createPackageChangeMarkdown ${base}, ${head}, ${repo}`);

        return Q.fcall(() => {
            const defer = Q.defer();
            this.api.repos.compareCommits({
                user: this.org,
                repo,
                base,
                head
            }, defer.makeNodeResolver());
            return defer.promise;
        }).then(({ commits }) => ([
            '### Diff',
            `[${base}...${head}](http://github.com/${this.org}/${repo}/compare/${base}...${head})`,
            '### Commits',
            commits.map(({
                commit: {
                    author: {
                        name
                    } = {},
                    message
                },
                html_url // eslint-disable-line camelcase
            }) => (
                `${(
                    name === HELPSCORE_SCM ? '' : `- __${name}__`
                )}- [${message.split('\n')[0]}](${html_url})` // eslint-disable-line camelcase
            )).reverse().join('\n')
        ].join('\n\n')));
    }
}
