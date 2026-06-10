# AI Gateway — 多智能体分析服务。
#
# 基于 micromamba + conda-forge，运行 FastAPI + Pydantic AI。
# 接收 WebSocket Server 的 /analyze 请求，调用 DeepSeek LLM 进行
# Code / SQL / Judge 三位一体的学生进度分析。
FROM mambaorg/micromamba:latest

COPY --chown=$MAMBA_USER:$MAMBA_USER environment.yml /tmp/environment.yml
RUN micromamba install -y -n base -f /tmp/environment.yml && \
    micromamba clean --all -y

COPY --chown=$MAMBA_USER:$MAMBA_USER src/ /app
WORKDIR /app

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
