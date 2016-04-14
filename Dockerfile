FROM gcr.io/porch-gcp/node:4

#
# Set our private registry for install purposes
RUN npm set registry http://npm.mgmt.porch.com

#
# Don't auto commit on npm version
RUN npm config set git-tag-version false

# Adding ssh keys, for github helpscore-scm.
RUN echo "Host github.com\n\tStrictHostKeyChecking no\n" >> /root/.ssh/config

# add and run
ADD bin/hub /usr/bin

WORKDIR /opt/build

# handle npm deps
ADD package.json /opt/build/
RUN npm install

ADD . /opt/build/

CMD ["npm", "start"]
