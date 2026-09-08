# OPIc 모의고사

> **실전과 같은 훈련으로 영포자의 승리자가 된다**

음성으로 문제를 듣고, 마이크로 답변한 뒤, 바로 피드백을 받는 브라우저 기반 OPIc 연습 도구입니다. 별도 서버 없이 정적 HTML 하나로 실행할 수 있으며, 연습 목적에 맞춰 오프라인 평가와 API 평가를 선택할 수 있습니다.

## 주요 기능

- OPIc 유형의 영어 질문 200개와 역할극 문항
- 질문은 음성으로만 제공되며, 한 문항당 최초 재생과 다시 듣기를 포함해 최대 2회 재생
- 음성 답변 원문은 수정할 수 없도록 고정
- 문항 듣기를 누른 시점부터 문항별 2분 타이머 시작
- 마이크 스트림을 세션 중 재사용해 반복 권한 요청 최소화
- 다음 문항으로 이동하는 동안 전사와 평가를 백그라운드 처리
- 진행 중인 문항만으로 즉시 제출하는 모의고사 모드
- 한 문항 피드백 후 새 문제를 계속 푸는 연습모드
- Intermediate Low부터 Advanced Low까지의 OPIc 예상 등급 표시

## 실행

1. 저장소의 `index.html`을 내려받습니다.
2. 마이크 권한을 안정적으로 사용하려면 Chrome 또는 Edge에서 `localhost`/HTTPS로 엽니다.
3. **평가 방식**을 선택합니다.
   - **오프라인 기본 평가**: 인터넷 없이 규칙 기반 평가
   - **오프라인 Whisper**: `whisper.cpp`의 양자화 `base.en Q5_1` 모델(약 57MB)을 브라우저 저장소에 내려받아 로컬 전사
   - **OpenAI API / Gemini API**: 전사와 평가 품질을 높일 수 있지만 개인 API 키가 필요

오프라인 Whisper 모델은 브라우저의 IndexedDB에 저장됩니다. 비공개 모드에서는 브라우저를 닫을 때 저장 데이터가 사라져 다시 다운로드해야 할 수 있습니다.

## Gemini API 키 발급

[Google AI Studio API 키 발급 페이지](https://aistudio.google.com/app/apikey)를 열고 다음 순서로 진행합니다.

1. Google 계정으로 로그인합니다.
2. **API key 만들기**를 선택합니다.
3. 키를 복사해 앱의 Gemini API 입력란에 붙여넣습니다.
4. **연결**을 눌러 사용 가능한 최신 Flash 모델을 확인합니다.

 API 키는 이 정적 페이지에서 Google API로 직접 전송됩니다. 키를 공개 저장소나 다른 사람에게 공유하지 말고, Google AI Studio에서 사용량·제한을 확인하세요.

## GitHub Pages

`main` 브랜치에 push하면 `.github/workflows/pages.yml`이 정적 파일을 GitHub Pages에 배포합니다. 저장소 설정에서 **Settings → Pages → Source: GitHub Actions**를 한 번 선택하면 됩니다. Pages 주소는 저장소의 **Actions** 실행 결과와 **Settings → Pages**에서 확인할 수 있습니다.

## 구조

```text
index.html                         정적 앱 진입점·UI·질문 데이터
OPIc_영어_연습질문_200개.md          질문 원본 및 편집용 목록
docs/ARCHITECTURE.md                실행·평가·저장 흐름
docs/ANALYTICS.md                   다운로드·익명 통계의 범위와 한계
```

앱은 다음 순서로 동작합니다.

```text
문항 음성 재생
  -> 마이크 녹음
  -> 브라우저 MediaRecorder로 원본 확보
  -> 오프라인 Whisper 또는 선택한 API로 전사
  -> 규칙 평가 + (선택) 로컬 LLM / 온라인 AI 평가
  -> 문항 피드백 저장
```

API를 선택해도 별도 중계 서버를 거치지 않습니다. 따라서 사용자의 API 키와 음성 데이터는 선택한 제공자의 브라우저 API 요청으로 직접 전달됩니다.

## 다운로드와 사용 통계

GitHub는 저장소 관리자의 **Insights → Traffic**에서 최근 저장소 조회와 Git clone을 익명 집계해 보여줍니다. Release asset으로 배포하면 asset별 다운로드 수도 확인할 수 있습니다. 다만 정적 HTML만으로는 실제로 앱을 실행한 사람 수를 정확히 세거나 개인을 식별할 수 없습니다.

이 프로젝트는 기본적으로 제3자 추적 스크립트를 넣지 않습니다. 자세한 범위와 향후 선택 가능한 익명 분석 방안은 [`docs/ANALYTICS.md`](docs/ANALYTICS.md)에 정리했습니다.

## 라이선스

MIT License. 질문 콘텐츠와 외부 모델의 이용 조건은 각 원저작자와 제공자의 정책을 따릅니다.

