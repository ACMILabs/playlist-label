/**
 * Class grouping together all methods to render a playlist label in the client,
 * along with simple state to track the current playlist being played.
 */

const FPS = 5;

export default class PlaylistLabelRenderer {
  /**
   * Set an initial state for the renderer
   */

  constructor() {
    this.state = {
      currentLabelId: null,
      nextLabelId: null,
      items: null,
      upcomingItems: null,
      isAnimatingCollect: false,
      playbackPosition: 0,
    };
  }

  /**
   * Init, parsing playlist id that should be made available on the
   * rendered page via window.initialData.
   */
  init() {
    const id =
      "id" in window.initialData ? window.initialData.id : null;
    this.state.currentLabelId =
      "current_label_id" in window.initialData
        ? window.initialData.current_label_id
        : null;
    this.state.nextLabelId =
      "next_label_id" in window.initialData
        ? window.initialData.next_label_id
        : null;

    if (id != null) {
      const url = `/api/playlist/`;
      this.fetchPlaylist(url);
    } else {
      console.error("No valid id could be found on initial pageload."); // eslint-disable-line no-console
    }

    this.handleTapMessage = this.handleTapMessage.bind(this);
    const tapSource = new EventSource("/api/tap-source/");
    tapSource.onmessage = this.handleTapMessage;

    setInterval(this.autoUpdateProgress, 1000/FPS, this);
  }

  hashChange() {
    let label_id = parseInt(location.hash.substring(1));
    this.jumpToLabel(label_id);
    this.state.playbackPosition = 0;
    this.updateProgress();
  }

  /**
   * Fetch playlist makes API request to get playlist data and calls {@link subscribeToMediaPlayer}.
   * @param {string} url - The nfcTag API endpoint with primary key already included.
   */
  fetchPlaylist(url) {
    fetch(url)
      .then((response) => {
        if (!response.ok) {
          throw Error(response.statusText);
        }
        return response.json();
      })
      .then((jsonData) => {
        this.state.items = jsonData.playlist_labels;
        this.state.upcomingItems = jsonData.playlist_labels;
        document.onkeydown = this.onKeyPress.bind(this);
        window.onhashchange = this.hashChange.bind(this);
        this.subscribeToMediaPlayer(jsonData);
        this.addTitleAnnotation(jsonData.playlist_labels[0].label.work);
        if (location.hash) {
          this.hashChange();
        } else {
          location.hash = this.state.items[0].label.id;
        }
      })
      .catch((error) => console.error(error)); // eslint-disable-line no-console
  }

  /**
   * Subscribe to the media player messages
   */
  subscribeToMediaPlayer() {
    // Subscribe to the media player messages
    // TODO: get media_player id from XOS
    const client = new Paho.MQTT.Client( // eslint-disable-line no-undef
      window.initialData.mqtt_host,
      parseInt(window.initialData.mqtt_port, 10),
      "/ws",
      ""
    );

    // set callback handlers
    client.onConnectionLost = this.onConnectionLost.bind(this);
    client.onMessageArrived = this.onMessageArrived.bind(this);
    client.connect({
      userName: window.initialData.mqtt_username,
      password: window.initialData.mqtt_password,
      onSuccess: () => {
        // Subscribe to the media player AMQP feed
        // TODO: Get the media player ID from XOS
        client.subscribe(
          `mediaplayer.${window.initialData.xos_media_player_id}`
        );
      },
      onFailure: () => {
        // Try to re-connect again
        this.subscribeToMediaPlayer();
      },
    });
  }

  onKeyPress(e) {
    if (48 <= e.keyCode && e.keyCode <= 57) { // numbers
      this.state.playbackPosition = 0.1 * (e.keyCode - 48);
      this.updateProgress();
    }
    if (e.keyCode == 39) { // right arrow
      location.hash = this.state.nextLabelId;
    }
    if (e.keyCode == 84) { // 't'
      console.log('tap');
      this.handleTapMessage();
    }
  }

  onConnectionLost(responseObject) {
    if (responseObject.errorCode !== 0) {
      console.error(`MQTT connection lost: ${responseObject.errorMessage}`); // eslint-disable-line no-console
      // Re-subscribe
      this.subscribeToMediaPlayer();
    }
  }

  onMessageArrived(message) {
    // Update display as needed based on message content
    const messageJson = JSON.parse(message.payloadString);

    // Update the progress bar
    this.state.playbackPosition = messageJson.playback_position;
    this.updateProgress()

    // Update the label if needed
    if (messageJson.label_id !== this.state.currentLabelId) {
      location.hash = messageJson.label_id;
    }
  }

  jumpToLabel(label_id) {
    console.log('jump to label', label_id);
    // Update the current state
    this.state.currentLabelId = label_id;
    const items = this.state.items;

    // make a list of items that starts with the new label
    const upcoming_items = [];
    const start_index = items.findIndex(function(item) {
      return item.label && item.label.id === label_id;
    });
    for (let i=0; i<items.length; i++) {
      upcoming_items.push(items[(start_index + i) % items.length]);
    };

    this.state.upcomingItems = upcoming_items;

    // update label content
    this.updateMainLabelContent(upcoming_items[0]);
    if (items.length > 1) {
      this.state.nextLabelId = upcoming_items[1].label.id;
      this.updateUpNextContent(upcoming_items);
    }
  }

  updateMainLabelContent(item) {
    const label = item.label;
    // Update the label fields with the currently playing data
    const title = document.getElementById("title").innerHTML = label.title;
    this.addTitleAnnotation(label.work);
    document.getElementById("subtitles").innerHTML = label.subtitles;
    document.getElementById("content0").innerHTML = label.columns[0].content;
    document.getElementById("content1").innerHTML = label.columns[1].content;
    document.getElementById("content2").innerHTML = label.columns[2].content;

    if (label.work.is_context_indigenous) {
      document.getElementById("indigenous").className = "indigenous indigenous_active";
    } else {
      document.getElementById("indigenous").className = "indigenous";
    }
  }

  updateUpNextContent(items) {
    // Update up next label
    const item = items[1];
    document.querySelector("#next_title").innerHTML = item.label.title;

    for (let i=1; i<items.length; i++) {
      const label = items[i].label;
      const id = "#up_next_label_" + i;
      try {
        document.querySelector(id + " .title").innerHTML = i + '. ' + label.title;
        document.querySelector(id + " .subtitles").innerHTML = label.subtitles;
      } catch(err) {}
    }
  }

  updateProgress() {
    const progressBar = document.getElementById("progress-bar");
    const playbackPosition = this.state.playbackPosition;
    progressBar.style.width = `${playbackPosition * 100}%`;

    const items = this.state.upcomingItems;

    // calculate time to wait times for the upcoming videos;
    let time_to_wait = items[0].video.duration_secs * (1.0 - playbackPosition);
    for (let i=1; i<items.length; i++) {
      const label = items[i].label;

      const num_minutes = parseInt(Math.round(time_to_wait / 60.0));
      let unit = ' minute';
      if (num_minutes != 1) unit += 's';

      const id = "#up_next_label_" + i;
      try {
        document.querySelector(id + " .time_to_wait").innerHTML = num_minutes + unit;
      } catch(err) {}
      time_to_wait += items[i].video.duration_secs;
    }
  }

  autoUpdateProgress(slf) {
    // move progress bar along one frame, while we wait for the next message to arrive from the broker
    if (slf.state.upcomingItems && slf.state.playbackPosition < 1.0) {
      const duration = slf.state.upcomingItems[0].video.duration_secs;
      const portion_per_frame = 1.0 / (duration * FPS);
      slf.state.playbackPosition += portion_per_frame;
      slf.updateProgress();
    }
  }

  truncate(str, max) {
    return str.length > max ? `${str.substr(0, max - 3)}...` : str;
  }

  handleTapMessage() {
    // UPDATE 'COLLECTED' UI
    if (!this.state.isAnimatingCollect) {
      // Debounced with isAnimatingCollect
      this.state.isAnimatingCollect = true;

      // Animation plays: collect -> hidden -> collected -> hidden -> collect
      const collectElement = document.getElementById("collect");
      collectElement.className = "collect hidden";
      window.setTimeout(function timeout1() {
        collectElement.innerHTML = "COLLECTED";
        collectElement.className = "collect active";
      }, 500);
      window.setTimeout(function timeout2() {
        collectElement.className = "collect active hidden";
      }, 3000);
      window.setTimeout(
        function timeout3() {
          collectElement.className = "collect";
          collectElement.innerHTML = "COLLECT";
          this.state.isAnimatingCollect = false;
        }.bind(this),
        3500
      );
    }
  }

  addTitleAnnotation(work) {
    // If a title_annotation exists, add it to the end of the title
    if (work && work.title_annotation) {
      const title = document.getElementById("title");
      const titleAnnotation = document.createElement("span");
      titleAnnotation.className = "title_annotation";
      titleAnnotation.innerHTML = work.title_annotation;
      title.innerHTML = title.innerHTML.replace(
        /<\/p>/g,
        `${titleAnnotation.outerHTML}</p>`
      );
    }
  }
}