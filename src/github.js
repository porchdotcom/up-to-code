import Q from 'q';
import GitHubApi from 'github';
import debug from 'debug';
import {
    memoize,
    uniqBy
} from 'lodash';
import assert from 'assert';

const log = debug('porch:goldcatcher:github');

const PAGE_LENGTH = 100;

export const fetchRepos = memoize((token, org) => {
    log('fetchRepos');

    const github = new GitHubApi({
        version: '3.0.0'
    });
    github.authenticate({
        type: 'token',
        token: token
    });

    const getReposPage = page => {
        const defer = Q.defer();
        github.repos.getFromOrg({
            org: org,
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

    return getReposPage(0).then(repos => uniqBy(repos, 'id')).tap(repos => log(`${repos.length} repos found`));
});

export const fetchRepoPackage = memoize((repo, token, org) => {
    log(`fetchRepoPackage ${repo}`);

    const github = new GitHubApi({
        version: '3.0.0'
    });
    github.authenticate({
        type: 'token',
        token: token
    });

    const defer = Q.defer();
    github.repos.getContent({
        user: org,
        repo,
        path: 'package.json'
    }, defer.makeNodeResolver());
    return defer.promise.then(({ content, encoding }) => {
        return JSON.parse(new Buffer(content, encoding).toString());
    });
});

export const fetchRepoPackagePullRequest = memoize((repo, token, org, module) => {
    log(`fetchRepoPackagePullRequest ${repo}`);

    const github = new GitHubApi({
        version: '3.0.0'
    });
    github.authenticate({
        type: 'token',
        token: token
    });

    const defer = Q.defer();
    const head = `${org}:goldcatcher-${module}`;
    github.pullRequests.getAll({
        user: org,
        repo,
        state: 'open',
        head
    }, defer.makeNodeResolver());
    return defer.promise.tap(prs => (
        assert.equal(prs.length, 1, `${head} not found`)
    ));
});

export const updatePullRequestComment = memoize((pr, body, token, org) => {
    log(`updatePullRequestComment ${pr.title} ${body}`);

    const github = new GitHubApi({
        version: '3.0.0'
    });
    github.authenticate({
        type: 'token',
        token: token
    });

    const defer = Q.defer();
    github.pullRequests.update({
        user: org,
        repo: pr.head.repo.name,
        number: pr.number,
        title: pr.title,
        body: body
    }, defer.makeNodeResolver());
    return defer.promise;
});

export const fetchRepoPackageReleases = memoize((token, org, module) => {
    log('fetchRepoPackageReleases');

    const github = new GitHubApi({
        version: '3.0.0'
    });
    github.authenticate({
        type: 'token',
        token: token
    });

    const getReleasesPage = page => {
        const defer = Q.defer();
        github.releases.listReleases({
            owner: org,
            repo: module,
            page: page,
            per_page: PAGE_LENGTH
        }, defer.makeNodeResolver());
        return defer.promise.then(pageReleases => {
            if (pageReleases.length === PAGE_LENGTH) {
                return getReleasesPage(page + 1).then(nextPageReleases => [...pageReleases, ...nextPageReleases]);
            }
            return pageReleases;
        });
    };

    return getReleasesPage(0).tap(releases => log(`${releases.length} releases found`));
});

export const compareCommits = memoize((base, head, token, org, module) => {
    log('compareCommits');

    const github = new GitHubApi({
        version: '3.0.0'
    });
    github.authenticate({
        type: 'token',
        token: token
    });

    const defer = Q.defer();
    github.repos.compareCommits({
        user: org,
        repo: module,
        base,
        head
    }, defer.makeNodeResolver());
    return defer.promise;
}, (base, head) => JSON.stringify({ base, head }));

export const getContributors = memoize((repo, token, org) => {
    log(`getContributors ${repo}`);

    const github = new GitHubApi({
        version: '3.0.0'
    });
    github.authenticate({
        type: 'token',
        token: token
    });

    const defer = Q.defer();
    github.repos.getContributors({
        user: org,
        repo
    }, defer.makeNodeResolver());
    return defer.promise;
});

export const getMembers = memoize((token, org) => {
    log('getMembers');

    const github = new GitHubApi({
        version: '3.0.0'
    });
    github.authenticate({
        type: 'token',
        token: token
    });

    const getMembersPage = page => {
        const defer = Q.defer();
        github.orgs.getMembers({
            org: org,
            page: page,
            per_page: PAGE_LENGTH
        }, defer.makeNodeResolver());
        return defer.promise.then(pageMembers => {
            if (pageMembers.length === PAGE_LENGTH) {
                return getMembersPage(page + 1).then(nextPageMembers => [...pageMembers, ...nextPageMembers]);
            }
            return pageMembers;
        });
    };

    return getMembersPage(0).tap(members => log(`${members.length} members found`));
});
