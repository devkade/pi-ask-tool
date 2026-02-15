# pi Ask Tool Extension

`oh-my-pi`의 **+ Ask Tool (Interactive Questioning)** 패턴을 `pi` extension으로 옮긴 구현입니다.

## 포함 기능

- `ask` 커스텀 툴 등록
- 단일 질문 / 다중 질문(`questions[]`) 지원
- 멀티 선택(`multi: true`) 지원
- 추천 옵션(`recommended`) 표시
- `Other (type your own)` 자동 입력 분기
- 단일 선택 질문에서 `Tab`으로 **동일 화면 내 추가 의견 입력** 지원
  - 예: `세션 기반 인증` 선택 + `Tab` 입력 + 의견 작성 + `Enter`
  - 결과: `세션 기반 인증 - 분할세션`
- 멀티 선택 질문(`multi: true`)도 별도 팝업 없이 **같은 화면에서 선택 + note 입력 통합**
  - 체크 스타일(`[ ]` / `[x]`) 선택 이펙트 제공
  - `Other` 선택 시에도 같은 화면에서 `Tab`으로 note 입력
- 다중 질문(`questions` 2개 이상, 단일/멀티 혼합 포함)에서 **상단 탭 + Submit 확인 화면** 지원
- 단일 질문이라도 `multi: true`인 경우 **질문 탭 + Submit 탭** 흐름으로 진행
- 단일/탭 UI 선택지는 **원형 bullet(○/●)** 스타일 지원
- 내비게이션/도움말 문구는 영문(`move`, `submit`, `add note`, `cancel`)으로 표시
- 인터랙티브 UI가 없는 모드에서는 에러 반환

## 파일 구조

- `ask-extension.ts` - extension 엔트리
- `src/index.ts` - pi extension 등록/실행 로직
- `src/ask-logic.ts` - 질문 선택/결과 조합 로직
- `src/ask-inline-ui.ts` - 단일 비멀티 질문용 인라인 입력 UI (`Tab` 의견 작성)
- `src/ask-tabs-ui.ts` - 질문 탭 UI + Submit 검토 화면 (단일 멀티/다중 질문 공용)
- `test/ask-logic.test.ts` - 핵심 로직 테스트

## 실행 방법

### 빠른 테스트

```bash
pi -e ./ask-extension.ts
```

### /reload 지원(권장)

프로젝트에 배치:

```bash
mkdir -p .pi/extensions/ask-tool
cp -R ask-extension.ts src .pi/extensions/ask-tool/
```

그 다음 pi에서 `/reload`.

## 툴 파라미터 스키마

```ts
{
  questions: [
    {
      id: string,
      question: string,
      options: [{ label: string }],
      multi?: boolean,
      recommended?: number // 0-indexed
    }
  ]
}
```

> `options`에 `Other`는 넣지 마세요. UI가 자동 추가합니다.

## 테스트

```bash
npm test
```
