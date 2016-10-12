import assert from 'assert';
import Q from 'q';
import debug from 'debug';
import request from 'request';
import url from 'url';
import { memoize, uniqBy } from 'lodash';
import { filter, until } from './promises';

const PAGE_LENGTH = 100;

const log = debug('porch:uptocode:gitlab');

const apiRaw = options => {
    log('request %o', options);
    const defer = Q.defer();
    request(options, defer.makeNodeResolver());
    return defer.promise.spread((res, body) => {
        assert(res.statusCode < 400, body);
        return body;
    }).finally(() => {
        log('request complete %o', options);
    });
};

const apiCached = memoize(apiRaw, JSON.stringify);

const api = ({ cached = false, ...options }) => cached ? apiCached(options) : apiRaw(options);

export default class GitLab {
    constructor({ token, org, host }) {
        this.api = options => api({
            json: true,
            baseUrl: url.format({
                protocol: 'https:',
                host,
                pathname: '/api/v3'
            }),
            headers: {
                'PRIVATE-TOKEN': token
            },
            ...options
        });

        this.paginate = ({ qs, ...options }) => {
            const getPage = page => (
                Q.fcall(() => (
                    this.api({
                        ...options,
                        qs: {
                            ...qs,
                            page,
                            per_page: PAGE_LENGTH
                        }
                    })
                )).then(res => {
                    if (res.length === PAGE_LENGTH) {
                        return getPage(page + 1).then(nextPageRes => uniqBy([...res, ...nextPageRes], 'id'));
                    }
                    return res;
                })
            );

            return getPage(0);
        };
        this.host = host;
        this.org = org;
    }

    fetchRepo({ repo }) {
        log(`fetchRepo ${repo}`);

        return Q.fcall(() => (
            this.fetchRepos()
        )).then(repos => (
            repos.find(({ name }) => name === repo)
        )).finally(() => {
            log(`fetchRepo ${repo} complete`);
        });
    }

    fetchRepos() {
        log('fetchRepos');
        return Q.fcall(() => (
            this.paginate({
                cached: true,
                uri: '/projects'
            })
        )).then(repos => (
            repos.filter(({ namespace: { name }}) => name === this.org)
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
                cached: true,
                uri: `/projects/${id}/repository/compare`,
                qs: {
                    from: base,
                    to: head
                }
            })
        )).then(({ commits }) => ([
            '### Diff',
            `[${base}...${head}](https://${this.host}/${this.org}/${repo}/compare/${base}...${head})`,
            '### Commits',
            commits.map(({
                id,
                author_name: authorName,
                title
            }) => {
                const strippedTitle = title.replace(' [ci skip]', '').replace(' [skip ci]', '');
                return `- ${authorName} - [${strippedTitle}](https://${this.host}/${this.org}/${repo}/commit/${id})` // eslint-disable-line camelcase
            }).reverse().join('\n')
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
                        cached: true,
                        uri: `/projects/${id}/repository/blobs/master`,
                        qs: {
                            filepath: 'package.json'
                        }
                    })
                )).then(({ dependencies = {}, devDependencies = {}, peerDependencies = {} }) => (
                    dependencies.hasOwnProperty(packageName) ||
                    devDependencies.hasOwnProperty(packageName) ||
                    peerDependencies.hasOwnProperty(packageName)
                )).catch(() => false)
            ))
        ));
    }

    createMergeRequest({ body, title, head, repo, accept }) {
        log(`createMergeRequest ${title}, ${head}, ${repo}, ${accept}`);

        return Q.fcall(() => (
            this.fetchRepo({ repo })
        )).then(({ id }) => (
            Q.fcall(() => (
                this.paginate({
                    uri: `/projects/${id}/merge_requests`,
                    qs: {
                        state: 'opened'
                    }
                })
            )).then(mergeRequests => (
                mergeRequests.filter(({
                    target_branch: targetBranch,
                    source_branch: sourceBranch
                }) => (
                    targetBranch === 'master' &&
                    sourceBranch === head
                ))
            )).then(mrs => {
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
            }).then(mr => {
                if (accept) {
                    log('accepting merge request');

                    const isIssueOpen = true; // https://gitlab.com/gitlab-org/gitlab-ce/issues/22740

                    return Q.fcall(() => {
                        return isIssueOpen && Q.fcall(() => (
                            this.paginate({
                                uri: `/projects/${id}/pipelines`
                            })
                        )).then(pipelines => (
                            pipelines.find(({ sha }) => sha === mr.sha)
                        )).tap(pipeline => {
                            assert(pipeline, `pipeline for ${mr.sha} required`);
                        }).tap(() => (
                            log('waiting for pipeline')
                        )).then(pipeline => (
                            Q.fcall(() => (
                                // wait for the pipeline to complete
                                until(() => (
                                    this.api({
                                        uri: `/projects/${id}/pipelines/${pipeline.id}`
                                    }).then(({ status }) => {
                                        log(`status ${status}`);
                                        return status !== 'running';
                                    })
                                ), 60000)
                            )).then(() => (
                                // ensure the pipeline was successful
                                this.api({
                                    uri: `/projects/${id}/pipelines/${pipeline.id}`
                                }).then(({ status }) => {
                                    log(`pipeline status ${status}`);
                                    assert.equal(status, 'success');
                                })
                            )).then(() => (
                                // ensure that the mr hasn't been updated
                                this.api({
                                    uri: `/projects/${id}/merge_request/${mr.id}`
                                }).then(({ sha }) => {
                                    log(`merge request update check ${mr.sha} ${sha}`);
                                    assert.equal(sha, mr.sha);
                                })
                            ))
                        ));
                    }).then(() => (
                        this.api({
                            method: 'PUT',
                            uri: `/projects/${id}/merge_requests/${mr.id}/merge`,
                            body: {
                                should_remove_source_branch: true,
                                merge_when_build_succeeds: true
                            }
                        })
                    ));
                }
                return Q.resolve();
            })
        ));
    }
}
