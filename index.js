/**
*
* Copyright 2016 Google Inc. All rights reserved.
*
* Licensed under the Apache License, Version 2.0 (the "License");
* you may not use this file except in compliance with the License.
* You may obtain a copy of the License at
*
*     http://www.apache.org/licenses/LICENSE-2.0
*
* Unless required by applicable law or agreed to in writing, software
* distributed under the License is distributed on an "AS IS" BASIS,
* WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
* See the License for the specific language governing permissions and
* limitations under the License.
*/
import {
  create as mat2dCreate,
  translate,
  scale,
  invert as mat2dInvert
} from './lib/gl-matrix/mat2d.js';
import {
  create as vec2Create,
  fromValues as vec2FromValues,
  transformMat2d
} from './lib/gl-matrix/vec2.js';

function getTouchDistance(t1, t2) {
  const xDist = t1.pageX - t2.pageX;
  const yDist = t1.pageY - t2.pageY;

  return Math.sqrt(xDist * xDist + yDist * yDist);
}

const styleText = `
  :host {
    display: inline-block;
  }
  .scroller {
    height: 100%;
    overflow: auto;
    position: relative;
    -webkit-overflow-scrolling: touch;
    touch-action: pan-x pan-y;
  }
  .transformer {
    transform-origin: 0 0;
    min-width: min-content;
    min-height: min-content;
  }
`;

// Private instance vars
const scrollers = new WeakMap();
const transformers = new WeakMap();
const touchEndListeners = new WeakMap();
const touchMoveListeners = new WeakMap();
const pinching = new WeakMap();
const activeTouchIds = new WeakMap();
const startPinchX = new WeakMap();
const startPinchY = new WeakMap();
const startPinchDistance = new WeakMap();
const endPinchDistance = new WeakMap();
const innerScale = new WeakMap();
const innerTranslateX = new WeakMap();
const innerTranslateY = new WeakMap();
const innerNaturalWidth = new WeakMap();
const innerNaturalHeight = new WeakMap();
const userInteracted = new WeakMap();
const computedMinScale = new WeakMap();

// Private instance methods
function updateTransformer(pinchZoomer) {
  const transformer = transformers.get(pinchZoomer);
  const x = innerTranslateX.get(pinchZoomer);
  const y = innerTranslateY.get(pinchZoomer);
  const scale = innerScale.get(pinchZoomer);

  transformer.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
}

function calculateScale(pinchZoomer, type) {
  const transformer = transformers.get(pinchZoomer);
  const scroller = scrollers.get(pinchZoomer);
  const currentScale = innerScale.get(pinchZoomer);
  const outerBounds = scroller.getBoundingClientRect();
  const innerBounds = transformer.getBoundingClientRect();
  const innerUnscaledWidth = innerBounds.width / currentScale;
  const innerUnscaledHeight = innerBounds.height / currentScale;

  if (type == 'contain') {
    return Math.min(
      outerBounds.width / innerUnscaledWidth,
      outerBounds.height / innerUnscaledHeight
    )
  }
  else if (type == 'cover') {
    return Math.max(
      outerBounds.width / innerUnscaledWidth,
      outerBounds.height / innerUnscaledHeight
    );
  }
}

function updateInitial(pinchZoomer) {
  let scale = pinchZoomer.initialScale || 1;

  if (typeof scale == 'string') scale = calculateScale(pinchZoomer, scale);

  const transformer = transformers.get(pinchZoomer);
  const scroller = scrollers.get(pinchZoomer);
  const currentScale = innerScale.get(pinchZoomer);
  const outerBounds = scroller.getBoundingClientRect();
  const innerBounds = transformer.getBoundingClientRect();
  const innerUnscaledWidth = innerBounds.width / currentScale;
  const innerUnscaledHeight = innerBounds.height / currentScale;

  innerScale.set(pinchZoomer, scale);
  innerTranslateX.set(pinchZoomer, Math.max(0, (outerBounds.width - (innerUnscaledWidth * scale)) / 2));
  innerTranslateY.set(pinchZoomer, Math.max(0, (outerBounds.height - (innerUnscaledHeight * scale)) / 2));
}

function updateMinScale(pinchZoomer) {
  let minScale = pinchZoomer.minScale || 'contain';

  if (typeof minScale == 'string') minScale = calculateScale(pinchZoomer, minScale);
  computedMinScale.set(pinchZoomer, minScale);
}

export default class PinchZoomer extends HTMLElement {
  constructor() {
    super();

    // Build the DOM
    const shadow = this.attachShadow({mode: 'closed'});
    const style = document.createElement('style');
    style.textContent = styleText;
    const scroller = document.createElement('div');
    scroller.className = 'scroller';
    const transformer = document.createElement('div');
    transformer.className = 'transformer';
    const slot = document.createElement('slot');
    
    shadow.append(style);
    shadow.append(scroller);
    scroller.append(transformer);
    transformer.append(slot);

    // Set instance members
    scrollers.set(this, scroller);
    transformers.set(this, transformer);
    pinching.set(this, false);
    innerScale.set(this, 1);
    innerTranslateX.set(this, 0);
    innerTranslateY.set(this, 0);
    userInteracted.set(this, false);

    // Start of pinch
    activeTouchIds.set(this, []);
    startPinchX.set(this, 0);
    startPinchY.set(this, 0);
    startPinchDistance.set(this, 0);

    // During pinch
    endPinchDistance.set(this, 0);

    // Listeners
    scroller.addEventListener('touchstart', event => {
      // Bail if it's normal scrolling, or we're already pinching
      if (event.touches.length < 2 || pinching.get(this)) return;
      event.preventDefault();

      pinching.set(this, true);
      userInteracted.set(this, true);

      const scroller = scrollers.get(this);
      const transformer = transformers.get(this);
      const elScale = innerScale.get(this);
      const outerBounds = scroller.getBoundingClientRect();
      const innerBounds = transformers.get(this).getBoundingClientRect();
      const x1 = event.touches[0].clientX - outerBounds.left;
      const x2 = event.touches[1].clientX - outerBounds.left;
      const y1 = event.touches[0].clientY - outerBounds.top;
      const y2 = event.touches[1].clientY - outerBounds.top;

      // Record start values
      innerNaturalWidth.set(this, innerBounds.width / elScale);
      innerNaturalHeight.set(this, innerBounds.height / elScale);
      activeTouchIds.set(this, [...event.touches].map(t => t.identifier));
      startPinchX.set(this, (x1 + x2) / 2);
      startPinchY.set(this, (y1 + y2) / 2);
      startPinchDistance.set(this, getTouchDistance(event.touches[0], event.touches[1]));
      
      // Switch from regular scrolling to transform
      innerTranslateX.set(this, innerTranslateX.get(this) - scroller.scrollLeft);
      innerTranslateY.set(this, innerTranslateY.get(this) - scroller.scrollTop);
      scroller.style.overflow = 'hidden';
      scroller.scrollLeft = 0;
      scroller.scrollTop = 0;
      transformer.style.willChange = 'transform';

      updateTransformer(this);
      scroller.addEventListener('touchmove', touchMoveListeners.get(this));
      scroller.addEventListener('touchend', touchEndListeners.get(this));
    });

    touchMoveListeners.set(this, event => {
      event.preventDefault();
      const outerBounds = scrollers.get(this).getBoundingClientRect();
      const x1 = event.touches[0].clientX - outerBounds.left;
      const x2 = event.touches[1].clientX - outerBounds.left;
      const y1 = event.touches[0].clientY - outerBounds.top;
      const y2 = event.touches[1].clientY - outerBounds.top;
      const avgX = (x1 + x2) / 2;
      const avgY = (y1 + y2) / 2;
      const distance = getTouchDistance(event.touches[0], event.touches[1]);
      const distanceDiff = distance / startPinchDistance.get(this);
      const elScale = innerScale.get(this);
      const scaleAmount = Math.min(
        Math.max(distanceDiff, computedMinScale.get(this) / elScale),
        (this.maxScale || Infinity) / elScale
      );
      const startAvgX = startPinchX.get(this);
      const startAvgY = startPinchY.get(this);
      const x = innerTranslateX.get(this);
      const y = innerTranslateY.get(this);

      endPinchDistance.set(this, distance);

      // I'm so sorry about the contents of this function.
      // I don't really know what I'm doing.
      // I just wrote code until it worked.

      const matrix = mat2dCreate();

      translate(matrix, matrix, vec2FromValues(avgX, avgY));
      scale(matrix, matrix, vec2FromValues(scaleAmount, scaleAmount));
      translate(matrix, matrix, vec2FromValues(-startAvgX, -startAvgY));
      translate(matrix, matrix, vec2FromValues(x, y));
      scale(matrix, matrix, vec2FromValues(elScale, elScale));

      const topLeft = vec2Create();
      const bottomRight = vec2FromValues(innerNaturalWidth.get(this), innerNaturalHeight.get(this));

      transformMat2d(topLeft, topLeft, matrix);
      transformMat2d(bottomRight, bottomRight, matrix);

      const newWidth = bottomRight[0] - topLeft[0];
      const newHeight = bottomRight[1] - topLeft[1];

      let xTranslate = 0;
      let yTranslate = 0;

      // Are we translating out of the boundaries? If so, fix it up.
      if (newWidth < outerBounds.width) {
        xTranslate = -topLeft[0] + (outerBounds.width - newWidth) / 2;
      }
      else if (topLeft[0] > 0) {
        xTranslate = -topLeft[0];
      }
      else if (bottomRight[0] < outerBounds.width) {
        xTranslate = outerBounds.width - bottomRight[0];
      }

      if (newHeight < outerBounds.height) {
        yTranslate = -topLeft[1] + (outerBounds.height - newHeight) / 2;
      }
      else if (topLeft[1] > 0) {
        yTranslate = -topLeft[1];
      }
      else if (bottomRight[1] < outerBounds.height) {
        yTranslate = outerBounds.height - bottomRight[1];
      }

      if (xTranslate != 0 || yTranslate != 0) {
        // I want to apply this translation as if it were the first operation in the matrix.
        // This seems to do the trick, but there must be an easier way:
        const counterTranslate = vec2FromValues(-xTranslate, -yTranslate);
        mat2dInvert(matrix, matrix);
        translate(matrix, matrix, counterTranslate);
        mat2dInvert(matrix, matrix);
      }

      transformers.get(this).style.transform = `matrix(${matrix[0]}, ${matrix[1]}, ${matrix[2]}, ${matrix[3]}, ${matrix[4]}, ${matrix[5]})`;
    });

    touchEndListeners.set(this, event => {
      const touchIds = activeTouchIds.get(this);

      // Bail if we've still got the original two touches
      if (
        event.touches.length >= 2 &&
        touchIds[0] == event.touches.identifier[0] &&
        touchIds[1] == event.touches.identifier[1]
      ) return;

      event.preventDefault();

      const scroller = scrollers.get(this);
      const transformer = transformers.get(this);

      pinching.set(this, false);
      scroller.removeEventListener('touchmove', touchMoveListeners.get(this));
      scroller.removeEventListener('touchend', touchEndListeners.get(this));

      // Go from transforming back to standard scrolling
      const outerBounds = scroller.getBoundingClientRect();
      const innerBounds = transformers.get(this).getBoundingClientRect();
      const yOffset = innerBounds.top - outerBounds.top;
      const xOffset = innerBounds.left - outerBounds.left;

      innerScale.set(this, Math.min(
        Math.max(
          innerScale.get(this) * (endPinchDistance.get(this) / startPinchDistance.get(this)),
          computedMinScale.get(this)
        ),
        this.maxScale || Infinity
      ));

      innerTranslateX.set(this, Math.max(xOffset, 0));
      innerTranslateY.set(this, Math.max(yOffset, 0));

      transformer.style.willChange = '';
      updateTransformer(this);

      scroller.style.overflow = '';
      scroller.scrollTop -= yOffset;
      scroller.scrollLeft -= xOffset;
    });
  }
  get controls() {
    return this.hasAttribute('controls');
  }
  set controls(val) {
    if (val) {
      this.setAttribute('controls', '');
    }
    else {
      this.removeAttribute('controls');
    }
  }
  get maxScale() {
    return Number(this.getAttribute('maxscale')) || 0;
  }
  set maxScale(val) {
    this.setAttribute('maxscale', Number(val));
  }
  connectedCallback() {
    if (!userInteracted.get(this)) {
      updateInitial(this);
      updateTransformer(this);
    }

    updateMinScale(this);
    updateTransformer(this);
  }
  static get observedAttributes() {
    return ['initialscale', 'minscale', 'maxscale', 'controls'];
  }
  attributeChangedCallback(name) {
    console.log('attr change', name);
    let minScale;

    switch (name) {
      case 'initialscale':
        if (!userInteracted.get(this)) {
          updateInitial(this);
          updateTransformer(this);
        }
        break;
      case 'minscale':
        updateMinScale(this);
        minScale = computedMinScale.get(this);

        if (minScale > innerScale.get(this)) {
          innerScale.set(this, minScale);
          updateTransformer(this);
        }
        break;
      case 'maxscale':
        if (innerScale.get(this) > this.maxScale) {
          innerScale.set(this, this.maxScale);
          updateTransformer(this);
        }
        break;
    }
  }
  changeTo({
    x, y, scale,
    animate = false
  }={}) {

  }
}

for (const prop of ['initialScale', 'minScale']) {
  Object.defineProperty(PinchZoomer.prototype, prop, {
    get() {
      const attrVal = this.getAttribute(prop.toLowerCase());
      if (attrVal == 'cover' || attrVal == 'contain') return attrVal;
      const num = Number(attrVal);

      if (num) return num;

      // Defaults:
      if (prop == 'initialZoom') return 1;
      return 'contain';
    },
    set(val) {
      if (val == 'cover' || val == 'contain') {
        this.setAttribute(prop.toLowerCase(), val);
        return;
      }
      this.setAttribute(prop.toLowerCase(), Number(val));
    }
  })
}

customElements.define('pinch-zoomer', PinchZoomer);