# v1.4.2 로컬 채점 검토

## 재현

실제 Edge/WebGPU에서 Llama-3.2-1B-Instruct-q4f16_1-MLC를 로드해 합성 영어 답변을 채점했다. 기존 코드는 ready=true였지만 필수 tip 없이 점수만 반환했다. normalizeEvalResult가 응답을 거부하여 규칙 평가로 전환됐다. 모델 미로드와 추론 출력 실패가 구분되지 않아 사용자가 로딩 실패로 느낄 수 있었다.

## 수정

- GPU 어댑터와 shader-f16 지원 확인, 모델 로딩 후 실제 구조화 추론 확인을 통과한 경우만 ready=true.
- 준비 중 로컬 시험 시작 방지. Whisper 성공·LLM 실패를 별도 상태로 표시.
- WebLLM JSON Schema 출력 강제, 512 토큰 상한, finish_reason=stop 및 필수 점수·개선점 검사. 작은 영어 모델에 맞게 짧은 영어 지침과 개선 팁 사용.
- 내용·문법·텍스트 흐름 점수는 로컬 모델이 제공하고, 규칙은 테스트 문구·주제 이탈 등 보호 검사에 사용. 규칙 70% 혼합 제거.
- 실패 시 ready=false 및 실제 실패 출처 표시. 최종 사용 모델 집계는 전역 ready 플래그가 아닌 문항 결과를 기준으로 계산.
- 소형 모델 평가의 provisional 상태와 공식 등급 보류 유지. JSON 형식 보장이 채점 정확도 보장은 아니다.

## 검증

기존 실제 모델 테스트: tip 누락으로 파싱 실패를 재현했다.

수정 실제 모델 테스트: 준비 추론 확인 후 집 묘사 답변에 content=8, fluency=7, grammar=6, pronunciation=5와 비어 있지 않은 영어 개선점을 반환했다. 이 사례는 모델 실행·출력 형식 검증이며 점수의 정답성이나 광범위한 OPIc 채점 신뢰성을 검증한 것이 아니다. Whisper는 이 테스트에서 제외했으며 별도 전사 경로는 기존 회귀 테스트로 확인한다.

자동 회귀 테스트는 준비 확인 실패·재시도, Whisper 부분 성공, 구조화 출력, 규칙 가중치 제거, 마이크 테스트 답변 제한, 잘린 응답 거부와 로컬 실패 표시, 혼합 결과의 실제 모델 집계를 확인한다.

참고: [WebLLM API](https://webllm.mlc.ai/docs/user/api_reference.html), [WebLLM structured generation](https://blog.mlc.ai/2024/06/13/webllm-a-high-performance-in-browser-llm-inference-engine).
