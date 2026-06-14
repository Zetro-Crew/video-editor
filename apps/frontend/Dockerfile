FROM TODO 

COPY dist /app
COPY host.conf /bitnami/nginx/conf/vhosts/
COPY nginx.conf /opt/bitnami/nginx/conf/

USER root

ENV NGINX_USER=frontend \
    NGINX_GROUP=frontend \ 
    NGINX_GID=8989 \ 
    NGINX_UID=8989

RUN set -ex; \
    groupadd -r --gid "$NGINX_GID" "$NGINX_GROUP"; \
    useradd -r -uid "$NGINX_UID" --gid "$NGINX_GID" "$NGINX_USER";

RUN mkdir -p /opt/bitnami/nginx/tmp && \
    touch /opt/bitnami/nginx/tmp/nginx.conf

RUN chown -R frontend:frontend /opt/bitnami/nginx/tmp /opt/bitnami/nginx/tmp/nginx.conf && \
    chmod -R 777 /opt/bitnami/nginx/tmp /opt/bitnami/nginx/tmp/nginx.conf

USER frontend
    