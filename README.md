Goldcatcher
===========

# About

Goldcatcher creates beautiful pull requests to update libraries for every repo
in your organization that is out of date.

Let's say you work at a company that has lots of node apps and lots of
javascript libraries.  When you make a change to one of those libraries, you
would like your node apps to update to the latest version.  Goldcatcher
automates this process by creating a pull request to update the version in
package.json.  The goldcatcher pull request will include links to easily see a
diff of the updates, new version, and link to other similar pull requests.
This gives the app owner a chance to review the updates and keep their project
update to code.

A goldcatcher pull request contains lots of useful info:
![pull request example](example.png)


# Usage

## Running with docker

The easiest way to use goldcatcher is docker.  

    docker run \
        -e npm_config_registry=http://npm.example.com/nexus/content/groups/npmall/ \
        -e npm_config_email=npm@example.com \
        -e npm_config_always_auth=true \
        -e npm_config__auth=npmpassword \
        -e DEBUG="porch:goldcatcher*" \
        porchdotcom/goldcatcher:latest \
        --package-name=awesome-js-library \
        --github-org=myorg \
        --github-token=abcdef12abcdef12abcdef12abcdef12abcdef12 \
        --gitlab-user=goldcatcheracct \
        --gitlab-org=myorg \
        --gitlab-token=abcd123 \
        --gitlab-host=gitlab.example.com

docker run -e npm_config_registry=http://yourprivatenpm.example.com porchdotcom/goldcatcher \
    --package-name=

## Options

### --package-name

The recently published library that your projects depend on.

### --github-org

The name of the github organization containing your projects.

### --github-token

Github token with permissions to read repos and create pull requests.

### --gitlab-user

Gitlab user name that will read repos and create pull requests.

### --gitlab-token

Gitlab token granting permissions to read repos and create merge requests.

### --gitlab-org

The name of the gitlab organization containing your projects.

### --gitlab-host

Domain name of self hosted gitlab instance.  For example `gitlab.porch.com`

## Environment Variables

[NPM configuration](https://docs.npmjs.com/misc/config) is passed to goldcatcher through environment variables. For
example, if you have a private npm registry, you should configure it using `npm_config_registry=http://mynpm.example.com`.
Anything required to access your npm host in your .npmrc file should be passed to goldcatcher through and environment variable.

### Commonly used npm config

At a minimum, you likely need to define the following environment variables for
a private npm registry:

    npm_config_registry
    npm_config__auth



### DEBUG="porch:goldcatcher*"
Enable verbose logging for goldcatcher

# Supported platforms

Gold catcher can create pull requests on github and gitlab.  It has been tested
with sinopia and nexus npm registries.


