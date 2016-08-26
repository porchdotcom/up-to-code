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
        this.org = org;
    }

    isRepo({ repo }) {
        log(`isRepo ${repo}`);
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
            this.api(url.format({
                pathname: '/projects',
                query: { page, per_page: PAGE_LENGTH }
            }), defer.makeNodeResolver());
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

    createPackageChangeMarkdown({ repo }) {
        return Q.resolve(`__${repo}__ is hosted on gitlab. Support for commits/diff information coming soon.`);
    }
}
