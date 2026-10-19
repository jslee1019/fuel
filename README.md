# 택시 이용 자가검증

기존 유류비 페이지와 별도로 `/taxi/`에 주소 기반 자동 비교 화면을 추가합니다. 본사 주소는 서울특별시 중구 을지로 264로 반영합니다.

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
- `worker.mjs`: 기존 Cloudflare `wakefuel` Worker. 기존 `/opinet`에 `/geocode`, `/taxi/compare`를 추가합니다.
- `server/edge-handler.mjs`, `server/automatic-routing.mjs`: 요청 검증, 호출 제한, 주소 및 경로 조회.
- `api/compare.mjs`: 로컬 개발 서버 어댑터. 운영에서는 Cloudflare 모듈을 사용합니다.
- `dev/server.mjs`: 로컬 자동 조회 미리보기.

## 실행

Node.js 20 이상. 서버 환경에 `KAKAO_REST_API_KEY`를 설정한 뒤 `node dev/server.mjs`로 실행합니다. 기본 주소는 `http://127.0.0.1:8768/taxi/`입니다. 키를 파일·소스·로그에 넣지 않습니다.

`node --test tests/*.test.js`로 검증합니다.

## 운영 배포

- 유류비: https://jslee1019.github.io/fuel/
- 택시: https://jslee1019.github.io/fuel/taxi/
- 조회 서버: 기존 `wakefuel.jslee-43a.workers.dev` Worker.
- 비밀 값은 Cloudflare Secret `KAKAO_REST_API_KEY`, `OPINET_API_KEY`로 보관합니다. HTML이나 저장소에 키를 넣지 않습니다.
- `taxi/config.js`는 `/taxi/compare`, 기존 유류비 화면은 `/geocode`에 연결합니다.
- 요청 본문 4 KiB 제한, 지도 요청 시간 제한, 허용 출처 검증, Cloudflare Rate Limit 바인딩을 적용합니다. IP별 분당 30회, 공통 키 분당 120회이며 Cloudflare 위치별 제한입니다. 인증 또는 전체 계정의 강제 비용 한도는 아닙니다.
- 배포 모듈: `worker.mjs`, `server/edge-handler.mjs`, `server/automatic-routing.mjs`, `taxi/core.js`. `cloudflare-deployment.json`은 비밀 값을 제외한 업로드 메타데이터입니다. 기존 Secret 바인딩을 유지합니다.
- GitHub Pages는 main 브랜치로 배포합니다. Worker 변경은 Cloudflare에 별도로 배포하고 실제 `/opinet`, `/geocode`, `/taxi/compare` 응답을 확인합니다.
- 기존 서비스 요금제, 예산, 지도 API 할당량은 변경하지 않습니다.

## 공식 API

- https://developers.kakao.com/docs/ko/kakaomap/rest-api
- https://developers.kakaomobility.com/docs/navi-api/directions/
- https://developers.kakaomobility.com/affiliate/publictransit/multimodal.html
