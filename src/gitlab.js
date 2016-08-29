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

        this.api = memoize(options => {
            const defer = Q.defer();
            api(options, defer.makeNodeResolver());
            return defer.promise.spread((res, body) => {
                assert(res.statusCode < 400, body);
                return body;
            });
        });

        this.paginate = memoize(options => {
            const getPage = page => (
                Q.fcall(() => (
                    this.api({
                        ...options,
                        qs: {
                            page,
                            per_page: PAGE_LENGTH
                        }
                    })
                )).then(res => {
                    if (res.length === PAGE_LENGTH) {
                        return getPage(page + 1).then(nextPageRepos => [...res, ...nextPageRepos]);
                    }
                    return res;
                })
            );

            return getPage(0);
        });
        this.host = host;
        this.org = org;
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
        return Q.fcall(() => (
            this.paginate({ uri: '/projects' })
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
            this.api({
                uri: `/projects/${id}/repository/compare?from=${base}&to=${head}`
            })
        )).then(({ commits }) => ([
            '### Diff',
            `[${base}...${head}](https://${this.host}/${this.org}/${repo}/compare/${base}...${head})`,
            '### Commits',
            commits.map(({
                id,
                author_name: authorName,
                title
            }) => (
                `- ${authorName}- [${title}](https://${this.host}/${this.org}/${repo}/commit/${id})` // eslint-disable-line camelcase
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
                    this.api({
                        uri: `/projects/${id}/repository/blobs/master?filepath=package.json`
                    })
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

        return Q.fcall(() => (
            this.fetchRepo({ repo })
        )).then(({ id }) => (
            Q.fcall(() => (
                this.paginate({
                    uri: `/projects/${id}/merge_requests`
                })
            )).then(mergeRequests => (
                mergeRequests.filter(({
                    target_branch: targetBranch,
                    source_branch: sourceBranch,
                    state
                }) => (
                    targetBranch === 'master' &&
                    sourceBranch === head &&
                    state === 'opened'
                ))
            )).then(mrs => {
                log(`merge requests ${JSON.stringify(mrs, null, 4)}`);
                if (!!mrs.length) {
                    assert.equal(mrs.length, 1, `${head} not found`);

                    const [mr] = mrs;
                    return this.api({
                        method: 'PUT',
                        uri: `/projects/${id}/merge_requests/${mr.id}`,
                        body: {
                            title,
                            description: body
                        }
                    });
                }
                return this.api({
                    method: 'POST',
                    uri: `/projects/${id}/merge_requests`,
                    body: {
                        source_branch: head,
                        target_branch: 'master',
                        title,
                        description: body
                    }
                });
            })
        ));
    }
}
