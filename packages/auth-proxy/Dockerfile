# Nginx 反向代理：对学生 code-server 做 auth_request 鉴权
FROM nginx:alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 8080
CMD ["nginx", "-g", "daemon off;"]
