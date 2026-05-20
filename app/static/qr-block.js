// @ts-check

const TRANSLATE_SVG = `<svg id="Layer_1" xmlns="http://www.w3.org/2000/svg" version="1.1" viewBox="0 0 256 256">
  <path fill="currentColor" d="M188.2,103.09h-21.99l-14.21,41.66c-15.01-1.45-28.25-6.13-39.17-13.78,12.45-13.87,20.97-31.96,24.44-53.5h24.8v-16.41h-53.21v-18.11h-16.41v18.11h-53.2v16.41h81.31c-3.19,17.21-10.03,31.6-19.93,42.62-7.44-8.29-13.21-18.45-16.94-30.38l-15.66,4.89c4.47,14.31,11.35,26.52,20.21,36.49-13.24,9.21-29.83,14.18-48.99,14.18v16.41c23.96,0,44.78-6.88,61.16-19.28,12.79,9.77,28.38,15.98,46.16,18.26l-17.33,50.79h22.31l7.01-23.11h36.97l7.17,23.11h22.31l-36.81-108.37ZM163.97,170.82l13.07-42.71h.64l12.59,42.71h-26.29Z"/>
</svg>`;

const CAPTION_SVG = `<svg id="Layer_1" xmlns="http://www.w3.org/2000/svg" version="1.1" viewBox="0 0 256 256">
  <g>
    <path fill="currentColor" d="M54.2,129.94c0-26.33,11.58-43.51,35.59-43.51,17.06,0,29.5,10.24,30.59,26.57h-15.85c-.85-8.78-6.46-13.17-15.85-13.17-10.11,0-17.43,6.71-17.43,17.07v25.35c0,9.99,7.92,17.31,17.92,17.31s15.11-4.02,16.7-13.77h15.84c-2.56,19.01-15.48,27.18-32.79,27.18-23.89,0-34.74-18.04-34.74-43.02Z"/>
    <path fill="currentColor" d="M134.28,129.94c0-26.33,11.58-43.51,35.59-43.51,17.06,0,29.5,10.24,30.59,26.57h-15.85c-.85-8.78-6.46-13.17-15.85-13.17-10.11,0-17.43,6.71-17.43,17.07v25.35c0,9.99,7.92,17.31,17.92,17.31s15.11-4.02,16.7-13.77h15.84c-2.56,19.01-15.48,27.18-32.79,27.18-23.89,0-34.74-18.04-34.74-43.02Z"/>
  </g>
  <path fill="currentColor" d="M231.19,60.16v135.68H24.81V60.16h206.37M247.59,43.75H8.41v168.49h239.19V43.75h0Z"/>
</svg>`;

class QRBlock extends HTMLElement {
  static observedAttributes = ["data-qr-svg", "data-show-caption-icon"];

  connectedCallback() {
    this.render();
  }

  attributeChangedCallback() {
    this.render();
  }

  // Public (not #private) due to Babel config lacking class-fields transform — see Phase 6.
  render() {
    const qrSvg = this.getAttribute("data-qr-svg");
    const showCaption = this.hasAttribute("data-show-caption-icon");

    if (!qrSvg) {
      this.style.display = "none";
      return;
    }

    this.style.display = "";
    this.innerHTML = /* html */ `
      <section class="qr-block">
        ${qrSvg}
        <div class="info">
        <div class="icons">
          ${TRANSLATE_SVG}
          ${showCaption ? CAPTION_SVG : ""}
        </div>
        <div class="qr-desc">Scan to access artwork labels${
          showCaption ? " and captions" : ""
        }</div>
        </div>
        <div class="langs">
          <span>English</span>
          <span lang="cmn-hans">简体字</span>
          <span lang="pa">ਪੰਜਾਬੀ</span>
          <span lang="hi">हिन्दी</span>
        </div>
      </section>
    `;
  }
}

customElements.define("acmi-qr-block", QRBlock);
