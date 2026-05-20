// @ts-check

class ListeningRoomBottom extends HTMLElement {
  svgText = "";

  setSVGText(text) {
    this.svgText = text;
    this.#render();
  }

  connectedCallback() {
    this.#render();
  }

  #render() {
    const text =
      this.dataset.text ??
      `Use your exhibition ticket to enter the ballot for upcoming exclusive
        listening sessions. Scan the QR code to enter.`;
    const showQR = (this.dataset.qr ?? "true") === "true";
    const t = `
      <p>
        ${text}
      </p>
      
${
  showQR
    ? `<svg
        class="ticket-icon"
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 512 512"
      >
        <path
          fill="currentColor"
          d="m426.24 127.72l-10.94 10.94a29.67 29.67 0 0 1-42-42l10.94-10.94L314.52 16l-88 88l-4 12.09l-12.09 4L16 314.52l69.76 69.76l10.94-10.94a29.67 29.67 0 0 1 42 42l-10.94 10.94L197.48 496l194.4-194.4l4-12.09l12.09-4l88-88Zm-208.56 5.43l21.87-21.87l33 33l-21.88 21.87Zm43 43l21.88-21.88l32.52 32.52l-21.88 21.88Zm42.56 42.56l21.88-21.88l32.52 32.52l-21.84 21.93Zm75.57 75.56l-33-33l21.87-21.88l33 33Z"
        />
      </svg>
      ${
        this.svgText
          ? `<div class="lr-qr-svg">
          ${this.svgText}
      </div>`
          : ""
      }`
    : ""
}
    `;
    this.setHTMLUnsafe(t);
  }
}

customElements.define("acmi-listening-room-bottom", ListeningRoomBottom);
