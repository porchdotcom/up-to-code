import Q from 'q';
import debug from 'debug';
import request from 'request';
import url from 'url';
import { uniqBy } from 'lodash';

const PAGE_LENGTH = 100;

const log = debug('porch:goldcatcher:gitlab');

export default class GitLab {
    constructor({ token, org, host }) {
        this.api = request.defaults({
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
        this.host = host;
        this.org = org;
    }

    isRepo({ repo }) {
        log(`isRepo ${repo}`);

        return this.getRepo({ repo }).then(r => !!r);
    }

    getRepo({ repo }) {
        log(`getRepo ${repo}`);

        return Q.fcall(() => (
            this.fetchRepos()
        )).then(repos => (
            repos.find(({ name }) => name === repo)
        ));
    }

    fetchRepos() {
        log('fetchRepos');

        const getReposPage = page => {
            const defer = Q.defer();
            this.api(`/projects?page=${page}&per_page=${PAGE_LENGTH}`, defer.makeNodeResolver());
            return defer.promise.get(1).then(pageRepos => {
                if (pageRepos.length === PAGE_LENGTH) {
                    return getReposPage(page + 1).then(nextPageRepos => [...pageRepos, ...nextPageRepos]);
                }
                return pageRepos;
            });
        };

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
            this.getRepo({ repo })
        )).then(({ id }) => {
            const defer = Q.defer();
            this.api(`/projects/${id}/repository/compare?from=${base}&to=${head}`, defer.makeNodeResolver());
            return defer.promise.get(1);
        }).then(({ commits }) => ([
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
}
