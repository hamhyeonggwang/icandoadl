/* Session 스키마 v1 · 링크 인코딩 · 데모 세션
   C2: 세션 JSON에는 영상·아동 식별정보를 절대 포함하지 않는다. */

export const SEGMENT_LENGTHS = { short: 24, medium: 48, long: 72 }; // 항행 거리(월드 단위)

export const GRADING_DEFAULTS = {
  graspRadius: 0.07,     // 정규화 좌표 반경
  tReleaseMs: 300,
  assistTimeoutS: 20,
};

export function makeSegment(over = {}) {
  return { type: 'segment', level: 1, length: 'short', theme: 'hall', ...over };
}

/* 횡단보도: 2차선 도로 + 보행 신호등. Level 0 초록불 자동 / 1 교대 스트로크로 건넘
   (손들기 게이트는 폐기 — 스트로크(양손 주먹)와 손들기(편 손)가 동작 모순, 현장 피드백) */
export function makeCrossing(over = {}) {
  return { type: 'crossing', level: 1, redS: 7, greenS: 9, ...over };
}

export function makeStation(over = {}) {
  return {
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
  };
}

/* 고르기 스테이션 — 선택 패널(키오스크·버스 노선·길찾기 앱).
   steps: 순차 진행, 각 스텝은 카드 중 정답을 dwell(머무르기)로 선택 */
export function makeSelectStation(over = {}) {
  return {
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
  };
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
    } else if (f.type !== 'segment' && f.type !== 'crossing') {
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

/* 데모 세션 — "우리 마을 하루": 아이방에서 학교까지 마을 한 블록 (A3 확장)
   v1.1: 버스 정류장(노선 고르기)·마트 예산 장보기·카페 키오스크·길찾기 앱 포함 */
export function makeDemoSession() {
  const st = (title, place, instruction, items, target, extra = {}) =>
    makeStation({ title, place, instruction, items, target, grading: { ...GRADING_DEFAULTS }, ...extra });
  const sel = (title, place, steps) => makeSelectStation({ title, place, steps });
  return makeSession({
    title: '우리 마을 하루 (데모)',
    flow: [
      st('일어나서 옷 갈아입기', 'room', '벗은 잠옷과 모자를 옷장에 정리해요',
        [{ lib: 'shirt', pos: [0.25, 0.6], scale: 1, hand: 'any' },
         { lib: 'hat', pos: [0.42, 0.68], scale: 1, hand: 'any' }],
        { lib: 'closet', pos: [0.78, 0.55], scale: 1.3, zoneRadius: 0.13 }),
      st('세수와 양치', 'washstand', '칫솔과 비누를 세면대에 놓아요',
        [{ lib: 'toothbrush', pos: [0.25, 0.6], scale: 1, hand: 'any' },
         { lib: 'soap', pos: [0.42, 0.7], scale: 1, hand: 'any' }],
        { lib: 'sink', pos: [0.75, 0.6], scale: 1.4, zoneRadius: 0.13 }),
      st('아침 식사', 'kitchen', '빵과 주스를 쟁반에 올려요',
        [{ lib: 'bread', pos: [0.25, 0.62], scale: 1, hand: 'any' },
         { lib: 'juice', pos: [0.42, 0.68], scale: 1, hand: 'any' }],
        { lib: 'tray', pos: [0.75, 0.65], scale: 1.3, zoneRadius: 0.12 }),
      // 외출: 신발장에서 신발을 '꺼내' 발판 위에서 신는다 (방향 반전 — 현장 피드백)
      st('신발 꺼내 신기', 'entrance', '신발장에서 신발을 꺼내 발판에 놓아요',
        [{ lib: 'shoe', pos: [0.22, 0.55], scale: 1, hand: 'any' },
         { lib: 'shoe', pos: [0.3, 0.68], scale: 1, hand: 'any' }],
        { lib: 'footmat', pos: [0.74, 0.68], scale: 1.3, zoneRadius: 0.13 }),
      // 엘리베이터 = 버튼 누르기 (항행 아님 — 현장 피드백)
      sel('엘리베이터 타기', 'elevator', [
        { prompt: '🛗 1층 버튼을 눌러요',
          options: [{ label: '2층', emoji: '2️⃣', correct: false },
                    { label: '1층', emoji: '1️⃣', correct: true },
                    { label: '지하', emoji: '🅱️', correct: false }] },
      ]),
      makeSegment({ level: 1, length: 'short', theme: 'street' }),
      sel('버스 타기', 'busstop', [
        { prompt: '학교 가는 3번 버스를 골라요',
          options: [{ label: '3번', emoji: '🚌', correct: true },
                    { label: '7번', emoji: '🚌', correct: false },
                    { label: '12번', emoji: '🚌', correct: false }] },
        { prompt: '버스가 왔어요! 타는 문을 골라요',
          options: [{ label: '앞문', emoji: '🚪', correct: true },
                    { label: '뒷문', emoji: '🚫', correct: false }] },
      ]),
      makeSegment({ level: 1, length: 'short', theme: 'street' }),
      makeCrossing({ level: 1, redS: 7, greenS: 9 }),
      st('마트 예산 장보기', 'mart', '5,000원으로 과일 2가지만 담아요',
        [{ lib: 'apple', pos: [0.22, 0.6], scale: 1, hand: 'any', price: 1500 },
         { lib: 'banana', pos: [0.38, 0.68], scale: 1, hand: 'any', price: 2000 },
         { lib: 'soap', pos: [0.45, 0.55], scale: 1, hand: 'any', distractor: true, price: 3000 },
         { lib: 'grape', pos: [0.55, 0.65], scale: 1, hand: 'any', price: 4000 }],
        { lib: 'cart', pos: [0.79, 0.6], scale: 1.3, zoneRadius: 0.13 },
        { budget: 5000, requiredCount: 2 }),
      st('문구점 들르기', 'stationery', '연필과 공책을 가방에 넣어요',
        [{ lib: 'pencil', pos: [0.26, 0.62], scale: 1, hand: 'any' },
         { lib: 'notebook', pos: [0.44, 0.68], scale: 1, hand: 'any' }],
        { lib: 'backpack', pos: [0.77, 0.58], scale: 1.3, zoneRadius: 0.12 }),
      sel('카페 키오스크', 'cafe', [
        { prompt: '딸기주스를 주문해요 — 메뉴에서 골라요',
          options: [{ label: '딸기주스', emoji: '🍓', correct: true },
                    { label: '우유', emoji: '🥛', correct: false },
                    { label: '포도주스', emoji: '🍇', correct: false }] },
        { prompt: '결제 버튼을 눌러요',
          options: [{ label: '결제', emoji: '💳', correct: true },
                    { label: '취소', emoji: '❌', correct: false }] },
      ]),
      sel('길찾기 앱', 'street', [
        { prompt: '🗺️ 학교는 어느 쪽일까요? 지도를 보고 골라요',
          options: [{ label: '위쪽', emoji: '⬆️', correct: true },
                    { label: '왼쪽', emoji: '⬅️', correct: false },
                    { label: '오른쪽', emoji: '➡️', correct: false }] },
      ]),
      makeSegment({ level: 2, length: 'medium', theme: 'school' }),
      st('교실 도착', 'school', '큰 책은 양손으로! 책상에 꺼내요',
        [{ lib: 'pencilcase', pos: [0.25, 0.6], scale: 1, hand: 'any' },
         { lib: 'book', pos: [0.42, 0.68], scale: 1.7, hand: 'both' }],
        { lib: 'desk', pos: [0.76, 0.62], scale: 1.4, zoneRadius: 0.14 }),
    ],
  });
}
