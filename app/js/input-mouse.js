/* MouseDriver — 개발·폴백용 입력 드라이버 (브리프 Exit 조항 선반영)
   계약: update(now) → { hands:{L,R}, lean, roll, strokeEvent }
   - 마우스 = 오른손(Shift 누르면 왼손), 버튼 누름 = FIST, 뗌 = OPEN
   - F/J 교대 키 입력 = 교대 스트로크
   - A/D (또는 ←/→) 유지 = 체간 기울기
   좌표는 표시좌표계(0~1, 거울 반영 후)로 HandDriver와 동일 */
import { PARAMS } from './params.js';

function emptyHand() {
  return { present: false, openness: 0, cls: 'NEUTRAL', pos: null, vy: 0 };
}

export class MouseDriver {
  constructor() {
    this.needsCamera = false;
    this.videoEl = null;
    this._pos = { x: 0.5, y: 0.5 };
    this._down = false;
    this._shift = false;
    this._lean = 0;
    this._keys = {};
    this._lastStrokeKey = null;
    this._lastStrokeT = 0;
    this._strokePending = false;
    this._prevPos = null; this._prevT = 0; this._vy = 0;
  }

  async start(container) {
    this._container = container;
    container.addEventListener('mousemove', e => {
      const r = container.getBoundingClientRect();
      this._pos = {
        x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)),
        y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)),
      };
    });
    container.addEventListener('mousedown', () => { this._down = true; });
    window.addEventListener('mouseup', () => { this._down = false; });
    window.addEventListener('keydown', e => {
      this._keys[e.key.toLowerCase()] = true;
      this._shift = e.shiftKey;
      const k = e.key.toLowerCase();
      if ((k === 'f' || k === 'j') && !e.repeat) {
        const now = performance.now();
        if (this._lastStrokeKey && this._lastStrokeKey !== k &&
            now - this._lastStrokeT <= PARAMS.ALT_STROKE_WINDOW_MS) {
          this._strokePending = true;
        }
        this._lastStrokeKey = k; this._lastStrokeT = now;
      }
    });
    window.addEventListener('keyup', e => {
      this._keys[e.key.toLowerCase()] = false;
      this._shift = e.shiftKey;
    });
  }

  async calibrate() { /* 폴백 드라이버 — 캘리브레이션 불요 */ }

  update(now) {
    // 손목 수직속도 (표시좌표 y 하향 증가 → 위 스윙 양수)
    if (this._prevPos && this._prevT) {
      const dt = (now - this._prevT) / 1000;
      if (dt > 0) this._vy = -(this._pos.y - this._prevPos.y) / dt;
    }
    this._prevPos = { ...this._pos }; this._prevT = now;

    const active = {
      present: true,
      openness: this._down ? 0 : 1,
      cls: this._down ? 'FIST' : 'OPEN',
      pos: { ...this._pos },
      vy: this._vy,
    };
    const hands = this._shift
      ? { L: active, R: emptyHand() }
      : { L: emptyHand(), R: active };

    // 기울기: A/D 또는 화살표 유지 시 목표값으로 수렴, 놓으면 복귀
    const target = (this._keys['a'] || this._keys['arrowleft']) ? -0.5
                 : (this._keys['d'] || this._keys['arrowright']) ? 0.5 : 0;
    this._lean += (target - this._lean) * 0.15;

    const strokeEvent = this._strokePending;
    this._strokePending = false;

    return { hands, lean: this._lean, roll: 0, strokeEvent };
  }
}
