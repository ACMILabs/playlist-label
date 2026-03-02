import {signal,computed,effect} from './signals.js'
class DigitalLabel extends HTMLElement {
  static observedAttributes = ['data-label-json']
  #label = signal('null');
  label = computed(() => JSON.parse(this.#label.get()))
  titleElem = this.querySelector('.title');
  authorElem = this.querySelector('.author');
  contentElem = this.querySelector('.content');
  creditLineElem = this.querySelector('.creditLineElem');
  connectedCallback(...args) {
    console.log(args, this.dataset)
    if (this.dataset.labelJson) {
      console.log(JSON.parse(this.dataset.labelJson))
    }
    effect(() => {
      console.log(this.label.get())
    })
  }
  attributeChangedCallback(...args) {
    if (args[0] === 'data-label-json') {
      this.#label.set(args[2])
    }
    console.log({...this})
  }
}

customElements.define('acmi-digital-label',DigitalLabel)