// Keyboard + mouse. WASD/arrows move and drive, mouse aims on foot, click shoots,
// E enters/exits cars, Space handbrake, Shift sprint, P/Esc pause, M mute, H horn.
// Weapons: 1 = pistol, 2 = SMG, 3 = shotgun, Q (or the mouse wheel) cycles.
export class Input {
  constructor() {
    this.keys = {};
    this.mouse = { x: 0, y: 0, down: false, clicked: false, wx: 0, wy: 0, wheel: 0 };
    this._pressed = {};
  }
  attach(canvas, onFirstGesture) {
    this.canvas = canvas;
    const down = (e) => {
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) e.preventDefault();
      if (!this.keys[e.key.toLowerCase()] && !e.repeat) this._pressed[e.key.toLowerCase()] = true;
      this.keys[e.key.toLowerCase()] = true;
      if (onFirstGesture) onFirstGesture();
    };
    const up = (e) => { this.keys[e.key.toLowerCase()] = false; };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', () => { this.keys = {}; });
    canvas.addEventListener('mousemove', (e) => {
      const r = canvas.getBoundingClientRect();
      this.mouse.x = e.clientX - r.left; this.mouse.y = e.clientY - r.top;
    });
    canvas.addEventListener('mousedown', (e) => {
      this.mouse.down = true; this.mouse.clicked = true;
      if (onFirstGesture) onFirstGesture();
    });
    window.addEventListener('mouseup', () => { this.mouse.down = false; });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    // Mouse wheel cycles weapons (handled in world.js alongside Q).
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.mouse.wheel += Math.sign(e.deltaY);
    }, { passive: false });
  }
  axis() {
    const k = this.keys;
    return {
      x: (k.d || k.arrowright ? 1 : 0) - (k.a || k.arrowleft ? 1 : 0),
      y: (k.s || k.arrowdown ? 1 : 0) - (k.w || k.arrowup ? 1 : 0),
    };
  }
  pressed(key) { return !!this._pressed[key]; }
  consumeClick() { const c = this.mouse.clicked; this.mouse.clicked = false; return c; }
  // Wheel steps since last frame (+1/-1 per notch), consumed by weapon cycling.
  consumeWheel() { const w = this.mouse.wheel; this.mouse.wheel = 0; return w; }
  endFrame() { this._pressed = {}; this.mouse.clicked = false; this.mouse.wheel = 0; }
}
