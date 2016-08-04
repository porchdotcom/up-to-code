FROM gcr.io/porch-gcp/node:4

ADD bin/hub /usr/bin


WORKDIR /opt/build
COPY . /opt/build/
RUN npm install

#COPY hub.config /root/.config/hub

CMD ["npm", "start"]
