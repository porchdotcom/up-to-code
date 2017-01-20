import assert from 'assert';
import Q from 'q';
import request from 'request';
import url from 'url';
import { memoize, uniqBy } from 'lodash';
import { filter, until } from './promises';
import decorateFunctionLogger from './decorate-function-logger';

const INTERVAL = 60000;
const PAGE_LENGTH = 100;

const apiRaw = decorateFunctionLogger(({ logger, ...options }) => {
    const defer = Q.defer();
    request(options, defer.makeNodeResolver());
    return defer.promise.spread((res, body) => {
        logger.trace({ statusCode: res.statusCode }, 'api request');
        assert(res.statusCode < 400, body);
        return body;
    });
});

const apiCached = memoize(apiRaw, ({ logger, ...options }) => JSON.stringify(options)); // eslint-disable-line no-unused-vars

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

    fetchRepo = decorateFunctionLogger(({ repo, logger }) => {
        logger.trace(`fetchRepo ${repo}`);

        return Q.fcall(() => (
            this.fetchRepos({ logger })
        )).then(repos => (
            repos.find(({ name }) => name === repo)
        )).finally(() => {
            logger.trace(`fetchRepo ${repo} complete`);
        });
    });

    fetchRepos = decorateFunctionLogger(({ logger }) => {
        logger.trace('fetchRepos');
        return Q.fcall(() => (
            this.paginate({
                logger,
                cached: true,
                uri: '/projects'
            })
        )).then(repos => (
            repos.filter(({ namespace: { name }}) => name === this.org)
        )).tap(repos => (
            logger.trace(`${repos.length} repos found`)
        ));
    });

    createPackageChangeMarkdown = decorateFunctionLogger(({ base, head, repo, logger }) => {
        logger.trace(`createPackageChangeMarkdown ${base} ${head} ${repo}`);

        return Q.fcall(() => (
            this.fetchRepo({ repo, logger })
        )).then(({ id }) => (
            this.api({
                logger,
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
                return `- ${authorName} - [${strippedTitle}](https://${this.host}/${this.org}/${repo}/commit/${id})`; // eslint-disable-line camelcase
            }).reverse().join('\n')
        ].join('\n\n')));
    });

    fetchDependantRepos = decorateFunctionLogger(({ packageName, logger }) => {
        logger.trace(`fetchDependantRepos ${packageName}`);

        return Q.fcall(() => (
            this.fetchRepos({ logger })
        )).then(repos => (
            filter(repos, ({ id }) => (
                Q.fcall(() => (
                    this.api({
                        logger,
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
    });

    createMergeRequest = decorateFunctionLogger(({ description, title, head, repo, accept, logger }) => {
        logger.trace(`createMergeRequest ${title}, ${head}, ${repo}, ${accept}`);

        return Q.fcall(() => (
            this.fetchRepo({ repo, logger })
        )).then(({ id }) => (
            Q.fcall(() => (
                this.paginate({
                    logger,
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
                    return Q.fcall(() => (
                        this.api({
                            logger,
                            method: 'PUT',
                            uri: `/projects/${id}/merge_requests/${mr.id}`,
                            body: {
                                title,
                                description
                            }
                        })
                    )).tap(({
                        title: updatedTitle,
                        description: updatedDescription
                    }) => {
                        assert.equal(updatedTitle, mr.title, `description for mr ${mr.id} failed to update`);
                        assert.equal(updatedDescription, mr.description, `description for mr ${mr.id} failed to update`);
                    });
                }
                return this.api({
                    logger,
                    method: 'POST',
                    uri: `/projects/${id}/merge_requests`,
                    body: {
                        source_branch: head,
                        target_branch: 'master',
                        title,
                        description
                    }
                });
            }).then(mr => {
                if (accept) {
                    logger.trace('accepting merge request');

                    const isIssueOpen = true; // https://gitlab.com/gitlab-org/gitlab-ce/issues/22740

                    return Q.fcall(() => {
                        return isIssueOpen && Q.delay(INTERVAL).then(() => (
                            this.paginate({
                                logger,
                                uri: `/projects/${id}/pipelines`
                            })
                        )).then(pipelines => (
                            pipelines.find(({ sha }) => sha === mr.sha)
                        )).tap(pipeline => {
                            assert(pipeline, `pipeline for ${mr.sha} required`);
                        }).tap(() => (
                            logger.trace('waiting for pipeline')
                        )).then(pipeline => (
                            Q.fcall(() => (
                                // wait for the pipeline to complete
                                until(() => (
                                    this.api({
                                        logger,
                                        uri: `/projects/${id}/pipelines/${pipeline.id}`
                                    }).then(({ status }) => {
                                        logger.trace(`pipeline status ${status}`);
                                        return status !== 'running' && status !== 'pending' && status !== 'created';
                                    })
                                ), INTERVAL)
                            )).then(() => {
                                logger.trace('pipeline no longer running');
                                // ensure the pipeline was successful
                                return this.api({
                                    logger,
                                    uri: `/projects/${id}/pipelines/${pipeline.id}`
                                }).then(({ status }) => {
                                    logger.trace(`pipeline status ${status}`);
                                    assert.equal(status, 'success', `pipeline ${pipeline.id} was unsuccessful with status "${status}"`);
                                });
                            }).then(() => (
                                // ensure that the mr hasn't been updated
                                this.api({
                                    logger,
                                    uri: `/projects/${id}/merge_request/${mr.id}`
                                }).then(current => {
                                    logger.trace(`merge request update check ${mr.sha} ${current.sha}`);
                                    assert.equal(current.sha, mr.sha, `pipeline for ${mr.sha} has completed, but mr is now for the git commit ${current.sha}`);
                                })
                            ))
                        ));
                    }).then(() => (
                        this.api({
                            logger,
                            method: 'PUT',
                            uri: `/projects/${id}/merge_requests/${mr.id}/merge`,
                            body: {
                                should_remove_source_branch: true,
                                merge_when_build_succeeds: true
                            }
                        }).then(() => {
                            logger.trace(`merged merge request ${title} ${head} ${repo}`);
                        })
                    ));
                }
                logger.trace('not auto merging merge request');
                return Q.resolve();
            })
        ));
    });
}
