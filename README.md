# 택시 이용 자가검증

기존 유류비 페이지와 별도로 `/taxi/`에 주소 기반 자동 비교 화면을 추가합니다. 원본 `index.html`은 변경 대상에서 제외합니다.

## 동작

1. 신청자, 소속, 업무 목적, 미팅 일시, 출발지와 도착지를 입력합니다.
2. 다음 주소 검색 또는 직접 입력한 주소를 서버에서 카카오 주소/장소 검색으로 확인합니다. 동일 이름이 여러 곳이면 실제 주소를 선택해야 합니다.
3. 다음지도·카카오의 대중교통 및 자동차 경로를 자동 조회합니다. 직원이 소요 시간을 입력하지 않습니다.
4. 대중교통 편도 60분 이상이며 택시로 30분 이상 단축되는지 초 단위 원본 값으로 비교합니다.
5. 미팅 시각에서 두 수단에 공통인 도착 여유시간과 각 소요 시간을 빼서 출발 계획을 표시합니다.
6. 신청 요약은 입력 일정·기준 충족 여부·조회 시각을 포함합니다. 지도 API의 원본 경로·좌표·시간 값은 서버나 파일로 저장하지 않습니다.

현재 조회 시점의 두 수단 예상값을 비교합니다. 미래 미팅 날짜의 시간표와 교통 예측을 반영한 경로는 아닙니다. 화면에서도 이 제한을 표시하며 출발 전 재확인을 안내합니다. 기준 충족은 최종 승인을 대체하지 않습니다. 기존 사전 승인과 카카오T 비즈니스 절차 및 다른 예외 사유를 유지합니다.

## 구성

- `taxi/`: GitHub Pages 정적 화면. 비밀 키 없음.
- `api/compare.mjs`, `server/automatic-routing.mjs`: 서버에서 주소와 경로 조회. 호출 정보/결과를 영구 저장하지 않음.
- `dev/server.mjs`: 로컬 자동 조회 미리보기.

## 실행

Node.js 20 이상. 서버 환경에 `KAKAO_REST_API_KEY`를 설정한 뒤 `node dev/server.mjs`로 실행합니다. 기본 주소는 `http://127.0.0.1:8768/taxi/`입니다. 키를 파일·소스·로그에 넣지 않습니다.

`node --test tests/*.test.js`로 검증합니다.

## 공개 서버 연결

정적 GitHub Pages는 REST 비밀 키를 보관할 수 없으므로 별도 서버 연결이 필요합니다. 현재 새 서버 프로젝트 생성은 승인 대기이며 공개 배포되지 않았습니다.

- 서버 환경: `KAKAO_REST_API_KEY`, `ALLOWED_ORIGINS` (기본 `https://jslee1019.github.io`).
- 배포 후 `taxi/config.js`의 `routingEndpoint`를 서버의 `/api/compare` URL로 지정합니다.
- 현재 요청 크기 제한, 시간 제한, 허용 출처, 프로세스별 호출 제한을 적용합니다. CORS나 메모리 기반 제한은 사용자 인증·분산 쿼터를 대체하지 않습니다. 공개 범위를 넓히기 전에 서버측 인증/공유 호출 제한을 추가해야 합니다.
- 기존 서비스 요금제, 예산, 지도 API 할당량은 변경하지 않습니다.

## 공식 API

- https://developers.kakao.com/docs/ko/kakaomap/rest-api
- https://developers.kakaomobility.com/docs/navi-api/directions/
- https://developers.kakaomobility.com/affiliate/publictransit/multimodal.html
