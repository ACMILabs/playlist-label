/**
 * @jest-environment jsdom
 */

import PlaylistLabelRenderer from "../../../app/static/playlist";
import playlistJson from "../../data/playlist.json";
import messageJson from "../../data/message.json";
import messageJsonWithTitleAnnotation from "../../data/message_with_title_annotation.json";
import tapSuccessfulEventData from "../../data/tap_successful_event_data.json";
import tapFailedEventData from "../../data/tap_failed_event_data.json";

describe("PlaylistLabelRenderer", () => {
  beforeEach(() => {
    // Reset Mocks
    fetch.resetMocks();
    fetch.mockResponseOnce(JSON.stringify(playlistJson));

    // Load JSON
    const playlistData = playlistJson;

    // Set up window data
    window.initialData = {
      id: playlistData.id,
      current_label_id: playlistData.playlist_labels[0].id,
      next_label_id: playlistData.playlist_labels[1].id,
      csrfToken: "csrf_token",
      mqtt_host: "mqtt_host",
      mqtt_port: "1234",
      mqtt_username: "mqtt_username",
      mqtt_password: "mqtt_password",
      xos_playlist_endpoint: "https://xos.acmi.net.au/api/playlists/",
      xos_media_player_id: 8,
      ignore_tap_reader: "false",
      ignore_media_player: "true",
      is_preview: "false",
      playlist_json: playlistData,
    };

    // Set up our document body
    document.body.innerHTML = `<div>
                                <div>
                                  <div>
                                    <div id="title"></div>
                                    <div id="subtitles"></div>
                                  </div>
                                  <div>
                                    <div id="content0"></div>
                                    <div id="content1"></div>
                                    <div id="content2"></div>
                                    <div id="indigenous" class="indigenous"></div>
                                  </div>
                                </div>
                                <div class="collect" id="collect">COLLECT</div>
                                <div id="next_title"></div>
                              </div>
                              <div class="progress-bar-container">
                                <div id="progress-bar" class="progress-bar"></div>
                              </div>
                              <div id="error-dialogue" class="error-dialogue closed">
                                <div id="error-dialogue-text" class="error-dialogue-text">Error</div>
                              </div>
                              <div id="up_next_template">
                                  <div class="up_next_work" id="up_next_label_1">
                                    <div class="title"></div>
                                    <div class="subtitles"></div>
                                    <div class="starts_in">Starts <span class="time_to_wait">x minutes</span></div>
                                  </div>
                                  <div class="up_next_work" id="up_next_label_2">
                                    <div class="title"></div>
                                    <div class="subtitles"></div>
                                    <div class="starts_in">Starts <span class="time_to_wait">x minutes</span></div>
                                  </div>
                              </div>
                              <div id="countdown_template">
                                <div class="title">
                                  <p>
                                    <span id="minutes_remaining">0:00</span>
                                    <br>
                                    <span id="units">minutes</span>
                                  </p>
                                </div>
                              </div>`;
  });

  it("should instantiate a playlist label renderer", () => {
    const renderer = new PlaylistLabelRenderer();
    renderer.init();
    expect(renderer).toBeInstanceOf(PlaylistLabelRenderer);
  });

  it("should update label fields when a message arrives", () => {
    const messageData = {
      payloadString: JSON.stringify(messageJson),
    };
    const renderer = new PlaylistLabelRenderer();
    renderer.state.playlistJson = playlistJson;
    renderer.init();
    renderer.onMessageArrived(messageData);
    expect(messageJson.label_id).toBeDefined();
    expect(messageJson.duration).toBeDefined();
    expect(messageJson.playback_position).toBeDefined();
    expect(renderer.state.currentLabelId).toStrictEqual(messageJson.label_id);
    const element = renderer.state.playlistJson.playlist_labels.find(
      (label) => {
        return label.label.id === renderer.state.currentLabelId;
      }
    );
    expect(document.body.innerHTML).toContain(element.label.title);
    expect(document.body.innerHTML).not.toContain("title_annotation");
    expect(document.body.innerHTML).toContain(element.label.subtitles);
    expect(document.body.innerHTML).toContain(element.label.columns[0].content);
    const elementNext = renderer.state.playlistJson.playlist_labels.find(
      (label) => {
        return label.label.id === renderer.state.nextLabelId;
      }
    );
    expect(document.body.innerHTML).toContain(elementNext.label.title);
  });

  it("should include a title annotation when a message arrives", () => {
    const messageData = {
      payloadString: JSON.stringify(messageJsonWithTitleAnnotation),
    };
    const renderer = new PlaylistLabelRenderer();
    renderer.state.playlistJson = playlistJson;
    renderer.init();
    renderer.onMessageArrived(messageData);
    const element = renderer.state.playlistJson.playlist_labels.find(
      (label) => {
        return label.label.id === renderer.state.currentLabelId;
      }
    );
    const tmp = document.createElement("div");
    tmp.innerHTML = element.label.title;
    expect(document.body.innerHTML).toContain(tmp.textContent);
    expect(document.body.innerHTML).toContain(
      element.label.work.title_annotation
    );
  });

  it("up next should show correct time left message", () => {
    const messageData = {
      payloadString: JSON.stringify(messageJson),
    };

    const renderer = new PlaylistLabelRenderer();
    renderer.state.playlistJson = playlistJson;
    renderer.init();
    renderer.onMessageArrived(messageData);

    const upNextTemplate = document.querySelector("#up_next_template");

    const timeToWaitElement1 = upNextTemplate.querySelector(
      "#up_next_label_1 .time_to_wait"
    );
    expect(timeToWaitElement1.innerHTML).toContain("soon");

    const timeToWaitElement2 = upNextTemplate.querySelector(
      "#up_next_label_2 .time_to_wait"
    );
    expect(timeToWaitElement2.innerHTML).toContain("3 minutes");
  });

  it("countdown should show correct time left message", () => {
    const renderer = new PlaylistLabelRenderer();
    renderer.state.playlistJson = playlistJson;
    renderer.init();

    const messageData = {
      payloadString: JSON.stringify(messageJson),
    };
    renderer.onMessageArrived(messageData);
    const countDownTemplate = document.querySelector("#countdown_template");
    const minutesRemainingElement =
      countDownTemplate.querySelector("#minutes_remaining");
    const timeLeftUnitElement = countDownTemplate.querySelector("#units");

    expect(minutesRemainingElement.innerHTML).toContain("1");
    expect(timeLeftUnitElement.innerHTML).toContain(" minute");

    const newMessageJson = messageJson;
    newMessageJson.playback_position = 0.66;
    const newMessageData = {
      payloadString: JSON.stringify(newMessageJson),
    };
    renderer.onMessageArrived(newMessageData);

    expect(minutesRemainingElement.innerHTML).toContain("20");
    expect(timeLeftUnitElement.innerHTML).toContain(" seconds");
  });

  it("should handle tap events", () => {
    const tapSuccessfulEventPayload = {
      data: JSON.stringify(tapSuccessfulEventData),
    };
    const renderer = new PlaylistLabelRenderer();
    renderer.init();
    renderer.handleTapMessage(tapSuccessfulEventPayload);
    expect(renderer.state.isAnimatingCollect).toBeTruthy();
  });

  it("should handle failed tap events", () => {
    const tapFailedEventPayload = {
      data: JSON.stringify(tapFailedEventData),
    };
    const renderer = new PlaylistLabelRenderer();
    renderer.init();
    renderer.handleTapMessage(tapFailedEventPayload);
    expect(renderer.state.isAnimatingCollect).toBe(false);
  });
});
