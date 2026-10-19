FROM python:3.13-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends cron wget \
    && rm -rf /var/lib/apt/lists/*

COPY ./requirements/base.txt /code/requirements/base.txt
COPY ./requirements/prod.txt /code/requirements/prod.txt
RUN pip3 install -r /code/requirements/prod.txt

COPY . /code/
WORKDIR /code/

CMD ["bash","scripts/pi.sh"]
