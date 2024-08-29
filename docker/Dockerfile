FROM nginx:latest

## Create folders
RUN mkdir -p /smart-apps

## Copy files
COPY docker/default.conf.template /etc/nginx/templates/default.conf.template

## Copy dist to kroniq
COPY /dist /usr/share/nginx/html/smart-apps
