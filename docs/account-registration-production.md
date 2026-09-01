# 이메일 가입과 마케팅 동의 운영 체크리스트

OKRPTR 가입은 Google이 확인한 이메일만 사용한다. 휴대전화 번호, SMS 인증, PASS 본인인증은 사용하지 않으며 과거 전화번호와 인증 요청은 `0034_billing_email.sql` 및 런타임 마이그레이션에서 삭제한다.

## 가입 확인

1. 새 Google 계정이 추가 화면 없이 바로 개인 워크스페이스에 진입하는지 확인한다.
2. 이메일 확인이 되지 않은 Google 응답은 세션 생성 단계에서 거부하는지 확인한다.
3. `/api/account/phone/send`와 `/api/account/phone/verify`가 `410 phone_verification_retired`를 반환하는지 확인한다.
4. 운영 환경의 과거 `ACCOUNT_REGISTRATION_REQUIRED`, `TWILIO_*`, `ACCOUNT_DATA_ENCRYPTION_KEY` 값은 제거한다. 코드도 오래된 플래그를 무시한다.

## 이메일 마케팅 동의

- `마케팅 목적 개인정보 이용`과 `광고성 이메일 수신`을 기본 해제 상태로 별도 저장한다.
- 두 동의가 모두 유효하고 `reaffirmAfter`가 지나지 않은 사용자만 광고 이메일 대상에 포함한다.
- 내 설정과 서명된 `/api/account/marketing-consent/unsubscribe` 링크에서 철회할 수 있다.
- 2년이 지나면 재확인 전까지 발송 대상에서 제외한다.
- 초대, 체험 종료, 결제, 영수증, 결제 실패 메일은 거래성 이메일로 분리한다.

운영 보안값 `EMAIL_UNSUBSCRIBE_SECRET`은 내부 청구 키와 다른 충분히 긴 무작위 값으로 등록한다. 마케팅 발송 도구를 붙일 때는 API 응답의 `marketingEligible`만 사용하고 동의 원본을 임의로 재해석하지 않는다.
