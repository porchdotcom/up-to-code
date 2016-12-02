import assert from 'assert';
import Q from 'q';
import request from 'request';
import url from 'url';
import { memoize, uniqBy } from 'lodash';
import { filter, until } from './promises';
import log from './log';

const PAGE_LENGTH = 100;

const apiRaw = options => {
    const defer = Q.defer();
    request(options, defer.makeNodeResolver());
    return defer.promise.spread((res, body) => {
        assert(res.statusCode < 400, body);
        return body;
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

    fetchRepo = log(async ({ repo, logger }) => {
        logger.trace('fetchRepo');
        const repos = await this.fetchRepos({ logger });
        return repos.find(({ name }) => name === repo);
    });

    fetchRepos = log(async ({ logger }) => {
        logger.trace('fetchRepos');
        const repos = await this.paginate({
            cached: true,
            uri: '/projects'
        });
        return repos.filter(({ namespace: { name }}) => name === this.org);
    });

    createPackageChangeMarkdown = log(async ({ base, head, repo, logger }) => {
        logger.trace(`createPackageChangeMarkdown ${base} ${head} ${repo}`);

        const { id: repoId } = await this.fetchRepo({ repo, logger });
        const { commits } = await this.api({
            cached: true,
            uri: `/projects/${repoId}/repository/compare`,
            qs: {
                from: base,
                to: head
            }
        });
        return [
            '### Diff',
            `[${base}...${head}](https://${this.host}/${this.org}/${repo}/compare/${base}...${head})`,
            '### Commits',
            commits.map(({
                id: commitId,
                author_name: authorName,
                title
            }) => {
                const strippedTitle = title.replace(' [ci skip]', '').replace(' [skip ci]', '');
                return `- ${authorName} - [${strippedTitle}](https://${this.host}/${this.org}/${repo}/commit/${commitId})`; // eslint-disable-line camelcase
            }).reverse().join('\n')
        ].join('\n\n');
    });

    fetchDependantRepos = log(async ({ packageName, logger }) => {
        logger.trace(`fetchDependantRepos ${packageName}`);

        const repos = await this.fetchRepos({ logger });
        return filter(repos, async ({ id }) => {
            try {
                const {
                    dependencies = {},
                    devDependencies = {},
                    peerDependencies = {}
                } = await this.api({
                    cached: true,
                    uri: `/projects/${id}/repository/blobs/master`,
                    qs: {
                        filepath: 'package.json'
                    }
                });
                return (
                    dependencies.hasOwnProperty(packageName) ||
                    devDependencies.hasOwnProperty(packageName) ||
                    peerDependencies.hasOwnProperty(packageName)
                );
            } catch (err) {
                return false;
            }
        });
    });

    createMergeRequest = log(async ({ body, title, head, repo, accept, logger }) => {
        logger.trace(`createMergeRequest ${title}, ${head}, ${repo}, ${accept}`);

        const { id } = await this.fetchRepo({ repo, logger });
        const mergeRequests = await this.paginate({
            uri: `/projects/${id}/merge_requests`,
            qs: {
                state: 'opened'
            }
        });
        const mrs = mergeRequests.filter(({
            target_branch: targetBranch,
            source_branch: sourceBranch
        }) => (
            targetBranch === 'master' &&
            sourceBranch === head
        ));

        assert(mrs.length === 0 || mrs.length === 1);

        const mr = mrs.length === 0 ? (
            await this.api({
                method: 'POST',
                uri: `/projects/${id}/merge_requests`,
                body: {
                    source_branch: head,
                    target_branch: 'master',
                    title,
                    description: body
                }
            })
        ) : (
            await this.api({
                method: 'PUT',
                uri: `/projects/${id}/merge_requests/${mrs[0].id}`,
                body: {
                    title,
                    description: body
                }
            })
        );
        if (!accept) {
            logger.trace('not auto merging merge request');
            return;
        }

        logger.trace('accepting merge request');

        const isIssueOpen = true; // https://gitlab.com/gitlab-org/gitlab-ce/issues/22740
        if (isIssueOpen) {
            const pipelines = await this.paginate({
                uri: `/projects/${id}/pipelines`
            });
            const pipeline = pipelines.find(({ sha }) => sha === mr.sha);
            assert(pipeline, `pipeline for ${mr.sha} required`);

            logger.trace('waiting for pipeline to complete');
            // wait for the pipeline to complete
            await until(() => (
                this.api({
                    uri: `/projects/${id}/pipelines/${pipeline.id}`
                }).then(({ status }) => {
                    logger.trace(`pipeline status ${status}`);
                    return status !== 'running' && status !== 'pending';
                })
            ), 60000);

            logger.trace('pipeline no longer running');
            // ensure the pipeline was successful
            const { status } = await this.api({
                uri: `/projects/${id}/pipelines/${pipeline.id}`
            });
            logger.trace(`pipeline status ${status}`);
            assert.equal(status, 'success');

            // ensure that the mr hasn't been updated
            const { sha } = await this.api({
                uri: `/projects/${id}/merge_request/${mr.id}`
            });
            logger.trace(`merge request update check ${mr.sha} ${sha}`);
            assert.equal(sha, mr.sha);
        }

        await this.api({
            method: 'PUT',
            uri: `/projects/${id}/merge_requests/${mr.id}/merge`,
            body: {
                should_remove_source_branch: true,
                merge_when_build_succeeds: true
            }
        });
        logger.trace(`merged merge request ${title} ${head} ${repo}`);
    });
}
