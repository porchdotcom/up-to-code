import assert from 'assert';
import GitLab from '../src/gitlab';
import Q from 'q';

describe('gitlab', () => {
    const gitlab = new GitLab({
        org: process.env.GITLAB_ORG,
        token: process.env.GITLAB_TOKEN,
        host: process.env.GITLAB_HOST
    });

    it('fetches all repos', () => (
        Q.all([
            gitlab.fetchRepos(),
            gitlab.fetchRepos()
        ]).spread((repos1, repos2) => {
            assert.deepEqual(repos1, repos2);
        })
    ));

    it('fetches fluxible-resolver repo', () => (
        gitlab.fetchRepo({
            repo: 'fluxible-resolver'
        }).tap(({ id, name }) => {
            assert.equal(id, 932);
            assert.equal(name, 'fluxible-resolver');
        })
    ));

    it('creates merge request markdown', () => (
        gitlab.createPackageChangeMarkdown({
            base: '593ddbc95d4c38130a38b73325282326110cec7f',
            head: '17b17563919b7915141d3c4a130916c2dd02a4ca',
            repo: 'fluxible-resolver'
        }).tap(markdown => {
            assert.equal(markdown, [
                '### Diff',
                '',
                '[593ddbc95d4c38130a38b73325282326110cec7f...17b17563919b7915141d3c4a130916c2dd02a4ca](https://gitlab.porch.com/porchdotcom/fluxible-resolver/compare/593ddbc95d4c38130a38b73325282326110cec7f...17b17563919b7915141d3c4a130916c2dd02a4ca)',
                '',
                '### Commits',
                '',
                '- Patrick Williams- [recompose update](https://gitlab.porch.com/porchdotcom/fluxible-resolver/commit/17b17563919b7915141d3c4a130916c2dd02a4ca)'
            ].join('\n'));
        })
    ));
});
