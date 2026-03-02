FROM nginx:stable-alpine
COPY . /usr/share/nginx/html:ro
# small optimization: remove default conf and use simple one
RUN rm /etc/nginx/conf.d/default.conf
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
