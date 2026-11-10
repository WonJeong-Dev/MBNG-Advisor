# data/ — MBNG Advisor 데이터 원본

이 폴더가 원본입니다. `node tools/build.mjs`가 여기서 공개 API(`api/v1/`)와 앱(`MBNG Advisor.html`의 `@data:ID` 주석 구간)을 함께 만듭니다. 앱의 해당 구간이나 `api/v1/`을 직접 고치지 않습니다.

## 출처 규칙

- `sources.json`의 출처 종류는 두 가지뿐입니다.
  - `official`: 넥슨 공식 공개 글(mabinogimobile.nexon.com 업데이트 노트·공지·개발자 노트·가이드, now.nexon.com)
  - `ingame`: 게임 화면 직접 확인(확인일 `checked` 필수)
- 위키·팬사이트·커뮤니티·다른 사람의 API 값은 출처로 쓰지 않습니다. 어디를 확인할지 찾는 단서로만 씁니다.
- 레코드마다 `src`(출처 id 목록)가 있어야 하고, 쓰지 않는 출처가 남아 있으면 빌드가 실패합니다.

## 파일

| 파일 | 내용 |
|---|---|
| `datasets/<id>.json` | 데이터 하나. `verified_at`(마지막 대조일), `watch.keywords`(공식 글 감시 키워드), `tables`(레코드), `params`, `notes` |
| `schemas.json` | 표별 레코드 형식(JSON Schema). 빌드가 검사하고 `openapi.json`에 싣습니다 |
| `sources.json` | 출처 사전 |
| `changes.json` | 값 변경·재확인 기록 |
| `watch.json` | 공식 글 감시 상태(본 글, 가이드 본문 해시, 감지한 사건)와 실행 정보(`runner`). `tools/watch-official.mjs`가 씁니다. 넥슨 공식 사이트가 해외 접속에는 한국어 목록을 주지 않아 GitHub Actions가 아니라 한국 PC에서 `tools/watch-local.ps1`로 돌립니다 |

## 갱신 절차

1. 감시가 사건을 남기면 해당 데이터의 상태가 `check_needed`가 됩니다(GitHub 이슈 알림).
2. 공식 글을 읽거나 게임에서 확인합니다.
3. 값이 바뀌었으면 `datasets/<id>.json`의 레코드와 `src`를 고치고, 필요하면 `sources.json`에 출처를 더합니다.
4. 출처와 다시 대조했으면 `verified_at`을 그날로 바꿉니다. 대조 없이 무관한 글로 판단만 했으면 사건 key를 `reviewed`에 넣습니다.
5. `changes.json`에 무엇을 근거로 무엇이 바뀌었는지(또는 변경 없음) 기록합니다.
6. `node tools/build.mjs`로 앱과 API를 다시 만들고, `node tools/build.mjs --check`로 확인한 뒤 커밋합니다.

## 새 데이터 추가

`datasets/`에 파일을 만들고 `schemas.json`에 표 형식을 넣습니다. 앱에서도 쓰면 `tools/build.mjs`의 `APPGEN`에 앱 상수 생성 함수를 넣고, HTML에 `/*@data:ID*/…/*@end:ID*/` 구간을 둡니다.
