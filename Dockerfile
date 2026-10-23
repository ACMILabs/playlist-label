# base-image for python on any machine using a template variable,
# see more about dockerfile templates here: https://www.balena.io/docs/learn/develop/dockerfile/
FROM python:3.13-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends cron wget \
    && rm -rf /var/lib/apt/lists/*

COPY ./requirements/base.txt /code/requirements/base.txt
COPY ./requirements/prod.txt /code/requirements/prod.txt
RUN pip3 install -Ur /code/requirements/prod.txt

COPY . /code/
WORKDIR /code/

# pi.sh will run when container starts up on the device
CMD ["bash","scripts/pi.sh"]
