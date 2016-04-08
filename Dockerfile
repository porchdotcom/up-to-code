FROM gcr.io/porch-gcp/node:4

#
# Set our private registry for install purposes
RUN npm set registry http://npm.mgmt.porch.com

#
# install npm modules
RUN npm install -g npm-check-updates

#
# Don't auto commit on npm version
RUN npm config set git-tag-version false

# Adding ssh keys, for github helpscore-scm.
RUN echo "Host github.com\n\tStrictHostKeyChecking no\n" >> /root/.ssh/config

# add and run
ADD hub /usr/bin
ADD start.sh /opt/build/
WORKDIR /opt/build

CMD ["./start.sh"]
