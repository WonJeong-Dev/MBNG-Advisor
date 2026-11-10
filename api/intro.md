마비노기 모바일 데이터를 **넥슨 공식 공개 글**과 **게임 화면 직접 확인**만으로 정리해 JSON으로 제공합니다. 위키·팬사이트·커뮤니티·다른 API의 값은 싣지 않습니다.

키 없이 누구나 읽을 수 있고, 모든 출처에서 브라우저로 바로 불러올 수 있습니다(CORS 허용).

## 원칙

- **출처 두 종류만:** `official`(넥슨 공식 업데이트 노트·공지·개발자 노트·가이드·NEXON NOW)과 `ingame`(게임 화면 직접 확인).
- **값마다 출처:** 모든 레코드에 `src`(출처 id 목록)가 붙고, 출처의 제목·주소·게시일·기준일·확인일은 `sources`에 있습니다.
- **확인일과 상태:** 데이터마다 마지막으로 출처와 대조한 날(`verified_at`)과 상태(`status.state`)가 있습니다.

## 최신 유지 방식

1. 1시간마다 공식 업데이트·공지·개발자 노트 목록과, 데이터가 근거로 삼는 공식 가이드 본문을 확인합니다.
2. 새 글이나 고친 글(제목의 '(수정)')에 데이터별 감시 키워드가 있거나 근거 가이드 본문이 바뀌면, 해당 데이터의 `status.state`가 `check_needed`로 바뀌고 `pending`에 그 글이 나옵니다.
3. 공식 글을 다시 읽거나 게임에서 다시 확인해 값을 고치면 `changes.json`에 기록하고 `verified_at`을 갱신합니다. 그러면 상태가 `ok`로 돌아옵니다.

NEXON NOW는 로봇 접근을 막아 두어 자동 감시하지 않고 사람이 확인합니다(해당 출처에 `monitoring: "manual"`).

## 사용 예

```js
const r = await fetch('https://wonjeong-dev.github.io/MBNG-Advisor/api/v1/weekly.json');
const { status, data } = await r.json();
if (status.state === 'check_needed') console.warn('공식 변경 재확인 중', status.pending);
console.log(data.items.map(i => `${i.name} 주 ${i.counts.map(c => c.max).join('/')}회`));
```

```python
import requests
d = requests.get('https://wonjeong-dev.github.io/MBNG-Advisor/api/v1/link-bonus.json', timeout=10).json()
v = next(x for x in d['data']['values'] if x['star'] == 10 and x['level'] == 20)
print(v['value'], v['heal_value'])
```

## 이용 조건

- 데이터 정리·구조는 **CC BY 4.0**입니다. 출처를 `MBNG Advisor (https://wonjeong-dev.github.io/MBNG-Advisor/)`로 표기하면 상업 이용을 포함해 자유롭게 쓸 수 있습니다.
- 넥슨과 무관한 팬 프로젝트입니다. 게임 명칭과 콘텐츠의 권리는 넥슨코리아에 있습니다. 게임 이미지는 제공하지 않습니다.
- `v1` 안에서는 필드를 추가만 합니다. 필드 이름을 바꾸거나 지울 일이 생기면 `v2`로 새 주소를 엽니다.
- GitHub Pages가 약 10분 동안 캐시합니다. 상태 확인은 `status.json` 하나로 충분합니다.
