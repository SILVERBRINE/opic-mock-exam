# Download counts

## 집계 대상

이 프로젝트에서 공개적으로 집계하는 값은 GitHub Release asset의 다운로드 수뿐입니다. 앱을 실행했는지, 몇 번 방문했는지, 어떤 답변을 했는지는 수집하지 않습니다.

## 누적 다운로드 방식

`.github/workflows/release.yml`은 `v*` 태그가 만들어지거나 수동 실행될 때 다음 파일을 ZIP으로 묶어 Release asset으로 게시합니다.

- `index.html`
- `README.md`
- `LICENSE`

첫 배포는 저장소의 **Actions → Publish downloadable release → Run workflow**에서 `v1.0.0`을 입력해 실행합니다. 이후 `v*` 태그를 push할 때마다 새 버전이 게시됩니다.

GitHub Release의 asset별 `download_count`가 누적 다운로드 수입니다. 저장소 웹페이지 조회 수, Git clone 수, GitHub Actions artifact 다운로드 수는 이 값에 포함되지 않습니다.

## 개인정보와 보안 범위

앱에는 분석 스크립트나 사용자 식별용 전송 코드를 넣지 않습니다. 공개 페이지에서 GitHub API 토큰을 사용하지 않으며, 다운로드 수는 GitHub가 Release asset에 제공하는 집계값으로만 확인합니다.

