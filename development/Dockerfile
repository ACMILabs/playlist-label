# Built from Dockerfile.development
# To rebuild:
# docker build --file development/Dockerfile.development -t acmilabs/playlistlabel-development:v1 .
# docker push acmilabs/playlistlabel-development:v1

FROM python:3.13-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    apt-utils g++ build-essential \
    && rm -rf /var/lib/apt/lists/*

ENV PYTHONUNBUFFERED=1

COPY ./requirements/base.txt /code/requirements/base.txt
COPY ./requirements/test.txt /code/requirements/test.txt
RUN pip install -Ur /code/requirements/test.txt

COPY . /code/
WORKDIR /code/
