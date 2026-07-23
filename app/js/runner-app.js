/* 러너 엔진 — 페이즈 교대: 3인칭 항행 ↔ 거울 모드 스테이션 조작
   브리프 동결: 상호작용 2.5D(스냅·드롭존), 3D는 렌더링 전용, 물리엔진 없음, 실패 종결 없음.
   C2: 카메라 스트림은 온디바이스 소비만, 저장·전송 없음. 페이즈 전환 시 렌더링만 토글. */
import * as THREE from 'three';
import { PARAMS } from './params.js';
import { decodeSession, makeDemoSession, SEGMENT_LENGTHS, GRADING_DEFAULTS } from './session.js';
import { libMeta, PLACES } from './library-meta.js';
import { buildMesh } from './library-mesh.js';

/* ---------- DOM ---------- */
const stage = document.getElementById('stage');
const glcanvas = document.getElementById('glcanvas');
const videoWrap = document.getElementById('videoWrap');
const startOverlay = document.getElementById('startOverlay');
const startTitle = document.getElementById('startTitle');
const startDesc = document.getElementById('startDesc');
const btnStart = document.getElementById('btnStart');
const calibOverlay = document.getElementById('calibOverlay');
const calibTitle = document.getElementById('calibTitle');
const calibDesc = document.getElementById('calibDesc');
const calibCount = document.getElementById('calibCount');
const hud = document.getElementById('hud');
const hudInstruction = document.getElementById('hudInstruction');
const hudProgressFill = document.getElementById('hudProgressFill');
const hudStep = document.getElementById('hudStep');
const banner = document.getElementById('banner');
const fpsBadge = document.getElementById('fpsBadge');
const assistBadge = document.getElementById('assistBadge');
const fadeEl = document.getElementById('fade');
const placeChip = document.getElementById('placeChip');

/* ---------- 세션 로드 ---------- */
function loadSession() {
  const m = location.hash.match(/#s=([A-Za-z0-9_-]+)/);
  if (m) {
    try { return decodeSession(m[1]); }
    catch { /* 손상된 링크 → 데모 폴백 */ }
  }
  return makeDemoSession();
}
let session = loadSession();

function updateStartTexts() {
  startTitle.textContent = session.title || 'ADL 훈련 세션';
  const nSt = (session.flow || []).filter(f => f.type === 'station').length;
  const nSeg = (session.flow || []).filter(f => f.type === 'segment').length;
  const nX = (session.flow || []).filter(f => f.type === 'crossing').length;
  startDesc.textContent = `스테이션 ${nSt}개 · 이동 ${nSeg}개${nX ? ` · 횡단보도 ${nX}개` : ''} — 웹캠 앞에 앉아 시작을 눌러 주세요.`;
}

/* GLB 포함 세션은 링크로 못 옮기므로 JSON 파일 열기 경로 제공 */
document.getElementById('fileSession').addEventListener('change', async e => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    session = JSON.parse(await file.text());
    updateStartTexts();
  } catch {
    startDesc.textContent = '세션 파일을 읽을 수 없어요 — 에디터에서 저장한 .adl.json 파일인지 확인해 주세요.';
  }
  e.target.value = '';
});

/* ---------- 세션 리포트 (C2: 파생 수치만, 온디바이스, 로컬 다운로드) ----------
   A2 승격: 자동 기록은 치료사 동석 관찰의 '보조' — 화면 요약 + JSON/CSV 로컬 저장 */
const report = { startedAt: null, title: '', entries: [] };
function pushReportEntry(item, phase, ms) {
  const e = { type: item.type, title: item.title || '', place: item.place || '', ms: Math.round(ms) };
  Object.assign(e, phase.metrics || {});
  report.entries.push(e);
}

/* ---------- 오디오 (합성음만 — 외부 자산 없음) ---------- */
let actx = null;
function audio() { if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)(); return actx; }
function tone(freq, dur = 0.15, type = 'sine', gain = 0.12, delay = 0) {
  const a = audio();
  const o = a.createOscillator(), g = a.createGain();
  o.type = type; o.frequency.value = freq;
  g.gain.setValueAtTime(gain, a.currentTime + delay);
  g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + delay + dur);
  o.connect(g).connect(a.destination);
  o.start(a.currentTime + delay); o.stop(a.currentTime + delay + dur);
}
const sfx = {
  grab: () => tone(520, 0.1, 'triangle', 0.15),
  drop: () => { tone(660, 0.12, 'sine'); tone(880, 0.18, 'sine', 0.12, 0.09); },
  stationDone: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.25, 'sine', 0.14, i * 0.12)),
  stroke: () => tone(220 + Math.random() * 40, 0.08, 'triangle', 0.07),
  assist: () => tone(392, 0.3, 'sine', 0.08),
  greenLight: () => [784, 988, 1175].forEach((f, i) => tone(f, 0.15, 'sine', 0.13, i * 0.1)), // 보행 신호 음향 신호기
  blinkTick: () => tone(1046, 0.06, 'square', 0.06),
  redStop: () => tone(330, 0.35, 'sine', 0.1),
};

/* ---------- 렌더러 ---------- */
const renderer = new THREE.WebGLRenderer({ canvas: glcanvas, alpha: true, antialias: true });
renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
function stageAspect() { return stage.clientWidth / stage.clientHeight; }
function resize() {
  renderer.setSize(stage.clientWidth, stage.clientHeight, false);
  navCam.aspect = stageAspect(); navCam.updateProjectionMatrix();
  const h = 1 / stageAspect();
  stCam.top = 0; stCam.bottom = -h; stCam.left = 0; stCam.right = 1;
  stCam.updateProjectionMatrix();
}
window.addEventListener('resize', resize);

/* ---------- 항행 씬 ---------- */
const navScene = new THREE.Scene();
navScene.background = new THREE.Color('#87b5e0');
navScene.fog = new THREE.Fog('#87b5e0', 20, 90);
const navCam = new THREE.PerspectiveCamera(55, 16 / 9, 0.1, 200);
{
  navScene.add(new THREE.HemisphereLight('#ffffff', '#6b7f5e', 1.0));
  const sun = new THREE.DirectionalLight('#fff4d6', 1.2);
  sun.position.set(5, 12, 4);
  navScene.add(sun);
}
/* 항행 테마 — 마을 공간별 바닥·프롭 팔레트 */
const THEMES = {
  hall:     { floor: '#c9b896', propA: '#ed8936', propB: '#48bb78', trees: true },
  street:   { floor: '#9aa5b1', propA: '#ed8936', propB: '#48bb78', trees: true },
  park:     { floor: '#8fbf7f', propA: '#b7791f', propB: '#2f855a', trees: true },
  school:   { floor: '#d9cba8', propA: '#4299e1', propB: '#2b6cb0', trees: false }, // 사물함 복도
  market:   { floor: '#e0d5bd', propA: '#e53e3e', propB: '#ecc94b', trees: false }, // 마트 통로 선반
  elevator: { floor: '#b6bcc7', propA: '#8b93a7', propB: '#718096', trees: false },
};

function buildNavCourse(segment) {
  const g = new THREE.Group();
  const len = SEGMENT_LENGTHS[segment.length] || 24;
  const theme = THEMES[segment.theme] || THEMES.hall;
  const floorColor = theme.floor;
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(12, len + 40),
    new THREE.MeshStandardMaterial({ color: floorColor, roughness: 1 })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.z = -(len / 2);
  g.add(floor);
  // 진행감을 위한 차선 마커
  for (let z = 0; z < len; z += 3) {
    const bar = new THREE.Mesh(
      new THREE.BoxGeometry(0.25, 0.02, 1.2),
      new THREE.MeshStandardMaterial({ color: '#f7fafc' })
    );
    bar.position.set(0, 0.011, -z - 1);
    g.add(bar);
  }
  // 양측 패럴랙스 프롭 (테마별: 나무/상자 또는 선반·사물함형 기둥)
  for (let z = 2; z < len; z += 4) {
    [-1, 1].forEach(side => {
      const alt = (Math.floor(z / 4) + (side > 0 ? 1 : 0)) % 2 === 0;
      let prop;
      if (theme.trees && alt) {
        prop = new THREE.Mesh(new THREE.ConeGeometry(0.8, 2.4, 8),
          new THREE.MeshStandardMaterial({ color: theme.propB }));
        prop.position.set(side * (4.5 + (z % 3) * 0.4), 1.2, -z);
      } else {
        const tall = !theme.trees; // 실내 테마는 키 큰 선반·사물함 느낌
        prop = new THREE.Mesh(new THREE.BoxGeometry(1.2, tall ? 2.6 : 1.6, 1.2),
          new THREE.MeshStandardMaterial({ color: alt ? theme.propB : theme.propA }));
        prop.position.set(side * (tall ? 4.0 : 4.5 + (z % 3) * 0.4), tall ? 1.3 : 0.8, -z);
      }
      g.add(prop);
    });
  }
  // 도착 게이트
  const gate = new THREE.Group();
  const gm = new THREE.MeshStandardMaterial({ color: '#4fd1c5' });
  const p1 = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 3), gm);
  const p2 = p1.clone(); p1.position.set(-2, 1.5, 0); p2.position.set(2, 1.5, 0);
  const top = new THREE.Mesh(new THREE.BoxGeometry(4.3, 0.3, 0.3), gm);
  top.position.set(0, 3, 0);
  gate.add(p1, p2, top);
  gate.position.z = -len;
  g.add(gate);
  return { group: g, length: len };
}

function buildAvatar() {
  const g = new THREE.Group();
  const skin = new THREE.MeshStandardMaterial({ color: '#4fd1c5' });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.35, 0.7, 4, 12), skin);
  body.position.y = 0.9;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.28, 16, 12),
    new THREE.MeshStandardMaterial({ color: '#fbd38d' }));
  head.position.y = 1.75;
  const armMat = new THREE.MeshStandardMaterial({ color: '#38a89d' });
  const armL = new THREE.Mesh(new THREE.CapsuleGeometry(0.1, 0.5, 4, 8), armMat);
  const armR = armL.clone();
  armL.position.set(-0.5, 1.1, 0); armR.position.set(0.5, 1.1, 0);
  g.add(body, head, armL, armR);
  g.userData = { armL, armR };
  return g;
}
const avatar = buildAvatar();
navScene.add(avatar);

/* ---------- 스테이션 씬 (거울 모드, 2.5D 판정) ---------- */
const stScene = new THREE.Scene();
const stCam = new THREE.OrthographicCamera(0, 1, 0, -0.5625, 0.1, 10);
stCam.position.z = 3;
{
  stScene.add(new THREE.AmbientLight('#ffffff', 0.9));
  const d = new THREE.DirectionalLight('#ffffff', 1.1);
  d.position.set(0.3, 0.5, 2);
  stScene.add(d);
}
function toWorld(nx, ny) { return { x: nx, y: -ny / stageAspect() }; }

function makeHandCursor() {
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.028, 0.006, 8, 24),
    new THREE.MeshBasicMaterial({ color: '#e7e9ee' })
  );
  ring.position.z = 0.5;
  ring.visible = false;
  stScene.add(ring);
  return ring;
}
const cursors = { L: makeHandCursor(), R: makeHandCursor() };
const CLS_COLORS = { OPEN: 0x68d391, FIST: 0xfc8181, NEUTRAL: 0xe7e9ee };

/* 성공 파티클 */
const particles = [];
function burst(nx, ny, color = 0xffd76e) {
  const geo = new THREE.BufferGeometry();
  const n = 26;
  const pos = new Float32Array(n * 3), vel = [];
  const w = toWorld(nx, ny);
  for (let i = 0; i < n; i++) {
    pos.set([w.x, w.y, 0.6], i * 3);
    const a = Math.random() * Math.PI * 2, sp = 0.1 + Math.random() * 0.25;
    vel.push([Math.cos(a) * sp, Math.sin(a) * sp]);
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const pts = new THREE.Points(geo, new THREE.PointsMaterial({ color, size: 0.014, transparent: true }));
  stScene.add(pts);
  particles.push({ pts, vel, life: 1 });
}
function updateParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.life -= dt * 1.2;
    const arr = p.pts.geometry.attributes.position.array;
    for (let j = 0; j < p.vel.length; j++) {
      arr[j * 3] += p.vel[j][0] * dt;
      arr[j * 3 + 1] += p.vel[j][1] * dt - 0.08 * dt;
    }
    p.pts.geometry.attributes.position.needsUpdate = true;
    p.pts.material.opacity = Math.max(0, p.life);
    if (p.life <= 0) { stScene.remove(p.pts); particles.splice(i, 1); }
  }
}

/* ---------- 페이즈: 항행 ---------- */
class NavPhase {
  constructor(segment) {
    this.segment = segment;
    const course = buildNavCourse(segment);
    this.course = course.group;
    this.length = course.length;
    navScene.add(this.course);
    this.travelled = 0; this.speed = 0; this.x = 0;
    this.armPhase = 0;
    this.done = false;
    this.metrics = { strokes: 0 };
    avatar.position.set(0, 0, 0);
    hudStep.textContent = '';
    videoWrap.classList.add('hidden'); // 렌더링만 토글 — 스트림은 유지 (브리프 A7)
    hudInstruction.textContent =
      segment.theme === 'elevator' ? '🛗 엘리베이터를 타고 내려가요'
      : segment.level === 0 ? '앞으로 가요!'
      : segment.level === 1 ? '양손을 번갈아 저어 앞으로 가요!'
      : '양손을 번갈아 젓고, 몸을 기울여 방향을 바꿔요!';
  }
  update(input, dt) {
    const lv = this.segment.level;
    if (lv === 0) {
      this.speed = 5;
    } else {
      if (input.strokeEvent) {
        this.speed = Math.min(8, this.speed + 2.4);
        this.armPhase += Math.PI;
        this.metrics.strokes++;
        sfx.stroke();
      }
      this.speed *= Math.pow(0.5, dt / 1.1); // 임펄스 감쇠 (퐁퐁 물리 차용)
    }
    if (lv === 2) {
      const lean = Math.abs(input.lean) < PARAMS.LEAN_DEADZONE ? 0 : input.lean;
      this.x = Math.min(3, Math.max(-3, this.x + lean * 5 * dt));
    } else {
      this.x *= Math.pow(0.5, dt / 0.8); // 자동 복귀
    }
    this.travelled += this.speed * dt;

    avatar.position.set(this.x, 0, -this.travelled);
    const swing = Math.sin(performance.now() / 1000 * 6) * Math.min(1, this.speed / 4) * 0.6;
    avatar.userData.armL.rotation.x = swing;
    avatar.userData.armR.rotation.x = -swing;
    navCam.position.set(this.x * 0.7, 2.4, -this.travelled + 6);
    navCam.lookAt(this.x, 1, -this.travelled - 4);

    hudProgressFill.style.width = `${Math.min(100, this.travelled / this.length * 100)}%`;
    if (this.travelled >= this.length) this.done = true;
  }
  render() { renderer.render(navScene, navCam); }
  dispose() { navScene.remove(this.course); }
}

/* ---------- 페이즈: 횡단보도 (2차선 도로 + 보행 신호등) ----------
   실패 종결 없음: 빨간불엔 연석에서 전진이 잠길 뿐이고,
   건너는 중 신호가 바뀌면 차량이 정지선에서 기다린다. */
const XW = {
  CURB: -9.6,       // 연석 (여기서 멈춤)
  ROAD_A: -10,      // 도로 시작
  LANE1: -11.5, LANE2: -14.5,
  ROAD_B: -16,      // 도로 끝
  GOAL: -21,        // 건너편 마트 앞
  LEN: 21,
  STOPLINE: 5,      // 차량 정지선 |x|
};

function buildCrossingCourse() {
  const g = new THREE.Group();
  const std = c => new THREE.MeshStandardMaterial({ color: c });
  // 인도 (출발측·건너편)
  const walkA = new THREE.Mesh(new THREE.PlaneGeometry(12, 12), std('#c3c9d4'));
  walkA.rotation.x = -Math.PI / 2; walkA.position.z = XW.ROAD_A / 2 + 1;
  const walkB = new THREE.Mesh(new THREE.PlaneGeometry(12, 14), std('#c3c9d4'));
  walkB.rotation.x = -Math.PI / 2; walkB.position.z = XW.ROAD_B - 7;
  // 2차선 도로
  const road = new THREE.Mesh(new THREE.PlaneGeometry(64, XW.ROAD_A - XW.ROAD_B), std('#3d434f'));
  road.rotation.x = -Math.PI / 2; road.position.set(0, 0.001, (XW.ROAD_A + XW.ROAD_B) / 2);
  g.add(walkA, walkB, road);
  // 중앙선 (점선)
  for (let x = -30; x < 30; x += 3) {
    const dash = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.02, 0.18), std('#ecc94b'));
    dash.position.set(x, 0.012, (XW.LANE1 + XW.LANE2) / 2);
    g.add(dash);
  }
  // 횡단보도 (얼룩말 줄무늬)
  for (let z = XW.ROAD_A - 0.6; z > XW.ROAD_B + 0.3; z -= 1.2) {
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.02, 0.65), std('#f7fafc'));
    stripe.position.set(0, 0.014, z);
    g.add(stripe);
  }
  // 보행 신호등 (건너편 우측 — 실제 배치처럼 마주 봄)
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 3.4), std('#4a5568'));
  pole.position.set(2.9, 1.7, XW.ROAD_B - 0.8);
  const housing = new THREE.Mesh(new THREE.BoxGeometry(0.7, 1.3, 0.35), std('#1a202c'));
  housing.position.set(2.9, 3.2, XW.ROAD_B - 0.8);
  const redLamp = new THREE.Mesh(new THREE.CircleGeometry(0.22, 16),
    new THREE.MeshStandardMaterial({ color: '#fc8181', emissive: '#e53e3e', emissiveIntensity: 1.2 }));
  redLamp.position.set(2.9, 3.5, XW.ROAD_B - 0.6);
  const greenLamp = new THREE.Mesh(new THREE.CircleGeometry(0.22, 16),
    new THREE.MeshStandardMaterial({ color: '#68d391', emissive: '#2f855a', emissiveIntensity: 0 }));
  greenLamp.position.set(2.9, 2.9, XW.ROAD_B - 0.6);
  g.add(pole, housing, redLamp, greenLamp);
  // 건너편 마트 파사드
  const mart = new THREE.Group();
  const wall = new THREE.Mesh(new THREE.BoxGeometry(14, 5, 1), std('#f6e05e'));
  wall.position.y = 2.5;
  const door = new THREE.Mesh(new THREE.BoxGeometry(2.4, 3, 1.06), std('#2b6cb0'));
  door.position.set(0, 1.5, 0.02);
  const awning = new THREE.Mesh(new THREE.BoxGeometry(6, 0.3, 1.6), std('#e53e3e'));
  awning.position.set(0, 3.4, 0.8);
  mart.add(wall, door, awning);
  mart.position.z = XW.GOAL - 2.5;
  g.add(mart);
  // 차량 (차선별 2대)
  const cars = [];
  const carColors = ['#e53e3e', '#4299e1', '#ecc94b', '#9f7aea'];
  [[XW.LANE1, 1], [XW.LANE2, -1]].forEach(([lane, dir], li) => {
    for (let i = 0; i < 2; i++) {
      const car = new THREE.Group();
      const body = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.7, 1.3), std(carColors[li * 2 + i]));
      body.position.y = 0.55;
      const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.55, 1.15), std('#cbd5e0'));
      cabin.position.set(-0.2 * dir, 1.1, 0);
      car.add(body, cabin);
      [-0.8, 0.8].forEach(wx => [-0.55, 0.55].forEach(wz => {
        const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.2, 12), std('#1a202c'));
        wheel.rotation.x = Math.PI / 2; wheel.position.set(wx, 0.28, wz);
        car.add(wheel);
      }));
      car.position.set(dir > 0 ? -14 - i * 16 : 14 + i * 16, 0, lane);
      g.add(car);
      cars.push({ mesh: car, dir, speed: 10 + i * 1.5 });
    }
  });
  return { group: g, redLamp, greenLamp, cars };
}

class CrossingPhase {
  constructor(crossing) {
    this.def = crossing;
    const built = buildCrossingCourse();
    this.course = built.group;
    this.redLamp = built.redLamp;
    this.greenLamp = built.greenLamp;
    this.cars = built.cars;
    navScene.add(this.course);
    this.z = 0; this.x = 0; this.speed = 0;
    this.startT = performance.now();
    this.light = 'red'; this._prevLight = null;
    this._blinkOn = true; this._lastBlinkT = 0;
    this.crossingStarted = false;
    this.done = false;
    this._hudMsg = '';
    this.metrics = { strokes: 0, redBlockedPushes: 0, waitMs: 0, crossMs: 0 };
    this._curbArriveT = null; this._crossStartT = null; this._crossEndT = null;
    avatar.position.set(0, 0, 0);
    hudStep.textContent = '';
    videoWrap.classList.add('hidden');
  }

  lightState(now) {
    const redMs = (this.def.redS ?? 7) * 1000;
    const greenMs = (this.def.greenS ?? 9) * 1000;
    const blinkMs = 3000;
    const t = (now - this.startT) % (redMs + greenMs + blinkMs);
    if (t < redMs) return 'red';
    if (t < redMs + greenMs) return 'green';
    return 'blink';
  }

  setHud(msg) {
    if (msg !== this._hudMsg) { this._hudMsg = msg; hudInstruction.textContent = msg; }
  }

  update(input, dt) {
    const now = performance.now();
    const lv = this.def.level ?? 2;
    const light = this.lightState(now);
    if (light !== this._prevLight) {
      if (light === 'green') sfx.greenLight();
      if (light === 'red') sfx.redStop();
      this._prevLight = light;
    }
    this.light = light;

    // 신호등 램프 표시 (깜빡임 포함)
    if (light === 'blink' && now - this._lastBlinkT > 400) {
      this._blinkOn = !this._blinkOn; this._lastBlinkT = now;
      if (this._blinkOn) sfx.blinkTick();
    }
    this.redLamp.material.emissiveIntensity = light === 'red' ? 1.2 : 0;
    this.greenLamp.material.emissiveIntensity =
      light === 'green' ? 1.2 : (light === 'blink' && this._blinkOn ? 1.2 : 0);

    // 구역 판정
    const inRoad = this.z <= XW.CURB && this.z > XW.ROAD_B;
    const beforeCurb = this.z > XW.CURB;

    // 전진 허용 규칙
    let canMove = true;
    let hint = null;
    if (beforeCurb) {
      canMove = true;
      hint = '횡단보도까지 걸어가요';
    } else if (!this.crossingStarted) {
      if (this._curbArriveT == null) this._curbArriveT = now;
      // 연석: 초록불에만 출발 (깜빡일 때는 다음 신호를 기다려요 — 보행 교육 원칙)
      if (light === 'green') {
        this.crossingStarted = true;
        this._crossStartT = now;
        this.metrics.waitMs = Math.round(now - this._curbArriveT);
      } else {
        canMove = false;
        if (input.strokeEvent) this.metrics.redBlockedPushes++; // 신호 대기 중 출발 시도 (관찰 지표)
        hint = light === 'red' ? '🔴 빨간불! 멈춰서 기다려요'
                               : '🟢 깜빡깜빡 — 다음 초록불을 기다려요';
      }
    }
    if (this.crossingStarted && inRoad) {
      if (light === 'red') {
        hint = '차들이 기다려 줘요 — 끝까지 건너가요';
      } else if (light === 'blink') {
        hint = '깜빡여요 — 서둘러 건너요!';
      } else {
        hint = '🟢 초록불! 좌우를 살피며 건너가요';
      }
    } else if (this.crossingStarted && !inRoad && !beforeCurb) {
      hint = '다 건넜어요! 마트로 가요';
    }
    this.setHud(hint || '');

    // 이동 (항행과 동일한 임펄스 물리, 조향 없음 — 직진 훈련)
    if (lv === 0) {
      this.speed = canMove ? 4 : 0;
    } else {
      if (canMove && input.strokeEvent) {
        this.speed = Math.min(8, this.speed + 2.4);
        this.metrics.strokes++;
        sfx.stroke();
      }
      if (!canMove) this.speed = 0;
      this.speed *= Math.pow(0.5, dt / 1.1);
    }
    let nz = this.z - this.speed * dt;
    // 연석 클램프: 출발 허가 전에는 연석을 넘지 못함
    if (!this.crossingStarted && nz < XW.CURB) nz = XW.CURB;
    this.z = nz;
    this.x *= Math.pow(0.5, dt / 0.8); // 중앙 복귀

    // 차량: 보행 빨간불(차량 초록)일 때 주행, 그 외엔 정지선 대기
    for (const car of this.cars) {
      const m = car.mesh;
      const nearStop = car.dir > 0 ? m.position.x < -XW.STOPLINE : m.position.x > XW.STOPLINE;
      const insideCross = Math.abs(m.position.x) < XW.STOPLINE;
      const mayDrive = light === 'red' || insideCross; // 이미 건널목 안이면 빠져나감
      if (mayDrive || !nearStop) {
        let nx = m.position.x + car.dir * car.speed * dt;
        if (light !== 'red' && nearStop) {
          // 정지선 클램프
          nx = car.dir > 0 ? Math.min(nx, -XW.STOPLINE) : Math.max(nx, XW.STOPLINE);
        }
        m.position.x = nx;
        if (car.dir > 0 && m.position.x > 32) m.position.x = -32;
        if (car.dir < 0 && m.position.x < -32) m.position.x = 32;
      }
    }

    // 아바타·카메라
    avatar.position.set(this.x, 0, this.z);
    const swing = Math.sin(now / 1000 * 6) * Math.min(1, this.speed / 4) * 0.6;
    avatar.userData.armL.rotation.x = swing;
    avatar.userData.armR.rotation.x = -swing;
    navCam.position.set(this.x * 0.7, 2.4, this.z + 6);
    navCam.lookAt(this.x, 1, this.z - 4);

    if (this._crossStartT && !this._crossEndT && this.z <= XW.ROAD_B) {
      this._crossEndT = now;
      this.metrics.crossMs = Math.round(now - this._crossStartT);
    }

    hudProgressFill.style.width = `${Math.min(100, (-this.z) / XW.LEN * 100)}%`;
    if (this.z <= XW.GOAL) this.done = true;
  }

  render() { renderer.render(navScene, navCam); }
  dispose() { navScene.remove(this.course); }
}

/* ---------- 장소(place) 데코 — 스테이션·고르기 공용 ---------- */
function applyPlaceDecor(root, station) {
  const place = PLACES[station.place];
  if (!place || station.place === 'none') return;
  placeChip.textContent = `${place.emoji} ${place.name}`;
  placeChip.style.background = place.color;
  placeChip.classList.remove('hidden');
  const h = 1 / stageAspect();
  const decoMat = new THREE.MeshStandardMaterial({ color: place.color, transparent: true, opacity: 0.8 });
  const counter = new THREE.Mesh(new THREE.BoxGeometry(1.06, 0.05, 0.16), decoMat);
  counter.position.set(0.5, -h + 0.035, 0.02);
  const pillarL = new THREE.Mesh(new THREE.BoxGeometry(0.05, h * 0.85, 0.1), decoMat);
  pillarL.position.set(0.025, -h / 2, 0.02);
  const pillarR = pillarL.clone();
  pillarR.position.x = 0.975;
  root.add(counter, pillarL, pillarR);
  if (!driver?.videoEl) {
    videoWrap.style.background = `linear-gradient(160deg, #141a26, ${place.color}44)`;
  }
}

/* ---------- 라벨·카드 텍스처 (외부 자산 없음 — 캔버스 합성) ---------- */
function makeLabelSprite(text, { fg = '#08201d', bg = '#ffffffee' } = {}) {
  const cv = document.createElement('canvas');
  cv.width = 256; cv.height = 96;
  const x = cv.getContext('2d');
  x.fillStyle = bg;
  x.beginPath(); x.roundRect(4, 4, 248, 88, 24); x.fill();
  x.fillStyle = fg;
  x.font = 'bold 44px -apple-system, "Malgun Gothic", sans-serif';
  x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText(text, 128, 52);
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cv), depthTest: false }));
  sp.scale.set(0.09, 0.034, 1);
  return sp;
}

function makeCardTexture(opt, state = 'idle') {
  const cv = document.createElement('canvas');
  cv.width = 256; cv.height = 320;
  const x = cv.getContext('2d');
  const bg = state === 'correct' ? '#2f6b4f' : state === 'wrong' ? '#6b2f2f' : '#242938';
  x.fillStyle = bg;
  x.beginPath(); x.roundRect(6, 6, 244, 308, 26); x.fill();
  x.strokeStyle = state === 'assist' ? '#4fd1c5' : '#3a4154';
  x.lineWidth = state === 'assist' ? 10 : 5;
  x.beginPath(); x.roundRect(6, 6, 244, 308, 26); x.stroke();
  x.textAlign = 'center'; x.textBaseline = 'middle';
  x.font = '110px sans-serif';
  x.fillText(opt.emoji || '▫️', 128, 120);
  x.fillStyle = '#e7e9ee';
  const label = opt.label || '';
  x.font = `bold ${label.length > 5 ? 40 : 52}px -apple-system, "Malgun Gothic", sans-serif`;
  x.fillText(label, 128, 245);
  return new THREE.CanvasTexture(cv);
}

/* ---------- 페이즈: 고르기 (선택 패널 — 키오스크·정류장·길찾기) ----------
   선택 = OPEN 손을 카드 위에 dwellMs 동안 머무르기 (도달 + 유지 훈련).
   오답 = 흔들림 + 기록만 (실패 아님). assist: 정답 강조 → 오답 흐리게. */
class SelectPhase {
  constructor(station) {
    this.station = station;
    this.grading = { dwellMs: 900, assistTimeoutS: 20, ...(station.grading || {}) };
    this.root = new THREE.Group();
    stScene.add(this.root);
    this.stepIdx = 0;
    this.done = false;
    this.assistLevel = 0;
    this.stepStartT = performance.now();
    this.metrics = { steps: (station.steps || []).length, wrongSelects: 0, assistLevel: 0, stars: 0 };
    this.dwell = { card: null, start: 0 };
    this._advanceAt = 0;
    applyPlaceDecor(this.root, station);
    videoWrap.classList.remove('hidden');
    this.cards = [];
    this.buildStep();
  }

  buildStep() {
    this.cards.forEach(c => this.root.remove(c.mesh, c.ring));
    this.cards = [];
    const step = this.station.steps[this.stepIdx];
    hudInstruction.textContent = step.prompt;
    hudStep.textContent = `${this.stepIdx + 1} / ${this.station.steps.length}`;
    hudProgressFill.style.width = `${this.stepIdx / this.station.steps.length * 100}%`;
    const n = step.options.length;
    const W = 0.17, H = 0.21; // 월드(x-정규화) 단위 카드 크기
    const h = 1 / stageAspect();
    step.options.forEach((opt, i) => {
      const cx = 0.5 + (i - (n - 1) / 2) * (W + 0.05);
      const cy = -h * 0.52;
      const tex = makeCardTexture(opt);
      const mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(W, H),
        new THREE.MeshBasicMaterial({ map: tex, transparent: true })
      );
      mesh.position.set(cx, cy, 0.3);
      // dwell 진행 링
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.02, 0.03, 24, 1, 0, 0.001),
        new THREE.MeshBasicMaterial({ color: '#4fd1c5', side: THREE.DoubleSide })
      );
      ring.position.set(cx, cy + H / 2 + 0.03, 0.35);
      ring.visible = false;
      this.root.add(mesh, ring);
      this.cards.push({ opt, mesh, ring, cx, cy, W, H, state: 'idle', shakeT: 0 });
    });
    this.stepStartT = performance.now();
    this.assistLevel = 0;
    assistBadge.classList.add('hidden');
  }

  setCardState(card, state) {
    card.state = state;
    card.mesh.material.map = makeCardTexture(card.opt, state);
    card.mesh.material.needsUpdate = true;
  }

  update(input, dt) {
    const now = performance.now();
    if (this._advanceAt) {
      if (now >= this._advanceAt) {
        this._advanceAt = 0;
        this.stepIdx++;
        if (this.stepIdx >= this.station.steps.length) this.complete();
        else this.buildStep();
      }
      updateParticles(dt);
      return;
    }

    // assist 에스컬레이션 (스텝 기준)
    const elapsedS = (now - this.stepStartT) / 1000;
    const newAssist = elapsedS > this.grading.assistTimeoutS * 2 ? 2
      : elapsedS > this.grading.assistTimeoutS ? 1 : 0;
    if (newAssist !== this.assistLevel) {
      this.assistLevel = newAssist;
      this.metrics.assistLevel = Math.max(this.metrics.assistLevel, newAssist);
      assistBadge.textContent = '도움: 정답을 알려줄게요';
      assistBadge.classList.remove('hidden');
      sfx.assist();
      this.cards.forEach(c => {
        if (c.opt.correct && newAssist >= 1) this.setCardState(c, 'assist');
        if (!c.opt.correct && newAssist >= 2) { c.mesh.material.opacity = 0.35; }
      });
    }

    // 손 커서 + dwell 판정 (OPEN 손만 — 가리키기)
    let hover = null;
    ['L', 'R'].forEach(k => {
      const hand = input.hands[k];
      const cur = cursors[k];
      if (hand.present && hand.pos) {
        const w = toWorld(hand.pos.x, hand.pos.y);
        cur.position.set(w.x, w.y, 0.5);
        cur.visible = true;
        cur.material.color.setHex(CLS_COLORS[hand.cls] || CLS_COLORS.NEUTRAL);
        if (hand.cls === 'OPEN' && !hover) {
          hover = this.cards.find(c =>
            Math.abs(w.x - c.cx) <= c.W / 2 && Math.abs(w.y - c.cy) <= c.H / 2) || null;
        }
      } else {
        cur.visible = false;
      }
    });

    if (hover) {
      if (this.dwell.card !== hover) { this.dwell = { card: hover, start: now }; }
      const p = Math.min(1, (now - this.dwell.start) / this.grading.dwellMs);
      hover.ring.visible = true;
      hover.ring.geometry.dispose();
      hover.ring.geometry = new THREE.RingGeometry(0.02, 0.03, 24, 1, Math.PI / 2, -p * Math.PI * 2);
      if (p >= 1) this.selectCard(hover, now);
    } else {
      if (this.dwell.card) this.dwell.card.ring.visible = false;
      this.dwell = { card: null, start: 0 };
    }

    // 오답 흔들림 애니메이션
    this.cards.forEach(c => {
      if (c.shakeT > 0) {
        c.shakeT -= dt;
        c.mesh.position.x = c.cx + Math.sin(now / 25) * 0.008 * Math.max(0, c.shakeT);
        if (c.shakeT <= 0) c.mesh.position.x = c.cx;
      }
    });
    updateParticles(dt);
  }

  selectCard(card, now) {
    this.dwell = { card: null, start: 0 };
    card.ring.visible = false;
    if (card.opt.correct) {
      this.setCardState(card, 'correct');
      sfx.drop();
      burst(card.cx, -card.cy * stageAspect());
      this._advanceAt = now + 900;
    } else {
      this.metrics.wrongSelects++;
      this.setCardState(card, 'wrong');
      card.shakeT = 1;
      tone(294, 0.25, 'sine', 0.1); tone(262, 0.3, 'sine', 0.1, 0.15);
      setTimeout(() => { if (card.state === 'wrong') this.setCardState(card, 'idle'); }, 900);
    }
  }

  complete() {
    this.done = true;
    this.metrics.stars = Math.max(1, 3 - this.metrics.assistLevel);
    hudProgressFill.style.width = '100%';
    sfx.stationDone();
    banner.textContent = `${'⭐'.repeat(this.metrics.stars)} 참 잘했어요!`;
    banner.classList.remove('hidden');
  }

  render() { renderer.render(stScene, stCam); }
  dispose() {
    stScene.remove(this.root);
    cursors.L.visible = false; cursors.R.visible = false;
    banner.classList.add('hidden');
    assistBadge.classList.add('hidden');
    placeChip.classList.add('hidden');
    videoWrap.style.background = '';
  }
}

/* ---------- 페이즈: 스테이션 (거울 조작) ---------- */
function makeHandFSM() {
  return { fsm: 'LOCKED', carry: null, openHoldStart: null, lossStart: null };
}

class StationPhase {
  constructor(station) {
    this.station = station;
    this.grading = { ...GRADING_DEFAULTS, ...(station.grading || {}) };
    this.root = new THREE.Group();
    stScene.add(this.root);
    this.assistLevel = 0;
    this.startT = performance.now();
    this.done = false;
    this.metrics = { graspAttempts: 0, graspFails: 0, releases: 0, misplaced: 0,
                     wrongItem: 0, trackLosses: 0, assistLevel: 0, stars: 0, budgetOvers: 0 };
    this.budget = station.budget > 0 ? station.budget : 0;
    this.requiredCount = station.requiredCount > 0 ? station.requiredCount : 0;

    // 타깃 (드롭존)
    const t = station.target;
    this.target = { def: t, mesh: buildMesh(t.lib, t.scale || 1, session.assets) };
    const tw = toWorld(t.pos[0], t.pos[1]);
    this.target.mesh.position.set(tw.x, tw.y, 0);
    this.root.add(this.target.mesh);
    this.zoneRing = new THREE.Mesh(
      new THREE.RingGeometry(t.zoneRadius * 0.94, t.zoneRadius, 40),
      new THREE.MeshBasicMaterial({ color: '#4fd1c5', transparent: true, opacity: 0.55, side: THREE.DoubleSide })
    );
    this.zoneRing.position.set(tw.x, tw.y, 0.05);
    this.root.add(this.zoneRing);

    // 잡기 아이템
    this.items = (station.items || []).map((def, i) => {
      const mesh = buildMesh(def.lib, def.scale || 1, session.assets);
      const w = toWorld(def.pos[0], def.pos[1]);
      mesh.position.set(w.x, w.y, 0.1);
      // 예산 스테이션: 가격표 부착 (셀프 계산대 훈련)
      if (this.budget && def.price > 0) {
        const tag = makeLabelSprite(`${def.price.toLocaleString()}원`);
        tag.position.set(0, libMeta(def.lib, session.assets).size * (def.scale || 1) + 0.035, 0.2);
        mesh.add(tag);
      }
      this.root.add(mesh);
      return {
        id: i, def, mesh,
        nx: def.pos[0], ny: def.pos[1],
        state: 'free', // free | carried | placed | floating
        heldBy: null, bobT: Math.random() * 6,
      };
    });
    this.handFSM = { L: makeHandFSM(), R: makeHandFSM() };

    applyPlaceDecor(this.root, station);

    videoWrap.classList.remove('hidden'); // 거울 모드: 영상 표시
    hudInstruction.textContent = station.instruction || station.title;
    this.updateHudStep();
  }

  spentBudget() {
    return this.items.filter(i => i.state === 'placed').reduce((s, i) => s + (i.def.price || 0), 0);
  }

  goalCount() {
    const goals = this.items.filter(i => !i.def.distractor).length;
    return this.requiredCount ? Math.min(this.requiredCount, goals) : goals;
  }

  updateHudStep() {
    // 방해 자극(distractor)은 목표 수에 포함하지 않음
    const placed = this.items.filter(i => !i.def.distractor && i.state === 'placed').length;
    const need = this.goalCount();
    let txt = `${placed} / ${need}`;
    if (this.budget) txt += ` · 💰 ${this.spentBudget().toLocaleString()} / ${this.budget.toLocaleString()}원`;
    hudStep.textContent = txt;
    hudProgressFill.style.width = `${need ? Math.min(1, placed / need) * 100 : 100}%`;
  }

  radiusScale() { return this.assistLevel >= 1 ? PARAMS.ASSIST_SCALE : 1; }

  graspRadiusOf(it, pad = 1) {
    const meta = libMeta(it.def.lib, session.assets);
    return (this.grading.graspRadius + meta.size * (it.def.scale || 1) * 0.5) * this.radiusScale() * pad;
  }

  findGraspTarget(k, pos) {
    let best = null, bestD = Infinity;
    for (const it of this.items) {
      if (it.state === 'carried') continue;
      // 예산 스테이션: 담은 것도 다시 꺼낼 수 있음 (셀프 계산대 '빼기' — 조합 재선택 훈련)
      if (it.state === 'placed' && !this.budget) continue;
      if (it.def.hand === 'both') continue; // 양손 과제는 한 손으로 못 듦
      if (it.def.hand && it.def.hand !== 'any' && it.def.hand !== k) continue;
      const d = Math.hypot(pos.x - it.nx, pos.y - it.ny);
      if (d <= this.graspRadiusOf(it) && d < bestD) { best = it; bestD = d; }
    }
    return best;
  }

  nearBothItem(pos) {
    return this.items.some(it =>
      it.def.hand === 'both' && (it.state === 'free' || it.state === 'floating') &&
      Math.hypot(pos.x - it.nx, pos.y - it.ny) <= this.graspRadiusOf(it, 1.3));
  }

  /* 양손 과제: 두 주먹이 모두 반경 안 → 함께 들기.
     R1(직전 OPEN)은 양손 과제에 한해 완화 — 두 손 동시 조건 자체가 상위 난도 */
  tryBimanualGrasp(input) {
    const L = input.hands.L, R = input.hands.R;
    if (!(L.present && R.present && L.cls === 'FIST' && R.cls === 'FIST')) return;
    if (this.handFSM.L.carry != null || this.handFSM.R.carry != null) return;
    for (const it of this.items) {
      if (it.def.hand !== 'both' || (it.state !== 'free' && it.state !== 'floating')) continue;
      const r = this.graspRadiusOf(it, 1.3);
      if (Math.hypot(L.pos.x - it.nx, L.pos.y - it.ny) <= r &&
          Math.hypot(R.pos.x - it.nx, R.pos.y - it.ny) <= r) {
        it.state = 'carried'; it.heldBy = 'both';
        ['L', 'R'].forEach(k => {
          this.handFSM[k].fsm = 'CARRY'; this.handFSM[k].carry = it.id;
          this.handFSM[k].openHoldStart = null;
        });
        this.metrics.graspAttempts++;
        sfx.grab();
        return;
      }
    }
  }

  update(input, dt) {
    const now = performance.now();
    const g = this.grading;

    // assist 에스컬레이션 (실패호 제거 — 타임아웃은 실패가 아니라 도움). 완료 후엔 동결.
    const elapsedS = (now - this.startT) / 1000;
    const newAssist = this.done ? this.assistLevel
      : elapsedS > g.assistTimeoutS * 2 ? 2 : elapsedS > g.assistTimeoutS ? 1 : 0;
    if (newAssist !== this.assistLevel) {
      this.assistLevel = newAssist;
      this.metrics.assistLevel = Math.max(this.metrics.assistLevel, newAssist);
      assistBadge.textContent = newAssist === 1 ? '도움: 잡기 쉽게!' : '도움: 물건이 다가와요';
      assistBadge.classList.remove('hidden');
      sfx.assist();
    }

    // 양손 과제 잡기 시도 (개별 FSM보다 먼저 — 두 손 동시 조건)
    this.tryBimanualGrasp(input);

    // 손 커서 + FSM
    ['L', 'R'].forEach(k => {
      const hand = input.hands[k];
      const f = this.handFSM[k];
      const cur = cursors[k];
      if (hand.present && hand.pos) {
        const w = toWorld(hand.pos.x, hand.pos.y);
        cur.position.set(w.x, w.y, 0.5);
        cur.visible = true;
        cur.material.color.setHex(CLS_COLORS[hand.cls] || CLS_COLORS.NEUTRAL);
        cur.scale.setScalar(f.fsm === 'CARRY' ? 1.3 : 1);
        f.lossStart = null;
      } else {
        cur.visible = false;
        // 추적 소실: CARRY 중이면 부유 대기 (브리프 실패호 제거)
        if (f.fsm === 'CARRY' && f.carry != null) {
          if (!f.lossStart) f.lossStart = now;
          if (now - f.lossStart > PARAMS.TRACK_LOSS_MS) {
            const it = this.items[f.carry];
            const wasBoth = it && it.heldBy === 'both';
            if (it) { it.state = 'floating'; it.heldBy = null; }
            f.carry = null; f.fsm = 'LOCKED'; f.openHoldStart = null;
            if (wasBoth) {
              const of = this.handFSM[k === 'L' ? 'R' : 'L'];
              of.carry = null; of.fsm = 'ARMED'; of.openHoldStart = null;
            }
            this.metrics.trackLosses++;
          }
        }
        return;
      }

      switch (f.fsm) {
        case 'LOCKED':
          if (hand.cls === 'OPEN') f.fsm = 'ARMED';
          break;
        case 'ARMED':
          if (hand.cls === 'FIST' && f.carry == null) {
            const it = this.findGraspTarget(k, hand.pos);
            if (it) {
              it.state = 'carried'; it.heldBy = k;
              f.carry = it.id; f.fsm = 'CARRY';
              this.metrics.graspAttempts++;
              this.updateHudStep(); // 예산 스테이션: 꺼내면 잔액 갱신
              sfx.grab();
            } else if (this.nearBothItem(hand.pos)) {
              // 양손 사물 근처의 주먹은 파트너 손을 기다림 (LOCKED 안 함, 실패 아님)
            } else {
              this.metrics.graspAttempts++;
              this.metrics.graspFails++;
              f.fsm = 'LOCKED'; // R1: 빈 주먹 → 다시 펴야 재무장
            }
          }
          break;
        case 'CARRY': {
          const it = this.items[f.carry];
          if (!it) { f.fsm = 'ARMED'; f.carry = null; break; }
          if (it.heldBy === 'both') {
            const other = input.hands[k === 'L' ? 'R' : 'L'];
            if (other.present && other.pos) {
              it.nx = (hand.pos.x + other.pos.x) / 2;
              it.ny = (hand.pos.y + other.pos.y) / 2;
            }
          } else {
            it.nx = hand.pos.x; it.ny = hand.pos.y;
          }
          // R2: OPEN 유지 t_release ∧ 저속
          if (hand.cls === 'OPEN' && Math.abs(hand.vy) <= PARAMS.RELEASE_MAX_SPEED) {
            if (!f.openHoldStart) f.openHoldStart = now;
            if (now - f.openHoldStart >= g.tReleaseMs) this.release(k, f, it);
          } else {
            f.openHoldStart = null;
          }
          break;
        }
        case 'RELEASE':
          f.fsm = 'ARMED';
          break;
      }
    });

    // 아이템 위치·상태 반영
    const t = this.station.target;
    for (const it of this.items) {
      if (it.state === 'floating') {
        it.bobT += dt;
        // assist 2단계: 타깃 쪽으로 천천히 부유 (방해 자극은 제외)
        if (this.assistLevel >= 2 && !it.def.distractor) this.driftToTarget(it, dt);
      } else if (it.state === 'free' && this.assistLevel >= 2 && !it.def.distractor) {
        this.driftToTarget(it, dt);
      }
      const w = toWorld(it.nx, it.ny);
      const bob = (it.state === 'floating') ? Math.sin(it.bobT * 3) * 0.008 : 0;
      const targetZ = it.state === 'carried' ? 0.4 : 0.1;
      it.mesh.position.lerp(new THREE.Vector3(w.x, w.y + bob, targetZ), Math.min(1, dt * 14));
      it.mesh.userData.spin.rotation.y += dt * (it.state === 'carried' ? 2.2 : 0.6);
    }

    // 타깃 펄스 (assist 시 강조) — 판정은 정규화 좌표 원이므로 시각은 월드 타원(y를 aspect로 압축)
    const pulse = 1 + Math.sin(now / 1000 * 4) * (this.assistLevel >= 1 ? 0.15 : 0.04);
    const zs = pulse * this.radiusScale();
    this.zoneRing.scale.set(zs, zs / stageAspect(), 1);
    this.target.mesh.userData.spin.rotation.y += dt * 0.4;

    updateParticles(dt);
  }

  driftToTarget(it, dt) {
    const t = this.station.target;
    const dx = t.pos[0] - it.nx, dy = t.pos[1] - it.ny;
    const d = Math.hypot(dx, dy) || 1e-4;
    const step = PARAMS.ASSIST_DRIFT_SPEED * dt;
    if (d > step) { it.nx += dx / d * step; it.ny += dy / d * step; }
  }

  release(k, f, it) {
    const wasBoth = it.heldBy === 'both';
    f.carry = null; f.openHoldStart = null; f.fsm = 'RELEASE';
    if (wasBoth) {
      const of = this.handFSM[k === 'L' ? 'R' : 'L'];
      of.carry = null; of.fsm = 'RELEASE'; of.openHoldStart = null;
    }
    it.heldBy = null;
    this.metrics.releases++;
    const t = this.station.target;
    const d = Math.hypot(it.nx - t.pos[0], it.ny - t.pos[1]);
    if (d <= t.zoneRadius * this.radiusScale()) {
      const bounce = msg => {
        it.state = 'free';
        it.nx = Math.min(0.9, Math.max(0.1, t.pos[0] - 0.28 + Math.random() * 0.12));
        it.ny = Math.min(0.85, Math.max(0.15, t.pos[1] + 0.1));
        tone(294, 0.25, 'sine', 0.1); tone(262, 0.3, 'sine', 0.1, 0.15);
        banner.textContent = msg;
        banner.classList.remove('hidden');
        clearTimeout(this._wrongT);
        this._wrongT = setTimeout(() => { if (!this.done) banner.classList.add('hidden'); }, 1400);
      };
      if (it.def.distractor) {
        // 변별 과제: 정답 아닌 사물은 존이 부드럽게 돌려보냄 (실패 아님)
        this.metrics.wrongItem++;
        bounce('🙅 그건 아니에요 — 다시 골라봐요');
        return;
      }
      if (this.budget && this.spentBudget() + (it.def.price || 0) > this.budget) {
        // 예산 초과: 셀프 계산대 훈련 — 더 싼 조합을 고르게 유도 (실패 아님)
        this.metrics.budgetOvers++;
        bounce('💸 예산이 부족해요 — 다른 것을 골라봐요');
        return;
      }
      it.state = 'placed';
      // 존 안 스냅 (물리엔진 없음 — 판정·스냅만)
      const idx = this.items.filter(x => x.state === 'placed').length - 1;
      it.nx = t.pos[0] + (idx % 3 - 1) * 0.03;
      it.ny = t.pos[1] - 0.02;
      sfx.drop();
      burst(it.nx, it.ny);
      this.updateHudStep();
      const placedGoals = this.items.filter(x => !x.def.distractor && x.state === 'placed').length;
      if (placedGoals >= this.goalCount()) this.complete();
    } else {
      it.state = 'free'; // 존 밖 → 그 자리에 남음, 재쥐기 가능 (실패 아님)
      this.metrics.misplaced++;
    }
  }

  complete() {
    this.done = true;
    // 별 보상: 도움 단계를 척도로 재활용 (assist 0→⭐⭐⭐, 1→⭐⭐, 2→⭐)
    this.metrics.stars = Math.max(1, 3 - this.metrics.assistLevel);
    sfx.stationDone();
    burst(this.station.target.pos[0], this.station.target.pos[1], 0x4fd1c5);
    banner.textContent = `${'⭐'.repeat(this.metrics.stars)} 참 잘했어요!`;
    banner.classList.remove('hidden');
  }

  render() { renderer.render(stScene, stCam); }
  dispose() {
    stScene.remove(this.root);
    cursors.L.visible = false; cursors.R.visible = false;
    banner.classList.add('hidden');
    assistBadge.classList.add('hidden');
    placeChip.classList.add('hidden');
    videoWrap.style.background = '';
  }
}

/* ---------- 메인 플로우 ---------- */
let driver = null;
let current = null;
let calibrated = false;
let lastT = performance.now();
let fpsHist = [];
const stageMenu = document.getElementById('stageMenu');
const stagePlayed = new Set(); // 이번 세션에 연습한 과제 인덱스
const stageStars = {};         // 과제별 최고 별점 (메뉴 표시)

async function fadeTransition(fn) {
  fadeEl.classList.add('on');
  await new Promise(r => setTimeout(r, 450));
  fn();
  fadeEl.classList.remove('on');
}

function waitPhase(phase, extraMs = 0) {
  return new Promise(resolve => {
    const check = () => {
      if (phase.done) setTimeout(resolve, extraMs);
      else scheduleFrame(check);
    };
    check();
  });
}

async function runFlow(indices = null, { returnToMenu = false } = {}) {
  const flow = session.flow || [];
  const idxList = indices || flow.map((_, i) => i);
  hud.classList.remove('hidden');
  report.startedAt = new Date().toISOString();
  report.title = session.title || '';
  report.entries = [];
  for (const i of idxList) {
    const item = flow[i];
    const phaseStart = performance.now();
    await fadeTransition(() => {
      if (current) current.dispose();
      current = item.type === 'segment' ? new NavPhase(item)
              : item.type === 'crossing' ? new CrossingPhase(item)
              : item.kind === 'select' ? new SelectPhase(item)
              : new StationPhase(item);
    });
    const phaseRef = current;
    await waitPhase(current, item.type === 'station' ? 1800 : 400);
    pushReportEntry(item, phaseRef, performance.now() - phaseStart);
    stagePlayed.add(i);
    if (phaseRef.metrics && phaseRef.metrics.stars)
      stageStars[i] = Math.max(stageStars[i] || 0, phaseRef.metrics.stars);
  }
  await fadeTransition(() => {
    if (current) current.dispose();
    current = null;
    hud.classList.add('hidden');
    if (returnToMenu) {
      const e = report.entries[report.entries.length - 1];
      const s = e && e.stars ? e.stars : 0;
      showStageMenu(s ? `${'⭐'.repeat(s)} 잘했어요!` : '👏 완료! 다음 과제를 골라요');
    } else {
      showCompletion();
    }
  });
}

/* ---------- 완료 화면: 별 + 치료사용 리포트 요약 ---------- */
function entrySummary(e, i) {
  const head = `${i + 1}. ${e.type === 'segment' ? '🏃 이동' : e.type === 'crossing' ? '🚦 횡단보도' : `${(PLACES[e.place]?.emoji || '📦')} ${e.title}`}`;
  const sec = (e.ms / 1000).toFixed(0);
  if (e.type === 'segment') return `${head} — ${sec}초 · 스트로크 ${e.strokes}`;
  if (e.type === 'crossing') {
    return `${head} — ${sec}초 · 신호대기 ${(e.waitMs / 1000).toFixed(1)}초 · 건너기 ${(e.crossMs / 1000).toFixed(1)}초`
      + ` · 대기 중 출발시도 ${e.redBlockedPushes} · 스트로크 ${e.strokes}`;
  }
  if (e.wrongSelects != null) {
    return `${head} — ${sec}초 · 스텝 ${e.steps} · 오선택 ${e.wrongSelects}`
      + ` · 도움 ${e.assistLevel} · ${'⭐'.repeat(e.stars || 0)}`;
  }
  return `${head} — ${sec}초 · 잡기 ${e.graspAttempts}(빈손 ${e.graspFails}) · 존 밖 놓기 ${e.misplaced}`
    + `${e.wrongItem ? ` · 방해자극 시도 ${e.wrongItem}` : ''}${e.budgetOvers ? ` · 예산초과 시도 ${e.budgetOvers}` : ''}`
    + ` · 추적소실 ${e.trackLosses} · 도움 ${e.assistLevel} · ${'⭐'.repeat(e.stars || 0)}`;
}

function showCompletion() {
  const totalStars = report.entries.reduce((s, e) => s + (e.stars || 0), 0);
  const totalSec = Math.round(report.entries.reduce((s, e) => s + e.ms, 0) / 1000);
  startOverlay.classList.remove('hidden');
  startTitle.textContent = `🌟 세션 완료! ⭐×${totalStars}`;
  startDesc.textContent = `오늘 정말 잘했어요 — 총 ${Math.floor(totalSec / 60)}분 ${totalSec % 60}초. 한 번 더 할까요?`;
  btnStart.textContent = '다시 하기';
  btnStart.disabled = false;
  const box = document.getElementById('reportBox');
  box.innerHTML = `<h3>치료사용 기록 <span class="c2note">(온디바이스 · 영상/개인정보 없음)</span></h3>`
    + report.entries.map((e, i) => `<div class="repRow">${entrySummary(e, i)}</div>`).join('');
  box.classList.remove('hidden');
  document.getElementById('reportBtns').classList.remove('hidden');
}

function downloadBlob(content, type, filename) {
  const blob = new Blob([content], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}
const REPORT_COLS = ['idx', 'type', 'title', 'place', 'ms', 'strokes', 'graspAttempts', 'graspFails',
  'releases', 'misplaced', 'wrongItem', 'budgetOvers', 'wrongSelects', 'steps', 'trackLosses',
  'assistLevel', 'stars', 'redBlockedPushes', 'waitMs', 'crossMs'];
document.getElementById('btnSaveJson').addEventListener('click', () => {
  downloadBlob(JSON.stringify(report, null, 2), 'application/json',
    `adl-report_${report.startedAt.replace(/[:.]/g, '-')}.json`);
});
document.getElementById('btnSaveCsv').addEventListener('click', () => {
  const rows = report.entries.map((e, i) =>
    REPORT_COLS.map(c => c === 'idx' ? i + 1 : (e[c] ?? '')).join(','));
  downloadBlob([REPORT_COLS.join(','), ...rows].join('\n'), 'text/csv;charset=utf-8;',
    `adl-report_${report.startedAt.replace(/[:.]/g, '-')}.csv`);
});

function scheduleFrame(fn) {
  // 탭이 숨겨지면 rAF가 정지 — setTimeout 폴백으로 세션 유지
  if (document.visibilityState === 'hidden') setTimeout(fn, 33);
  else requestAnimationFrame(fn);
}

function loop() {
  scheduleFrame(loop);
  const now = performance.now();
  const dt = Math.min(0.05, (now - lastT) / 1000);
  lastT = now;
  if (!driver) return;
  const input = driver.update(now);
  if (current) {
    current.update(input, dt);
    current.render();
  }
  const fps = 1 / Math.max(1e-4, dt);
  fpsHist.push(fps); if (fpsHist.length > 40) fpsHist.shift();
  fpsBadge.textContent = `FPS ${(fpsHist.reduce((s, v) => s + v, 0) / fpsHist.length).toFixed(0)}`;
}

/* ---------- 드라이버 초기화 · 캘리브레이션 (전체·개별 공용) ---------- */
const isMouseMode = () => new URLSearchParams(location.search).get('input') === 'mouse';

function hideMenus() {
  startOverlay.classList.add('hidden');
  stageMenu.classList.add('hidden');
}

async function ensureDriver({ needCalib = true } = {}) {
  if (!driver) {
    if (isMouseMode()) {
      const { MouseDriver } = await import('./input-mouse.js');
      driver = new MouseDriver();
      await driver.start(stage);
      calibrated = true;
    } else {
      const { HandDriver } = await import('./input-hand.js');
      driver = new HandDriver();
      await driver.start();
      driver.videoEl.classList.add('mirror'); // 거울 영상 배경 연결
      videoWrap.appendChild(driver.videoEl);
    }
  }
  if (driver.needsCamera && needCalib && !calibrated) await runCalibration();
}

async function runCalibration() {
  hideMenus();
  calibOverlay.classList.remove('hidden');
  await driver.calibrate({
    show: (t, d) => { calibTitle.textContent = t; calibDesc.textContent = d; },
    countdown: n => { calibCount.textContent = n; },
    hide: () => calibOverlay.classList.add('hidden'),
  });
  calibrated = true;
}

function showStartError(err) {
  hideMenus();
  startOverlay.classList.remove('hidden');
  startTitle.textContent = '시작할 수 없어요';
  startDesc.textContent = `${err.message || err} — 카메라 연결을 확인하거나, 주소 뒤에 ?input=mouse 를 붙여 마우스 모드로 실행할 수 있습니다.`;
  btnStart.disabled = false;
}

/* ---------- 과제 선택 메뉴 (인지기능 배지 포함) ---------- */
function cognitiveTags(item) {
  if (item.type === 'segment') return ['주의', '양측협응'];
  if (item.type === 'crossing') return ['충동억제', '인과추론'];
  if (item.kind === 'select') return ['작업기억', '인과추론'];
  const items = item.items || [];
  const t = []; // 실행기능 태그를 앞으로 (slice(0,3)에서 살아남도록)
  if (item.budget > 0) t.push('계획·충동억제');
  if (items.some(x => x.distractor)) t.push('선택적주의');
  if (item.hand === 'both' || items.some(x => x.hand === 'both')) t.push('양측협응');
  t.push('주의', '순서기억');
  return t;
}

const THEME_NAMES = { hall: '집 복도', elevator: '엘리베이터', street: '길거리',
  park: '공원', market: '마트 통로', school: '학교 복도' };

function stageLabel(item) {
  if (item.type === 'segment')
    return { emoji: '🏃', title: `걷기 · ${THEME_NAMES[item.theme] || ''}`, type: `이동 · Level ${item.level}` };
  if (item.type === 'crossing')
    return { emoji: '🚦', title: '횡단보도 건너기', type: `신호 지키기 · Level ${item.level}` };
  const place = PLACES[item.place];
  if (item.kind === 'select')
    return { emoji: place?.emoji || '🃏', title: item.title, type: '고르기' };
  return { emoji: place?.emoji || '📦', title: item.title, type: item.budget > 0 ? '옮기기 · 예산' : '물건 옮기기' };
}

function buildStageGrid() {
  const grid = document.getElementById('stageGrid');
  grid.innerHTML = '';
  if (!isMouseMode()) {
    const c = document.createElement('button');
    c.className = 'stageCard calib';
    c.innerHTML = `<div class="scTop"><span class="scEmoji">🖐️</span>
      <div><div class="scTitle">준비운동</div><div class="scType">손 맞추기 · 캘리브레이션</div></div></div>
      <div class="scCog"><span class="cog">${calibrated ? '완료됨 ✓ · 다시 하기' : '과제 전에 1회'}</span></div>
      <div class="scStars"></div>`;
    c.addEventListener('click', () => startCalibrationOnly());
    grid.appendChild(c);
  }
  (session.flow || []).forEach((item, i) => {
    const info = stageLabel(item);
    const tags = cognitiveTags(item).slice(0, 3);
    const card = document.createElement('button');
    card.className = 'stageCard' + (stagePlayed.has(i) ? ' doneOnce' : '');
    card.innerHTML = `
      <div class="scTop"><span class="scEmoji">${info.emoji}</span>
        <div><div class="scTitle">${i + 1}. ${info.title}</div><div class="scType">${info.type}</div></div></div>
      <div class="scCog">${tags.map(t => `<span class="cog">${t}</span>`).join('')}</div>
      <div class="scStars">${stageStars[i] ? '⭐'.repeat(stageStars[i]) : ''}</div>`;
    card.addEventListener('click', () => playStage(i));
    grid.appendChild(card);
  });
}

function showStageMenu(toast = null) {
  hideMenus();
  calibOverlay.classList.add('hidden');
  document.getElementById('reportBox').classList.add('hidden');
  document.getElementById('reportBtns').classList.add('hidden');
  buildStageGrid();
  const toastEl = document.getElementById('stageToast');
  if (toast) { toastEl.textContent = toast; toastEl.classList.remove('hidden'); }
  else toastEl.classList.add('hidden');
  stageMenu.classList.remove('hidden');
}

async function playStage(i) {
  audio();
  try {
    await ensureDriver({ needCalib: true });
    hideMenus();
    await runFlow([i], { returnToMenu: true });
  } catch (err) { showStartError(err); }
}

async function startCalibrationOnly() {
  audio();
  try {
    await ensureDriver({ needCalib: false });
    if (!driver.needsCamera) { showStageMenu('마우스 모드는 준비운동이 필요 없어요'); return; }
    calibrated = false; // 강제 재캘리브레이션
    await runCalibration();
    showStageMenu('준비운동 완료! 이제 과제를 골라요');
  } catch (err) { showStartError(err); }
}

/* ---------- 진입점: 전체 하루 / 과제 골라 연습 ---------- */
btnStart.addEventListener('click', async () => {
  btnStart.disabled = true;
  document.getElementById('reportBox').classList.add('hidden');
  document.getElementById('reportBtns').classList.add('hidden');
  audio(); // 사용자 제스처 시점에 AudioContext 활성화
  const prevText = btnStart.textContent;
  if (!driver && !isMouseMode()) btnStart.textContent = '모델 로딩 중…';
  try {
    await ensureDriver({ needCalib: true });
    hideMenus();
    await runFlow(null, { returnToMenu: false });
  } catch (err) {
    showStartError(err);
  } finally {
    btnStart.textContent = prevText;
    btnStart.disabled = false;
  }
});

document.getElementById('btnChoose').addEventListener('click', () => showStageMenu());
document.getElementById('btnMenuBack').addEventListener('click', () => {
  stageMenu.classList.add('hidden');
  startOverlay.classList.remove('hidden');
});

/* 초기 UI */
updateStartTexts();
resize();
loop();

/* 개발 진단 훅 (콘솔 전용 — 게임 로직 비관여) */
window.__dbg = { get driver() { return driver; }, get current() { return current; }, get session() { return session; } };
