import PlaylistLabelRenderer from "../../../app/static/playlist";
import playlistJson from "../../data/playlist.json";
import messageJson from "../../data/message.json";

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
      mqtt_password: "mqtt_password"
    };

    // Set up our document body
    document.body.innerHTML = `<div class="playlist-label-container" id="playlist-label-js-hook"> 
                                <div class="row">
                                  <div class="col-sm">
                                    <h1></h1>
                                    <h2></h2>
                                  </div>
                                  <div class="col-sm">
                                    <p></p>
                                  </div>
                                  <div class="col-sm image-container">
                                    <img src="" alt="" title="">
                                  </div>
                                </div>
                                <h3></h3>
                                <h4></h4>
                                <h5></h5>
                              </div>
                              <div class="progress-bar-container">
                                <div class="progress-bar"></div>
                              </div>`;
  });

  it("should instantiate a playlist label renderer", () => {
    const renderer = new PlaylistLabelRenderer();
    renderer.init();
    expect(renderer).toBeInstanceOf(PlaylistLabelRenderer);
  });

  it("should update label fields when a message arrives", () => {
    const messageData = {
      payloadString: JSON.stringify(messageJson)
    };
    const renderer = new PlaylistLabelRenderer();
    renderer.state.playlistJson = playlistJson;
    renderer.init();
    renderer.onMessageArrived(messageData);
    const mainElem = document.getElementById("playlist-label-js-hook");
    expect(messageJson.label_id).toBeDefined();
    expect(messageJson.duration).toBeDefined();
    expect(messageJson.playback_position).toBeDefined();
    expect(renderer.state.currentLabelId).toStrictEqual(messageJson.label_id);
    const element = renderer.state.playlistJson.playlist_labels.find(label => {
      return label.label.id === renderer.state.currentLabelId;
    });
    expect(mainElem.innerHTML).toContain(element.label.title);
    expect(mainElem.innerHTML).toContain(element.label.subtitles);
    expect(mainElem.innerHTML).toContain(element.label.columns[0].content);
    expect(mainElem.innerHTML).toContain(element.label.works[0].image);
    const elementNext = renderer.state.playlistJson.playlist_labels.find(
      label => {
        return label.label.id === renderer.state.nextLabelId;
      }
    );
    expect(mainElem.innerHTML).toContain(elementNext.label.title);
    expect(mainElem.innerHTML).toContain(elementNext.label.subtitles);
  });
});
