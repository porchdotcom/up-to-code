FROM gcr.io/porch-gcp/node:4

ADD bin/hub /usr/bin

WORKDIR /opt/build
COPY package.json /opt/build/
RUN npm install

COPY . /opt/build/

RUN mkdir -p /root/.config/
#CMD /bin/bash

RUN git config --global user.name helpscore-scm \
    && git config --global user.email scm@helpscore.com \
    && git config --global push.default simple


ENTRYPOINT ["node", "bin/index.js"]
