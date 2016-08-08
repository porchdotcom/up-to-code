FROM node:4

RUN git config --global user.name goldcatcher \
    && git config --global user.email goldcatcher@porch.com \
    && git config --global push.default simple

RUN npm install -g npm@3.10.5

ADD bin/hub /usr/bin

WORKDIR /opt/build
COPY package.json /opt/build/
RUN npm install --production

COPY . /opt/build/

RUN mkdir -p /root/.config/

ENTRYPOINT ["node", "bin/index.js"]
