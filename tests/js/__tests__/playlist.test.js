import PlaylistLabelRenderer from "../../../app/static/playlist";
import playlistJson from "../../data/playlist.json";
import messageJson from "../../data/message.json";
import messageJsonWithTitleAnnotation from "../../data/message_with_title_annotation.json";

describe("PlaylistLabelRenderer", () => {
  beforeEach(() => {
    // Reset Mocks
    fetch.resetMocks();
    fetch.mockResponseOnce(JSON.stringify(playlistJson));

    // Load JSON
    const playlistData = playlistJson;

    // Set up window data
    window.playlistLabelData = {
      id: playlistData.id,
      current_label_id: playlistData.playlist_labels[0].id,
      next_label_id: playlistData.playlist_labels[1].id,
      csrfToken: "csrf_token",
      mqtt_host: "mqtt_host",
      mqtt_port: "1234",
      mqtt_username: "mqtt_username",
      mqtt_password: "mqtt_password",
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

  it("should handle tap events", () => {
    const renderer = new PlaylistLabelRenderer();
    renderer.init();
    renderer.handleTapMessage();
    expect(renderer.state.isAnimatingCollect).toBeTruthy();
  });
});
