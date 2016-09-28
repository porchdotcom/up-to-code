import { updateGitlabRepoDependency } from '../src';

describe.skip('index', () => {
    it('update gitlab repo with dependency', () => (
        updateGitlabRepoDependency({
            name: '',
            packageName: '',
            githubToken: process.env.GITHUB_TOKEN,
            githubOrg: process.env.GITHUB_ORG,
            gitlabHost: process.env.GITLAB_HOST,
            gitlabOrg: process.env.GITLAB_ORG,
            gitlabToken: process.env.GITLAB_TOKEN,
            gitlabUser: process.env.GITLAB_USER
        })
    ));
});
