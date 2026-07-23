/* 내장 일상사물 라이브러리 메타 — 에디터·러너 공용 (three 비의존)
   size: 정규화 화면좌표 기준 기본 반경 (잡기·존 판정용 시각 크기) */
export const LIBRARY = {
  backpack:   { name: '가방',     emoji: '🎒', color: '#e53e3e', size: 0.075, targetOk: true },
  lunchbox:   { name: '도시락',   emoji: '🍱', color: '#dd6b20', size: 0.065, targetOk: true },
  basket:     { name: '바구니',   emoji: '🧺', color: '#b7791f', size: 0.075, targetOk: true },
  cupholder:  { name: '컵꽂이',   emoji: '🗄️', color: '#718096', size: 0.07,  targetOk: true },
  pencilcase: { name: '필통',     emoji: '✏️', color: '#3182ce', size: 0.05 },
  book:       { name: '책',       emoji: '📘', color: '#2b6cb0', size: 0.055 },
  apple:      { name: '사과',     emoji: '🍎', color: '#e53e3e', size: 0.04 },
  cup:        { name: '컵',       emoji: '🥤', color: '#38b2ac', size: 0.045 },
  toothbrush: { name: '칫솔',     emoji: '🪥', color: '#805ad5', size: 0.045 },
  soap:       { name: '비누',     emoji: '🧼', color: '#d69e2e', size: 0.04 },
  towel:      { name: '수건',     emoji: '🧻', color: '#4fd1c5', size: 0.05 },
  sock:       { name: '양말',     emoji: '🧦', color: '#ed64a6', size: 0.045 },
  spoon:      { name: '숟가락',   emoji: '🥄', color: '#a0aec0', size: 0.04 },
  crayon:     { name: '크레파스', emoji: '🖍️', color: '#e53e3e', size: 0.035 },
  scissors:   { name: '가위',     emoji: '✂️', color: '#718096', size: 0.045 },
  bottle:     { name: '물병',     emoji: '🍼', color: '#63b3ed', size: 0.05 },
  hat:        { name: '모자',     emoji: '🧢', color: '#3182ce', size: 0.055 },
  tray:       { name: '쟁반',     emoji: '🍽️', color: '#b7791f', size: 0.08, targetOk: true },
  /* 마을 확장 — 마트·문구점·집·학교 장면용 */
  banana:     { name: '바나나',   emoji: '🍌', color: '#ecc94b', size: 0.045 },
  orange:     { name: '귤',       emoji: '🍊', color: '#ed8936', size: 0.04 },
  grape:      { name: '포도',     emoji: '🍇', color: '#805ad5', size: 0.045 },
  strawberry: { name: '딸기',     emoji: '🍓', color: '#e53e3e', size: 0.035 },
  bread:      { name: '빵',       emoji: '🍞', color: '#d69e2e', size: 0.05 },
  juice:      { name: '주스',     emoji: '🧃', color: '#ed64a6', size: 0.04 },
  shoe:       { name: '신발',     emoji: '👟', color: '#4299e1', size: 0.05 },
  shirt:      { name: '옷',       emoji: '👕', color: '#48bb78', size: 0.055 },
  pencil:     { name: '연필',     emoji: '✏️', color: '#ecc94b', size: 0.035 },
  notebook:   { name: '공책',     emoji: '📓', color: '#38b2ac', size: 0.05 },
  cart:       { name: '장바구니', emoji: '🛒', color: '#e53e3e', size: 0.085, targetOk: true },
  shoerack:   { name: '신발장',   emoji: '🗄️', color: '#975a16', size: 0.085, targetOk: true },
  closet:     { name: '옷장',     emoji: '🚪', color: '#9c6f44', size: 0.09,  targetOk: true },
  sink:       { name: '세면대',   emoji: '🚰', color: '#e2e8f0', size: 0.085, targetOk: true },
  footmat:    { name: '발판',     emoji: '👣', color: '#38a169', size: 0.08,  targetOk: true },
  plate:      { name: '접시',     emoji: '🍽️', color: '#f7fafc', size: 0.07,  targetOk: true },
  desk:       { name: '책상',     emoji: '🪑', color: '#b7791f', size: 0.09,  targetOk: true },
};

/* 스테이션 장소 (place) — 거울 모드 위 장소 칩 + 3D 소품 데코 색 */
export const PLACES = {
  none:       { name: '(장소 없음)', emoji: '', color: '#2b303c' },
  room:       { name: '아이방',    emoji: '🛏️', color: '#805ad5' },
  kitchen:    { name: '주방',      emoji: '🍳', color: '#dd6b20' },
  bathroom:   { name: '화장실',    emoji: '🚽', color: '#4299e1' },
  washstand:  { name: '세면대 앞', emoji: '🚰', color: '#38b2ac' },
  entrance:   { name: '현관·신발장', emoji: '🚪', color: '#975a16' },
  stationery: { name: '문구점',    emoji: '✏️', color: '#ecc94b' },
  mart:       { name: '마트',      emoji: '🛒', color: '#e53e3e' },
  cafe:       { name: '카페',      emoji: '☕', color: '#9c6f44' },
  restaurant: { name: '식당',      emoji: '🍚', color: '#ed8936' },
  school:     { name: '학교',      emoji: '🏫', color: '#3182ce' },
  busstop:    { name: '버스 정류장', emoji: '🚏', color: '#38a169' },
  street:     { name: '길거리',    emoji: '🛣️', color: '#718096' },
  elevator:   { name: '엘리베이터', emoji: '🛗', color: '#718096' },
};

/* 커스텀 GLB는 lib 키가 'asset:<id>' — 메타는 session.assets에서 온다 */
export function libMeta(key, assets) {
  if (key && key.startsWith('asset:')) {
    const a = assets?.[key.slice(6)];
    return { name: a?.name || '내 모델', emoji: '🧩', color: '#9f7aea', size: 0.06, custom: true };
  }
  return LIBRARY[key] || { name: key, emoji: '❓', color: '#a0aec0', size: 0.05 };
}
