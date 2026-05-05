# oh-my-goal — Plan

> Codex CLI `/goal`의 핵심 UX를 Opencode 플러그인으로 이식한다.
> 한 줄로 목표를 설정하면 에이전트가 달성될 때까지 스스로 루프를 돌며 완수한다.

---

## 왜 만드나

Opencode 생태계에는 Oh-My-OpenCode, autoresearch 같은 강력한 자율 루프 플러그인이 이미 존재한다.
그러나 이들은 공통적으로 **복잡하다** — 멀티에이전트 설정, scope/metric/verify 정의, 모델 매핑 등이 필요하다.

Codex CLI `/goal`의 진짜 강점은 다른 데 있다.

```
/goal 로그인 버그 고쳐줘
```

끝. 이게 전부다.

oh-my-goal은 이 UX를 Opencode에 가져온다. 설정 없이, 바로 작동한다.

---

## 핵심 컨셉

Codex `/goal`의 내부 구현은 의외로 단순하다.
`goals/continuation.md` 프롬프트를 **매 턴 끝에 자동 주입**해서 루프를 유지한다.

oh-my-goal도 동일한 원리로 동작한다:

```
사용자: /goal <objective>
  → goal.json에 목표 저장 (status: pursuing)
  → 매 세션 idle마다 → 목표 평가 프롬프트 자동 주입
  → 미달성이면 → 다음 턴 자동 시작
  → 달성 or budget 소진이면 → 루프 종료
```

---

## 명세

### 슬래시 커맨드

| 커맨드 | 동작 |
|---|---|
| `/goal <목표>` | 새 목표 설정, 즉시 루프 시작 |
| `/goal status` | 현재 목표·상태·예산 출력 |
| `/goal pause` | 루프 일시정지 |
| `/goal resume` | 일시정지에서 재개 |
| `/goal clear` | 목표 삭제, 루프 종료 |

### 목표 상태 머신

```
[없음] ──/goal set──→ [pursuing]
                           │
              /goal pause──┤──→ [paused]──/goal resume──→ [pursuing]
                           │
                  평가 성공──┤──→ [achieved]
                           │
              budget 소진───┤──→ [budget-limited]
                           │
                /goal clear─┴──→ [없음]
```

### goal.json 스키마

```json
{
  "objective": "로그인 버그 고쳐줘",
  "status": "pursuing",
  "created_at": "2026-05-05T10:00:00Z",
  "token_budget": 100000,
  "tokens_used": 12400,
  "iteration": 3,
  "history": [
    { "iteration": 1, "summary": "에러 로그 분석 완료", "status": "in_progress" },
    { "iteration": 2, "summary": "JWT 만료 처리 버그 발견", "status": "in_progress" }
  ]
}
```

---

## 아키텍처

### 파일 구조

```
oh-my-goal/
├── package.json
├── index.ts                  # 메인 플러그인 진입점
├── src/
│   ├── goal-store.ts         # goal.json 읽기/쓰기
│   ├── prompts/
│   │   ├── continuation.md   # 매 턴 주입되는 자기평가 프롬프트
│   │   ├── budget_limit.md   # 예산 초과 시 주입 프롬프트
│   │   └── achieved.md       # 달성 시 주입 프롬프트
│   └── handlers/
│       ├── command.ts        # /goal 커맨드 파싱 및 라우팅
│       └── loop.ts           # 자율 루프 평가 로직
└── README.md
```

### Opencode Plugin API 매핑

| 기능 | 사용 Hook / Event |
|---|---|
| `/goal` 커맨드 감지 | `tui.command.execute` |
| 매 턴 평가 프롬프트 주입 | `session.idle` + `tui.prompt.append` |
| 컨텍스트 압축 시 목표 보존 | `experimental.session.compacting` |
| 토큰 사용량 추적 | `message.updated` |
| 상태 토스트 알림 | `tui.toast.show` |

---

## 핵심 프롬프트 설계

가장 중요한 부분. Codex의 접근법을 Opencode에 맞게 재구성한다.

### `continuation.md` — 매 턴 끝에 자동 주입

```markdown
---
## 🎯 Active Goal Check

**Current Goal:** {{objective}}
**Iteration:** {{iteration}} | **Tokens used:** {{tokens_used}} / {{token_budget}}

Before ending this turn, evaluate:

1. **Is the goal achieved?** Check against the original objective concretely.
   - If YES → respond with `GOAL_ACHIEVED: <brief summary>` and stop.
   - If NO → identify the next concrete action needed.

2. **Are you blocked?** (missing info, permission, unclear requirement)
   - If YES → respond with `GOAL_BLOCKED: <reason>` and stop.

3. **Continue working.** Execute the next action immediately without asking.

Do not ask for confirmation. Do not summarize what you did. Just work.
---
```

### `budget_limit.md` — 예산 90% 도달 시 주입

```markdown
---
## ⚠️ Token Budget Warning

Token budget is nearly exhausted ({{tokens_used}} / {{token_budget}}).

Prioritize:
1. Committing any completed work
2. Documenting current progress and blockers
3. Leaving the codebase in a clean state

Do not start new major changes.
---
```

### `achieved.md` — 달성 감지 시 주입

```markdown
---
## ✅ Goal Achieved

The goal "{{objective}}" has been marked as achieved after {{iteration}} iterations.

Provide a final summary:
- What was accomplished
- Files changed
- How to verify the result
---
```

---

## 구현 계획

### Phase 1 — 스캐폴딩 🟢

- [ ] `package.json` 생성 (의존성: `@opencode-ai/plugin`, `zod`)
- [ ] `index.ts` 기본 플러그인 구조
- [ ] `goal-store.ts` — goal.json CRUD (`.opencode/goal.json` 위치)
- [ ] `tui.command.execute` hook으로 `/goal` 커맨드 파싱

### Phase 2 — 루프 엔진 🟡

- [ ] `session.idle` 이벤트에서 pursuing 상태 감지
- [ ] `continuation.md` 프롬프트를 `tui.prompt.append`로 주입
- [ ] 응답에서 `GOAL_ACHIEVED:` / `GOAL_BLOCKED:` 감지 (`message.updated`)
- [ ] 상태 전환 로직 구현

### Phase 3 — 예산 & 컴팩션 🟡

- [ ] `message.updated`에서 토큰 사용량 누적 추적
- [ ] 90% 도달 시 `budget_limit.md` 주입
- [ ] `experimental.session.compacting` hook으로 목표 상태 컨텍스트 보존

### Phase 4 — UX 🟢

- [ ] `/goal status` — 현재 상태 `tui.toast.show`로 표시
- [ ] `/goal pause` / `resume` / `clear` 구현
- [ ] 상태 변경마다 토스트 알림
- [ ] 목표 달성/실패 시 완료 알림 (OS 알림 선택적)

### Phase 5 — 패키징 🟢

- [ ] npm 배포 (`oh-my-goal`)
- [ ] README 작성
- [ ] awesome-opencode PR 제출

---

## 기술 결정

### goal.json 위치: `.opencode/goal.json`

프로젝트 레벨에 저장한다. 이유:
- 목표는 프로젝트별로 다름
- `.gitignore`에 추가 가능
- 팀 공유 시 동기화 가능 (선택적)

### 루프 트리거: `session.idle` 이벤트

에이전트가 응답을 완료했을 때 발생한다. 이 시점에:
1. 응답에서 `GOAL_ACHIEVED`/`GOAL_BLOCKED` 키워드 스캔
2. 없으면 → `tui.prompt.append`로 continuation 프롬프트 주입해 다음 턴 시작

### 토큰 추적: `message.updated`

실제 사용량은 Opencode SDK의 메시지 메타데이터에서 읽는다.
없을 경우 대략적인 문자 수 기반 추정치를 폴백으로 사용.

### Oh-My-OpenCode 호환성

Oh-My-OpenCode와 함께 사용할 경우 충돌하지 않는다.
oh-my-goal은 단순히 프롬프트를 주입하는 레이어이며, 에이전트/모델 선택에 개입하지 않는다.

---

## 차별화 요소

| | oh-my-goal | Oh-My-OpenCode | autoresearch |
|---|---|---|---|
| 설치 복잡도 | npm 1줄 | 높음 | 중간 |
| 사용법 | `/goal 목표` | 멀티에이전트 설정 필요 | scope/metric 정의 필요 |
| 타겟 | 일반 코딩 작업 | 대규모 오케스트레이션 | 반복 최적화 루프 |
| 기존 툴 호환 | 완전 호환 | 호환 | 호환 |
| Codex /goal 유사도 | ⭐⭐⭐⭐⭐ | ⭐⭐ | ⭐⭐⭐ |

---

## 위험 요소 & 대응

| 위험 | 대응 |
|---|---|
| `GOAL_ACHIEVED` 오감지 | 키워드를 특이한 형식으로 설계 + threshold 확인 |
| 무한 루프 | 기본 token_budget 50k 설정, iteration 최대값 제한 |
| 비용 폭주 | 루프 시작 시 예산 명시적 표시, 토스트 경고 |
| compaction 시 목표 소실 | `experimental.session.compacting` hook으로 강제 보존 |

---

## 마일스톤

```
Week 1: Phase 1 + 2  →  기본 루프 동작 확인
Week 2: Phase 3 + 4  →  예산 관리 + UX 완성
Week 3: Phase 5      →  npm 배포 + 문서화
```

---

## 빠른 시작 (완성 후 예상 UX)

```bash
# 설치
npm i -g oh-my-goal

# opencode.json에 추가
{
  "plugin": ["oh-my-goal"]
}

# 사용
/goal 결제 모듈 테스트 커버리지 80% 달성해줘
```

에이전트가 알아서 루프를 돌고, 달성되면 알려준다. 그게 전부다.
