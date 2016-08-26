import assert from 'assert';
import Q from 'q';
import debug from 'debug';
import request from 'request';
import url from 'url';
import { memoize, uniqBy } from 'lodash';
import { filter } from './promises';

const PAGE_LENGTH = 100;

const log = debug('porch:goldcatcher:gitlab');

export default class GitLab {
    constructor({ token, org, host }) {
        const api = request.defaults({
            json: true,
            baseUrl: url.format({
                protocol: 'https:',
                host,
                pathname: '/api/v3'
            }),
            headers: {
                'PRIVATE-TOKEN': token
            }
        });
        this.api = memoize(path => {
            const defer = Q.defer();
            api(path, defer.makeNodeResolver());
            return defer.promise.spread((res, body) => {
                assert.equal(res.statusCode, 200);
                return body;
            });
        });
        this.host = host;
        this.org = org;
    }

    isRepo({ repo }) {
        log(`isRepo ${repo}`);

        return this.fetchRepo({ repo }).then(r => !!r);
    }

    fetchRepo({ repo }) {
        log(`fetchRepo ${repo}`);

        return Q.fcall(() => (
            this.fetchRepos()
        )).then(repos => (
            repos.find(({ name }) => name === repo)
        ));
    }

    fetchRepos() {
        log('fetchRepos');

        const getReposPage = page => (
            Q.fcall(() => (
                this.api(`/projects?page=${page}&per_page=${PAGE_LENGTH}`)
            )).then(pageRepos => {
                if (pageRepos.length === PAGE_LENGTH) {
                    return getReposPage(page + 1).then(nextPageRepos => [...pageRepos, ...nextPageRepos]);
                }
                return pageRepos;
            })
        );

        return Q.fcall(() => (
            getReposPage(0)
        )).then(repos => (
            repos.filter(({ namespace: { name }}) => name === this.org)
        )).then(repos => (
            uniqBy(repos, 'id')
        )).tap(repos => (
            log(`${repos.length} repos found`)
        ));
    }

    createPackageChangeMarkdown({ base, head, repo }) {
        log(`createPackageChangeMarkdown ${base} ${head} ${repo}`);

        return Q.fcall(() => (
            this.fetchRepo({ repo })
        )).then(({ id }) => (
            this.api(`/projects/${id}/repository/compare?from=${base}&to=${head}`)
        )).then(({ commits }) => ([
            '### Diff',
            `[${base}...${head}](https://${this.host}/${this.org}/${repo}/compare/${base}...${head})`,
            '### Commits',
            commits.map(({
                id,
                author_name: authorName,
                title
            }) => (
                `${authorName}- [${title}](https://${this.host}/${this.org}/${repo}/commit/${id})` // eslint-disable-line camelcase
            )).reverse().join('\n')
        ].join('\n\n')));
    }

    fetchDependantRepos({ packageName }) {
        log(`fetchDependantRepos ${packageName}`);

        return Q.fcall(() => (
            this.fetchRepos()
        )).then(repos => (
            filter(repos, ({ id }) => (
                Q.fcall(() => (
                    this.api(`/projects/${id}/repository/blobs/master?filepath=package.json`)
                )).then(({ dependencies = {}, devDependencies = {}, peerDependencies = {} }) => (
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
            throw new Error('not supported yet');
        });
    }
}
