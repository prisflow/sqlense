# Nginx 反向代理：对学生 code-server 做 auth_request 鉴权
FROM nginx:alpine

# 模板使用 ${HOST_GW} 占位符，启动时 entrypoint 从 /etc/hosts 提取
COPY nginx.conf.template /etc/nginx/templates/default.conf.template
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 8080
ENTRYPOINT ["/entrypoint.sh"]
CMD ["nginx", "-g", "daemon off;"]
