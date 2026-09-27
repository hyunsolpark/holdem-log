# 홀덤 로그 PWA

토너먼트 **대회 일정·결과**, **뱅크롤**, **새틀라이트 티켓**, **핸드 메모**를 기록하는 개인용 홀덤 앱. 안드로이드 크롬에 설치해 쓰며, 서버 없이 모든 데이터는 기기 안(IndexedDB)에만 저장됩니다. 상세 요구사항은 `SPEC.md` 참고.

주소: https://hyunsolpark.github.io/holdem-log/

## GitHub Pages 설정 (최초 1회)
저장소 **Settings → Pages → Build and deployment**에서 Source `Deploy from a branch`, Branch `main` / `/ (root)` 저장 → 1~2분 뒤 위 주소로 열림.

## 휴대폰에 설치
안드로이드 크롬으로 주소를 열고 메뉴(⋮) → **앱 설치** 또는 **홈 화면에 추가**. 한 번 열고 나면 오프라인에서도 동작합니다.

## 사용 흐름
1. 홈 ⚙ → **시작 뱅크롤** 설정
2. ＋ → 대회 등록: 날짜가 미래면 **예정**, 지났으면 바로 **결과**까지 입력
3. 새틀라이트 결과에 **획득 티켓**(액면가·유효기간) 추가 → 티켓 보유액으로 뱅크롤에 반영
4. 본 대회 등록 시 참가 방식 **티켓 사용** → 바이인이 액면가로 채워지고 티켓이 사용 처리
5. 날짜가 지난 예정 대회는 홈 **결과 입력 대기**에 표시
6. 핸드 탭 ＋ → 카드 선택기로 핸드·보드 입력, 태그, **복기 필요/완료**
7. 통계 탭: ROI, 입상률, 누적 손익, 플랫폼별·종류별, **새틀라이트 성공률·티켓 1장당 비용**

## 돈 계산
- 대회 손익 = 상금 + 획득 티켓 액면가 − 비용(첫 참가: 현금 바이인 또는 티켓 액면가, 리엔트리: 현금)
- 현금 뱅크롤 = 시작 금액 + 대회 현금 손익 + 입금 − 출금 + 티켓 판매 금액
- 총 뱅크롤 = 현금 + 보유 티켓 액면가(예정 대회에 쓰기로 한 티켓 포함)

## 수정 후 다시 배포할 때
1. `sw.js`의 `CACHE_VERSION`과 `js/version.js`의 `APP_VERSION`을 함께 올리기
2. JS 파일을 새로 추가했다면 `sw.js`의 `SHELL` 목록에도 추가
3. push → 앱을 다시 열면 "새 버전이 있어요 · 새로고침" 알림

## 백업
홈 ⚙ → JSON 백업/가져오기(덮어쓰기·병합), 대회 기록 CSV(엑셀용). 크롬 사이트 데이터를 지우면 데이터도 지워지니 주기적으로 백업하세요. 같은 `hyunsolpark.github.io` 아래의 다른 앱(투자 일지)과 같은 사이트로 취급되므로, 사이트 데이터를 지우면 두 앱이 함께 지워집니다.

## 파일 구조
```
index.html, manifest.webmanifest, sw.js, css/style.css
js/app.js        탭, 서비스 워커
js/db.js         IndexedDB, 가져오기
js/store.js      메모리 캐시 + 저장 동작 (대회·티켓 연결)
js/money.js      대회 손익, 뱅크롤, 통계
js/cards.js      카드 표기·선택기
js/calendar.js   Google 캘린더 링크, .ics
js/export.js     JSON 백업·검증, CSV
js/charts.js     누적 손익 그래프
js/ui.js, utils.js, markdown.js
js/views/        home, sessions, session-form, session-detail, sheets(티켓·캘린더), hands, hand-form, stats, settings(입출금)
```
