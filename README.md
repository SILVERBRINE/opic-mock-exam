# OPIc 모의고사

> **실전과 같은 훈련으로 영포자의 승리자가 된다**

누적 다운로드: [![누적 다운로드](https://img.shields.io/github/downloads/SILVERBRINE/opic-mock-exam/total?label=downloads&cacheSeconds=300)](https://github.com/SILVERBRINE/opic-mock-exam/releases)

처음에는 Release를 한 번 발행해야 숫자가 표시돼요. 그 뒤 ZIP을 내려받을 때마다 GitHub가 누적해서 올려 줍니다.

문제는 귀로 듣고, 답변은 마이크로 녹음해요. 한 문제 끝나면 바로 피드백을 보고 다음 문제로 넘어가는 OPIc 연습 도구입니다. 서버 없이 정적 HTML 하나로 실행되고, 오프라인 평가와 API 평가 중 편한 방식을 고르면 됩니다.

## 주요 기능

- OPIc 유형의 영어 질문 200개 문제은행과 역할극 문항
- 질문은 음성으로만 제공되며, 한 문항당 최초 재생과 다시 듣기를 포함해 최대 2회 재생
- 음성 답변 원문은 수정할 수 없게 고정
- 문항 듣기를 누른 시점부터 문항별 2분 타이머 시작
- 마이크 스트림을 세션 중 재사용해 반복 권한 요청 최소화
- 다음 문항으로 이동하는 동안 전사와 평가를 백그라운드 처리
- 진행 중인 문항만으로 즉시 제출하는 모의고사 모드
- 한 문항 피드백 후 새 문제를 계속 푸는 연습모드
- Intermediate Low부터 Advanced Low까지의 OPIc 예상 등급 표시

## 실행

1. 저장소의 `index.html`을 내려받아요.
2. 마이크 권한을 안정적으로 쓰려면 Chrome 또는 Edge에서 `localhost`/HTTPS로 열어 주세요.
3. **평가 방식**을 골라요.
   - **오프라인 기본 평가**: 인터넷 없이 규칙 기반 평가
   - **오프라인 Whisper**: `whisper.cpp`의 양자화 `base.en Q5_1` 모델(약 57MB)을 브라우저 저장소에 내려받아 로컬 전사
   - **OpenAI API / Gemini API**: 전사와 평가 품질을 높일 수 있지만 개인 API 키가 필요

오프라인 Whisper 모델은 브라우저의 IndexedDB에 저장돼요. 비공개 모드에서는 브라우저를 닫을 때 저장 데이터가 사라져서 다음에 다시 받을 수 있습니다.

## Gemini API 키 발급

[Google AI Studio API 키 발급 페이지](https://aistudio.google.com/app/apikey)를 열고 다음 순서로 진행합니다.

1. Google 계정으로 로그인해요.
2. **API key 만들기**를 누릅니다.
3. 키를 복사해 앱의 Gemini API 입력란에 붙여 넣어요.
4. **연결**을 누르면 사용 가능한 최신 Flash 모델을 확인할 수 있습니다.

API 키는 이 정적 페이지에서 Google API로 직접 전송됩니다. 키를 공개 저장소나 다른 사람에게 공유하지 말고, Google AI Studio에서 사용량·제한을 확인하세요.

## GitHub Pages

`main` 브랜치에 push하면 `.github/workflows/pages.yml`이 정적 파일을 GitHub Pages에 배포합니다. 저장소 설정에서 **Settings → Pages → Source: GitHub Actions**를 한 번 선택하면 됩니다. Pages 주소는 저장소의 **Actions** 실행 결과와 **Settings → Pages**에서 확인할 수 있습니다.

## 구조

```text
index.html                         정적 앱 진입점·UI·질문 데이터
docs/ARCHITECTURE.md                실행·평가·저장 흐름
```

질문 문제은행 200개는 별도 문서가 아니라 `index.html` 안에 들어 있어요. 앱의 **연습 질문 수정**에서 바꾼 내용은 지금 쓰는 브라우저에만 저장됩니다.

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

## 라이선스

MIT License. 질문 콘텐츠와 외부 모델의 이용 조건은 각 원저작자와 제공자의 정책을 따릅니다.

