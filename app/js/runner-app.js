/* 러너 엔진 — 페이즈 교대: 3인칭 항행 ↔ 거울 모드 스테이션 조작
   브리프 동결: 상호작용 2.5D(스냅·드롭존), 3D는 렌더링 전용, 물리엔진 없음, 실패 종결 없음.
   C2: 카메라 스트림은 온디바이스 소비만, 저장·전송 없음. 페이즈 전환 시 렌더링만 토글. */
import * as THREE from 'three';
import { PARAMS } from './params.js';
import { decodeSession, makeDemoSession, makeErrandSession, makeKioskDrillSession,
  SEGMENT_LENGTHS, GRADING_DEFAULTS, applyDifficultyPreset } from './session.js';
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
const hotbarEl = document.getElementById('hotbar');

/* 핫바: 과제 기능의 재해석 — 스테이션=목표 사물 슬롯, 고르기=스텝 슬롯 (표시 전용) */
function setHotbar(slots) {
  if (!slots || !slots.length) {
    hotbarEl.classList.add('hidden');
    hotbarEl.innerHTML = '';
    return;
  }
  hotbarEl.innerHTML = slots.map((s, i) =>
    `<div class="vx-slot${s.done ? ' done' : ''}${s.active ? ' active' : ''}">` +
    `<span class="num">${i + 1}</span><span>${s.icon}</span>` +
    `${s.done ? '<span class="chk">✔</span>' : ''}</div>`
  ).join('');
  hotbarEl.classList.remove('hidden');
}

/* ---------- 세션 로드 ---------- */
function loadSession() {
  const m = location.hash.match(/#s=([A-Za-z0-9_-]+)/);
  if (m) {
    try { return decodeSession(m[1]); }
    catch { /* 손상된 링크 → 데모 폴백 */ }
  }
  return makeDemoSession();
}
/* P3: 수락된 성장 제안은 과제 제목 기준 오버라이드로 저장되어 다음 회차에도 유지된다.
   C2 준수: 레벨 숫자만 저장, 이 기기 한정. '기록 지우기'로 함께 초기화. */
const OVERRIDE_KEY = 'adl-level-overrides-v1';
const SUGGEST_KEY = 'adl-suggest-v1';

function loadJSONKey(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) || fallback; }
  catch { return fallback; }
}

function applyLevelOverrides(sess) {
  const ov = loadJSONKey(OVERRIDE_KEY, {});
  for (const f of sess.flow || []) {
    const lv = ov[f.title];
    if (f.difficulty && lv >= 1 && lv <= 5 && lv !== f.difficulty) {
      f.difficulty = lv;
      applyDifficultyPreset(f);
    }
  }
  return sess;
}

let session = applyLevelOverrides(loadSession());

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
    session = applyLevelOverrides(JSON.parse(await file.text()));
    updateStartTexts();
    renderSuggestCard();
  } catch {
    startDesc.textContent = '세션 파일을 읽을 수 없어요 — 에디터에서 저장한 .adl.json 파일인지 확인해 주세요.';
  }
  e.target.value = '';
});

/* R1(content-coherence_v0.1.md): 하루를 실제 시간 맥락에 맞는 두 편으로 분리 — 등교(1편)와
   하교 후 심부름(2편)은 서로 다른 occupation 시점이므로 한 흐름에 섞지 않는다. 카페
   키오스크는 어느 서사에도 속하지 않는 독립 훈련(사용자 결정: "별도처리"). */
function switchSession(factory) {
  session = applyLevelOverrides(factory());
  updateStartTexts();
  renderSuggestCard();
}
document.getElementById('btnPart1').addEventListener('click', () => switchSession(makeDemoSession));
document.getElementById('btnPart2').addEventListener('click', () => switchSession(makeErrandSession));
document.getElementById('btnKioskDrill').addEventListener('click', () => switchSession(makeKioskDrillSession));

/* ---------- 세션 리포트 (C2: 파생 수치만, 온디바이스, 로컬 다운로드) ----------
   A2 승격: 자동 기록은 치료사 동석 관찰의 '보조' — 화면 요약 + JSON/CSV 로컬 저장 */
const report = { startedAt: null, title: '', entries: [] };
function pushReportEntry(item, phase, ms) {
  const e = { type: item.type, title: item.title || '', place: item.place || '', ms: Math.round(ms) };
  if (item.difficulty) e.lv = item.difficulty;
  Object.assign(e, phase.metrics || {});
  report.entries.push(e);
}

/* ---------- 오디오 (합성음만 — 외부 자산 없음) ---------- */
let actx = null;
let muted = false;
function audio() { if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)(); return actx; }
function tone(freq, dur = 0.15, type = 'sine', gain = 0.12, delay = 0) {
  if (muted) return;
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

/* ---------- 음성 안내 (R2 — Web Speech API, 외부 자산 없음·온디바이스 처리) ----------
   전학령기·발달장애 대상은 문해 이전 단계 — 텍스트 지시만으로는 접근 불가하다는
   visual-perception_v0.1.md 진단에 대한 응답. mute 버튼(M) 하나로 효과음·음성을 함께 제어. */
let _lastSpoken = null;
function speak(text) {
  if (muted || !text) return;
  if (!('speechSynthesis' in window)) return; // 미지원 브라우저: 조용히 생략(텍스트는 항상 표시됨)
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'ko-KR'; u.rate = 0.95; u.pitch = 1.05;
  window.speechSynthesis.speak(u);
}
/* HUD 지시문 표시 + 음성 발화를 한 곳에서 — 동일 문구 반복 시 재발화 방지 */
function setInstruction(text) {
  hudInstruction.textContent = text;
  if (text && text !== _lastSpoken) { _lastSpoken = text; speak(text); }
}

/* ---------- 렌더러 ---------- */
const renderer = new THREE.WebGLRenderer({ canvas: glcanvas, alpha: true, antialias: true });
renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
function stageAspect() {
  // 레이아웃 전환 순간 크기가 0이면 NaN이 지오메트리로 번짐 — 16:9 폴백으로 차단
  const w = stage.clientWidth, h = stage.clientHeight;
  return (w > 0 && h > 0) ? w / h : 16 / 9;
}
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

/* 커브 코스 중심선 (difficulty-progression §A L3) — z는 시작점부터의 진행 거리(양수) */
function laneCenterX(segment, z) {
  if (segment.courseType !== 'curve') return 0;
  return (segment.curveAmp || 0) * Math.sin(z * (segment.curveFreq || 0.18));
}

function makeNavSign(text, color = '#2b6cb0') {
  // 항행 코스용 표지판 스프라이트 (makeLabelSprite보다 큰 스케일 — 3D 월드 단위)
  const cv = document.createElement('canvas');
  cv.width = 256; cv.height = 128;
  const x = cv.getContext('2d');
  x.fillStyle = '#121212'; x.fillRect(0, 0, 256, 128);
  x.fillStyle = color; x.fillRect(8, 8, 240, 112);
  x.fillStyle = '#fff';
  x.font = 'bold 64px "DungGeunMo", "Malgun Gothic", monospace';
  x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText(text, 128, 64);
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cv), depthTest: false }));
  sp.scale.set(1.4, 0.7, 1);
  return sp;
}

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
  // 진행감을 위한 차선 마커 (커브 코스는 중심선을 따라 휘어짐)
  for (let z = 0; z < len; z += 3) {
    const bar = new THREE.Mesh(
      new THREE.BoxGeometry(0.25, 0.02, 1.2),
      new THREE.MeshStandardMaterial({ color: '#f7fafc' })
    );
    bar.position.set(laneCenterX(segment, z), 0.011, -z - 1);
    g.add(bar);
  }
  // 양측 패럴랙스 프롭 (테마별: 나무/상자 또는 선반·사물함형 기둥) — 커브 중심선 기준 오프셋
  for (let z = 2; z < len; z += 4) {
    const cx = laneCenterX(segment, z);
    [-1, 1].forEach(side => {
      const alt = (Math.floor(z / 4) + (side > 0 ? 1 : 0)) % 2 === 0;
      let prop;
      if (theme.trees && alt) {
        // 복셀 나무: 줄기 블록 + 잎 블록
        prop = new THREE.Group();
        const trunk = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.3, 0.5),
          new THREE.MeshStandardMaterial({ color: '#6f4527', flatShading: true }));
        trunk.position.y = 0.65;
        const leaf = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.2, 1.5),
          new THREE.MeshStandardMaterial({ color: theme.propB, flatShading: true }));
        leaf.position.y = 1.85;
        const leafTop = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.55, 0.9),
          new THREE.MeshStandardMaterial({ color: theme.propB, flatShading: true }));
        leafTop.position.y = 2.7;
        prop.add(trunk, leaf, leafTop);
        prop.position.set(cx + side * (4.5 + (z % 3) * 0.4), 0, -z);
      } else {
        const tall = !theme.trees; // 실내 테마는 키 큰 선반·사물함 느낌
        prop = new THREE.Mesh(new THREE.BoxGeometry(1.2, tall ? 2.6 : 1.6, 1.2),
          new THREE.MeshStandardMaterial({ color: alt ? theme.propB : theme.propA }));
        prop.position.set(cx + side * (tall ? 4.0 : 4.5 + (z % 3) * 0.4), tall ? 1.3 : 0.8, -z);
      }
      g.add(prop);
    });
  }
  // 게이트 (L2 §A "직선 + 게이트 통과") — 좁은 문 기둥 한 쌍, 조향으로 통과
  (segment.gates || []).forEach(gt => {
    const z = gt.z * len;
    const gm = new THREE.MeshStandardMaterial({ color: '#f6ad55', flatShading: true });
    const half = (gt.width || 1.0);
    const post1 = new THREE.Mesh(new THREE.BoxGeometry(0.2, 1.8, 0.2), gm);
    const post2 = post1.clone();
    post1.position.set(gt.xOffset - half, 0.9, -z);
    post2.position.set(gt.xOffset + half, 0.9, -z);
    g.add(post1, post2);
  });
  // 갈림길 (L4 표지판 읽기 / L5 미니맵 암기 — 실제 분기 지오메트리 없이 판정 지점 방식, §5 문서화된 단순화)
  (segment.forks || []).forEach(fk => {
    const z = fk.z * len;
    const cx = laneCenterX(segment, z);
    const sign = segment.courseType === 'forkMemory'
      ? makeNavSign('❓', '#805ad5')                     // 기억 회상 — 정답 비공개
      : makeNavSign(fk.correct === 'L' ? '⬅' : '➡', '#38a169'); // 즉시 판단 — 표지판 공개
    sign.position.set(cx, 2.1, -z);
    g.add(sign);
  });
  // 깃발 (P5 §A-인지 L5 "걷기 중 표지 계수" — 이중과제: 조향하며 색으로 셈)
  (segment.flags || []).forEach(fl => {
    const z = fl.z * len;
    const cx = laneCenterX(segment, z);
    const color = fl.color === 'orange' ? '#ed8936' : '#48bb78';
    const flagGroup = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.6, 0.08),
      new THREE.MeshStandardMaterial({ color: '#718096', flatShading: true }));
    pole.position.y = 0.8;
    const flag = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.34, 0.06),
      new THREE.MeshStandardMaterial({ color, flatShading: true }));
    flag.position.set(0.29, 1.4, 0);
    flagGroup.add(pole, flag);
    flagGroup.position.set(cx + fl.xOffset, 0, -z);
    g.add(flagGroup);
  });
  // 도착 게이트
  const gate = new THREE.Group();
  const gm = new THREE.MeshStandardMaterial({ color: '#4fd1c5' });
  const p1 = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 3), gm);
  const p2 = p1.clone();
  const endCx = laneCenterX(segment, len);
  p1.position.set(endCx - 2, 1.5, 0); p2.position.set(endCx + 2, 1.5, 0);
  const top = new THREE.Mesh(new THREE.BoxGeometry(4.3, 0.3, 0.3), gm);
  top.position.set(endCx, 3, 0);
  gate.add(p1, p2, top);
  gate.position.z = -len;
  g.add(gate);
  return { group: g, length: len };
}

function buildAvatar() {
  // 블록형 아바타 (복셀 원리 — 특정 게임 캐릭터 비복제). userData.armL/armR 계약 유지.
  const g = new THREE.Group();
  const box = (w, h, d, c) =>
    new THREE.Mesh(new THREE.BoxGeometry(w, h, d),
      new THREE.MeshStandardMaterial({ color: c, flatShading: true }));
  const body = box(0.62, 0.78, 0.34, '#3f8f7c');
  body.position.y = 0.95;
  const head = box(0.46, 0.46, 0.46, '#e4b183');
  head.position.y = 1.62;
  const legL = box(0.24, 0.56, 0.3, '#3b5d8f');
  const legR = legL.clone();
  legL.position.set(-0.16, 0.28, 0); legR.position.set(0.16, 0.28, 0);
  const armL = box(0.18, 0.6, 0.24, '#357a6a');
  const armR = armL.clone();
  armL.position.set(-0.46, 1.05, 0); armR.position.set(0.46, 1.05, 0);
  g.add(body, head, legL, legR, armL, armR);
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
  // 복셀 커서: 정사각 브래킷 외곽선 — 표시 전용 (좌표·판정 로직 무관)
  const mat = new THREE.MeshBasicMaterial({ color: '#e7e9ee' });
  const g = new THREE.Group();
  const S = 0.056, T = 0.009, L = 0.022; // 크기·두께·모서리 길이
  const bar = (w, h, x, y) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    m.position.set(x, y, 0);
    g.add(m);
  };
  const e = S / 2;
  // 네 모서리 브래킷 (조준 레티클풍)
  [[-1, 1], [1, 1], [-1, -1], [1, -1]].forEach(([sx, sy]) => {
    bar(L, T, sx * (e - L / 2), sy * e);        // 가로 조각
    bar(T, L, sx * e, sy * (e - L / 2));        // 세로 조각
  });
  bar(T * 1.4, T * 1.4, 0, 0);                  // 중심 픽셀 도트
  g.material = mat; // 기존 인터페이스 유지: cursors[k].material.color
  g.position.z = 0.5;
  g.visible = false;
  stScene.add(g);
  return g;
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
const STEER_COURSE_TYPES = ['gate', 'curve', 'fork', 'forkMemory'];

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
    const orangeCount = (segment.flags || []).filter(f => f.color === 'orange').length;
    if (orangeCount > 0) this.metrics.flagsTotal = orangeCount;
    this.steerCourse = STEER_COURSE_TYPES.includes(segment.courseType);
    // 게이트/갈림길은 통과 시점에 1회만 판정 — 비처벌(실패해도 진행은 계속)
    this.gateState = (segment.gates || []).map(gt => ({ ...gt, done: false }));
    this.forkState = (segment.forks || []).map(fk => ({ ...fk, done: false }));
    // 깃발(이중과제) — 통과 시점에 색만 셈(관찰 지표). 정답 확인은 뒤따르는 회상 스텝이 담당.
    this.flagState = (segment.flags || []).map(fl => ({ ...fl, done: false }));
    avatar.position.set(0, 0, 0);
    hudStep.textContent = '';
    setHotbar(null);
    videoWrap.classList.add('hidden'); // 렌더링만 토글 — 스트림은 유지 (브리프 A7)
    const hasFlags = (segment.flags || []).length > 0;
    this.baseInstruction =
      segment.theme === 'elevator' ? '🛗 엘리베이터를 타고 내려가요'
      : segment.level === 0 ? '앞으로 가요!'
      : segment.courseType === 'gate' ? '양손을 저어 가며, 좁은 문 사이로 조향해서 지나가요!'
      : segment.courseType === 'curve' ? '길이 휘어져요 — 몸을 계속 기울여 길을 따라가요!'
      : segment.courseType === 'fork' ? '표지판을 보고 방향을 정해 조향해요!'
      : segment.courseType === 'forkMemory'
        ? (hasFlags ? '외운 경로대로 조향하면서, 주황 깃발도 몇 개인지 세어 봐요! (초록은 세지 않아요)'
                    : '외운 경로대로 방향을 정해 조향해요!')
      : hasFlags ? '조향하면서 주황 깃발이 몇 개인지 세어 봐요! (초록은 세지 않아요)'
      : segment.level === 1 ? '양손을 번갈아 저어 앞으로 가요!'
      : '양손을 번갈아 젓고, 몸을 기울여 방향을 바꿔요!';
    // 미니맵 암기 (L5 §A) — 출발 전 정답 경로를 잠깐 보여주고 감춤 (mart listRevealS와 동일 패턴)
    this.mapRevealS = segment.mapRevealS || 0;
    this.mapRevealElapsed = 0;
    this.mapRevealed = this.mapRevealS <= 0;
    if (!this.mapRevealed) {
      const route = this.forkState.map(f => f.correct === 'L' ? '⬅️' : '➡️').join(' → ');
      setInstruction(`🗺️ 경로를 기억하세요: ${route}`);
    } else {
      setInstruction(this.baseInstruction);
    }
  }
  update(input, dt) {
    if (!this.mapRevealed) {
      this.mapRevealElapsed += dt;
      if (this.mapRevealElapsed >= this.mapRevealS) {
        this.mapRevealed = true;
        setInstruction(this.baseInstruction);
      }
      return; // 출발 전 암기 구간 — 아직 이동하지 않음
    }
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
    if (lv === 2 || this.steerCourse) {
      const lean = Math.abs(input.lean) < PARAMS.LEAN_DEADZONE ? 0 : input.lean;
      this.x = Math.min(3, Math.max(-3, this.x + lean * 5 * dt));
    } else {
      this.x *= Math.pow(0.5, dt / 0.8); // 자동 복귀
    }
    this.travelled += this.speed * dt;

    // 커브 코스 중심선 이탈량 (관찰 지표 — 감점 아님)
    if (this.segment.courseType === 'curve') {
      const target = laneCenterX(this.segment, this.travelled);
      this._devSum = (this._devSum || 0) + Math.abs(this.x - target) * dt;
      this._devTime = (this._devTime || 0) + dt;
      this.metrics.laneDeviationAvg = +(this._devSum / Math.max(0.001, this._devTime)).toFixed(2);
    }
    // 게이트 통과 판정 (비처벌 — 못 지나가도 진행은 계속됨)
    for (const gt of this.gateState) {
      if (!gt.done && this.travelled >= gt.z * this.length) {
        gt.done = true;
        this.metrics.gatesTotal = (this.metrics.gatesTotal || 0) + 1;
        if (Math.abs(this.x - gt.xOffset) <= (gt.width || 1.0)) {
          this.metrics.gatesPassed = (this.metrics.gatesPassed || 0) + 1;
          sfx.blinkTick();
        } else {
          sfx.assist();
        }
      }
    }
    // 갈림길 방향 판정 (비처벌 — 오답이어도 진행은 계속됨)
    for (const fk of this.forkState) {
      if (!fk.done && this.travelled >= fk.z * this.length) {
        fk.done = true;
        this.metrics.forksTotal = (this.metrics.forksTotal || 0) + 1;
        const side = this.x >= 0 ? 'R' : 'L';
        if (side === fk.correct) {
          this.metrics.forksCorrect = (this.metrics.forksCorrect || 0) + 1;
          sfx.blinkTick();
        } else {
          sfx.assist();
        }
      }
    }
    // 깃발 통과 관찰 지표(이중과제) — 주황만 셈, 초록은 방해자극이라 세지 않음. 비처벌.
    for (const fl of this.flagState) {
      if (!fl.done && this.travelled >= fl.z * this.length) {
        fl.done = true;
        if (fl.color === 'orange') {
          this.metrics.flagsSeen = (this.metrics.flagsSeen || 0) + 1;
          sfx.blinkTick();
        }
      }
    }

    avatar.position.set(this.x, 0, -this.travelled);
    const swing = Math.sin(performance.now() / 1000 * 6) * Math.min(1, this.speed / 4) * 0.6;
    avatar.userData.armL.rotation.x = swing;
    avatar.userData.armR.rotation.x = -swing;
    navCam.position.set(this.x * 0.7, 2.4, -this.travelled + 6);
    navCam.lookAt(this.x, 1, -this.travelled - 4);

    hudProgressFill.style.width = `${Math.min(100, this.travelled / this.length * 100)}%`;
    if (this.travelled >= this.length) {
      const gT = this.metrics.gatesTotal || 0, fT = this.metrics.forksTotal || 0;
      if (gT + fT > 0) {
        const hit = (this.metrics.gatesPassed || 0) + (this.metrics.forksCorrect || 0);
        const total = gT + fT;
        this.metrics.stars = hit === total ? 3 : hit > 0 ? 2 : 1;
      }
      this.done = true;
    }
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

/* 공 시나리오(R2 §C) — 회차 고정 배치, 실제 위치는 절대 움직이지 않는다(연석 잠금과 동일
   원리로 물리적 실수 자체를 차단, 시도만 관찰 지표로 기록) */
function buildBall() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5),
    new THREE.MeshStandardMaterial({ color: '#e53e3e', flatShading: true }));
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.14, 0.52),
    new THREE.MeshStandardMaterial({ color: '#f7fafc', flatShading: true }));
  g.add(body, stripe);
  g.position.y = 0.25;
  return g;
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
    this.metrics = { strokes: 0, redBlockedPushes: 0, waitMs: 0, crossMs: 0,
                     lookBothDone: 0, ballChaseAttempts: 0 };
    this._curbArriveT = null; this._crossStartT = null; this._crossEndT = null;
    // R2 승격(crosswalk-core_v0.1.md, 확정) — 3단계 반복 구조: 1회=연습, 2회=반복, 마지막=적용
    this.repsTotal = crossing.reps || 1;
    this.repIdx = 0; // 0-base 현재 회차
    this.lookRequired = !!crossing.lookBothWays;
    this.lookState = 'none'; // 'none' -> 'left' -> 'done' (좌→우 순서 강제, 비처벌)
    this.lookHoldStart = null;
    this.ballRep = crossing.ballRep || 0; // 1-base, 회차 고정 배치(무작위 아님)
    this.ball = null; this.ballState = 'idle'; this._chasing = false;
    avatar.position.set(0, 0, 0);
    hudStep.textContent = this.repsTotal > 1 ? `1 / ${this.repsTotal}` : '';
    setHotbar(null);
    videoWrap.classList.add('hidden');
  }

  _prepareNextRep(now) {
    this.z = 0; this.x = 0; this.speed = 0;
    this.crossingStarted = false;
    this.lookState = 'none'; this.lookHoldStart = null;
    this._curbArriveT = null; this._crossStartT = null; this._crossEndT = null;
    this.ballState = 'idle'; this._chasing = false;
    if (this.ball) { navScene.remove(this.ball); this.ball = null; }
    this.startT = now; // 매 회차 빨간불부터 새로 시작 — 멈춘다·살핀다·건넌다를 매번 온전히 요구
    hudStep.textContent = `${this.repIdx + 1} / ${this.repsTotal}`;
    setInstruction('한 번 더 건너요!');
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
    if (msg !== this._hudMsg) { this._hudMsg = msg; setInstruction(msg); }
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
      // 좌→우 살핌(R2, 확정) — 순서 강제, 비처벌: 틀린 순서는 그냥 다시 살피면 될 뿐
      if (this.lookRequired && this.lookState !== 'done') {
        const lean = input.lean;
        if (this.lookState === 'none') {
          if (lean < -PARAMS.LEAN_DEADZONE) {
            if (!this.lookHoldStart) this.lookHoldStart = now;
            if (now - this.lookHoldStart > 400) {
              this.lookState = 'left'; this.lookHoldStart = null; sfx.blinkTick();
            }
          } else this.lookHoldStart = null;
        } else if (this.lookState === 'left') {
          if (lean > PARAMS.LEAN_DEADZONE) {
            if (!this.lookHoldStart) this.lookHoldStart = now;
            if (now - this.lookHoldStart > 400) {
              this.lookState = 'done'; this.lookHoldStart = null;
              this.metrics.lookBothDone++; sfx.blinkTick();
            }
          } else this.lookHoldStart = null;
        }
      }
      const canStart = light === 'green' && (!this.lookRequired || this.lookState === 'done');
      // 연석: 초록불 + (필요 시) 살핌 완료에만 출발 (깜빡일 때는 다음 신호를 기다려요)
      if (canStart) {
        this.crossingStarted = true;
        this._crossStartT = now;
        this.metrics.waitMs = Math.round(now - this._curbArriveT);
      } else {
        canMove = false;
        if (input.strokeEvent) this.metrics.redBlockedPushes++; // 신호 대기 중 출발 시도 (관찰 지표)
        hint = light === 'red' ? '🔴 빨간불! 멈춰서 기다려요'
             : light === 'blink' ? '🟢 깜빡깜빡 — 다음 초록불을 기다려요'
             : this.lookState === 'none' ? '👀 먼저 왼쪽을 살펴봐요'
             : '👀 이제 오른쪽도 살펴봐요';
      }
    }
    // 공 시나리오(R2 §C, 회차 고정) — 실제 위치는 절대 움직이지 않음(연석 잠금과 동일 원리)
    if (this.ballRep && this.repIdx + 1 === this.ballRep && this.crossingStarted && inRoad) {
      if (this.ballState === 'idle' && now - this._crossStartT > 1200) {
        this.ballState = 'rolling';
        this.ball = buildBall();
        this.ball.position.set(-8, 0.25, this.z);
        navScene.add(this.ball);
        this._ballStartT = now;
      }
      if (this.ballState === 'rolling') {
        const t = (now - this._ballStartT) / 1500;
        this.ball.position.x = -8 + Math.min(1, t) * 16;
        this.ball.position.z = this.z;
        this.ball.rotation.z -= dt * 8;
        if (input.lean > PARAMS.LEAN_DEADZONE) {
          if (!this._chasing) { this.metrics.ballChaseAttempts++; this._chasing = true; }
        } else this._chasing = false;
        if (t >= 1) {
          this.ballState = 'done';
          navScene.remove(this.ball); this.ball = null;
        }
      }
    }
    if (this.crossingStarted && inRoad) {
      if (this.ballState === 'rolling') {
        hint = '⚽ 공이 굴러가요! 기다려요, 따라가지 않아요';
      } else if (this.ballState === 'done' && now - this._ballStartT < 2000) {
        hint = '잘 기다렸어요! 공은 어른이 주워줄 거예요';
      } else if (light === 'red') {
        hint = '차들이 기다려 줘요 — 끝까지 건너가요';
      } else if (light === 'blink') {
        hint = '깜빡여요 — 서둘러 건너요!';
      } else {
        hint = '🟢 초록불! 좌우를 살피며 건너가요';
      }
    } else if (this.crossingStarted && !inRoad && !beforeCurb) {
      hint = '다 건넜어요!';
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
    // 살핌 구간: lean으로 카메라가 실제 좌우 도로를 비춤(spatial-experience §"시선의 변화" 적용)
    if (this.lookRequired && !this.crossingStarted && this.lookState !== 'done') {
      const yaw = Math.max(-1, Math.min(1, input.lean)) * 6;
      navCam.lookAt(this.x + yaw, 1, this.z - 4);
    } else {
      navCam.lookAt(this.x, 1, this.z - 4);
    }

    if (this._crossStartT && !this._crossEndT && this.z <= XW.ROAD_B) {
      this._crossEndT = now;
      this.metrics.crossMs = Math.round(now - this._crossStartT);
    }

    hudProgressFill.style.width = `${Math.min(100, (-this.z) / XW.LEN * 100)}%`;
    if (this.z <= XW.GOAL) {
      this.repIdx++;
      if (this.repIdx >= this.repsTotal) this.done = true;
      else this._prepareNextRep(now);
    }
  }

  render() { renderer.render(navScene, navCam); }
  dispose() { navScene.remove(this.course); if (this.ball) navScene.remove(this.ball); }
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
function makeLabelSprite(text, { fg = '#232323', bg = '#f4f4f4' } = {}) {
  // 픽셀 가격표: 직각 + 하드보더
  const cv = document.createElement('canvas');
  cv.width = 256; cv.height = 96;
  const x = cv.getContext('2d');
  x.fillStyle = '#121212';
  x.fillRect(0, 0, 256, 96);           // 외곽 하드보더
  x.fillStyle = bg;
  x.fillRect(8, 8, 240, 74);           // 면
  x.fillStyle = 'rgba(0,0,0,.25)';
  x.fillRect(8, 70, 240, 12);          // 하단 음영 (블록 두께감)
  x.fillStyle = fg;
  x.font = 'bold 42px "DungGeunMo", "Malgun Gothic", monospace';
  x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText(text, 128, 46);
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cv), depthTest: false }));
  sp.scale.set(0.09, 0.034, 1);
  return sp;
}

function makeCardTexture(opt, state = 'idle') {
  // 복셀 선택 카드: 직각·이중 하드보더·상태색 (판정 로직 무관 — 텍스처 전용)
  const cv = document.createElement('canvas');
  cv.width = 256; cv.height = 320;
  const x = cv.getContext('2d');
  const face = state === 'correct' ? '#3d7a34' : state === 'wrong' ? '#8a3438' : '#3a3a3a';
  const edge = state === 'assist' ? '#ffd83d' : '#121212';
  x.fillStyle = edge;
  x.fillRect(0, 0, 256, 320);                    // 외곽 보더
  x.fillStyle = face;
  x.fillRect(10, 10, 236, 300);                  // 면
  x.fillStyle = 'rgba(255,255,255,.14)';
  x.fillRect(10, 10, 236, 14);                   // 상단 하이라이트
  x.fillStyle = 'rgba(0,0,0,.30)';
  x.fillRect(10, 288, 236, 22);                  // 하단 음영
  x.textAlign = 'center'; x.textBaseline = 'middle';
  x.font = '104px sans-serif';
  x.fillText(opt.emoji || '▫️', 128, 118);
  x.fillStyle = '#f4f4f4';
  const label = opt.label || '';
  x.font = `${label.length > 5 ? 38 : 50}px "DungGeunMo", "Malgun Gothic", monospace`;
  x.shadowColor = 'rgba(0,0,0,.6)'; x.shadowOffsetX = 3; x.shadowOffsetY = 3;
  x.fillText(label, 128, 244);
  x.shadowColor = 'transparent';
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
    setInstruction(step.prompt);
    hudStep.textContent = `${this.stepIdx + 1} / ${this.station.steps.length}`;
    hudProgressFill.style.width = `${this.stepIdx / this.station.steps.length * 100}%`;
    // 핫바: 스텝 슬롯 (현재 스텝 하이라이트 — 정답 이모지는 완료된 스텝만 공개)
    setHotbar(this.station.steps.map((s, i) => ({
      icon: i < this.stepIdx ? (s.options?.find(o => o.correct)?.emoji || '✔') : '❓',
      done: i < this.stepIdx,
      active: i === this.stepIdx,
    })));
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
    setHotbar(null);
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
    // P2 난이도 프리셋: 존 판정 배율·존 링 표시 (L5=숨김·위치 회상 — assist 발동 시 다시 표시)
    this.zoneScale = this.grading.zoneScale || 1;
    this.zoneRing.visible = this.grading.zoneRingVisible !== false;

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
    setInstruction(station.instruction || station.title);
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
    // 핫바: 목표 사물 슬롯 (방해 자극 제외)
    setHotbar(this.items.filter(i => !i.def.distractor).map(i => ({
      icon: libMeta(i.def.lib, session.assets).emoji,
      done: i.state === 'placed',
    })));
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
    const zs = pulse * this.radiusScale() * this.zoneScale;
    this.zoneRing.scale.set(zs, zs / stageAspect(), 1);
    this.zoneRing.visible = (this.grading.zoneRingVisible !== false) || this.assistLevel >= 1;
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
    if (d <= t.zoneRadius * this.zoneScale * this.radiusScale()) {
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
    setHotbar(null);
  }
}

/* ---------- 페이즈: 생활 장면 (Living Scene) ----------
   scene-grammar_v0.1.md 정본. station과 달리 여러 occupation(행동)이 한 장면에 공존하고,
   각 행동은 상태 변화를 남기며 서로의 전제조건이 된다(P5·P8). 판정은 기존 GRASP/CARRY/RELEASE
   FSM·양손 잡기를 재사용하고, 신규는 slide(축 제약 끌기)·bimanualLift(양손 임계값) 2개뿐(C절).
   렌더링은 기존 StationPhase와 동일한 거울 모드(풀스크린 웹캠 + 2.5D 오버레이) — 다이제틱 거울은
   MVP-B(세면실) 대상이며 이 침실 장면에는 적용하지 않는다(dual-perspective-system_v0.1.md §3). */
function makeLSHandFSM() {
  return { fsm: 'LOCKED', carryId: null, openHoldStart: null, lossStart: null };
}

class LivingScenePhase {
  constructor(scene) {
    this.scene = scene;
    this.grading = { ...GRADING_DEFAULTS, ...(scene.grading || {}) };
    this.root = new THREE.Group();
    stScene.add(this.root);
    this.done = false;
    this.startT = performance.now();
    this.assistLevel = 0;
    this.userState = { ...(scene.userState || {}) };
    this.metrics = { graspAttempts: 0, graspFails: 0, releases: 0, misplaced: 0,
                     trackLosses: 0, assistLevel: 0, stars: 0, wrongItem: 0 };
    this._purposeSwitched = false;

    // 배경(diegetic mirror 장면 전용 — 웹캠이 화면 전체가 아니라 거울에만 나타날 때 필요)
    if (scene.roomBackdrop) this._setupBackdrop(scene.roomBackdrop);

    // 배경 환경(비상호작용)
    this.envMeshes = (scene.envObjects || []).map(def => {
      const mesh = buildMesh(def.lib, def.scale || 1, session.assets);
      const w = toWorld(def.pos[0], def.pos[1]);
      mesh.position.set(w.x, w.y, -0.05);
      this.root.add(mesh);
      return mesh;
    });

    // Diegetic Mirror (MVP-B, dual-perspective-system_v0.1.md §5) — 있으면 웹캠은
    // 화면 전체가 아니라 이 거울 표면에만 나타남. 없으면 기존 풀스크린 거울 모드 유지(§3 스코프).
    if (scene.mirror) this._setupMirror(scene.mirror);
    videoWrap.classList.toggle('hidden', !!scene.mirror);

    // 조작 사물 (파생 오브젝트는 mesh 생성을 보류 — P8)
    this.props = (scene.props || []).map(def => {
      const p = { def, id: def.id, nx: def.pos[0], ny: def.pos[1],
        state: 'free', visible: !def.startHidden, mesh: null, anchor: null };
      if (p.visible) this._buildPropMesh(p);
      return p;
    });

    this.handFSM = { L: makeLSHandFSM(), R: makeLSHandFSM() };
    applyPlaceDecor(this.root, scene);
    setInstruction(scene.purpose || scene.title);
    this._assistPropId = null;
    this.updateHudStep();
  }

  _setupBackdrop(color) {
    const h = 1 / stageAspect();
    const wall = new THREE.Mesh(
      new THREE.PlaneGeometry(1.6, h * 1.6),
      new THREE.MeshStandardMaterial({ color, flatShading: true })
    );
    wall.position.set(0.5, -h / 2, -0.3);
    this.root.add(wall);
  }

  /* 웹캠 영상을 3D 월드 안 거울 표면(VideoTexture)으로 편입.
     화면 전체가 카메라로 바뀌는 대신, 거울 경계 안에서만 자기 모습을 본다.
     마우스 모드(videoEl 없음)는 자리표시 색면으로 대체 — 인터랙션 판정에는 영향 없음. */
  _setupMirror(def) {
    const videoEl = driver?.videoEl || null;
    const w = def.w, hgt = def.h;
    let material;
    if (videoEl) {
      const vt = new THREE.VideoTexture(videoEl);
      vt.minFilter = THREE.LinearFilter; vt.magFilter = THREE.LinearFilter;
      // object-fit:cover 크롭 — 거울의 화면상 종횡비 vs 카메라 종횡비 불일치 대응(§6 리스크 1)
      const videoAspect = (videoEl.videoWidth || 16) / (videoEl.videoHeight || 9);
      const mirrorScreenAspect = w / (hgt * stageAspect());
      if (videoAspect > mirrorScreenAspect) {
        vt.repeat.set(mirrorScreenAspect / videoAspect, 1);
        vt.offset.set((1 - vt.repeat.x) / 2, 0);
      } else {
        vt.repeat.set(1, videoAspect / mirrorScreenAspect);
        vt.offset.set(0, (1 - vt.repeat.y) / 2);
      }
      material = new THREE.MeshBasicMaterial({ map: vt });
      this._mirrorTexture = vt;
    } else {
      material = new THREE.MeshStandardMaterial({ color: '#3a4a5a', flatShading: true });
    }
    const wpos = toWorld(def.pos[0], def.pos[1]);
    const frame = new THREE.Mesh(
      new THREE.PlaneGeometry(w + 0.035, hgt + 0.035),
      new THREE.MeshStandardMaterial({ color: '#e2e8f0', flatShading: true })
    );
    frame.position.set(wpos.x, wpos.y, -0.02);
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, hgt), material);
    mesh.position.set(wpos.x, wpos.y, -0.015);
    mesh.scale.x = -1; // 거울 반전(카메라 CSS 반전은 VideoTexture 픽셀 자체엔 미적용 — 지오메트리로 뒤집음
    this.root.add(frame, mesh);
    this._mirrorMesh = mesh;
  }

  _buildPropMesh(p) {
    const mesh = buildMesh(p.def.lib, p.def.scale || 1, session.assets);
    const w = toWorld(p.nx, p.ny);
    mesh.position.set(w.x, w.y, 0.1);
    this.root.add(mesh);
    p.mesh = mesh;
  }

  propById(id) { return this.props.find(p => p.id === id); }

  requiredProps() { return this.props.filter(p => p.def.required); }

  updateHudStep() {
    const req = this.requiredProps();
    const done = req.filter(p => p.state === 'done').length;
    hudStep.textContent = `${done} / ${req.length}`;
    hudProgressFill.style.width = `${req.length ? done / req.length * 100 : 100}%`;
    setHotbar(this.props.filter(p => p.visible && !p.def.distractor).map(p => ({
      icon: libMeta(p.def.lib, session.assets).emoji,
      done: p.state === 'done',
    })));
  }

  radiusScale() { return this.assistLevel >= 1 ? PARAMS.ASSIST_SCALE : 1; }

  graspRadiusOf(p, pad = 1) {
    const meta = libMeta(p.def.lib, session.assets);
    return (this.grading.graspRadius + meta.size * (p.def.scale || 1) * 0.5) * this.radiusScale() * pad;
  }

  findGraspTarget(k, pos) {
    let best = null, bestD = Infinity;
    for (const p of this.props) {
      if (!p.visible || p.state === 'carried' || p.state === 'done') continue;
      if (p.def.hand === 'both') continue;
      if (p.def.hand && p.def.hand !== 'any' && p.def.hand !== k) continue;
      const d = Math.hypot(pos.x - p.nx, pos.y - p.ny);
      if (d <= this.graspRadiusOf(p) && d < bestD) { best = p; bestD = d; }
    }
    return best;
  }

  nearBimanualProp(pos) {
    return this.props.some(p => p.visible && p.def.hand === 'both' && p.state === 'free' &&
      Math.hypot(pos.x - p.nx, pos.y - p.ny) <= this.graspRadiusOf(p, 1.3));
  }

  tryBimanualGrasp(input) {
    const L = input.hands.L, R = input.hands.R;
    if (!(L.present && R.present && L.cls === 'FIST' && R.cls === 'FIST')) return;
    if (this.handFSM.L.carryId != null || this.handFSM.R.carryId != null) return;
    for (const p of this.props) {
      if (p.def.hand !== 'both' || p.state !== 'free') continue;
      const r = this.graspRadiusOf(p, 1.3);
      if (Math.hypot(L.pos.x - p.nx, L.pos.y - p.ny) <= r &&
          Math.hypot(R.pos.x - p.nx, R.pos.y - p.ny) <= r) {
        p.state = 'carried';
        p.anchor = { mx: (L.pos.x + R.pos.x) / 2, my: (L.pos.y + R.pos.y) / 2, startX: p.nx, startY: p.ny };
        ['L', 'R'].forEach(k => {
          this.handFSM[k].fsm = 'CARRY'; this.handFSM[k].carryId = p.id; this.handFSM[k].openHoldStart = null;
        });
        this.metrics.graspAttempts++;
        sfx.grab();
        return;
      }
    }
  }

  /* 파생 오브젝트 노출(P8) + 상태 반영 */
  applyOnComplete(p) {
    const oc = p.def.onComplete;
    if (!oc) return;
    if (oc.setUserState) Object.assign(this.userState, oc.setUserState);
    if (oc.reveal) {
      const rp = this.propById(oc.reveal);
      if (rp && !rp.visible) { rp.visible = true; this._buildPropMesh(rp); }
    }
  }

  /* 존 밖/부적합 반납 — 실패가 아니라 "되돌아옴" (P9). 잠깐 안내문을 띄우고 사라진다. */
  bounceProp(p, msg) {
    p.state = 'free';
    if (msg) {
      banner.textContent = msg;
      banner.classList.remove('hidden');
      clearTimeout(this._bounceT);
      this._bounceT = setTimeout(() => { if (!this.done) banner.classList.add('hidden'); }, 1400);
    }
  }

  completeCarryToZone(k, f, p, now) {
    f.carryId = null; f.openHoldStart = null; f.fsm = 'RELEASE';
    this.metrics.releases++;
    const z = p.def.zone;
    const d = Math.hypot(p.nx - z.pos[0], p.ny - z.pos[1]);
    if (d > z.radius * (this.grading.zoneScale || 1) * this.radiusScale()) {
      this.metrics.misplaced++;
      this.bounceProp(p); // 존 밖 → 그 자리에 남음, 재시도 가능 (실패 아님)
      return;
    }
    if (p.def.distractor) {
      // 목록에 없는 물건(유혹) — 선택적 주의·충동 억제. 담아도 되돌아올 뿐, 벌점 없음.
      this.metrics.wrongItem++;
      tone(294, 0.25, 'sine', 0.1); tone(262, 0.3, 'sine', 0.1, 0.15);
      this.bounceProp(p, '🙅 심부름 목록에 없어요 — 다시 골라봐요');
      return;
    }
    if (p.def.scanZone && !p._scanned) {
      // ZONE_PASS 신규 판정 — 계산대를 지나야 장바구니 담기가 완료된다(P5: 순서가 결과를 만든다)
      this.bounceProp(p, '📷 계산대를 먼저 지나가야 해요');
      return;
    }
    p.state = 'done';
    p.nx = z.pos[0]; p.ny = z.pos[1];
    if (p.mesh) { const w = toWorld(p.nx, p.ny); p.mesh.scale.multiplyScalar(0.75); p.mesh.position.set(w.x, w.y, 0.1); }
    this.applyOnComplete(p);
    sfx.drop();
    burst(p.nx, p.ny);
    this.updateHudStep();
    this.checkExit();
  }

  update(input, dt) {
    const now = performance.now();
    const elapsedS = (now - this.startT) / 1000;

    // 작업기억 유발: 목적(심부름 목록)을 잠깐만 보여주고 일반 안내문으로 전환.
    // 이후엔 assist 1단계(개별 occupation 힌트)만으로 다시 떠올리게 한다.
    if (this.scene.listRevealS && !this._purposeSwitched && elapsedS > this.scene.listRevealS) {
      this._purposeSwitched = true;
      setInstruction(this.scene.genericPrompt || this.scene.title);
    }

    const newAssist = this.done ? this.assistLevel
      : elapsedS > this.grading.assistTimeoutS * 2 ? 2 : elapsedS > this.grading.assistTimeoutS ? 1 : 0;
    if (newAssist !== this.assistLevel) {
      this.assistLevel = newAssist;
      this.metrics.assistLevel = Math.max(this.metrics.assistLevel, newAssist);
      if (newAssist >= 1) {
        // P3: 지시문은 assist 1단계에서만 — 첫 미완료 필수 행동의 occupation을 힌트로
        const next = this.requiredProps().find(p => p.state !== 'done' && p.visible);
        assistBadge.textContent = next ? next.def.occupation : '도움: 주변을 둘러보아요';
        assistBadge.classList.remove('hidden');
      }
      sfx.assist();
    }

    this.tryBimanualGrasp(input);

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
        if (f.fsm === 'CARRY' && f.carryId != null) {
          if (!f.lossStart) f.lossStart = now;
          if (now - f.lossStart > PARAMS.TRACK_LOSS_MS) {
            const p = this.propById(f.carryId);
            if (p) p.state = 'free';
            const wasBimanual = p && p.def.hand === 'both';
            f.carryId = null; f.fsm = 'LOCKED'; f.openHoldStart = null;
            if (wasBimanual) {
              const of = this.handFSM[k === 'L' ? 'R' : 'L'];
              of.carryId = null; of.fsm = 'ARMED'; of.openHoldStart = null;
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
          if (hand.cls === 'FIST' && f.carryId == null) {
            const p = this.findGraspTarget(k, hand.pos);
            if (p) {
              p.state = 'carried'; f.carryId = p.id; f.fsm = 'CARRY';
              p.anchor = { hx: hand.pos.x, hy: hand.pos.y, startX: p.nx, startY: p.ny };
              this.metrics.graspAttempts++;
              sfx.grab();
            } else if (this.nearBimanualProp(hand.pos)) {
              // 양손 사물 근처 — 파트너 손 대기 (실패 아님)
            } else {
              this.metrics.graspAttempts++;
              this.metrics.graspFails++;
              f.fsm = 'LOCKED'; // R1: 빈 주먹 → 다시 펴야 재무장
            }
          }
          break;
        case 'CARRY': {
          const p = this.propById(f.carryId);
          if (!p) { f.fsm = 'ARMED'; f.carryId = null; break; }

          if (p.def.interaction === 'carryToZone') {
            p.nx = hand.pos.x; p.ny = hand.pos.y;
            // ZONE_PASS: 운반 중 계산대 존을 지나면 스캔됨(경유 판정 — 놓기가 아니라 통과)
            if (p.def.scanZone && !p._scanned) {
              const sd = Math.hypot(p.nx - p.def.scanZone.pos[0], p.ny - p.def.scanZone.pos[1]);
              if (sd <= p.def.scanZone.radius * this.radiusScale()) {
                p._scanned = true;
                tone(880, 0.08, 'square', 0.12);
                burst(p.nx, p.ny, 0x68d391);
              }
            }
            if (hand.cls === 'OPEN' && Math.abs(hand.vy) <= PARAMS.RELEASE_MAX_SPEED) {
              if (!f.openHoldStart) f.openHoldStart = now;
              if (now - f.openHoldStart >= this.grading.tReleaseMs) this.completeCarryToZone(k, f, p, now);
            } else f.openHoldStart = null;
          } else if (p.def.interaction === 'oscillate') {
            // 왕복(양치): 쥔 사물이 손을 따라가며, 좌우 방향 반전 횟수를 센다(걷기 스트로크와 동일 원리).
            const prevX = p.nx;
            p.nx = hand.pos.x; p.ny = hand.pos.y;
            const dt = Math.max(1e-3, (now - (p._oscLastT || now)) / 1000);
            p._oscLastT = now;
            const vx = (p.nx - prevX) / dt;
            const sign = Math.abs(vx) > PARAMS.OSC_MIN_VX ? Math.sign(vx) : 0;
            if (sign !== 0 && sign !== (p._oscLastSign || 0)) {
              p._oscCount = (p._oscCount || 0) + 1;
              p._oscLastSign = sign;
              sfx.stroke();
            }
            if ((p._oscCount || 0) >= (p.def.oscTarget || PARAMS.OSC_TARGET_DEFAULT)) {
              p.state = 'done'; f.fsm = 'ARMED'; f.carryId = null;
              this.applyOnComplete(p);
              sfx.drop(); burst(p.nx, p.ny);
              this.updateHudStep(); this.checkExit();
            } else if (hand.cls === 'OPEN' && Math.abs(hand.vy) <= PARAMS.RELEASE_MAX_SPEED) {
              // 도중에 내려놓으면 실패 없이 그 자리에 남음 — 진행한 왕복 횟수는 보존(재시도 가능)
              if (!f.openHoldStart) f.openHoldStart = now;
              if (now - f.openHoldStart >= this.grading.tReleaseMs) {
                p.state = 'free'; f.fsm = 'RELEASE'; f.carryId = null; f.openHoldStart = null;
                this.metrics.releases++;
              }
            } else f.openHoldStart = null;
          } else if (p.def.interaction === 'slide') {
            if (hand.cls !== 'FIST') { f.fsm = 'ARMED'; f.carryId = null; break; }
            const axisKey = p.def.axis === 'y' ? 'y' : 'x';
            const raw = (hand.pos[axisKey] - p.anchor[axisKey === 'x' ? 'hx' : 'hy']) * p.def.dir;
            const progress = Math.max(0, Math.min(1, raw / p.def.distance));
            if (axisKey === 'x') p.nx = p.anchor.startX + p.def.dir * p.def.distance * progress;
            else p.ny = p.anchor.startY + p.def.dir * p.def.distance * progress;
            if (progress >= 1) {
              p.state = 'done'; f.fsm = 'ARMED'; f.carryId = null;
              this.applyOnComplete(p);
              sfx.drop(); burst(p.nx, p.ny);
              this.updateHudStep(); this.checkExit();
            }
          } else if (p.def.interaction === 'bimanualLift') {
            const other = input.hands[k === 'L' ? 'R' : 'L'];
            if (hand.cls !== 'FIST' || !other.present || other.cls !== 'FIST') {
              // 어느 한쪽 손이라도 놓으면 실패 없이 대기 상태로 복귀
              p.state = 'free';
              ['L', 'R'].forEach(kk => {
                if (this.handFSM[kk].carryId === p.id) {
                  this.handFSM[kk].fsm = 'ARMED'; this.handFSM[kk].carryId = null;
                }
              });
              break;
            }
            const midY = (hand.pos.y + other.pos.y) / 2;
            const raw = (midY - p.anchor.my) * p.def.dir;
            const progress = Math.max(0, Math.min(1, raw / p.def.distance));
            p.nx = p.anchor.startX + (p.def.foldedPos[0] - p.anchor.startX) * progress;
            p.ny = p.anchor.startY + (p.def.foldedPos[1] - p.anchor.startY) * progress;
            if (progress >= 1) {
              p.state = 'done';
              p.nx = p.def.foldedPos[0]; p.ny = p.def.foldedPos[1];
              if (p.mesh) p.mesh.scale.multiplyScalar(p.def.foldedScale || 0.6);
              // 완료 순간 두 손 다 FIST 상태 — ARMED로 두면 forEach 처리 순서상 아직
              // 처리 전인 손이 '빈 주먹'으로 오판정돼 즉시 LOCKED+graspFail이 발생(R1 오작동).
              // 두 손 다 LOCKED로 보내 다시 펴야 재무장하게 하여 일관되게 만든다.
              ['L', 'R'].forEach(kk => { this.handFSM[kk].fsm = 'LOCKED'; this.handFSM[kk].carryId = null; });
              this.applyOnComplete(p);
              sfx.drop(); burst(p.nx, p.ny);
              this.updateHudStep(); this.checkExit();
            }
          }
          break;
        }
        case 'RELEASE':
          f.fsm = 'ARMED';
          break;
      }
    });

    // 사물 위치 반영
    for (const p of this.props) {
      if (!p.visible || !p.mesh) continue;
      const w = toWorld(p.nx, p.ny);
      const z = p.state === 'carried' ? 0.4 : 0.1;
      p.mesh.position.lerp(new THREE.Vector3(w.x, w.y, z), Math.min(1, dt * 14));
      if (p.mesh.userData.spin) p.mesh.userData.spin.rotation.y += dt * (p.state === 'carried' ? 2.2 : 0.3);
      else p.mesh.rotation.y += dt * (p.state === 'carried' ? 2.2 : 0.3);
    }

    updateParticles(dt);
  }

  checkExit() {
    if (this.done) return;
    const req = this.requiredProps();
    if (req.length && req.every(p => p.state === 'done')) this.complete();
  }

  complete() {
    this.done = true;
    this.metrics.stars = Math.max(1, 3 - this.metrics.assistLevel);
    sfx.stationDone();
    const last = this.requiredProps().slice(-1)[0];
    burst(last ? last.nx : 0.5, last ? last.ny : 0.5, 0x4fd1c5);
    const transition = this.scene.exit?.transition || '참 잘했어요!';
    banner.textContent = `${'⭐'.repeat(this.metrics.stars)} ${transition}`;
    banner.classList.remove('hidden');
  }

  render() { renderer.render(stScene, stCam); }
  dispose() {
    stScene.remove(this.root);
    this._mirrorTexture?.dispose();
    cursors.L.visible = false; cursors.R.visible = false;
    banner.classList.add('hidden');
    assistBadge.classList.add('hidden');
    placeChip.classList.add('hidden');
    videoWrap.style.background = '';
    videoWrap.classList.remove('hidden'); // diegetic 거울로 숨겼던 경우 다음 페이즈를 위해 복원
    setHotbar(null);
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
              : item.type === 'livingScene' ? new LivingScenePhase(item)
              : item.kind === 'select' ? new SelectPhase(item)
              : new StationPhase(item);
    });
    const phaseRef = current;
    await waitPhase(current, (item.type === 'station' || item.type === 'livingScene') ? 1800 : 400);
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
  if (e.type === 'segment') {
    const gT = e.gatesTotal, fT = e.forksTotal, flT = e.flagsTotal;
    const extra = (gT ? ` · 게이트 ${e.gatesPassed || 0}/${gT}` : '')
      + (fT ? ` · 갈림길 ${e.forksCorrect || 0}/${fT}` : '')
      + (flT ? ` · 깃발 관찰 ${e.flagsSeen || 0}/${flT}(참고용)` : '');
    return `${head} — ${sec}초 · 스트로크 ${e.strokes}${extra}${e.stars ? ` · ${'⭐'.repeat(e.stars)}` : ''}`;
  }
  if (e.type === 'crossing') {
    return `${head} — ${sec}초 · 신호대기 ${(e.waitMs / 1000).toFixed(1)}초 · 건너기 ${(e.crossMs / 1000).toFixed(1)}초`
      + ` · 대기 중 출발시도 ${e.redBlockedPushes} · 스트로크 ${e.strokes}`
      + (e.lookBothDone ? ` · 좌우살핌 ${e.lookBothDone}회` : '')
      + (e.ballChaseAttempts ? ` · 공 따라가려는 시도 ${e.ballChaseAttempts}회(참고용)` : '');
  }
  if (e.wrongSelects != null) {
    return `${head} — ${sec}초 · 스텝 ${e.steps} · 오선택 ${e.wrongSelects}`
      + ` · 도움 ${e.assistLevel} · ${'⭐'.repeat(e.stars || 0)}`;
  }
  return `${head} — ${sec}초 · 잡기 ${e.graspAttempts}(빈손 ${e.graspFails}) · 존 밖 놓기 ${e.misplaced}`
    + `${e.wrongItem ? ` · 방해자극 시도 ${e.wrongItem}` : ''}${e.budgetOvers ? ` · 예산초과 시도 ${e.budgetOvers}` : ''}`
    + ` · 추적소실 ${e.trackLosses} · 도움 ${e.assistLevel} · ${'⭐'.repeat(e.stars || 0)}`;
}

/* ---------- 회차 기록 (P1, difficulty-progression_v0.1.md) ----------
   C2 준수: 파생 수치·별점만, 아동 식별정보 없음, 이 기기 localStorage에만 저장.
   기록 대상 = 완료 화면에 도달한 회차(전체 하루 완주). 개별 연습은 별점 토스트만. */
const HISTORY_KEY = 'adl-history-v1';
const HISTORY_CAP = 30;

function loadHistory() {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY)) || []; }
  catch { return []; }
}
function saveHistory(h) {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(h.slice(-HISTORY_CAP)));
}

/* 영역 점수 (0~100, 데이터 없으면 null) — 공식은 투명하게 유지, 임상 판단 대체 아님 */
function computeDomains(entries) {
  const agg = { graspAtt: 0, graspFails: 0, releases: 0, misplaced: 0, wrongItem: 0,
                selSteps: 0, wrongSelects: 0, redPushes: 0, assistSum: 0, assistN: 0 };
  for (const e of entries) {
    agg.graspAtt += e.graspAttempts || 0;
    agg.graspFails += e.graspFails || 0;
    agg.releases += e.releases || 0;
    agg.misplaced += e.misplaced || 0;
    agg.wrongItem += e.wrongItem || 0;
    if (e.wrongSelects != null) { agg.selSteps += e.steps || 0; agg.wrongSelects += e.wrongSelects; }
    if (e.type === 'crossing') agg.redPushes += e.redBlockedPushes || 0;
    if (e.assistLevel != null) { agg.assistSum += e.assistLevel; agg.assistN++; }
  }
  const pct = v => Math.max(0, Math.min(100, Math.round(v * 100)));
  const domains = {};
  // 조작 정확도: 잡기 성공률과 놓기 정확률의 평균
  const parts = [];
  if (agg.graspAtt > 0) parts.push((agg.graspAtt - agg.graspFails) / agg.graspAtt);
  if (agg.releases > 0) parts.push((agg.releases - agg.misplaced) / agg.releases);
  domains.motor = parts.length ? pct(parts.reduce((s, v) => s + v, 0) / parts.length) : null;
  // 선택·주의: 정답 선택 / (정답+오선택+방해자극 시도)
  const selTotal = agg.selSteps + agg.wrongSelects + agg.wrongItem;
  domains.select = selTotal > 0 ? pct(agg.selSteps / selTotal) : null;
  // 충동 억제: 빨간불 출발 시도당 감점 (횡단보도가 없으면 null)
  const hasCrossing = entries.some(e => e.type === 'crossing');
  domains.inhibit = hasCrossing ? Math.max(0, 100 - 20 * agg.redPushes) : null;
  // 자립도: 도움 없이 수행한 비율 (assist 0=만점, 2=0점)
  domains.indep = agg.assistN > 0 ? pct(1 - agg.assistSum / (2 * agg.assistN)) : null;
  return { domains, agg };
}

const DOMAIN_LABELS = { motor: '조작 정확도', select: '선택·주의', inhibit: '충동 억제', indep: '자립도' };

/* 다음 훈련 권고 (규칙 기반 · 치료사용 참고 — 임상 판단을 대체하지 않음) */
function buildRecommendations(agg, domains, prev) {
  const recs = [];
  if (agg.redPushes >= 3)
    recs.push(`횡단보도 대기 중 출발 시도 ${agg.redPushes}회 — 충동억제 과제 수준 유지 권장`);
  if (domains.motor != null && domains.motor < 70)
    recs.push('잡기·놓기 실패가 잦았어요 — 잡기 반경 확대 또는 사물 크기 상향 고려');
  if (domains.motor != null && domains.motor >= 90 && agg.assistSum === 0)
    recs.push('조작 과제를 도움 없이 안정 수행 — 난이도 상향(존 축소·거리 확대) 제안');
  if (agg.wrongItem >= 2)
    recs.push(`유혹 자극 시도 ${agg.wrongItem}회 — 선택적 주의 과제 반복 권장`);
  if (agg.assistSum >= 3)
    recs.push('도움 발동이 잦았어요 — 현재 수준 반복 또는 하향 고려');
  if (prev && prev.stars != null) {
    const d = (report.entries.reduce((s, e) => s + (e.stars || 0), 0)) - prev.stars;
    if (d > 0) recs.push(`지난 회차보다 별 +${d} — 성장하고 있어요!`);
  }
  if (!recs.length) recs.push('안정적으로 수행했어요 — 현재 수준 유지');
  return recs.slice(0, 3);
}

/* 회차별 별점 스파크라인 (canvas 직접 — 외부 라이브러리 없음, 복셀풍 사각 점) */
function drawTrend(history) {
  const cv = document.getElementById('trendCanvas');
  const x = cv.getContext('2d');
  x.clearRect(0, 0, cv.width, cv.height);
  const runs = history.slice(-15);
  if (!runs.length) return;
  const maxStars = Math.max(1, ...runs.map(r => r.stars || 0));
  const padX = 16, padY = 10;
  const W = cv.width - padX * 2, H = cv.height - padY * 2;
  const px = i => runs.length === 1 ? padX + W / 2 : padX + (i / (runs.length - 1)) * W;
  const py = s => padY + H - (s / maxStars) * H;
  x.strokeStyle = '#4a4a4a'; x.lineWidth = 1;
  x.beginPath(); x.moveTo(padX, padY + H); x.lineTo(padX + W, padY + H); x.stroke();
  x.strokeStyle = '#6abe4b'; x.lineWidth = 2;
  x.beginPath();
  runs.forEach((r, i) => { const X = px(i), Y = py(r.stars || 0); i ? x.lineTo(X, Y) : x.moveTo(X, Y); });
  x.stroke();
  runs.forEach((r, i) => {
    const last = i === runs.length - 1;
    x.fillStyle = last ? '#ffd83d' : '#6abe4b';
    const s = last ? 8 : 6;
    x.fillRect(px(i) - s / 2, py(r.stars || 0) - s / 2, s, s);
  });
  x.fillStyle = '#b3b3b3';
  x.font = '10px monospace';
  x.fillText(`${runs.length}회차 · 최고 ⭐${maxStars}`, padX, 10);
}

function renderViz(prev, history) {
  const { domains, agg } = computeDomains(report.entries);
  const bars = document.getElementById('profileBars');
  bars.innerHTML = Object.entries(DOMAIN_LABELS).map(([k, label]) => {
    const v = domains[k];
    if (v == null) {
      return `<div class="profRow nodata"><span class="pl">${label}</span>
        <div class="pbar"><div style="width:0%"></div></div>
        <span class="pv">—</span><span class="pd flat">자료없음</span></div>`;
    }
    const pv = prev?.domains?.[k];
    let delta = '<span class="pd flat">—</span>';
    if (pv != null) {
      const d = v - pv;
      delta = d > 0 ? `<span class="pd up">▲+${d}</span>`
            : d < 0 ? `<span class="pd down">▼${d}</span>`
            : '<span class="pd flat">=</span>';
    }
    return `<div class="profRow"><span class="pl">${label}</span>
      <div class="pbar"><div style="width:${v}%"></div></div>
      <span class="pv">${v}</span>${delta}</div>`;
  }).join('');
  drawTrend(history);
  document.getElementById('recList').innerHTML =
    buildRecommendations(agg, domains, prev).map(r => `<div class="rec">${r}</div>`).join('');
  document.getElementById('vizBox').classList.remove('hidden');
  return domains;
}

/* ---------- 성장 제안 (P3 — 자동 변경이 아니라 제안, 치료사/아동이 승인) ----------
   규칙(투명): 도움 0 + 핵심 지표 충족 → 한 단계 상향 제안 / 도움 2 발동 → 한 단계 하향 제안.
   대상 = difficulty(L1~5)가 지정된 옮기기·고르기·생활장면. crossing·segment는 자체 레벨(P4). */
function computeSuggestions(entries) {
  const out = [];
  for (const e of entries) {
    if (!e.lv) continue;
    const isSelect = e.wrongSelects != null;
    const isMove = e.graspAttempts != null && !isSelect;
    if (!isSelect && !isMove) continue;
    if (e.assistLevel === 0 && e.lv < 5) {
      const ok = isSelect
        ? e.wrongSelects === 0
        : (e.graspFails <= 1 && (e.misplaced || 0) <= 1 && !(e.wrongItem > 0));
      if (ok) out.push({ title: e.title, from: e.lv, to: e.lv + 1, dir: 'up', reason: '도움 없이 안정 수행' });
    } else if (e.assistLevel >= 2 && e.lv > 1) {
      out.push({ title: e.title, from: e.lv, to: e.lv - 1, dir: 'down', reason: '도움이 많이 필요했어요' });
    }
  }
  return out;
}

/* 현재 세션에 실제로 존재하는 과제만 남긴 대기 제안 */
function pendingSuggestions() {
  const sugg = loadJSONKey(SUGGEST_KEY, []);
  const titles = new Set((session.flow || []).filter(f => f.difficulty).map(f => f.title));
  return sugg.filter(sg => titles.has(sg.title));
}

function renderSuggestCard() {
  const card = document.getElementById('suggestCard');
  const pending = pendingSuggestions();
  if (!pending.length) { card.classList.add('hidden'); return; }
  const SHOW = 4;
  const rows = pending.slice(0, SHOW).map(sg =>
    `<div class="sg">${sg.title} <span class="lv">L${sg.from}</span>` +
    `<span class="${sg.dir}"> ${sg.dir === 'up' ? '▲' : '▼'} L${sg.to}</span>` +
    ` <span class="why">· ${sg.reason}</span></div>`).join('');
  const more = pending.length > SHOW ? `<div class="more">외 ${pending.length - SHOW}개 과제</div>` : '';
  document.getElementById('suggestList').innerHTML = rows + more;
  card.classList.remove('hidden');
}

document.getElementById('btnSuggestYes').addEventListener('click', () => {
  const pending = pendingSuggestions();
  const ov = loadJSONKey(OVERRIDE_KEY, {});
  for (const sg of pending) {
    const f = (session.flow || []).find(x => x.title === sg.title && x.difficulty);
    if (f) { f.difficulty = sg.to; applyDifficultyPreset(f); }
    ov[sg.title] = sg.to;
  }
  localStorage.setItem(OVERRIDE_KEY, JSON.stringify(ov));
  localStorage.removeItem(SUGGEST_KEY);
  document.getElementById('suggestCard').classList.add('hidden');
  startDesc.textContent = `과제 ${pending.length}개의 수준을 바꿨어요 — 오늘도 화이팅!`;
});
document.getElementById('btnSuggestNo').addEventListener('click', () => {
  localStorage.removeItem(SUGGEST_KEY);
  document.getElementById('suggestCard').classList.add('hidden');
});

function showCompletion() {
  const totalStars = report.entries.reduce((s, e) => s + (e.stars || 0), 0);
  const totalSec = Math.round(report.entries.reduce((s, e) => s + e.ms, 0) / 1000);
  startOverlay.classList.remove('hidden');
  startTitle.textContent = `🌟 세션 완료! ⭐×${totalStars}`;
  startDesc.textContent = `오늘 정말 잘했어요 — 총 ${Math.floor(totalSec / 60)}분 ${totalSec % 60}초. 한 번 더 할까요?`;
  btnStart.textContent = '다시 하기';
  btnStart.disabled = false;

  // 회차 기록: 이전 회차와 비교 → 시각화 → 이번 회차 저장
  const history = loadHistory();
  const prev = history[history.length - 1] || null;
  const domains = renderViz(prev, history.concat([{ stars: totalStars }])); // 추세엔 이번 회차 포함
  report.runNo = history.length + 1;
  history.push({ at: report.startedAt, title: report.title, stars: totalStars, domains });
  saveHistory(history);

  // P3: 이번 회차 수행으로 성장 제안 생성 (다음 시작 화면까지 유지)
  const sugg = computeSuggestions(report.entries);
  if (sugg.length) localStorage.setItem(SUGGEST_KEY, JSON.stringify(sugg));
  else localStorage.removeItem(SUGGEST_KEY);
  renderSuggestCard();

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
const REPORT_COLS = ['idx', 'type', 'title', 'place', 'lv', 'ms', 'strokes', 'graspAttempts', 'graspFails',
  'releases', 'misplaced', 'wrongItem', 'budgetOvers', 'wrongSelects', 'steps', 'trackLosses',
  'assistLevel', 'stars', 'redBlockedPushes', 'waitMs', 'crossMs',
  'gatesPassed', 'gatesTotal', 'forksCorrect', 'forksTotal', 'laneDeviationAvg',
  'flagsSeen', 'flagsTotal', 'lookBothDone', 'ballChaseAttempts'];
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
document.getElementById('btnHistCsv').addEventListener('click', () => {
  const h = loadHistory();
  const cols = ['run', 'at', 'title', 'stars', ...Object.keys(DOMAIN_LABELS)];
  const rows = h.map((r, i) =>
    [i + 1, r.at, r.title, r.stars, ...Object.keys(DOMAIN_LABELS).map(k => r.domains?.[k] ?? '')].join(','));
  downloadBlob([cols.join(','), ...rows].join('\n'), 'text/csv;charset=utf-8;',
    `adl-history_${new Date().toISOString().slice(0, 10)}.csv`);
});
document.getElementById('btnHistClear').addEventListener('click', () => {
  if (!confirm('이 컴퓨터에 저장된 회차 기록·성장 제안·레벨 조정을 모두 지울까요? (필요하면 먼저 "기록 CSV"로 내보내세요)')) return;
  localStorage.removeItem(HISTORY_KEY);
  localStorage.removeItem(SUGGEST_KEY);
  localStorage.removeItem(OVERRIDE_KEY);
  document.getElementById('vizBox').classList.add('hidden');
  document.getElementById('suggestCard').classList.add('hidden');
});

function scheduleFrame(fn) {
  // 탭이 숨겨지면 rAF가 정지 — setTimeout 폴백으로 세션 유지
  if (document.visibilityState === 'hidden') setTimeout(fn, 33);
  else requestAnimationFrame(fn);
}

/* 추적 소실 표시 — 거울 조작 과제에서 손이 안 보이면 명확히 알림 (접근성) */
const trackLostEl = document.getElementById('trackLost');
let handLostSince = 0;

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
  // 손 미검출 안내 (웹캠 모드 + 거울 조작 과제에서만)
  const mirrorTask = current && (current instanceof StationPhase || current instanceof SelectPhase || current instanceof LivingScenePhase);
  if (driver.needsCamera && mirrorTask && !current.done) {
    const anyHand = input.hands.L.present || input.hands.R.present;
    if (!anyHand) {
      if (!handLostSince) handLostSince = now;
      if (now - handLostSince > 1200) trackLostEl.classList.remove('hidden');
    } else {
      handLostSince = 0;
      trackLostEl.classList.add('hidden');
    }
  } else {
    handLostSince = 0;
    trackLostEl.classList.add('hidden');
  }
  const fps = 1 / Math.max(1e-4, dt);
  fpsHist.push(fps); if (fpsHist.length > 40) fpsHist.shift();
  fpsBadge.textContent = `FPS ${(fpsHist.reduce((s, v) => s + v, 0) / fpsHist.length).toFixed(0)}`;
}

/* 음소거 토글 (버튼 · M 키) */
const btnMute = document.getElementById('btnMute');
function setMuted(v) {
  muted = v;
  btnMute.textContent = muted ? '🔇' : '🔊';
  if (muted && 'speechSynthesis' in window) window.speechSynthesis.cancel();
}
btnMute.addEventListener('click', () => setMuted(!muted));
window.addEventListener('keydown', e => {
  if (e.key.toLowerCase() === 'm' && !e.repeat) setMuted(!muted);
});

/* ---------- 드라이버 초기화 · 캘리브레이션 (전체·개별 공용) ---------- */
const isMouseMode = () => new URLSearchParams(location.search).get('input') === 'mouse';

function hideMenus() {
  startOverlay.classList.add('hidden');
  stageMenu.classList.add('hidden');
}

/* 복셀 로딩 화면 — 실제 초기화 단계를 표시 (스피너 없음) */
const loadingOverlay = document.getElementById('loadingOverlay');
function setLoadStage(stage) {
  const steps = { camera: 33, model: 66, ready: 100 };
  document.getElementById('loadFill').style.width = `${steps[stage] || 0}%`;
  const mark = (id, cls) => { const el = document.getElementById(id); el.className = cls; };
  mark('loadCam', stage === 'camera' ? 'on' : 'ok');
  mark('loadModel', stage === 'camera' ? '' : stage === 'model' ? 'on' : 'ok');
  mark('loadReady', stage === 'ready' ? 'ok' : '');
}

async function ensureDriver({ needCalib = true } = {}) {
  if (!driver) {
    if (isMouseMode()) {
      const { MouseDriver } = await import('./input-mouse.js');
      driver = new MouseDriver();
      await driver.start(stage);
      calibrated = true;
    } else {
      hideMenus();
      loadingOverlay.classList.remove('hidden');
      try {
        const { HandDriver } = await import('./input-hand.js');
        driver = new HandDriver();
        await driver.start(setLoadStage);
        setLoadStage('ready');
        driver.videoEl.classList.add('mirror'); // 거울 영상 배경 연결
        videoWrap.appendChild(driver.videoEl);
        await new Promise(r => setTimeout(r, 400)); // READY 표시 잠깐 노출
      } finally {
        loadingOverlay.classList.add('hidden');
      }
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
/* 정중선 교차 판정(P5 §A-옮기기 L3) — 저작 시 별도 플래그 없이 실제 좌표에서 유도.
   사물·존이 화면 중앙(x=0.5)을 사이에 두고 반대편에 있고, 각각 중앙에서 충분히 떨어져 있을 때만 인정. */
function crossesMidline(items, target) {
  if (!target?.pos) return false;
  const zoneSide = Math.sign(target.pos[0] - 0.5);
  return (items || []).some(it =>
    Math.abs(it.pos[0] - 0.5) > 0.08 && Math.abs(target.pos[0] - 0.5) > 0.08 &&
    Math.sign(it.pos[0] - 0.5) !== 0 && Math.sign(it.pos[0] - 0.5) !== zoneSide);
}

function cognitiveTags(item) {
  if (item.type === 'segment') {
    const t = ['주의', '양측협응'];
    if ((item.flags || []).length) t.unshift('이중과제');
    if (item.courseType === 'gate') t.unshift('조향정확도');
    else if (item.courseType === 'curve') t.unshift('지속적조향');
    else if (item.courseType === 'fork') t.unshift('방향판단');
    else if (item.courseType === 'forkMemory') t.unshift('공간기억');
    return t;
  }
  if (item.type === 'crossing') {
    const t = ['충동억제', '인과추론'];
    if (item.lookBothWays) t.unshift('시각탐색');
    return t;
  }
  if (item.type === 'livingScene') {
    const props = item.props || [];
    const t = [];
    if (item.listRevealS) t.push('작업기억');
    if (props.some(p => p.distractor)) t.push('선택적주의');
    if (props.some(p => p.interaction === 'bimanualLift')) t.push('양측협응');
    if (props.some(p => p.interaction === 'oscillate')) t.push('신체 도식');
    t.push('순서기억', '주의');
    return t;
  }
  if (item.kind === 'select') {
    if ((item.steps || []).some(s => s.recall)) return ['지연회상', '작업기억'];
    return ['작업기억', '인과추론'];
  }
  const items = item.items || [];
  const t = []; // 실행기능 태그를 앞으로 (slice(0,3)에서 살아남도록)
  if (item.budget > 0) t.push('계획·충동억제');
  if (crossesMidline(items, item.target)) t.push('정중선교차');
  if (items.some(x => x.distractor)) t.push('선택적주의');
  if (item.hand === 'both' || items.some(x => x.hand === 'both')) t.push('양측협응');
  t.push('주의', '순서기억');
  return t;
}

const THEME_NAMES = { hall: '집 복도', elevator: '엘리베이터', street: '길거리',
  park: '공원', market: '마트 통로', school: '학교 복도' };

function stageLabel(item) {
  if (item.type === 'segment')
    return { emoji: '🏃', title: `걷기 · ${THEME_NAMES[item.theme] || ''}`,
      type: `이동 · Lv.${item.difficulty || item.level}` };
  if (item.type === 'crossing')
    return { emoji: '🚦', title: '횡단보도 건너기',
      type: `신호 지키기${item.reps > 1 ? ` · ${item.reps}회 반복` : ''} · Level ${item.level}` };
  if (item.type === 'livingScene')
    return { emoji: PLACES[item.place]?.emoji || '🏠', title: item.title,
      type: '생활 장면' + (item.difficulty ? ` · Lv.${item.difficulty}` : '') };
  const place = PLACES[item.place];
  const lv = item.difficulty ? ` · Lv.${item.difficulty}` : '';
  if (item.kind === 'select')
    return { emoji: place?.emoji || '🃏', title: item.title, type: '고르기' + lv };
  return { emoji: place?.emoji || '📦', title: item.title,
    type: (item.budget > 0 ? '옮기기 · 예산' : '물건 옮기기') + lv };
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
  document.getElementById('vizBox').classList.add('hidden');
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
  document.getElementById('vizBox').classList.add('hidden');
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
renderSuggestCard();
resize();
loop();

/* 개발 진단 훅 (콘솔 전용 — 게임 로직 비관여) */
window.__dbg = { get driver() { return driver; }, get current() { return current; }, get session() { return session; },
  navScene, stScene, renderer, computeSuggestions };
