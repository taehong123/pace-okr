# Payple 정기결제 운영 전환 체크리스트

현재 코드는 결제와 한도 기능을 포함하지만 `BILLING_ENFORCEMENT_ENABLED` 기본값은 꺼짐이다. 아래 검증이 끝나기 전에 이 값을 켜지 않는다.

## 1. Payple 승인

1. 기존 Payple 계약에 `okri.ai`과 OKRI 월 구독 상품을 추가하거나 별도 상점키를 발급받는다.
2. 국내 카드 정기결제 `AUTH`, 결제, 전액 취소, 빌링키 해지를 모두 승인받는다.
3. 등록 도메인과 브라우저 `Referer`가 `https://okri.ai`으로 일치하는지 확인한다.
4. Orderflow의 상점키나 빌링키 암호화 키를 복사하지 않는다.

Sites 운영 보안값:

- `PAYPLE_CST_ID`
- `PAYPLE_CUST_KEY`
- `PAYPLE_AUTH_URL`: Payple이 제공한 운영 카드 등록 SDK URL
- `PAYPLE_API_URL`: Payple이 제공한 운영 정기결제 API 기준 URL
- `PAYPLE_REFUND_KEY`
- `PAYPLE_BILLING_KEY_ENCRYPTION_KEY`: 다른 서비스·OAuth와 분리된 무작위 키
- `RESEND_API_KEY`
- `OKRI_BILLING_FROM`
- `EMAIL_UNSUBSCRIBE_SECRET`
- `INTERNAL_BILLING_SECRET`
- `OKRI_PUBLIC_URL=https://okri.ai`
- `BILLING_ENFORCEMENT_ENABLED=false`
- `BILLING_ENFORCEMENT_STARTED_AT`: 한도 활성화 시각의 ISO 8601 값. 이 시각 이전에 만든 워크스페이스에는 여기서부터 30일간 편집자 정리 유예가 자동 적용된다.

## 2. 통제된 검증

1. 테스트 Owner로 Team 카드 등록을 하고 즉시 결제가 없는지 확인한다.
2. 동일 결제 Owner와 동일 Payple 결제자가 다른 무료 워크스페이스에서 체험을 다시 받지 못하는지 확인한다.
3. 통제된 Team 실결제 1건을 실행하고 거래번호·마스킹 카드·금액·상태·영수증 URL만 저장되는지 확인한다.
4. 결제 후 Project와 AI를 사용하지 않은 상태에서 전액 환불하고 Free로 즉시 복귀하는지 확인한다.
5. 실패 카드로 1·3·5·7일 재시도와 7일 유예를 가상 시간 테스트한다.
6. Team→Business 일할 상향과 Business→Team 다음 갱신 하향을 확인한다.
7. 해지 시 자동 갱신은 즉시 멈추고 데이터는 유지되는지 확인한다.

## 3. 시간당 청구 실행

GitHub 저장소에 다음 Actions secret을 등록한다.

- `OKRI_BILLING_RUN_URL=https://okri.ai/api/internal/billing/run`
- `OKRI_INTERNAL_BILLING_SECRET`: Sites의 `INTERNAL_BILLING_SECRET`과 동일한 값

`.github/workflows/billing-hourly.yml`을 수동 실행해 서명 검증, D1 lease, 고유 주문번호 중복 방지를 확인한 뒤 스케줄을 사용한다.

## 4. 한도 활성화

Payple 운영 승인, 거래성 이메일, 시간당 실행, 취소·환불, 약관·개인정보처리방침을 모두 확인한 뒤에만 `BILLING_ENFORCEMENT_STARTED_AT`을 현재 시각으로 먼저 설정하고 `BILLING_ENFORCEMENT_ENABLED=true`로 변경한다. 활성화 전 Project 사용량은 0이며 기존 Project는 집계하지 않는다. 시작 시각 이전에 생성된 팀은 결제 화면에 유예 종료일을 표시하며 30일 뒤에만 초과 편집자를 읽기 전용으로 제한한다.
