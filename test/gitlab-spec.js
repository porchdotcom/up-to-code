import assert from 'assert';
import GitLab from '../src/gitlab';

describe('gitlab', () => {
    const gitlab = new GitLab({
        org: process.env.GITLAB_ORG,
        token: process.env.GITLAB_TOKEN,
        host: process.env.GITLAB_HOST
    });

    it('fetches fluxible-resolver repo', () => (
        gitlab.fetchRepo({ repo: 'fluxible-resolver' }).tap(({ id, name }) => {
            assert.equal(id, 932);
            assert.equal(name, 'fluxible-resolver');
        })
    ));
});
