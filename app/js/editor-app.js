/* 에디터 — 코드 없는 세션 저작 (Gate 2 대상: 무도움 30분 내 스테이션 2개 세션)
   저작물은 JSON — 러너와 분리 (브리프 Exit: 도구 중단 시에도 데이터 이식 가능) */
import {
  makeSession, makeSegment, makeStation, makeSelectStation, makeCrossing, makeDemoSession,
  validateSession, encodeSession, decodeSession, GRADING_DEFAULTS,
} from './session.js';
import { LIBRARY, libMeta, PLACES } from './library-meta.js';

/* ---------- 상태 ---------- */
const AUTOSAVE_KEY = 'adl-editor-session-v1';
let session = loadAutosave() || makeDemoSession();
let selectedFlow = session.flow.length ? 0 : -1;
let selectedObj = null; // {kind:'item', idx} | {kind:'target'}

function loadAutosave() {
  try {
    const raw = localStorage.getItem(AUTOSAVE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}
function autosave() {
  localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(session));
}

/* ---------- DOM ---------- */
const $ = id => document.getElementById(id);
const flowList = $('flowList');
const canvas = $('stageCanvas');
const canvasHint = $('canvasHint');
const palette = $('palette');
const propsPanel = $('propsPanel');
const titleInput = $('sessionTitle');
const statusEl = $('statusMsg');

titleInput.value = session.title;
titleInput.addEventListener('input', () => { session.title = titleInput.value; autosave(); });

function status(msg, ok = true) {
  statusEl.textContent = msg;
  statusEl.style.color = ok ? 'var(--ok)' : 'var(--danger)';
  clearTimeout(status._t);
  status._t = setTimeout(() => { statusEl.textContent = ''; }, 4000);
}

/* ---------- 플로우 목록 ---------- */
function currentStation() {
  const f = session.flow[selectedFlow];
  return f && f.type === 'station' ? f : null;
}

function renderFlow() {
  flowList.innerHTML = '';
  session.flow.forEach((f, i) => {
    const card = document.createElement('div');
    card.className = `flowCard ${i === selectedFlow ? 'sel' : ''}`;
    const label = f.type === 'segment'
      ? `🏃 이동 · Level ${f.level} · ${{ short: '짧게', medium: '보통', long: '길게' }[f.length]}`
      : f.type === 'crossing'
      ? `🚦 횡단보도 · Level ${f.level}`
      : `${PLACES[f.place]?.emoji || (f.kind === 'select' ? '🃏' : '📦')} ${f.title}${f.kind === 'select' ? ' (고르기)' : ''}`;
    card.innerHTML = `
      <span class="flowLabel">${i + 1}. ${label}</span>
      <span class="flowBtns">
        <button data-act="up" title="위로">↑</button>
        <button data-act="down" title="아래로">↓</button>
        <button data-act="del" title="삭제">✕</button>
      </span>`;
    card.addEventListener('click', e => {
      const act = e.target.dataset?.act;
      if (act === 'del') {
        session.flow.splice(i, 1);
        if (selectedFlow >= session.flow.length) selectedFlow = session.flow.length - 1;
      } else if (act === 'up' && i > 0) {
        [session.flow[i - 1], session.flow[i]] = [session.flow[i], session.flow[i - 1]];
        if (selectedFlow === i) selectedFlow = i - 1;
      } else if (act === 'down' && i < session.flow.length - 1) {
        [session.flow[i + 1], session.flow[i]] = [session.flow[i], session.flow[i + 1]];
        if (selectedFlow === i) selectedFlow = i + 1;
      } else {
        selectedFlow = i;
      }
      selectedObj = null;
      renderAll();
    });
    flowList.appendChild(card);
  });
}

$('btnAddSegment').addEventListener('click', () => {
  session.flow.push(makeSegment());
  selectedFlow = session.flow.length - 1;
  selectedObj = null;
  renderAll();
});
$('btnAddStation').addEventListener('click', () => {
  session.flow.push(makeStation({ title: `스테이션 ${session.flow.filter(f => f.type === 'station').length + 1}` }));
  selectedFlow = session.flow.length - 1;
  selectedObj = null;
  renderAll();
});
$('btnAddCrossing').addEventListener('click', () => {
  session.flow.push(makeCrossing());
  selectedFlow = session.flow.length - 1;
  selectedObj = null;
  renderAll();
});
$('btnAddSelect').addEventListener('click', () => {
  session.flow.push(makeSelectStation({ title: '고르기 과제' }));
  selectedFlow = session.flow.length - 1;
  selectedObj = null;
  renderAll();
});

/* ---------- 팔레트 ---------- */
function addLibItem(st, key, meta) {
  if (meta.targetOk && !st.target) {
    st.target = { lib: key, pos: [0.72, 0.6], scale: 1.2, zoneRadius: 0.11 };
    selectedObj = { kind: 'target' };
  } else {
    st.items.push({ lib: key, pos: [0.25 + (st.items.length % 4) * 0.12, 0.6], scale: 1, hand: 'any' });
    selectedObj = { kind: 'item', idx: st.items.length - 1 };
  }
  renderAll();
}

function renderPalette() {
  palette.innerHTML = '';
  let st = currentStation();
  if (st && st.kind === 'select') st = null; // 고르기 스테이션은 사물 배치 없음

  // 업로드된 커스텀 GLB
  Object.entries(session.assets || {}).forEach(([id, a]) => {
    const b = document.createElement('button');
    b.className = 'palItem';
    b.disabled = !st;
    b.innerHTML = `<span class="palEmoji">🧩</span><span>${a.name}</span><span class="palTag">GLB</span>`;
    b.addEventListener('click', () => { if (st) addLibItem(st, `asset:${id}`, { targetOk: false }); });
    const del = document.createElement('span');
    del.className = 'palDel'; del.textContent = '✕'; del.title = '모델 삭제';
    del.addEventListener('click', e => {
      e.stopPropagation();
      if (!confirm(`'${a.name}' 모델을 삭제할까요? 이 모델을 쓰는 사물도 함께 제거됩니다.`)) return;
      delete session.assets[id];
      session.flow.forEach(f => {
        if (f.type !== 'station') return;
        f.items = f.items.filter(it => it.lib !== `asset:${id}`);
        if (f.target?.lib === `asset:${id}`) f.target = null;
      });
      selectedObj = null;
      renderAll();
    });
    b.appendChild(del);
    palette.appendChild(b);
  });

  Object.entries(LIBRARY).forEach(([key, meta]) => {
    const b = document.createElement('button');
    b.className = 'palItem';
    b.disabled = !st;
    b.innerHTML = `<span class="palEmoji">${meta.emoji}</span><span>${meta.name}</span>${meta.targetOk ? '<span class="palTag">드롭존 가능</span>' : ''}`;
    b.addEventListener('click', () => { if (st) addLibItem(st, key, meta); });
    palette.appendChild(b);
  });
}

/* GLB 업로드 — 파일은 세션 JSON에 data URL로 내장 (온디바이스, 업로드 서버 없음) */
const GLB_MAX_BYTES = 3 * 1024 * 1024; // 링크·JSON 크기 보호용 상한 (추정치)
$('fileGlb').addEventListener('change', async e => {
  const file = e.target.files[0];
  if (!file) return;
  if (file.size > GLB_MAX_BYTES) {
    status(`GLB가 너무 큽니다 (${(file.size / 1048576).toFixed(1)}MB > 3MB) — 감량 후 다시 시도`, false);
    e.target.value = '';
    return;
  }
  const dataUrl = await new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = rej;
    r.readAsDataURL(file);
  });
  if (!session.assets) session.assets = {};
  const id = `g${Date.now().toString(36)}`;
  session.assets[id] = { name: file.name.replace(/\.glb$/i, ''), data: dataUrl };
  status(`'${file.name}' 추가됨 — 팔레트에서 배치하세요`);
  renderAll();
  e.target.value = '';
});

/* ---------- 스테이션 캔버스 (드래그 배치) ---------- */
let dragging = null;
function renderCanvas() {
  canvas.querySelectorAll('.canvasObj, .zoneCircle').forEach(el => el.remove());
  const st = currentStation();
  const f = session.flow[selectedFlow];
  if (!st) {
    canvasHint.textContent = f && f.type === 'segment'
      ? '이동 구간이 선택됨 — 오른쪽에서 난이도(Level)·길이를 설정하세요.'
      : f && f.type === 'crossing'
      ? '🚦 횡단보도가 선택됨 — 오른쪽에서 난이도와 신호 시간을 설정하세요. 사물 배치는 없습니다.'
      : '스테이션을 선택하거나 추가하면 여기에 사물을 배치할 수 있어요.';
    canvasHint.classList.remove('hidden');
    return;
  }
  canvasHint.classList.add('hidden');

  // 고르기 스테이션: 스텝 1 카드 미리보기 (배치 편집 없음 — 자동 정렬)
  if (st.kind === 'select') {
    const step = (st.steps || [])[0];
    (step?.options || []).forEach((o, i) => {
      const n = step.options.length;
      const el = document.createElement('div');
      el.className = 'canvasObj cardPrev' + (o.correct ? ' correctPrev' : '');
      el.style.left = `${50 + (i - (n - 1) / 2) * 20}%`;
      el.style.top = '55%';
      el.innerHTML = `<div class="cpEmoji">${o.emoji || '▫️'}</div><div class="cpLabel">${o.label || ''}</div>`;
      canvas.appendChild(el);
    });
    return;
  }

  const place = (def, kind, idx = null) => {
    const meta = libMeta(def.lib, session.assets);
    if (kind === 'target') {
      const zone = document.createElement('div');
      zone.className = 'zoneCircle';
      const d = def.zoneRadius * 2 * 100;
      // 판정은 정규화 좌표 원 → 16:9 화면에서는 가로:세로 %가 각각 폭·높이 기준인 타원으로 그려야 일치
      zone.style.cssText = `left:${def.pos[0] * 100}%; top:${def.pos[1] * 100}%; width:${d}%; height:${d}%;`;
      canvas.appendChild(zone);
    }
    const el = document.createElement('div');
    el.className = 'canvasObj' + (kind === 'target' ? ' isTarget' : '')
      + (def.distractor ? ' distract' : '')
      + (def.hand === 'both' ? ' bimanual' : '')
      + ((selectedObj?.kind === kind && (kind === 'target' || selectedObj?.idx === idx)) ? ' sel' : '');
    el.style.left = `${def.pos[0] * 100}%`;
    el.style.top = `${def.pos[1] * 100}%`;
    el.style.fontSize = `${34 * (def.scale || 1)}px`;
    el.textContent = meta.emoji;
    if (kind === 'item' && st.budget > 0 && def.price > 0) {
      const tag = document.createElement('span');
      tag.className = 'priceTag';
      tag.textContent = `${def.price.toLocaleString()}원`;
      el.appendChild(tag);
    }
    el.title = meta.name + (kind === 'target' ? ' (드롭존)' : '');
    el.addEventListener('mousedown', e => {
      e.preventDefault();
      selectedObj = kind === 'target' ? { kind: 'target' } : { kind: 'item', idx };
      dragging = { def };
      renderProps(); highlightSel();
    });
    canvas.appendChild(el);
  };

  st.items.forEach((it, i) => place(it, 'item', i));
  if (st.target) place(st.target, 'target');
}

function highlightSel() {
  renderCanvas(); // 소규모 DOM — 단순 재렌더
}

canvas.addEventListener('mousemove', e => {
  if (!dragging) return;
  const r = canvas.getBoundingClientRect();
  dragging.def.pos = [
    Math.min(0.97, Math.max(0.03, (e.clientX - r.left) / r.width)),
    Math.min(0.95, Math.max(0.05, (e.clientY - r.top) / r.height)),
  ];
  renderCanvas();
});
window.addEventListener('mouseup', () => {
  if (dragging) { dragging = null; autosave(); }
});

/* ---------- 속성 패널 ---------- */
function fieldRow(label, inputHtml) {
  return `<div class="fRow"><label>${label}</label>${inputHtml}</div>`;
}

function renderProps() {
  const f = session.flow[selectedFlow];
  if (!f) { propsPanel.innerHTML = '<p class="hint">플로우 항목을 선택하세요.</p>'; return; }

  if (f.type === 'segment') {
    propsPanel.innerHTML = `
      <h3>🏃 이동 구간</h3>
      ${fieldRow('난이도 Level', `
        <select id="pLevel">
          <option value="0" ${f.level === 0 ? 'selected' : ''}>0 · 자동 이동</option>
          <option value="1" ${f.level === 1 ? 'selected' : ''}>1 · 교대 스트로크만</option>
          <option value="2" ${f.level === 2 ? 'selected' : ''}>2 · 교대 + 체간 조향</option>
        </select>`)}
      ${fieldRow('길이', `
        <select id="pLen">
          <option value="short" ${f.length === 'short' ? 'selected' : ''}>짧게</option>
          <option value="medium" ${f.length === 'medium' ? 'selected' : ''}>보통</option>
          <option value="long" ${f.length === 'long' ? 'selected' : ''}>길게</option>
        </select>`)}
      ${fieldRow('배경', `
        <select id="pTheme">
          <option value="hall" ${f.theme === 'hall' ? 'selected' : ''}>집 복도</option>
          <option value="elevator" ${f.theme === 'elevator' ? 'selected' : ''}>엘리베이터</option>
          <option value="street" ${f.theme === 'street' ? 'selected' : ''}>길거리</option>
          <option value="park" ${f.theme === 'park' ? 'selected' : ''}>공원</option>
          <option value="market" ${f.theme === 'market' ? 'selected' : ''}>마트 통로</option>
          <option value="school" ${f.theme === 'school' ? 'selected' : ''}>학교 복도</option>
        </select>`)}`;
    $('pLevel').addEventListener('change', e => { f.level = +e.target.value; renderAll(); });
    $('pLen').addEventListener('change', e => { f.length = e.target.value; renderAll(); });
    $('pTheme').addEventListener('change', e => { f.theme = e.target.value; autosave(); });
    return;
  }

  if (f.type === 'crossing') {
    propsPanel.innerHTML = `
      <h3>🚦 횡단보도</h3>
      <p class="hint">2차선 도로 — 빨간불에 멈추고, 초록불에 건너요. 실패 없이 신호 지키기를 배웁니다.</p>
      ${fieldRow('난이도 Level', `
        <select id="xLevel">
          <option value="0" ${f.level === 0 ? 'selected' : ''}>0 · 초록불에 자동으로 건넘</option>
          <option value="1" ${f.level >= 1 ? 'selected' : ''}>1 · 교대 스트로크로 건넘</option>
        </select>`)}
      ${fieldRow(`빨간불 길이 <b>${f.redS}s</b>`, `<input type="range" id="xRed" min="4" max="15" step="1" value="${f.redS}">`)}
      ${fieldRow(`초록불 길이 <b>${f.greenS}s</b>`, `<input type="range" id="xGreen" min="6" max="20" step="1" value="${f.greenS}">`)}`;
    $('xLevel').addEventListener('change', e => { f.level = +e.target.value; renderAll(); });
    $('xRed').addEventListener('input', e => { f.redS = +e.target.value; renderProps(); autosave(); });
    $('xGreen').addEventListener('input', e => { f.greenS = +e.target.value; renderProps(); autosave(); });
    return;
  }

  // 고르기 스테이션 (선택 패널)
  if (f.kind === 'select') {
    const st = f;
    const g = st.grading || (st.grading = { dwellMs: 900, assistTimeoutS: 20 });
    const placeOpts = Object.entries(PLACES)
      .map(([k, p]) => `<option value="${k}" ${(st.place || 'none') === k ? 'selected' : ''}>${p.emoji} ${p.name}</option>`)
      .join('');
    const stepsHtml = (st.steps || []).map((s, si) => `
      <div class="stepBox" data-si="${si}">
        <div class="stepHead">스텝 ${si + 1} <button data-act="delStep" data-si="${si}" class="tiny">✕</button></div>
        ${fieldRow('안내문', `<input type="text" data-act="prompt" data-si="${si}" value="${(s.prompt || '').replace(/"/g, '&quot;')}">`)}
        ${s.options.map((o, oi) => `
          <div class="optRow">
            <input type="text" data-act="optEmoji" data-si="${si}" data-oi="${oi}" value="${o.emoji || ''}" class="emojiIn" title="이모지">
            <input type="text" data-act="optLabel" data-si="${si}" data-oi="${oi}" value="${(o.label || '').replace(/"/g, '&quot;')}" placeholder="선택지">
            <label title="정답"><input type="checkbox" data-act="optCorrect" data-si="${si}" data-oi="${oi}" ${o.correct ? 'checked' : ''}>⭕</label>
            <button data-act="delOpt" data-si="${si}" data-oi="${oi}" class="tiny">✕</button>
          </div>`).join('')}
        ${s.options.length < 4 ? `<button data-act="addOpt" data-si="${si}" class="tiny wide">+ 선택지</button>` : ''}
      </div>`).join('');
    propsPanel.innerHTML = `
      <h3>🃏 고르기 스테이션 <span class="hint">(키오스크·정류장·길찾기)</span></h3>
      ${fieldRow('이름', `<input type="text" id="pTitle" value="${st.title.replace(/"/g, '&quot;')}">`)}
      ${fieldRow('장소 (마을 공간)', `<select id="pPlace">${placeOpts}</select>`)}
      <h4>선택 스텝 (순서대로 진행)</h4>
      ${stepsHtml}
      <button id="addStep" class="tiny wide">+ 스텝 추가</button>
      <h4>단계조절</h4>
      ${fieldRow(`머무르기 시간 <b>${g.dwellMs}ms</b>`, `<input type="range" id="gDwell" min="400" max="2000" step="100" value="${g.dwellMs}">`)}
      ${fieldRow(`도움 시작 <b>${g.assistTimeoutS}s</b>`, `<input type="range" id="gAssist" min="5" max="60" step="5" value="${g.assistTimeoutS}">`)}`;
    $('pTitle').addEventListener('input', e => { st.title = e.target.value; renderFlow(); autosave(); });
    $('pPlace').addEventListener('change', e => { st.place = e.target.value; renderFlow(); autosave(); });
    $('gDwell').addEventListener('input', e => { g.dwellMs = +e.target.value; renderProps(); autosave(); });
    $('gAssist').addEventListener('input', e => { g.assistTimeoutS = +e.target.value; renderProps(); autosave(); });
    $('addStep').addEventListener('click', () => {
      st.steps.push({ prompt: '맞는 것을 골라요', options: [
        { label: '정답', emoji: '⭕', correct: true }, { label: '오답', emoji: '❌', correct: false }] });
      renderAll();
    });
    propsPanel.querySelectorAll('[data-act]').forEach(el => {
      const si = +el.dataset.si, oi = el.dataset.oi != null ? +el.dataset.oi : null;
      const act = el.dataset.act;
      if (act === 'prompt') el.addEventListener('input', e => { st.steps[si].prompt = e.target.value; autosave(); });
      if (act === 'optLabel') el.addEventListener('input', e => { st.steps[si].options[oi].label = e.target.value; renderCanvas(); autosave(); });
      if (act === 'optEmoji') el.addEventListener('input', e => { st.steps[si].options[oi].emoji = e.target.value; renderCanvas(); autosave(); });
      if (act === 'optCorrect') el.addEventListener('change', e => { st.steps[si].options[oi].correct = e.target.checked; autosave(); });
      if (act === 'delOpt') el.addEventListener('click', () => { st.steps[si].options.splice(oi, 1); renderAll(); });
      if (act === 'delStep') el.addEventListener('click', () => { st.steps.splice(si, 1); renderAll(); });
      if (act === 'addOpt') el.addEventListener('click', () => {
        st.steps[si].options.push({ label: '선택지', emoji: '▫️', correct: false }); renderAll();
      });
    });
    return;
  }

  // 스테이션
  const st = f;
  const g = st.grading || (st.grading = { ...GRADING_DEFAULTS });
  let objHtml = '';
  if (selectedObj?.kind === 'item' && st.items[selectedObj.idx]) {
    const it = st.items[selectedObj.idx];
    const meta = libMeta(it.lib, session.assets);
    objHtml = `
      <hr>
      <h3>${meta.emoji} ${meta.name} <span class="hint">(잡기 사물)</span></h3>
      ${fieldRow('크기', `<input type="range" id="oScale" min="0.6" max="2" step="0.1" value="${it.scale || 1}">`)}
      ${fieldRow('허용 손', `
        <select id="oHand">
          <option value="any" ${it.hand === 'any' ? 'selected' : ''}>아무 손이나</option>
          <option value="L" ${it.hand === 'L' ? 'selected' : ''}>왼손만</option>
          <option value="R" ${it.hand === 'R' ? 'selected' : ''}>오른손만</option>
          <option value="both" ${it.hand === 'both' ? 'selected' : ''}>🙌 양손 함께 (두 주먹)</option>
        </select>`)}
      ${fieldRow('', `<label class="chk"><input type="checkbox" id="oDistract" ${it.distractor ? 'checked' : ''}> 🙅 정답 아님 (방해 자극 — 존에 넣으면 되돌아옴)</label>`)}
      ${st.budget > 0 ? fieldRow('가격 (원)', `<input type="number" id="oPrice" min="0" step="500" value="${it.price || 0}">`) : ''}
      <button id="oDel" class="danger">이 사물 삭제</button>`;
  } else if (selectedObj?.kind === 'target' && st.target) {
    const meta = libMeta(st.target.lib, session.assets);
    objHtml = `
      <hr>
      <h3>${meta.emoji} ${meta.name} <span class="hint">(드롭존)</span></h3>
      ${fieldRow('크기', `<input type="range" id="tScale" min="0.8" max="2.4" step="0.1" value="${st.target.scale || 1}">`)}
      ${fieldRow('존 반경', `<input type="range" id="tZone" min="0.06" max="0.22" step="0.01" value="${st.target.zoneRadius}">`)}
      <button id="tDel" class="danger">드롭존 삭제</button>`;
  }

  const placeOpts = Object.entries(PLACES)
    .map(([k, p]) => `<option value="${k}" ${(st.place || 'none') === k ? 'selected' : ''}>${p.emoji} ${p.name}</option>`)
    .join('');
  propsPanel.innerHTML = `
    <h3>📦 스테이션</h3>
    ${fieldRow('이름', `<input type="text" id="pTitle" value="${st.title.replace(/"/g, '&quot;')}">`)}
    ${fieldRow('장소 (마을 공간)', `<select id="pPlace">${placeOpts}</select>`)}
    ${fieldRow('아이 안내문', `<input type="text" id="pInstr" value="${(st.instruction || '').replace(/"/g, '&quot;')}">`)}
    <h4>단계조절</h4>
    ${fieldRow(`잡기 반경 <b>${g.graspRadius.toFixed(2)}</b>`, `<input type="range" id="gRadius" min="0.03" max="0.15" step="0.01" value="${g.graspRadius}">`)}
    ${fieldRow(`놓기 유지 <b>${g.tReleaseMs}ms</b>`, `<input type="range" id="gRelease" min="150" max="800" step="50" value="${g.tReleaseMs}">`)}
    ${fieldRow(`도움 시작 <b>${g.assistTimeoutS}s</b>`, `<input type="range" id="gAssist" min="5" max="60" step="5" value="${g.assistTimeoutS}">`)}
    <h4>셀프 계산대 (선택 사항)</h4>
    ${fieldRow('예산 (원, 0=없음)', `<input type="number" id="pBudget" min="0" step="500" value="${st.budget || 0}">`)}
    ${fieldRow('담을 개수 (0=전부)', `<input type="number" id="pReqCount" min="0" max="9" value="${st.requiredCount || 0}">`)}
    ${objHtml}`;

  $('pTitle').addEventListener('input', e => { st.title = e.target.value; renderFlow(); autosave(); });
  $('pPlace').addEventListener('change', e => { st.place = e.target.value; renderFlow(); autosave(); });
  $('pInstr').addEventListener('input', e => { st.instruction = e.target.value; autosave(); });
  $('pBudget').addEventListener('input', e => { st.budget = Math.max(0, +e.target.value || 0); autosave(); });
  $('pReqCount').addEventListener('input', e => { st.requiredCount = Math.max(0, +e.target.value || 0); autosave(); });
  $('gRadius').addEventListener('input', e => { g.graspRadius = +e.target.value; renderProps(); autosave(); });
  $('gRelease').addEventListener('input', e => { g.tReleaseMs = +e.target.value; renderProps(); autosave(); });
  $('gAssist').addEventListener('input', e => { g.assistTimeoutS = +e.target.value; renderProps(); autosave(); });

  if (selectedObj?.kind === 'item' && st.items[selectedObj.idx]) {
    const it = st.items[selectedObj.idx];
    $('oScale').addEventListener('input', e => { it.scale = +e.target.value; renderCanvas(); autosave(); });
    $('oHand').addEventListener('change', e => { it.hand = e.target.value; autosave(); });
    $('oDistract').addEventListener('change', e => { it.distractor = e.target.checked; renderCanvas(); autosave(); });
    $('oPrice')?.addEventListener('input', e => { it.price = Math.max(0, +e.target.value || 0); renderCanvas(); autosave(); });
    $('oDel').addEventListener('click', () => {
      st.items.splice(selectedObj.idx, 1); selectedObj = null; renderAll();
    });
  }
  if (selectedObj?.kind === 'target' && st.target) {
    $('tScale').addEventListener('input', e => { st.target.scale = +e.target.value; renderCanvas(); autosave(); });
    $('tZone').addEventListener('input', e => { st.target.zoneRadius = +e.target.value; renderCanvas(); autosave(); });
    $('tDel').addEventListener('click', () => { st.target = null; selectedObj = null; renderAll(); });
  }
}

/* ---------- 저장 · 불러오기 · 실행 링크 ---------- */
$('btnNew').addEventListener('click', () => {
  if (!confirm('현재 세션을 지우고 새로 시작할까요? (JSON으로 먼저 저장해 두는 것을 권장)')) return;
  session = makeSession();
  selectedFlow = -1; selectedObj = null;
  titleInput.value = session.title;
  renderAll();
});

$('btnSaveJson').addEventListener('click', () => {
  const blob = new Blob([JSON.stringify(session, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${(session.title || 'session').replace(/[^\w가-힣-]+/g, '_')}.adl.json`;
  a.click();
  URL.revokeObjectURL(a.href);
  status('JSON 저장됨');
});

$('fileLoad').addEventListener('change', async e => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const s = JSON.parse(await file.text());
    const errs = validateSession(s);
    session = s;
    selectedFlow = s.flow.length ? 0 : -1; selectedObj = null;
    titleInput.value = session.title;
    renderAll();
    status(errs.length ? `불러옴 (경고: ${errs[0]})` : '불러오기 완료', errs.length === 0);
  } catch (err) {
    status(`불러오기 실패: ${err.message}`, false);
  }
  e.target.value = '';
});

function runnerLink() {
  const errs = validateSession(session);
  if (errs.length) { status(errs[0], false); return null; }
  const encoded = encodeSession(session);
  if (encoded.length > 1_500_000) {
    status('GLB 포함 세션은 링크가 너무 큽니다 — "JSON 저장" 후 러너의 "세션 파일 열기"로 실행하세요', false);
    return null;
  }
  const base = location.href.replace(/editor\.html.*$/, 'runner.html');
  return `${base}#s=${encoded}`;
}

$('btnPreview').addEventListener('click', () => {
  const url = runnerLink();
  if (url) window.open(url, '_blank');
});

$('btnCopyLink').addEventListener('click', async () => {
  const url = runnerLink();
  if (!url) return;
  try {
    await navigator.clipboard.writeText(url);
    status('실행 링크 복사됨 — 아동 PC 브라우저에 붙여넣어 실행');
  } catch {
    prompt('아래 링크를 복사하세요:', url);
  }
});

/* ---------- 렌더 ---------- */
function renderAll() {
  renderFlow();
  renderPalette();
  renderCanvas();
  renderProps();
  autosave();
}
renderAll();
