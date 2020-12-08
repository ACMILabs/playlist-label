Playlist label
==============

A playlist label running on a Raspberry Pi connected to a 12.3" screen.

## Features

* Downloads playlist data (including labels data) from an API endpoint
* Subscribes to playback status originating from a [media player](https://github.com/ACMILabs/media-player), via a message broker
* Displays applicable label in response to playback status using a fullscreen Chromium window.
* When combined with a Lens reader, receives tap data from a Lens reader and attaches the appropriate label metadata, before forwarding a `POST /taps/` message to a central API
* Can display in portrait or landscape

## Hardware

The label should play on any HDMI-connected screen, and some GPIO-connected screens. We use a Crystal Display CDS123WU01 12.3" 8:3 display.

A single Raspberry Pi can run both a Lens Reader and a Playlist Label screen. The hardware list may also include
[Lens Reader hardware](https://github.com/ACMILabs/lens-reader).

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

## Keyboard input

Ctrl+F5 refresh the browser view (NB this does not refresh the API source)
0-9: Move progress bar along 0-90%.
Right arrow: simulate a 'next label' message.

### Keyboard input from a shell

* Install xdotool `sudo apt install xdotool`
* To zoom out in the browser `xdotool key Ctrl+minus`
* To refresh the page `xdotool key "ctrl+F5"`
* To skip to next label `xdotool key "Right"`

## Alternative template

* An alternative template may be specified by setting the `LABEL_TEMPLATE` environment variable to a filename matching a file in the `templates` folder, e.g. `up_next.html`.

## Rasbperry Pi display quirks

### If the display seems stretched

* Set `PLAYLIST_LABEL_SCREEN` to `false`

### If the display has a black border

* Set `RESIN_HOST_CONFIG_disable_overscan` to `1`

### If using a Crystal Display CDS123WU01 12.3" 8:3 display and are seeing shadows, blurring or noise

* Add the following to `config.txt` on the SD card - the order may be important, and Balena may interfere if the device is already registered with Balena.

```
# Timing settings to get 12.3" screens to work
hdmi_ignore_edid=0xa5000080
hdmi_group=2
hdmi_mode=87
disable_overscan=1
hdmi_timings=1920 0 88 44 148 720 0 4 5 36 0 0 0 60 0 100980000 1
```
