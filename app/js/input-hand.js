/* HandDriver — MediaPipe Hand(양손)+Pose(lite) 입력 드라이버 (Gate 1 스파이크 이식)
   C2: 영상 프레임의 저장·전송 없음 — 랜드마크 파생값만 메모리에서 소비.
   출력 좌표는 표시좌표계(거울 반영: x → 1−x). lean도 표시 기준(오른쪽 기울기 = +). */
import { HandLandmarker, PoseLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';
import { PARAMS } from './params.js';

function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }

// 손 랜드마크: 0 WRIST, 5 indexMCP, 8/12/16/20 TIP
function computeOpenness(lm) {
  const wrist = lm[0];
  const handScale = dist(wrist, lm[5]) || 1e-4;
  return [8, 12, 16, 20].map(i => dist(lm[i], wrist) / handScale).reduce((s, v) => s + v, 0) / 4;
}

function makeHandState() {
  return {
    present: false, opennessRaw: 0, openness: 0.5,
    classCandidate: 'NEUTRAL', cls: 'NEUTRAL', classSince: 0,
    pos: null, prevPos: null, prevT: 0, vy: 0,
    lastPeakT: 0, lastPeakSign: 0, _justPeaked: false,
  };
}

export class HandDriver {
  constructor() {
    this.needsCamera = true;
    this.videoEl = null;
    this._hands = { L: makeHandState(), R: makeHandState() };
    this._calib = { L: { min: null, max: null }, R: { min: null, max: null }, torsoNeutralX: null };
    this._frame = 0;
    this._lastPose = null;
    this._leanCam = 0; this._roll = 0;
    this._lastSnapshot = { L: null, R: null, torsoX: null };
  }

  async start() {
    const video = document.createElement('video');
    video.autoplay = true; video.playsInline = true; video.muted = true;
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: 1280, height: 720 }, audio: false,
    });
    video.srcObject = stream;
    await video.play();
    this.videoEl = video;

    const vision = await FilesetResolver.forVisionTasks(
      'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm'
    );
    this._hand = await HandLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
        delegate: 'GPU',
      },
      runningMode: 'VIDEO', numHands: 2,
    });
    this._pose = await PoseLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task',
        delegate: 'GPU',
      },
      runningMode: 'VIDEO', numPoses: 1,
    });
  }

  /* 15초 캘리브레이션: 펴기 5s → 쥐기 5s → 중립 5s
     ui: { show(title, desc), countdown(sec), hide() } */
  async calibrate(ui) {
    const open = { L: [], R: [] }, fist = { L: [], R: [] }, neutral = [];
    const phase = (title, desc, onFrame) => new Promise(resolve => {
      ui.show(title, desc);
      const start = performance.now();
      const tick = () => {
        const elapsed = performance.now() - start;
        ui.countdown(Math.max(0, Math.ceil((PARAMS.CALIB_PHASE_MS - elapsed) / 1000)));
        this.update(performance.now());
        onFrame(this._lastSnapshot);
        if (elapsed >= PARAMS.CALIB_PHASE_MS) resolve();
        else requestAnimationFrame(tick);
      };
      tick();
    });

    await phase('1/3 · 손을 최대한 펴세요', '양손을 화면에 보이도록 쫙 펴고 유지합니다.', s => {
      if (s.L) open.L.push(s.L); if (s.R) open.R.push(s.R);
    });
    await phase('2/3 · 주먹을 꽉 쥐세요', '양손을 최대한 꽉 쥔 상태로 유지합니다.', s => {
      if (s.L) fist.L.push(s.L); if (s.R) fist.R.push(s.R);
    });
    await phase('3/3 · 정면을 보고 편하게 앉으세요', '체간 중립 자세를 측정합니다. 움직이지 마세요.', s => {
      if (s.torsoX != null) neutral.push(s.torsoX);
    });

    const avg = a => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : null);
    ['L', 'R'].forEach(k => {
      this._calib[k].max = avg(open[k]); this._calib[k].min = avg(fist[k]);
      if (this._calib[k].min == null || this._calib[k].max == null ||
          this._calib[k].max <= this._calib[k].min) {
        this._calib[k].min = 1.0; this._calib[k].max = 2.4; // 추정치 폴백
      }
    });
    this._calib.torsoNeutralX = avg(neutral);
    ui.hide();
  }

  _normalize(raw, k) {
    const c = this._calib[k];
    if (c.min == null || c.max == null) return 0.5;
    return Math.min(1, Math.max(0, (raw - c.min) / (c.max - c.min)));
  }

  update(now) {
    this._frame++;
    const handRes = this._hand.detectForVideo(this.videoEl, now);
    let poseRes;
    if (this._frame % PARAMS.POSE_EVERY_N_FRAMES === 0) {
      poseRes = this._pose.detectForVideo(this.videoEl, now);
      this._lastPose = poseRes;
    } else {
      poseRes = this._lastPose;
    }

    const snap = { L: null, R: null, torsoX: null };
    const seen = new Set();
    if (handRes?.landmarks) {
      handRes.landmarks.forEach((lm, idx) => {
        const handedness = handRes.handedness?.[idx]?.[0]?.categoryName;
        const k = handedness === 'Left' ? 'L' : 'R';
        seen.add(k);
        const h = this._hands[k];
        h.present = true;
        h.opennessRaw = computeOpenness(lm);
        h.openness = this._normalize(h.opennessRaw, k);
        snap[k] = h.opennessRaw;
        // 표시좌표 변환 (거울)
        const pos = { x: 1 - lm[0].x, y: lm[0].y };
        if (h.prevPos && h.prevT) {
          const dt = (now - h.prevT) / 1000;
          if (dt > 0) h.vy = -(pos.y - h.prevPos.y) / dt;
        }
        h.prevPos = { ...pos }; h.prevT = now;
        h.pos = pos;
        // 분류: 히스테리시스 + 디바운스
        let cand = 'NEUTRAL';
        if (h.openness >= PARAMS.OPEN_THRESH) cand = 'OPEN';
        else if (h.openness <= PARAMS.FIST_THRESH) cand = 'FIST';
        if (cand !== h.classCandidate) { h.classCandidate = cand; h.classSince = now; }
        if (cand !== 'NEUTRAL' && cand !== h.cls && now - h.classSince >= PARAMS.DEBOUNCE_MS) {
          h.cls = cand;
        }
      });
    }
    ['L', 'R'].forEach(k => { if (!seen.has(k)) this._hands[k].present = false; });

    if (poseRes?.landmarks?.[0]) {
      const pl = poseRes.landmarks[0];
      const ls = pl[11], rs = pl[12];
      if (ls && rs) {
        const midX = (ls.x + rs.x) / 2;
        const shoulderWidth = dist(ls, rs) || 1e-4;
        snap.torsoX = midX;
        if (this._calib.torsoNeutralX != null) {
          this._leanCam = (midX - this._calib.torsoNeutralX) / shoulderWidth;
        }
        this._roll = Math.atan2(rs.y - ls.y, rs.x - ls.x) * 180 / Math.PI;
      }
    }
    this._lastSnapshot = snap;

    // 교대 스트로크 검출 (스파이크 이식)
    let strokeEvent = false;
    ['L', 'R'].forEach(k => {
      const h = this._hands[k];
      if (!h.present) { h._justPeaked = false; return; }
      const sign = h.vy > PARAMS.STROKE_MIN_VY ? 1 : (h.vy < -PARAMS.STROKE_MIN_VY ? -1 : 0);
      if (sign !== 0 && sign !== h.lastPeakSign) {
        h.lastPeakT = now; h.lastPeakSign = sign; h._justPeaked = true;
      } else h._justPeaked = false;
    });
    if (this._hands.L._justPeaked || this._hands.R._justPeaked) {
      const dtPeaks = Math.abs(this._hands.L.lastPeakT - this._hands.R.lastPeakT);
      const bothFist = this._hands.L.cls === 'FIST' && this._hands.R.cls === 'FIST';
      if (dtPeaks > 0 && dtPeaks <= PARAMS.ALT_STROKE_WINDOW_MS && bothFist) strokeEvent = true;
    }

    const out = k => {
      const h = this._hands[k];
      return { present: h.present, openness: h.openness, cls: h.cls,
               pos: h.pos ? { ...h.pos } : null, vy: h.vy };
    };
    // 표시좌표 기준 lean: 카메라 x 반전이므로 부호 반전
    return { hands: { L: out('L'), R: out('R') }, lean: -this._leanCam, roll: this._roll, strokeEvent };
  }
}
