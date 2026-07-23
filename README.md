# I Can Do ADL — 웹캠 일상생활(ADL) 훈련 도구

아동 작업치료용 웹캠 기반 ADL 훈련 도구. 아동이 손과 몸을 움직여 "우리 마을 하루"(집·세면대·주방·현관 → 엘리베이터·버스·횡단보도 → 마트·문구점·카페 → 학교)를 경험하며 일상 과제를 수행한다. 치료사는 코드 없이 세션을 저작한다.

**게임 목적** — 신체 ADL 훈련을 넘어 상황 인지와 실행기능 경험:
주의·집중 · 작업기억 · 충동 억제 · 결과 예측/인과 추론.

## 구성
- `app/index.html` — 랜딩 (러너 / 에디터 진입)
- `app/runner.html` — 아동 러너 (3D 항행 ↔ 거울 모드 조작). `?input=mouse`로 웹캠 없이 테스트
- `app/editor.html` — 치료사 저작 에디터 (JSON 저장/불러오기, 실행 링크 생성)
- `app/js/` — 입력 드라이버(MediaPipe Hand+Pose / 마우스 폴백), 세션 스키마, 3D 라이브러리, 러너·에디터 엔진
- 문서: `problem-brief_*.md`(문제 정의 동결본), `plan_*.md`(구현 계획·마일스톤), `gate1-gesture-spike.html`(제스처 검증 스파이크)

빌드 과정 없음 — 순수 정적 HTML/JS. three.js·MediaPipe는 CDN(importmap)으로 로드.

## 로컬 실행
```bash
node serve.mjs
# http://localhost:8123/  (app/ 을 웹 루트로 서빙)
```

## 개인정보 (불가침)
웹캠 영상은 전량 온디바이스 처리 — 저장·클라우드 전송 없음. 랜드마크 파생 수치(개방도·속도 등)만 메모리에서 소비하며, 세션 리포트는 로컬 다운로드(JSON/CSV)만 제공한다.

## 배포 (Vercel)
정적 사이트, 빌드 없음. Vercel 임포트 시 **Framework Preset = Other**, 빌드/출력 설정 비움.
`vercel.json`은 두지 않는다 — `cleanUrls`가 `.html`을 떼고 상대경로 import를 깨뜨리므로 순수 정적 기본 동작에 맡긴다.
- **저장소 루트로 서빙(기본)**: `/` → `index.html`이 `./app/index.html`(랜딩)로 리다이렉트. 링크는 `/app/runner.html` 등.
- **(권장) Root Directory = `app`**: Vercel 프로젝트 설정에서 지정하면 `/`가 바로 랜딩,
  `/runner.html`·`/editor.html`로 URL이 깔끔해진다.
