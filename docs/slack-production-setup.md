# OKRPTR Slack 데일리 봇 운영 체크리스트

이 문서는 OKRPTR 서비스 운영자가 최초 한 번만 진행하는 설정이다. 일반 고객은 이 절차를 수행하지 않으며, OKRPTR의 **앱 연동 → Slack에 연결**에서 Slack 승인만 하면 된다.

## 1. 공용 Slack 앱 만들기

1. Slack API의 **Your Apps**에서 **Create New App → From an app manifest**를 선택한다.
2. 운영자 소유의 중립적인 개발 워크스페이스를 선택하고 저장소의 `slack-app-manifest.yml` 내용을 붙여넣는다. 이 워크스페이스는 앱 소유·검증용이며 고객 연결 대상이 아니다.
3. 생성 전 요약에서 다음 URL이 모두 `https://okrptr.com`을 사용하는지 확인한다.
   - OAuth Redirect: `/api/slack/callback`
   - Slash Command: `/api/slack/commands`
   - Interactivity: `/api/slack/interactions`
   - Events API: `/api/slack/events`
4. Bot Token Scopes에 `commands`, `chat:write`, `im:write`, `im:history`, `users:read`, `users:read.email`, `channels:read`, `groups:read`가 있는지 확인한다.
5. Event Subscription에 `message.im`이 있는지 확인한다.

## 2. 운영 보안 값 등록

Slack 앱의 **Basic Information**과 **OAuth & Permissions**에서 다음 값을 확인해 Sites 운영 환경에 보안 값으로 등록한다. 값을 저장소, 문서, 채팅, 스크린샷에 남기지 않는다.

- `SLACK_CLIENT_ID`
- `SLACK_CLIENT_SECRET`
- `SLACK_SIGNING_SECRET`
- `SLACK_TOKEN_ENCRYPTION_KEY`: 기존 운영 값을 유지한다. 운영 중 변경하면 저장된 Bot Token을 복호화할 수 없다.
- `SLACK_OAUTH_REDIRECT_URI=https://okrptr.com/api/slack/callback`

환경 값을 바꾼 뒤에는 저장된 Sites 버전을 다시 배포해야 새 설정이 적용된다. 운영 `/api/slack/status`가 `workspace_disconnected`를 반환하면 서비스 측 준비가 끝난 것이다.

## 3. 최초 워크스페이스 설치

1. OKRPTR에서 Owner 또는 Admin으로 로그인한다.
2. **앱 연동 → Slack 데일리 봇 → Slack에 연결**을 누른다.
3. 설치할 Slack 워크스페이스를 확인하고 권한을 승인한다.
4. OKRPTR로 돌아오면 연결 상태, 이메일 자동 연결 인원, 권한 상태를 확인한다.
5. 미연결 사용자는 Slack에서 `/okrptr daily`를 입력하고 15분짜리 일회용 링크로 본인 계정을 연결한다.

## 4. 데일리 작동 확인

1. 봇을 데일리를 공유할 공개 또는 비공개 채널에 초대한다.
2. OKRPTR 앱 연동 5단계에서 **사용자·예약 재동기화**를 실행한다.
3. 팀 공유 채널과 기본 평일·시간·시간대를 저장한다.
4. 연결된 사용자에게 **테스트 DM**을 보낸다.
5. Slack에서 `/okrptr daily`를 실행해 모달이 열리는지 확인한다.
6. Task를 선택해 제출하고 지정 채널에 개인 카드가 게시되는지 확인한다.
7. 같은 날짜에 다시 제출해 새 메시지가 아니라 기존 카드가 갱신되는지 확인한다.
8. 스킵의 `본업 과중 / 휴가 / 개인 일정 / 기타`를 각각 확인하고, `기타`에서 상세 사유가 필수인지 확인한다.

## 5. 모든 고객 워크스페이스의 직접 설치 허용

테스트 워크스페이스 A에서 기본 흐름을 확인한 뒤 Slack 앱의 **Manage Distribution**에서 배포 체크리스트를 완료하고 비공개 목록 방식의 Public Distribution을 활성화한다. 이어서 별도의 테스트 워크스페이스 B에서도 OKRPTR의 연결 버튼만으로 설치되는지 확인한다.

고객은 OKRPTR의 **내 Slack 워크스페이스에 연결** 버튼으로 OAuth 설치를 시작한다. Slack 승인 화면에서 자기 워크스페이스를 선택하며 훅 URL, Client ID, Signing Secret 같은 개발자 설정은 입력하지 않는다.

한 OKRPTR 워크스페이스에는 Slack 워크스페이스 하나만 연결한다. 같은 Slack 워크스페이스를 다른 OKRPTR 워크스페이스로 옮기려면 기존 연결을 먼저 해제한다.

권한을 추가하면 기존 워크스페이스에는 자동으로 권한이 생기지 않는다. OKRPTR에서 **권한 업데이트**를 눌러 한 번 다시 승인해야 한다.

## 6. 장애 확인

- **서비스 설정 확인 필요**: 운영 환경의 Client ID, Client Secret, Signing Secret을 확인하고 재배포한다.
- **권한 업데이트 필요**: 매니페스트의 Bot Token Scopes를 반영한 뒤 OKRPTR에서 다시 승인한다.
- **Slack 미연결 사용자**: 이메일 대소문자와 활성 멤버 여부를 확인하거나 `/okrptr daily` 일회용 링크를 사용한다.
- **Slack 관리자 승인 필요**: 고객 Slack의 앱 설치 정책에 따른 상태이므로 해당 Slack의 Owner/Admin 승인 후 다시 연결한다.
- **이미 다른 OKRPTR에 연결됨**: 기존 OKRPTR 워크스페이스에서 Slack 연결을 해제한 뒤 다시 시도한다.
- **공유 채널이 보이지 않음**: Slack에서 OKRPTR 봇을 해당 채널에 초대한 뒤 재동기화한다.
- **DM 또는 채널 전송 실패**: 앱 연동의 오류 항목에서 재시도하고 Sites Worker 오류 로그에서 Slack API 오류 코드를 확인한다.
