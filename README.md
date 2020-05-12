Playlist label
==============

A playlist label prototype running on a Raspberry Pi connected to a 12.3" screen.


## Features

* Downloads playlist data (including labels data) from an API endpoint
* Subscribes to playback status originating from a [media player](https://github.com/ACMILabs/media-player), via a message broker
* Displays applicable label in response to playback status using a fullscreen Chromium window.
* When combined with a Lens reader, receives tap data from a Lens reader and attaches the appropriate label metadata, before forwarding a `POST /taps/` message to a central API
* Can display in portrait or landscape

## Hardware
A single Raspberry Pi can run both a Lens Reader and a Playlist Label screen. The hardware list therefore is [Lens Reader hardware](https://github.com/ACMILabs/lens-reader) plus a screen. We use a Crystal Display CDS123WU01 12.3" 8:3 display.

## Run the development container

To run the development container:

`$ cd development` and `$ docker-compose up --build`

You should then be able to see the Flask server running at: http://localhost:8081

## Run tests locally

To run the python tests:

`$ cd development` and `$ docker-compose up --build` and `$ docker exec -it playlistlabel make linttest`

To run the javascript tests:

`$ cd testing` and `$ docker-compose up --build` and `$ docker exec -it javascripttests make linttestjs`

## Installation on Raspbian

To install and run on a Raspbian OS Raspberry Pi for prototyping:

* Install [Pyenv](http://www.knight-of-pi.org/pyenv-for-python-version-management-on-raspbian-stretch/) and Python 3.7.3
* Install the required packages `pip install -r requirements.txt`
* Copy `config.tmpl.env` to `source config.env` and fill in the relevant environment variables
* Run `source config.env`
* Run `./scripts/pi.sh`

## Installation via Balena

* Clone this repo.
* Add the Balena remote `git remote add balena g_acmi_developer@git.balena-cloud.com:g_acmi_developer/playlist-label-pi.git`
* Git push your changes
* Push your edits to Balena `git push balena master`

## Keyboard input from a shell

* Install xdotool `sudo apt install xdotool`
* To zoom out in the browser `xdotool key Ctrl+minus`
* To refresh the page `xdotool key "ctrl+F5"`
