/* Session 스키마 v1 · 링크 인코딩 · 데모 세션
   C2: 세션 JSON에는 영상·아동 식별정보를 절대 포함하지 않는다. */

export const SEGMENT_LENGTHS = { short: 24, medium: 48, long: 72 }; // 항행 거리(월드 단위)

export const GRADING_DEFAULTS = {
  graspRadius: 0.07,     // 정규화 좌표 반경
  tReleaseMs: 300,
  assistTimeoutS: 20,
};

/* 난이도 사다리 L1~L5 (difficulty-progression_v0.1.md §A) — 기존 grading 값의 프리셋 묶음.
   수치는 전부 초기 추정(현장 캘리브레이션 대상). L2 ≈ 기존 기본값.
   zoneScale: 존 판정 반경 배율 · zoneRingVisible: 존 링 표시(L5=숨김, 위치 회상 — 단 assist 발동 시 다시 표시) */
export const DIFFICULTY_PRESETS = {
  move: { // 옮기기 계열 (station move · livingScene carry형)
    1: { graspRadius: 0.10,  tReleaseMs: 200, zoneScale: 1.3, zoneRingVisible: true,  assistTimeoutS: 15 },
    2: { graspRadius: 0.07,  tReleaseMs: 300, zoneScale: 1.0, zoneRingVisible: true,  assistTimeoutS: 20 },
    3: { graspRadius: 0.055, tReleaseMs: 350, zoneScale: 0.8, zoneRingVisible: true,  assistTimeoutS: 25 },
    4: { graspRadius: 0.045, tReleaseMs: 400, zoneScale: 0.7, zoneRingVisible: true,  assistTimeoutS: 25 },
    5: { graspRadius: 0.04,  tReleaseMs: 450, zoneScale: 0.6, zoneRingVisible: false, assistTimeoutS: 30 },
  },
  select: { // 고르기 계열 (dwell 유지 시간이 길수록 지속 요구 큼)
    1: { dwellMs: 600,  assistTimeoutS: 15 },
    2: { dwellMs: 900,  assistTimeoutS: 20 },
    3: { dwellMs: 1100, assistTimeoutS: 25 },
    4: { dwellMs: 1300, assistTimeoutS: 25 },
    5: { dwellMs: 1500, assistTimeoutS: 30 },
  },
  memoryRevealS: { 1: 0, 2: 8, 3: 6, 4: 4, 5: 3 }, // 목록 노출 시간(초) · 0 = 상시 표시
};

/* 프리셋 적용: item.difficulty(1~5)가 있으면 grading에 프리셋을 덮어쓴다(저작 시점 적용 —
   러너는 grading만 읽으므로 단순 유지). 에디터 슬라이더로 이후 미세조정하면 그 값이 우선. */
export function applyDifficultyPreset(item) {
  const lv = item.difficulty;
  if (!lv) return item;
  const family = item.kind === 'select' ? 'select' : 'move';
  const preset = DIFFICULTY_PRESETS[family][lv];
  if (preset) item.grading = { ...(item.grading || {}), ...preset };
  if (item.type === 'livingScene' && item.listRevealS != null) {
    item.listRevealS = DIFFICULTY_PRESETS.memoryRevealS[lv] ?? item.listRevealS;
  }
  return item;
}

export function makeSegment(over = {}) {
  return {
    type: 'segment', level: 1, length: 'short', theme: 'hall',
    courseType: 'straight', // 'straight'|'gate'|'curve'|'fork'|'forkMemory' (difficulty-progression §A)
    gates: [],       // 'gate': [{z:0~1(구간 비율), xOffset, width}] — 좁은 문을 조향으로 통과
    curveAmp: 1.6, curveFreq: 0.18, // 'curve': 사인파 중심선 진폭·빈도 (초기 추정)
    forks: [],       // 'fork'|'forkMemory': [{z:0~1, correct:'L'|'R'}] — 표지판 보고 방향 선택
    mapRevealS: 0,   // 'forkMemory': 출발 전 경로를 이만큼(초)만 보여주고 감춤 — 공간기억 유발
    flags: [],       // 이중과제(P5 §D): [{z:0~1, xOffset, color:'orange'|'green'}] — 조향하며 색 세기
                      // (green은 방해자극·비계수). 정답은 뒤따르는 회상 스텝에 정적으로 저작됨.
    ...over,
  };
}

/* 걷기 난이도 사다리 L1~L5 (difficulty-progression_v0.1.md §A "걷기") — courseType 프리셋.
   L4·L5의 갈림길은 실제 분기 지오메트리가 아니라 판정 지점(sign+영역 통과 시 방향 기록) 방식 —
   충돌·경로 재수렴 로직 없이 안전하게 구현하기 위한 의도된 단순화. */
export const COURSE_LEVELS = {
  1: { courseType: 'straight', gates: [], forks: [], mapRevealS: 0 },
  2: { courseType: 'gate', gates: [{ z: 0.35, xOffset: 0, width: 1.0 }, { z: 0.65, xOffset: 0.8, width: 1.0 }] },
  3: { courseType: 'curve', curveAmp: 1.6, curveFreq: 0.18 },
  4: { courseType: 'fork', forks: [{ z: 0.55, correct: 'L' }] },
  5: { courseType: 'forkMemory', forks: [{ z: 0.4, correct: 'R' }, { z: 0.75, correct: 'L' }], mapRevealS: 4 },
};

export function applyCourseLevel(segment, lv) {
  const preset = COURSE_LEVELS[lv];
  if (!preset) return segment;
  Object.assign(segment, { gates: [], forks: [], mapRevealS: 0 }, preset);
  segment.difficulty = lv;
  return segment;
}

/* 횡단보도: 2차선 도로 + 보행 신호등. Level 0 초록불 자동 / 1 교대 스트로크로 건넘
   (손들기 게이트는 폐기 — 스트로크(양손 주먹)와 손들기(편 손)가 동작 모순, 현장 피드백)
   R2 승격(crosswalk-core_v0.1.md, 2026-07-25 — 세션 최중요 컨셉):
   reps: 총 횡단 횟수(3단계 구조 — 1회=연습, 2회=반복, 3회=적용). 매회 같은 규칙을 다시
   요구해 "반복 없는 반복"(변주 반복)으로 학습을 굳힌다.
   lookBothWays: 연석에서 초록불 전 좌→우 순서로 살피기 강제(비처벌 — 순서가 틀리면
   처음부터 다시 살피면 될 뿐, 실패 아님). 순서 강제는 실제 보행 교육과 동일(좌측 차로가
   먼저 온다).
   ballRep: 공이 도로로 굴러가는 시나리오가 등장할 반복 차수(1-base, reps 범위 내).
   0=없음. 회차별 고정 배치 — 무작위 아님(사행성 배제·예측 가능성 원칙, 사용자 결정). */
export function makeCrossing(over = {}) {
  return { type: 'crossing', level: 1, redS: 7, greenS: 9,
    reps: 1, lookBothWays: false, ballRep: 0, ...over };
}

export function makeStation(over = {}) {
  return applyDifficultyPreset({
    type: 'station',
    kind: 'move', // 'move' 옮기기 | 'select' 고르기(키오스크·정류장·길찾기)
    title: '새 스테이션',
    instruction: '물건을 옮겨 보아요',
    items: [],
    target: null,
    budget: 0,        // 0 = 예산 없음. >0이면 담긴 사물 price 합이 예산을 넘을 수 없음
    requiredCount: 0, // 0 = 전부 담기. >0이면 정답 사물 중 N개만 담으면 완료
    grading: { ...GRADING_DEFAULTS },
    ...over,
  });
}

/* 고르기 스테이션 — 선택 패널(키오스크·버스 노선·길찾기 앱).
   steps: 순차 진행, 각 스텝은 카드 중 정답을 dwell(머무르기)로 선택 */
export function makeSelectStation(over = {}) {
  return applyDifficultyPreset({
    type: 'station',
    kind: 'select',
    title: '고르기',
    place: 'none',
    instruction: '',
    steps: [{
      prompt: '맞는 것을 골라요',
      options: [
        { label: '정답', emoji: '⭕', correct: true },
        { label: '오답', emoji: '❌', correct: false },
      ],
    }],
    grading: { dwellMs: 900, assistTimeoutS: 20 },
    ...over,
  });
}

/* 생활 장면(Living Scene) — scene-grammar_v0.1.md 정본.
   station(옮기기)과 달리 여러 개의 서로 다른 occupation(행동)을 하나의 장면 안에 담고,
   각 행동은 상태 변화를 남기며, 선택된 행동은 다음 행동의 전제조건이 된다(P5·P8).
   props[].interaction: 'carryToZone'(존에 놓기) | 'slide'(축 제약 끌기) | 'bimanualLift'(양손 끌어올리기) */
export function makeLivingScene(over = {}) {
  return applyDifficultyPreset({
    type: 'livingScene',
    place: 'room',
    title: '생활 장면',
    purpose: '',              // HUD 1행 — 생활어(지시어 아님)
    userState: {},
    envObjects: [],           // 배경 사물: { id, lib, pos, scale }
    props: [],                // 조작 사물: 아래 shape 참고
    grading: { ...GRADING_DEFAULTS },
    ...over,
  });
}

/* 침실 아침 장면 — Scene Grammar §E-3 · §MVP-A.
   필수(required): 옷 갈아입기 → (파생) 잠옷 정리. 선택(optional): 커튼·이불. */
export function makeBedroomMorningScene(over = {}) {
  return makeLivingScene({
    place: 'room',
    title: '아침, 학교 갈 준비',
    purpose: '아직 잠옷을 입고 있어요 — 학교 갈 준비를 해요',
    userState: { outfit: 'sleepwear' },
    envObjects: [
      { id: 'window', lib: 'window', pos: [0.1, 0.28], scale: 1.1 },
      { id: 'bedFrame', lib: 'bed', pos: [0.27, 0.74], scale: 1.5 },
      { id: 'closet', lib: 'closet', pos: [0.82, 0.5], scale: 1.3 },
      { id: 'laundryBasket', lib: 'laundryBasket', pos: [0.62, 0.86], scale: 1.0 },
    ],
    props: [
      { id: 'curtain', lib: 'curtain', pos: [0.13, 0.34], scale: 1.0, hand: 'any',
        interaction: 'slide', axis: 'x', dir: 1, distance: 0.14,
        occupation: '커튼을 옆으로 열어요', required: false },
      { id: 'blanket', lib: 'blanket', pos: [0.26, 0.64], scale: 1.0, hand: 'both',
        interaction: 'bimanualLift', axis: 'y', dir: -1, distance: 0.12,
        foldedPos: [0.35, 0.6], foldedScale: 0.5,
        occupation: '이불을 양손으로 개어요', required: false },
      { id: 'clothes', lib: 'shirt', pos: [0.82, 0.44], scale: 1.0, hand: 'any',
        interaction: 'carryToZone', zone: { pos: [0.5, 0.88], radius: 0.15 },
        occupation: '옷장에서 옷을 꺼내 입어요', required: true,
        onComplete: { setUserState: { outfit: 'dayclothes' }, reveal: 'pajama' } },
      { id: 'pajama', lib: 'pajama', pos: [0.27, 0.68], scale: 0.9, hand: 'any',
        interaction: 'carryToZone', zone: { pos: [0.62, 0.86], radius: 0.14 },
        occupation: '벗은 잠옷을 바구니에 넣어요', required: true, startHidden: true },
    ],
    exit: { transition: '이제 세수하러 가요' },
    difficulty: 2,
    ...over,
  });
}

/* 세면실 아침 장면 — MVP-B: Diegetic Mirror (dual-perspective-system_v0.1.md §5).
   웹캠 영상이 화면 전체 오버레이가 아니라 room 안의 '거울' 오브젝트 표면(텍스처)으로 존재한다.
   신규 recognition은 oscillate(왕복) 1개뿐 — 나머지는 기존 GRASP/CARRY/RELEASE 재사용. */
export function makeWashstandMirrorScene(over = {}) {
  return makeLivingScene({
    place: 'washstand',
    title: '거울 앞에서 이 닦기',
    purpose: '거울을 보면서 칫솔로 이를 닦아요',
    userState: { hygiene: 'none' },
    roomBackdrop: '#8fb3c7',           // 세면실 벽(배경) — 웹캠은 거울에만 나타남
    mirror: { pos: [0.5, 0.4], w: 0.5, h: 0.5 },
    envObjects: [
      { id: 'sink', lib: 'sink', pos: [0.5, 0.86], scale: 1.7 },
    ],
    props: [
      { id: 'toothbrush', lib: 'toothbrush', pos: [0.2, 0.72], scale: 1.1, hand: 'any',
        interaction: 'oscillate', oscTarget: 8, // 기본값 — params.js OSC_TARGET_DEFAULT와 동일(초기 추정)
        occupation: '칫솔을 잡고 이를 닦아요', required: true,
        onComplete: { setUserState: { hygiene: 'teethBrushed' } } },
    ],
    exit: { transition: '상쾌해요! 이제 아침을 먹어요' },
    difficulty: 2,
    ...over,
  });
}

/* 마트 심부름 장면 — 2편 "심부름 다녀오기" (scene-grammar_v0.1.md §8).
   핵심은 예산이 아니라 "목록 암기"(작업기억): 심부름 목록이 잠깐 보였다 사라지고,
   아이는 기억에 의존해 진열대에서 물건을 고른다. 목록에 없는 사탕이 유혹(방해자극).
   신규 recognition은 zonePass(경유 스캔) 1개 — 계산대를 지나야 장바구니 담기가 완료된다. */
export function makeMartErrandScene(over = {}) {
  const scan = { pos: [0.55, 0.62], radius: 0.13 };
  const cartZone = { pos: [0.82, 0.6], radius: 0.15 };
  return makeLivingScene({
    place: 'mart',
    title: '마트 심부름',
    purpose: '엄마가 사과랑 우유를 사 오라고 하셨어요!',
    listRevealS: 6,                    // 목록을 이만큼만 보여주고 감춘다(작업기억 유발)
    genericPrompt: '심부름한 물건을 기억해서 장바구니에 담아요',
    userState: { errand: 'pending' },
    envObjects: [
      { id: 'shelf', lib: 'shelf', pos: [0.24, 0.5], scale: 1.4 },
      { id: 'scanner', lib: 'checkoutScanner', pos: [0.55, 0.68], scale: 1.1 },
      { id: 'cart', lib: 'cart', pos: [0.82, 0.6], scale: 1.3 },
    ],
    props: [
      { id: 'apple', lib: 'apple', pos: [0.16, 0.44], scale: 1, hand: 'any',
        interaction: 'carryToZone', zone: cartZone, scanZone: scan,
        occupation: '사과를 계산대에 스캔하고 장바구니에 담아요', required: true },
      { id: 'milk', lib: 'milk', pos: [0.3, 0.5], scale: 1, hand: 'any',
        interaction: 'carryToZone', zone: cartZone, scanZone: scan,
        occupation: '우유를 계산대에 스캔하고 장바구니에 담아요', required: true },
      { id: 'candy', lib: 'candy', pos: [0.22, 0.6], scale: 1, hand: 'any',
        interaction: 'carryToZone', zone: cartZone, distractor: true,
        occupation: '', required: false },
    ],
    exit: { transition: '결제 완료! 문구점도 들러야겠다' },
    difficulty: 3,
    ...over,
  });
}

export function makeSession(over = {}) {
  return { version: 1, title: '새 세션', flow: [], ...over };
}

export function validateSession(s) {
  const errs = [];
  if (!s || s.version !== 1) errs.push('version 불일치');
  if (!Array.isArray(s.flow)) { errs.push('flow 없음'); return errs; }
  s.flow.forEach((f, i) => {
    if (f.type === 'station') {
      if (f.kind === 'select') {
        if (!f.steps || f.steps.length === 0) errs.push(`${i + 1}번 고르기: 스텝 없음`);
        (f.steps || []).forEach((s, j) => {
          if (!s.options || s.options.length < 2) errs.push(`${i + 1}번 고르기 ${j + 1}스텝: 선택지 2개 이상 필요`);
          else if (!s.options.some(o => o.correct)) errs.push(`${i + 1}번 고르기 ${j + 1}스텝: 정답 없음`);
        });
      } else {
        if (!f.target) errs.push(`${i + 1}번 스테이션: 타깃(드롭존) 없음`);
        const goals = (f.items || []).filter(it => !it.distractor);
        if (goals.length === 0)
          errs.push(`${i + 1}번 스테이션: 정답 사물 없음 (방해 자극만으로는 완료 불가)`);
        if (f.budget > 0) {
          const need = f.requiredCount > 0 ? f.requiredCount : goals.length;
          const cheapest = goals.map(it => it.price || 0).sort((a, b) => a - b).slice(0, need)
            .reduce((s, v) => s + v, 0);
          if (cheapest > f.budget)
            errs.push(`${i + 1}번 스테이션: 예산(${f.budget}원)으로 완료 불가 — 최소 조합 ${cheapest}원`);
        }
      }
    } else if (f.type !== 'segment' && f.type !== 'crossing' && f.type !== 'livingScene') {
      errs.push(`${i + 1}번 항목: 알 수 없는 type`);
    }
  });
  return errs;
}

/* 링크 인코딩: JSON → base64url (URL 해시로 러너에 전달 — 서버·클라우드 불요) */
export function encodeSession(s) {
  const json = JSON.stringify(s);
  const b64 = btoa(String.fromCharCode(...new TextEncoder().encode(json)));
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function decodeSession(str) {
  const b64 = str.replace(/-/g, '+').replace(/_/g, '/');
  const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes));
}

/* 데모 세션 (content-coherence_v0.1.md R1 — 2026-07-25 서사 분할):
   등교 중 마트·문구점·카페를 들르는 시간 맥락 모순(ecological-validity_v0.1.md 문제4, 07-24
   진단·미적용)을 해소 — 하루를 실제 occupation 시점에 맞는 두 편으로 나눈다.
   1편 "학교 가는 아침"(집→학교, 등교) / 2편 "심부름 다녀오기"(하교 후, 장보기·정리).
   카페 키오스크는 두 서사 모두에서 제거하고 독립 훈련(makeKioskDrillSession)으로 분리
   — "키오스크 사용법" 자체가 목적이지 아동의 등교·심부름 occupation이 아니기 때문(사용자 결정).
   길찾기 앱은 제거(매일 가는 학교를 지도로 찾지 않는다 — ecological-validity 기존 결론 이행,
   지도의 실물화는 content-coherence §B 후속 과제로 남김). */
const st = (title, place, instruction, items, target, extra = {}) =>
  makeStation({ title, place, instruction, items, target, grading: { ...GRADING_DEFAULTS }, ...extra });
const sel = (title, place, steps, difficulty) =>
  makeSelectStation({ title, place, steps, ...(difficulty ? { difficulty } : {}) });
const walk = (theme, length, lv, over = {}) => applyCourseLevel(makeSegment({ length, theme, ...over }), lv);

/* 1편 — "학교 가는 아침": 기상→등교. 최중요 컨셉인 횡단보도(crosswalk-core_v0.1.md)에
   R2 승격 적용 — 좌→우 살핌 순서 강제, 반복 3회(연습·반복·적용), 공 시나리오는 3번째
   반복에 고정 배치(무작위 아님 — 사용자 결정, 예측 가능성 원칙). */
export function makeDemoSession() {
  return makeSession({
    title: '학교 가는 아침 (1편)',
    flow: [
      makeBedroomMorningScene(),
      makeWashstandMirrorScene(),
      st('아침 식사', 'kitchen', '빵과 주스를 쟁반에 올려요',
        [{ lib: 'bread', pos: [0.25, 0.62], scale: 1, hand: 'any' },
         { lib: 'juice', pos: [0.42, 0.68], scale: 1, hand: 'any' }],
        { lib: 'tray', pos: [0.75, 0.65], scale: 1.3, zoneRadius: 0.12 },
        { difficulty: 1 }),
      // 가방 싸기(R1 신설) — "넣기"의 올바른 자리는 등굣길 문구점이 아니라 집. 교실 도착에서
      // 같은 사물(필통·책)을 '꺼내는' 것과 짝을 이룬다(content-coherence §A 가방 흐름 교정).
      st('학교 가방 챙기기', 'room', '필통과 책을 가방에 넣어요',
        [{ lib: 'pencilcase', pos: [0.24, 0.58], scale: 1, hand: 'any' },
         { lib: 'book', pos: [0.42, 0.66], scale: 1.5, hand: 'any' }],
        { lib: 'backpack', pos: [0.76, 0.6], scale: 1.3, zoneRadius: 0.13 },
        { difficulty: 2 }),
      // 외출: 신발장에서 신발을 '꺼내' 발판 위에서 신는다 (방향 반전 — 현장 피드백)
      st('신발 꺼내 신기', 'entrance', '신발장에서 신발을 꺼내 발판에 놓아요',
        [{ lib: 'shoe', pos: [0.22, 0.55], scale: 1, hand: 'any' },
         { lib: 'shoe', pos: [0.3, 0.68], scale: 1, hand: 'any' }],
        { lib: 'footmat', pos: [0.74, 0.68], scale: 1.3, zoneRadius: 0.13 },
        { difficulty: 2 }),
      // 엘리베이터 = 버튼 누르기 (항행 아님 — 현장 피드백). 실제 패널처럼 2열 5행 버튼 배치.
      sel('엘리베이터 타기', 'elevator', [
        { prompt: '🛗 1층 버튼을 눌러요', cols: 2,
          options: [{ label: 'B1', emoji: '🅱️', correct: false },
                    { label: '1층', emoji: '1️⃣', correct: true },
                    { label: '2층', emoji: '2️⃣', correct: false },
                    { label: '3층', emoji: '3️⃣', correct: false },
                    { label: '4층', emoji: '4️⃣', correct: false },
                    { label: '5층', emoji: '5️⃣', correct: false },
                    { label: '6층', emoji: '6️⃣', correct: false },
                    { label: '7층', emoji: '7️⃣', correct: false },
                    { label: '8층', emoji: '8️⃣', correct: false },
                    { label: '9층', emoji: '9️⃣', correct: false }] },
      ], 1),
      walk('street', 'short', 2), // 게이트: 정렬 조향
      // 버스 노선 = 색+번호로 식별(사용자 결정) — 초록 7737을 학교 가는 버스로 지정
      sel('버스 노선 고르기', 'busstop', [
        { prompt: '학교 가는 초록 7737번 버스를 골라요',
          options: [{ label: '빨강 1200', emoji: '🔴', correct: false },
                    { label: '초록 7737', emoji: '🟢', correct: true },
                    { label: '파랑 730', emoji: '🔵', correct: false }] },
      ], 2),
      // 교통카드 태그(사용자 지시): 문 선택 같은 억지 메뉴가 아니라, 카드를 잡아 단말기
      // 위치로 옮기는 실제 모션 과제 — 기존 GRASP→CARRY→RELEASE 그대로 재사용.
      st('교통카드 태그하기', 'busstop', '카드를 잡아 단말기에 태그해요',
        [{ lib: 'transitcard', pos: [0.24, 0.6], scale: 1, hand: 'any' }],
        { lib: 'cardReader', pos: [0.72, 0.55], scale: 1.2, zoneRadius: 0.12 },
        { difficulty: 1 }),
      walk('street', 'short', 3), // 커브: 지속 조향
      // 횡단보도 R2 승격(crosswalk-core_v0.1.md, 확정): 좌→우 살핌 강제·반복 3회·
      // 공 시나리오는 3번째(마지막=적용 단계)에 고정
      makeCrossing({ level: 1, redS: 7, greenS: 9, reps: 3, lookBothWays: true, ballRep: 3 }),
      // 갈림길 2회 + 미니맵 암기(§A) + 이중과제(P5 §A-인지 L5):
      // 조향하는 동안 주황 깃발만 세고 초록 깃발(방해자극)은 무시 — 정답은 뒤 회상 스텝에서 확인
      walk('school', 'medium', 5, {
        flags: [
          { z: 0.2, xOffset: -1.4, color: 'orange' },
          { z: 0.45, xOffset: 1.2, color: 'green' },
          { z: 0.85, xOffset: -1.1, color: 'orange' },
        ],
      }),
      // 교실 도착 — 아침에 가방에 넣은 필통·책을 여기서 '꺼낸다'(넣기→꺼내기 호응)
      st('교실 도착', 'school', '큰 책은 양손으로! 책상에 꺼내요',
        [{ lib: 'pencilcase', pos: [0.25, 0.6], scale: 1, hand: 'any' },
         { lib: 'book', pos: [0.42, 0.68], scale: 1.7, hand: 'both' }],
        { lib: 'desk', pos: [0.76, 0.62], scale: 1.4, zoneRadius: 0.14 },
        { difficulty: 3 }),
      // 지연 회상(P5 §A-인지 L5): 걷는 동안 본 것을 다른 과제(교실 도착) 뒤에 떠올리기
      sel('아침 조회 — 오는 길 기억하기', 'school', [
        { prompt: '🚩 학교 오는 길에 주황 깃발을 몇 개 봤어요?',
          options: [{ label: '1개', emoji: '1️⃣', correct: false },
                    { label: '2개', emoji: '2️⃣', correct: true },
                    { label: '3개', emoji: '3️⃣', correct: false }],
          recall: true },
      ], 5),
    ],
  });
}

/* 2편 — "심부름 다녀오기": 하교 후·오후의 occupation. 마트·문구점·예산 계산(P5)이
   본래 있어야 할 시간 맥락. 횡단보도는 2번째 노출(장소 변주 = 일반화, R2 이하 프리셋
   기본값 그대로 — 매 심부름마다 반복 3회 전 구조를 다시 요구하면 과도하므로 reps:1). */
export function makeErrandSession() {
  return makeSession({
    title: '심부름 다녀오기 (2편)',
    flow: [
      walk('street', 'short', 2),
      makeCrossing({ level: 1, redS: 7, greenS: 9 }), // 일반화: 같은 규칙, 다른 장소·시간
      makeMartErrandScene(),
      // 단순 계산(P5 §A-인지 L4): 용돈 1000원으로 3개 중 2개만 담을 수 있다 — 심부름·쇼핑
      // 맥락(문구 사기)이 예산 계산의 올바른 자리 — 등굣길이 아니다(content-coherence 교정)
      st('문구점 들르기', 'stationery', '용돈 1000원 — 담을 수 있는 것 2가지를 가방에 넣어요',
        [{ lib: 'pencil', pos: [0.26, 0.62], scale: 1, hand: 'any', price: 300 },
         { lib: 'notebook', pos: [0.44, 0.68], scale: 1, hand: 'any', price: 700 },
         { lib: 'eraser', pos: [0.36, 0.5], scale: 0.9, hand: 'any', price: 600 }],
        { lib: 'backpack', pos: [0.77, 0.58], scale: 1.3, zoneRadius: 0.12 },
        { difficulty: 3, budget: 1000, requiredCount: 2 }),
      walk('street', 'short', 1),
      // 정리 — 사 온 것을 제자리에. "결제 완료! 이제 집에 가요"가 참이 되는 순간(마트 장면
      // exit 대사와의 모순 해소, content-coherence §A)이자 심부름의 완결.
      st('사 온 것 정리하기', 'kitchen', '사 온 우유를 냉장고에 넣어요',
        [{ lib: 'milk', pos: [0.3, 0.6], scale: 1, hand: 'any' }],
        { lib: 'fridge', pos: [0.76, 0.55], scale: 1.3, zoneRadius: 0.13 },
        { difficulty: 1 }),
    ],
  });
}

/* 카페 키오스크 — 독립 훈련(사용자 결정: "별도처리"). 아동의 등교·심부름 occupation이
   아니라 키오스크 조작이라는 기능 자체가 목적이므로 어느 서사에도 포함하지 않는다.
   치료사 동석을 전제하는 프레이밍으로 지시문을 분리. */
export function makeKioskDrillSession() {
  return makeSession({
    title: '키오스크 사용법 연습',
    flow: [
      sel('키오스크 사용법 연습', 'cafe', [
        { prompt: '선생님과 함께 딸기주스를 주문해요 — 메뉴 20가지 중에서 골라요', cols: 5,
          options: [
            { label: '딸기주스', emoji: '🍓', correct: true },
            { label: '아메리카노', emoji: '☕', correct: false },
            { label: '카페라떼', emoji: '🥛', correct: false },
            { label: '카푸치노', emoji: '☕', correct: false },
            { label: '바닐라라떼', emoji: '🍦', correct: false },
            { label: '카라멜마키아토', emoji: '🍯', correct: false },
            { label: '콜드브루', emoji: '🧊', correct: false },
            { label: '초코라떼', emoji: '🍫', correct: false },
            { label: '녹차라떼', emoji: '🍵', correct: false },
            { label: '유자차', emoji: '🍋', correct: false },
            { label: '레몬에이드', emoji: '🍋', correct: false },
            { label: '자몽에이드', emoji: '🍊', correct: false },
            { label: '복숭아아이스티', emoji: '🍑', correct: false },
            { label: '포도주스', emoji: '🍇', correct: false },
            { label: '우유', emoji: '🥛', correct: false },
            { label: '코코아', emoji: '🟤', correct: false },
            { label: '밀크쉐이크', emoji: '🥤', correct: false },
            { label: '스무디', emoji: '🧃', correct: false },
            { label: '에스프레소', emoji: '🖤', correct: false },
            { label: '아이스티', emoji: '🧋', correct: false },
          ] },
        { prompt: '결제 버튼을 눌러요',
          options: [{ label: '결제', emoji: '💳', correct: true },
                    { label: '취소', emoji: '❌', correct: false }] },
      ], 2),
    ],
  });
}
