# Daily Living Scene 설계 문법 v0.1
날짜: 2026-07-24 · 상태: 설계 정본(코드 무변경) · 상위: ecological-validity-analysis_v0.1.md
목적: 이 게임의 모든 콘텐츠가 반복 사용할 **생활 장면(Scene) 문법**을 정의한다.
검증 대상은 "물체를 움직일 수 있는가"가 아니라 **"사용자가 환경 변화와 행동의 이유를
이해하면서 하나의 생활 장면을 수행하고 있다고 느끼는가"**이다.

---

## 0. 무엇이 바뀌는가 — 루프의 교체

```
[현재]  물체 등장 → 조작 → 성공 판정 → 점수 → 다음 과제
[목표]  생활 상황 → 환경을 봄 → 할 일을 이해/선택 → 사물과 상호작용
        → 행동 수행 → 환경이 실제로 변화 → 그 변화가 다음 행동의 이유가 됨
```

### "옷 입기"는 "옷을 A존→B존 옮기기"와 무엇이 다른가 (5가지)
같은 Recognition(잡고 날라서 존에 놓기)을 쓰더라도 다음 5가지가 다르면 경험이 다르다:

| # | 차이 | 옮기기(현재) | 옷 입기(목표) |
|---|---|---|---|
| 1 | **도착지의 의미** | 임의의 존(원) | **사용자의 몸** — 존이 아니라 착용 |
| 2 | **지속 상태** | 놓는 순간 끝 | `outfit: sleepwear→dayclothes`가 **장면이 끝나도 유지**되고, 이후 장면(현관)의 조건이 됨 |
| 3 | **파생 결과** | 없음 | 입는 순간 **벗은 잠옷이 생긴다** → 다음 행동(바구니)의 이유가 이전 행동에서 태어남 |
| 4 | **이유의 표기** | 지시어("옷장에 넣어요") | 생활어("학교 가야 하는데 아직 잠옷이야") |
| 5 | **실패 개념** | 존 밖=미완 | 실패 없음 — 상태가 안 변했을 뿐, 되돌아갈 뿐 |

즉 **차이는 판정 기술이 아니라 상태·인과·언어에 있다.** 이것이 이 문법의 요지다.

---

## A. Daily Living Scene Design Principles (설계 원칙 10)

| # | 원칙 | 내용 | 위반 예 (현 프로토타입) |
|---|---|---|---|
| P1 | **상태가 진실이다** | 진행은 오브젝트 좌표가 아니라 상태 변화로 기록한다. 완료 = 목표 상태 도달 | "쟁반에 3개 올림"이 곧 완료 — 상태 없음 |
| P2 | **목적이 장면을 연다** | 모든 Scene은 생활 목적으로 시작하고 HUD 1행은 목적(생활어)이다 | "과일 2가지만 담아요"(규칙어) |
| P3 | **환경이 행동을 제안한다** | 할 일은 환경 단서(affordance)로 암시. 텍스트 지시는 기본이 아니라 **assist 1단계** | 지시문이 항상 상단에 상주 |
| P4 | **모든 행동은 세계를 바꾼다** | 완료 판정마다 보이는 환경/사용자 상태 변화가 ≥1. 없으면 Scene 미완성 | 신발을 놓아도 신겨지지 않음 |
| P5 | **변화가 다음 이유를 만든다** | Scene 출구 = 목적 상태 달성이고, 그 상태가 다음 Scene의 입구 조건 | 완료→별점→무관한 다음 과제 |
| P6 | **순서는 제약이지 대본이 아니다** | 필수 선행조건만 명시하고 나머지는 자유 순서·선택 | 15장면 완전 선형 |
| P7 | **Occupation이 Recognition을 선택한다** | 설계는 항상 생활활동→상호작용→판정 순. 역방향(판정이 있으니 활동을 발명) 금지 | "칫솔을 세면대에 놓기" |
| P8 | **사물은 제자리에서 출발한다** | 모든 조작 오브젝트는 환경 오브젝트에 소속된 출발지를 가진다 | 허공에 부유하는 칫솔 |
| P9 | **실패는 없고 상태만 있다** (불가침 계승) | 잘못된 행동은 상태가 되돌아오는 것. 벌점·게임오버 없음 | (준수 중 — 유지) |
| P10 | **Game Feedback은 통역이 아니라 박수다** | 별·파티클·사운드는 상태 변화를 축하할 뿐, 행동 설명을 Game Layer에 떠넘기지 않는다 | "양손으로!"가 규칙 안내 역할 |

---

## B. Scene Data Model

향후 코드에서 그대로 쓸 수 있는 구조 (현 session JSON의 확장 — station은 "행동 1개짜리 Scene"의 특수형으로 흡수 가능):

```jsonc
{
  "type": "scene",
  "id": "bedroom-morning",
  "place": "room",                       // 기존 PLACES 재사용
  "timeContext": "morning-before-school",
  "purpose": {                            // P2: HUD에 표시되는 것은 이것
    "label": "학교 갈 준비를 해요",
    "cue": "아직 잠옷을 입고 있어요"      // 상황 설명(생활어)
  },
  "userState": { "outfit": "sleepwear" }, // Scene 시작 시 사용자 상태

  "envObjects": [                         // 환경 = 상태 기계 (배경이 아님)
    { "id": "curtain", "states": ["closed","open"], "state": "closed",
      "pos": [0.15, 0.25], "affords": ["open-curtain"] },
    { "id": "bed",     "states": ["messy","made"],  "state": "messy",
      "pos": [0.3, 0.7],  "affords": ["make-bed"] },
    { "id": "closet",  "states": ["closed","open"], "state": "open",
      "pos": [0.8, 0.5],  "affords": ["pick-clothes"] },
    { "id": "laundryBasket", "states": ["empty","hasPajama"], "state": "empty",
      "pos": [0.6, 0.8],  "affords": ["drop-laundry"] }
  ],

  "props": [                              // P8: 조작 오브젝트는 제자리 소속
    { "id": "blanket",  "lib": "blanket", "home": "bed",
      "states": ["messy","folded"], "state": "messy" },
    { "id": "clothes",  "lib": "shirt",   "home": "closet",
      "states": ["inCloset","held","worn"], "state": "inCloset" },
    { "id": "pajama",   "lib": "shirt",   "home": null,       // 파생 오브젝트:
      "states": ["hidden","onBed","held","inBasket"],          // 옷 입기 전엔 없음
      "state": "hidden" }
  ],

  "actions": [                            // Occupation 단위 (C절 3층 명시)
    { "id": "open-curtain",
      "occupation": "커튼 열기", "interaction": "잡고 옆으로 끌기",
      "recognition": "GRASP+CARRY(horizontal)",
      "requires": [], "optional": true,   // F6: 선택 행동
      "effects": [ "curtain.state=open", "room.light=bright" ] },
    { "id": "make-bed",
      "occupation": "이불 개기", "interaction": "양손으로 끌어올리기",
      "recognition": "BIMANUAL_GRASP+CARRY",
      "requires": [], "optional": true, "orderFree": true,
      "effects": [ "blanket.state=folded", "bed.state=made" ] },
    { "id": "pick-and-wear",
      "occupation": "옷 갈아입기", "interaction": "옷장에서 꺼내 몸에 대기",
      "recognition": "GRASP+CARRY→bodyZone",
      "requires": [], "optional": false,
      "effects": [ "clothes.state=worn", "user.outfit=dayclothes",
                   "pajama.state=onBed" ] },               // ★파생: 벗은 잠옷 발생
    { "id": "drop-laundry",
      "occupation": "벗은 잠옷 정리", "interaction": "집어서 바구니에 넣기",
      "recognition": "GRASP+CARRY→zone",
      "requires": [ "pajama.state=onBed" ],                 // ★이전 행동이 이유를 생성
      "optional": false,
      "effects": [ "pajama.state=inBasket", "laundryBasket.state=hasPajama" ] }
  ],

  "exit": {                               // P5: 출구 = 목적 상태
    "condition": "user.outfit==dayclothes && pajama.state==inBasket",
    "transition": "이제 세수하러 가요"     // 다음 행동의 이유를 예고
  },
  "grading": { }                          // 기존 단계조절 그대로 부착 가능
}
```

핵심: **actions는 목록이지 순서가 아니다.** 순서는 `requires`(상태 조건)로만 발생한다(P6).
기존 스키마와의 호환: 현 station = `envObjects` 없이 `actions` 1개(move/select)인 Scene.
마이그레이션은 파괴가 아니라 일반화다.

---

## C. Activity / Interaction / Recognition 3-Layer Model

```
Occupation Layer   사용자가 수행한다고 인식하는 생활활동   "양치하기"
      ↓ (활동이 상호작용을 선택)
Interaction Layer  게임 안에서 물체와 하는 행동            "칫솔을 잡고 입가에서 문지르기"
      ↓ (상호작용이 판정을 선택)
Recognition Layer  MediaPipe가 판정하는 신체 움직임        GRASP + OSCILLATION@zone
```

**규칙 1**: UI·안내문·리포트에는 Occupation 이름만 등장한다. Recognition 용어(dwell, stroke)는
코드 밖으로 나오지 않는다.
**규칙 2**: 설계 순서는 항상 ↓ 방향. Recognition에서 출발한 활동 발명 금지(P7).
**규칙 3**: 한 Recognition은 여러 Occupation을 섬긴다 — 분리의 증거:

### Recognition 프리미티브 카탈로그 (보유 + 신규 2)
| Recognition | 정의 | 섬기는 Occupation 예 |
|---|---|---|
| GRASP | OPEN→FIST (R1) | 모든 집기 |
| CARRY | 쥔 채 이동 | 나르기·끌기(커튼)·입기(몸으로) |
| RELEASE | OPEN 유지+저속 (R2) | 놓기·넣기 |
| BIMANUAL_GRASP | 두 주먹 동시 | 이불 개기·큰 책 옮기기 |
| DWELL | OPEN 손 머무르기 | 버튼 누르기(엘리베이터·키오스크·하차벨) |
| ALT_STROKE | 양손 교대 스윙 | 걷기(등굣길 이동) |
| LEAN | 체간 기울기 | 방향 바꾸기 |
| **OSCILLATION** (신규①) | 쥔 채 특정 존에서 왕복 | 양치·(향후) 걸레질·빗질 |
| **ZONE_PASS** (신규②) | 운반 중 존 통과 | 계산대 스캔·(향후) 문 통과 |

신규는 2개뿐 — 문법 전환에 기술 폭발이 없음을 보장한다.

---

## D. State Transition Model

### 상태 어휘
```
UserState : outfit(sleepwear|dayclothes) · feet(barefoot|shoes)
            hygiene(none|teethBrushed|faceWashed) · meal(hungry|fed)
EnvState  : curtain(closed|open) · room.light(dark|bright) · bed(messy|made)
            table(set|dirty|clear) · sink(empty|hasDishes) · elevatorDoor(closed|open) ...
PropState : atHome(제자리) | held | placed@X | worn | consumed | hidden(파생 전)
```

### 전이 표기법
```
action(전제조건) ⇒ 효과1, 효과2, ...        // 효과는 연쇄될 수 있다
```
예:
```
open-curtain()                ⇒ curtain=open, room.light=bright        // 환경 연쇄
pick-and-wear()               ⇒ clothes=worn, user.outfit=dayclothes,
                                 pajama: hidden→onBed                   // 파생 오브젝트 생성
drop-laundry(pajama=onBed)    ⇒ pajama=inBasket
put-shoes(user.outfit=dayclothes) ⇒ shoes=worn, user.feet=shoes        // 장면 간 전제조건
press-1F(dwell)               ⇒ elevatorDoor=open                       // 행동→문 열림→진행
```
**게임의 중요한 경험은 오브젝트의 이동이 아니라 이 전이들이다.** 렌더러는 상태를 그릴 뿐이다.
(worn이면 아바타/상태 칩에 착용 표시, bright면 조명 밝게, open이면 문 열림 — 표현은 상태의 함수)

---

## E-1. 순서 분류 (P6 — 부분 순서)

| 분류 | 정의 | 아침 편 배정 |
|---|---|---|
| **필수 선후** | 상태 전제조건이 물리·논리적으로 강제 | 옷 입기→외출(잠옷 외출 불가), 잠옷 발생→바구니, 신발→현관문, 엘리베이터→거리, 신호→건너기 |
| **교환 가능** | 서로 순서 무관 | 침실 정리 ↔ 세면(어느 쪽 먼저든 됨), 이불 ↔ 옷 입기, 양치 ↔ 세수 |
| **선택적** | 안 해도 목적 달성 가능(하면 보상) | 커튼 열기(권장 — 방이 밝아짐), 세수, 이불 개기, 카페 들르기(2편) |

## E-2. Affordance 설계 (P3 — 지시문의 강등)

| 환경 오브젝트 | 시각 단서(무언의 제안) | 유도하는 행동 |
|---|---|---|
| 닫힌 커튼 | 어두운 방, 커튼 틈으로 새는 빛 | 열기 |
| 헝클어진 이불 | 구겨진 형태·비뚤어진 각도 | 개기 |
| 열린 옷장 | 걸린 옷이 보임, 은은한 강조 | 옷 선택 |
| 침대 위 잠옷 | 옷 입기 직후 '툭' 등장(소리) | 바구니로 |
| 컵에 꽂힌 칫솔 | 세면대 위 제자리 | 집어서 양치 |
| 열린 신발장 한 칸 | 내 신발만 칸에서 살짝 돌출 | 꺼내 신기 |
| 개수대 | 식탁의 빈 그릇 + 개수대 위치 | 정리 |
| 엘리베이터 패널 | 층 버튼 세로 배열(카드 아님) | 누르기 |

**지시문 정책**: 기본 화면에는 목적 1행(P2)만. 행동 지시문("~를 ~에 놓아요")은
**기존 assist 에스컬레이션의 1단계로 강등** — 막힌 아동에게만 나타난다.
(assist 0: 환경 단서만 → assist 1: 지시문+대상 강조 → assist 2: 기존 반경 확대·부유)

---

## E-3. Morning Routine Scene Map — 13개 활동 재검토

각 활동에 두 질문을 적용했다: ⓐ *생활의 필요에서 발생한 행동인가, 판정을 쓰기 위해 발명된
행동인가?* ⓑ *완료 시 화면 속 세계에서 무엇이 달라지는가?* (답이 없으면 설계 미완)

| Scene | 생활 목적 | 현재 상태 | 환경 단서 | Occupation | Interaction | MediaPipe 판정 | 행동 후 State 변화 | 다음 행동과의 관계 | 판정 |
|---|---|---|---|---|---|---|---|---|---|
| 침실 | 하루 시작 | 어두운 방 | 커튼 틈 빛 | 커튼 열기 | 잡고 끌기 | GRASP+CARRY | light=bright | 방이 보여 다른 행동 가능 | **유지**(선택) |
| 침실 | 정돈 습관 | 이불 헝클어짐 | 구겨진 이불 | 이불 개기 | 양손 끌어올리기 | BIMANUAL | bed=made | 독립적(교환 가능) | **유지**(선택) |
| 침실 | 외출 준비 | 잠옷 착용 | 열린 옷장 | 옷 갈아입기 | 꺼내 몸에 대기 | GRASP+CARRY→몸 | outfit=dayclothes, **잠옷 발생** | 현관 통과의 전제 | **유지**(핵심) |
| 침실 | 정리 | 벗은 잠옷 | 침대 위 잠옷+바구니 | 잠옷 정리 | 집어 넣기 | GRASP+CARRY | pajama=inBasket | 옷 입기가 이유를 생성 | **통합**(옷 갈아입기 후속) |
| 세면실 | 청결 | 안 씻음 | 컵 속 칫솔 | 양치하기 | 잡고 입가 문지르기 | GRASP+**OSC** | hygiene=teethBrushed | 침실과 교환 가능 | **유지**(필수) |
| 세면실 | 청결 | 세수 안 함 | 수건걸이 | 세수하기 | 두 손 얼굴로 | 양손 DWELL@얼굴 | hygiene=faceWashed | 양치와 교환 가능 | **수정**(선택으로) |
| 주방 | 아침 먹기 | 배고픔 | 차려진 식탁 | 아침 먹기 | 빵을 입으로 | CARRY→입존 | meal=fed, **빈 그릇 발생** | 정리의 이유 생성 | **수정**(간소 — 한 입) |
| 주방 | 정리 | 빈 그릇 | 개수대 | 그릇 정리 | 집어 옮기기 | GRASP+CARRY | table=clear | 식사가 이유를 생성 | **유지** |
| 현관 | 외출 | 맨발 | 열린 신발장 칸 | 신발 꺼내 신기 | 꺼내 발에 대기 | GRASP+CARRY→발 | feet=shoes | 외출의 전제 · **outfit 전제조건 검사** | **유지**(핵심) |
| 이동 | 내려가기 | 문 닫힘 | 층 버튼 패널 | 엘리베이터 타기 | 1층 누르기 | DWELL | door=open | 문 열림→거리로 | **유지**(문 열림 추가) |
| 이동 | 등교 | 집 앞 | 길 | 걷기 | 팔 젓기 | ALT_STROKE | position 전진 | 장소 연결 | **유지** |
| 이동 | 안전 등교 | 건널목 | 신호등 | 횡단보도 건너기 | 기다림/건넘 | (기존 crossing) | position=건너편 | 모범 — 그대로 | **유지** |
| 교실 | 수업 준비 | 착석 | 책상+가방 | 책 꺼내기 | 가방에서 책상으로 | GRASP(+BIMANUAL) | desk=ready | 출구: 수업 종 | **유지**(문구 수정) |

발명된 행동(ⓐ 위반)으로 **삭제·불채택**: 잠옷→옷장(방향 오개념), 칫솔→세면대(무의미 운반),
모자 정리(상황 근거 없음), 길찾기 앱(등교 맥락), 버스(탑승·하차 미완 — 보류).

### Scene 구성 (아침 편 = 6 Scene)
```
S1 침실   [커튼◦, 이불◦, 옷 갈아입기●→잠옷 정리●]   ┐ S1↔S2 순서 교환 가능
S2 세면실 [양치●, 세수◦]                              ┘
S3 주방   [아침 먹기(간소)●, 그릇 정리●]               (S1·S2와 교환 가능)
S4 현관   [내 신발 찾아 신기●]     ← 전제: outfit=dayclothes  ★장면 간 상태 검사
S5 이동   [엘리베이터● → 걷기● → 횡단보도●]            (고정 순서 — 구조적)
S6 교실   [책 꺼내기●] → 수업 종(출구)
```
● 필수 ◦ 선택. MVP 구현 시 S1~S3은 기존 스테이지 선택 메뉴로 "다음에 할 일 고르기"를
표현할 수 있다(집 허브) — 새 UI 없이 부분 순서를 근사.

---

## F. 기존 프로토타입 Migration Map (현 데모 15 스테이지)

| # | 현 스테이지 | 판정 | 이동처 / 조치 |
|---|---|---|---|
| 1 | 일어나서 옷 갈아입기 | **수정+통합** | S1 — 방향 수정(옷장→몸), 모자 삭제, 잠옷→바구니 파생 |
| 2 | 세수와 양치 | **수정** | S2 — OSC 양치로 재구성, 운반 과제 폐기 |
| 3 | 아침 식사 | **수정** | S3 — 쟁반 폐기, 먹기(간소)+개수대 정리 |
| 4 | 신발 꺼내 신기 | **수정** | S4 — "신기"까지(feet=shoes), outfit 전제조건 |
| 5 | 엘리베이터 타기 | **유지+수정** | S5 — 버튼 패널 배치, 문 열림 효과 |
| 6 | 걷기(골목) | **유지** | S5 |
| 7 | 버스 타기 | **보류(삭제)** | 하차 벨·하차 완성 시 "버스 등교" 변형 노선으로 부활 |
| 8 | 걷기(큰길) | **통합** | S5 (걷기 1개로) |
| 9 | 횡단보도 | **유지** | S5 — 무변경 (문법의 모범) |
| 10 | 마트 예산 장보기 | **이동+수정** | 2편(심부름) — 목록 기반, 방해=과자, 진열대 |
| 11 | 문구점 | **이동 or 통합** | 2편 — 결제 추가, 또는 마트에 흡수 |
| 12 | 카페 키오스크 | **이동** | 2편 — 하교 간식(선택 Scene) |
| 13 | 길찾기 앱 | **삭제** | '처음 가는 곳' 시나리오 생기면 부활 |
| 14 | 걷기(학교 복도) | **유지** | S6 진입부 |
| 15 | 교실 도착 | **유지+수정** | S6 — 안내문 생활어화 |

## G. MVP Scope — "일상 수행감" 검증 최소 세트

**MVP = S1 침실 한 장면.** 이유:
1. 이 문법의 전 요소가 한 장면에 있다: 환경 상태(어둠→밝음), affordance(커튼 틈 빛·열린 옷장),
   **파생 오브젝트**(입기→잠옷 발생), 사용자 상태(outfit), 부분 순서(커튼·이불 자유),
   선택 행동, 출구 조건.
2. **신규 Recognition이 0개** — 커튼(끌기)·이불(양손)·옷(몸 존)·잠옷(바구니) 전부 기존
   판정 재사용. 문법 검증에 기술 리스크가 없다.
3. 실패해도 손실 최소: 한 장면 데이터+환경 렌더링만.

**MVP+1** (문법이 통하면): S4 현관 추가 — **장면 간 상태 검사**(잠옷 차림이면 "아직 잠옷
이잖아!" 되돌림)를 검증. 그다음 S2(신규 판정 OSC 1개 도입) → S5·S6(기존 재사용) 순.

### 검증 지표 (관찰 — 치료사 동석)
| 질문 | 통과 신호 |
|---|---|
| 아동이 지시문 없이(assist 0) 환경 단서만으로 첫 행동을 개시하는가? | 개시율 관찰 |
| 행동 후 변화(밝아짐·착용·잠옷 등장)를 아동이 알아차리는가? | 시선·발화("어! 밝아졌다") |
| "왜 바구니에 넣었어?"에 생활 이유로 답하는가? | "빨래니까" ≠ "게임이 시키니까" |
| 장면이 끝났을 때 다음에 뭘 할지 아동이 먼저 말하는가? | "이제 세수!" |

이 4개가 "게임 속 과제"와 "자신의 일상 수행"을 가르는 관찰 가능한 경계다.

---
## 부록 — 전체 파이프라인 (Game Layer의 위치)
```
Daily Living Scene (B절 데이터)
   ↓ purpose·affordance 제시
Occupation (사용자가 인식하는 활동)
   ↓ 활동이 상호작용 선택
Interaction (물체와의 행동)
   ↓ 상호작용이 판정 선택
MediaPipe Recognition (GRASP/DWELL/OSC/...)
   ↓ 판정 성공
State Change (환경·사용자 상태 전이 = 게임의 진실)
   ↓ 상태를 렌더링 + 축하
Game Feedback (별·파티클·핫바·사운드 — 기존 유지, 설명 책임 없음)
```
