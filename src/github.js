import Q from 'q';
import GitHubApi from 'github';
import nconf from 'nconf';
import debug from 'debug';
import {
    memoize,
    uniqBy
} from 'lodash';
import assert from 'assert';

const log = debug('porch:goldkeeper:github');

const PAGE_LENGTH = 100;

export const fetchRepos = memoize(() => {
    log('fetchRepos');

    const github = new GitHubApi({
        version: '3.0.0'
    });
    github.authenticate({
        type: 'token',
        token: nconf.get('GITHUB_API_TOKEN')
    });

    const getReposPage = page => {
        const defer = Q.defer();
        github.repos.getFromOrg({
            org: nconf.get('GITHUB_ORG'),
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

export const fetchRepoPackage = memoize(repo => {
    log(`fetchRepoPackage ${repo}`);

    const github = new GitHubApi({
        version: '3.0.0'
    });
    github.authenticate({
        type: 'token',
        token: nconf.get('GITHUB_API_TOKEN')
    });

    const defer = Q.defer();
    github.repos.getContent({
        user: nconf.get('GITHUB_ORG'),
        repo,
        path: 'package.json'
    }, defer.makeNodeResolver());
    return defer.promise.then(({ content, encoding }) => {
        return JSON.parse(new Buffer(content, encoding).toString());
    });
});

export const fetchRepoPackagePullRequest = memoize(repo => {
    log(`fetchRepoPackagePullRequest ${repo}`);

    const github = new GitHubApi({
        version: '3.0.0'
    });
    github.authenticate({
        type: 'token',
        token: nconf.get('GITHUB_API_TOKEN')
    });

    const defer = Q.defer();
    const head = `${nconf.get('GITHUB_ORG')}:goldkeeper-${nconf.get('PACKAGE')}`;
    github.pullRequests.getAll({
        user: nconf.get('GITHUB_ORG'),
        repo,
        state: 'open',
        head
    }, defer.makeNodeResolver());
    return defer.promise.tap(prs => (
        assert.equal(prs.length, 1, `${head} not found`)
    ));
});

export const updatePullRequestComment = memoize((pr, body) => {
    log(`updatePullRequestComment ${pr.title} ${body}`);

    const github = new GitHubApi({
        version: '3.0.0'
    });
    github.authenticate({
        type: 'token',
        token: nconf.get('GITHUB_API_TOKEN')
    });

    const defer = Q.defer();
    github.pullRequests.update({
        user: nconf.get('GITHUB_ORG'),
        repo: pr.head.repo.name,
        number: pr.number,
        title: pr.title,
        body: body
    }, defer.makeNodeResolver());
    return defer.promise;
});

export const fetchRepoPackageReleases = memoize(() => {
    log('fetchRepoPackageReleases');

    const github = new GitHubApi({
        version: '3.0.0'
    });
    github.authenticate({
        type: 'token',
        token: nconf.get('GITHUB_API_TOKEN')
    });

    const getReleasesPage = page => {
        const defer = Q.defer();
        github.releases.listReleases({
            owner: nconf.get('GITHUB_ORG'),
            repo: nconf.get('PACKAGE'),
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

export const compareCommits = memoize((base, head) => {
    log('compareCommits');

    const github = new GitHubApi({
        version: '3.0.0'
    });
    github.authenticate({
        type: 'token',
        token: nconf.get('GITHUB_API_TOKEN')
    });

    const defer = Q.defer();
    github.repos.compareCommits({
        user: nconf.get('GITHUB_ORG'),
        repo: nconf.get('PACKAGE'),
        base,
        head
    }, defer.makeNodeResolver());
    return defer.promise;
}, (base, head) => JSON.stringify({ base, head }));

export const getContributors = memoize(repo => {
    log(`getContributors ${repo}`);

    const github = new GitHubApi({
        version: '3.0.0'
    });
    github.authenticate({
        type: 'token',
        token: nconf.get('GITHUB_API_TOKEN')
    });

    const defer = Q.defer();
    github.repos.getContributors({
        user: nconf.get('GITHUB_ORG'),
        repo
    }, defer.makeNodeResolver());
    return defer.promise;
});

export const getMembers = memoize(() => {
    log('getMembers');

    const github = new GitHubApi({
        version: '3.0.0'
    });
    github.authenticate({
        type: 'token',
        token: nconf.get('GITHUB_API_TOKEN')
    });

    const getMembersPage = page => {
        const defer = Q.defer();
        github.orgs.getMembers({
            org: nconf.get('GITHUB_ORG'),
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
