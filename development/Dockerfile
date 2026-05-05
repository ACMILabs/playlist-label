FROM python:3.13-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    make 

ENV PYTHONUNBUFFERED=1

COPY ./requirements/base.txt /code/requirements/base.txt
COPY ./requirements/test.txt /code/requirements/test.txt
RUN pip install -Ur /code/requirements/test.txt

COPY . /code/
WORKDIR /code/
