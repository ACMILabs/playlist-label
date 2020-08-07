/**
 * Class grouping together all methods to render a playlist label in the client,
 * along with simple state to track the current playlist being played.
 */
export default class PlaylistLabelRenderer {
  /**
   * Set an initial state for the renderer
   */
  constructor() {
    this.state = {
      currentLabelId: null,
      nextLabelId: null,
      playlistJson: null,
      isAnimatingCollect: false,
    };
  }

  /**
   * Init, parsing playlist id that should be made available on the
   * rendered page via window.playlistLabelData.
   */
  init() {
    const id =
      "id" in window.playlistLabelData ? window.playlistLabelData.id : null;
    this.state.currentLabelId =
      "current_label_id" in window.playlistLabelData
        ? window.playlistLabelData.current_label_id
        : null;
    this.state.nextLabelId =
      "next_label_id" in window.playlistLabelData
        ? window.playlistLabelData.next_label_id
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
        this.state.playlistJson = jsonData;
        this.addKeyBindings();
        this.subscribeToMediaPlayer(jsonData);
        this.addTitleAnnotation(jsonData.playlist_labels[0].label.work);
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
      window.playlistLabelData.mqtt_host,
      parseInt(window.playlistLabelData.mqtt_port, 10),
      "/ws",
      ""
    );

    // set callback handlers
    client.onConnectionLost = this.onConnectionLost.bind(this);
    client.onMessageArrived = this.onMessageArrived.bind(this);
    client.connect({
      userName: window.playlistLabelData.mqtt_username,
      password: window.playlistLabelData.mqtt_password,
      onSuccess: () => {
        // Subscribe to the media player AMQP feed
        // TODO: Get the media player ID from XOS
        client.subscribe(
          `mediaplayer.${window.playlistLabelData.xos_media_player_id}`
        );
      },
      onFailure: () => {
        // Try to re-connect again
        this.subscribeToMediaPlayer();
      },
    });
  }

  /**
   * Add key bindings to simulate messages
   */
  addKeyBindings() {
    self = this;
    document.onkeydown = function(e) {
      if (e.keyCode == 39) { // right arrow
        self.jump_to_label(self.state.nextLabelId);
     }
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
    this.update_progress(messageJson.playback_position)

    // Update the label if needed
    if (messageJson.label_id !== this.state.currentLabelId) {
      this.jump_to_label(messageJson.label_id)
    }
  }

  jump_to_label(label_id) {
    // Update the current state
    this.state.currentLabelId = label_id;
    // look through labels to find the match
    const items = this.state.playlistJson.playlist_labels;
    for (let index = 0; index < items.length; index++) {
      const item = items[index];
      if (item.label && item.label.id === this.state.currentLabelId) {
        this.update_main_label_content(item.label)

        if (items.length > 1) {
          this.state.nextLabelId = items[(index + 1) % items.length].label.id;
          this.update_up_next_content(items)
        }
      }
    }
  }

  update_main_label_content(label) {
    // Update the label fields with the currently playing data
    const title = document.getElementById("title");
    title.innerHTML = label.title;
    this.addTitleAnnotation(label.work);
    document.getElementById("subtitles").innerHTML =
      label.subtitles;
    document.getElementById("content0").innerHTML =
      label.columns[0].content;
    document.getElementById("content1").innerHTML =
      label.columns[1].content;
    document.getElementById("content2").innerHTML =
      label.columns[2].content;

    if (label.work.is_context_indigenous) {
      document.getElementById("indigenous").className =
        "indigenous indigenous_active";
    } else {
      document.getElementById("indigenous").className = "indigenous";
    }
  }

  update_up_next_content(items) {
    // Update up next label
    const item = items.find((item) => {
      return item.label.id === this.state.nextLabelId;
    });
    document.getElementById("next_title").innerHTML = item.label.title;
  }

  update_progress(playback_position) {
    const videoPlaybackPercentage = playback_position * 100;
    const progressBar = document.getElementById("progress-bar");
    progressBar.style.width = `${videoPlaybackPercentage}%`;
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

/**
 * Init the PlaylistLabelRenderer app once the DOM has completed loading.
 */
document.addEventListener("DOMContentLoaded", () => {
  if (window.playlistLabelData) {
    const playlistLabelApp = new PlaylistLabelRenderer();
    playlistLabelApp.init();
  } else {
    console.error("No playlist label data could be found on initial pageload."); // eslint-disable-line no-console
  }
});
