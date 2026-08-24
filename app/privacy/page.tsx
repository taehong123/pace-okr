import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "개인정보처리방침 | OKRPTR",
  description: "OKRPTR 개인정보처리방침",
};

export default function PrivacyPage() {
  return (
    <main className="legal-page">
      <article>
        <header>
          <Link href="/">OKRPTR</Link>
          <h1>개인정보처리방침</h1>
          <p>시행일: 2026년 8월 24일</p>
        </header>

        <section>
          <h2>1. 수집하는 정보</h2>
          <p>
            OKRPTR는 Google 계정 로그인 시 계정 식별자, 이메일 주소, 이름과
            프로필 이미지를 수집할 수 있습니다. 사용자가 Google Calendar 연결을
            별도로 승인하면 일정 조회 및 생성에 필요한 OAuth 권한과 토큰을
            처리합니다.
          </p>
        </section>

        <section>
          <h2>2. 이용 목적</h2>
          <p>
            수집한 정보는 사용자 인증, 워크스페이스 멤버 식별, 담당자 표시,
            사용자가 요청한 캘린더 연동 기능 제공, 보안 및 오류 대응에만
            사용합니다.
          </p>
        </section>

        <section>
          <h2>3. 보관과 보호</h2>
          <p>
            인증 정보와 연동 토큰은 접근이 제한된 환경에서 보관하며, OAuth
            토큰은 암호화하여 처리합니다. 서비스 제공에 필요하지 않게 된 정보는
            관련 법령상 보관 의무가 없는 한 지체 없이 삭제합니다.
          </p>
        </section>

        <section>
          <h2>4. 제3자 제공</h2>
          <p>
            OKRPTR는 개인정보를 판매하지 않습니다. 법령상 의무가 있거나 사용자가
            명시적으로 동의한 경우를 제외하고 개인정보를 제3자에게 제공하지
            않습니다.
          </p>
        </section>

        <section>
          <h2>5. Google 사용자 데이터</h2>
          <p>
            Google API에서 받은 정보의 사용 및 다른 앱으로의 전송은 제한적 사용
            요건을 포함한 Google API 서비스 사용자 데이터 정책을 준수합니다.
            Google 계정 로그인은 기본 프로필과 이메일 확인에만 사용하며, 캘린더
            권한은 사용자가 연동을 선택한 경우에만 요청합니다.
          </p>
        </section>

        <section>
          <h2>6. 사용자 권리</h2>
          <p>
            사용자는 앱의 연동 설정에서 Google Calendar 연결을 해제하거나 Google
            계정의 보안 설정에서 접근 권한을 철회할 수 있습니다. 개인정보 열람,
            정정 또는 삭제 요청은 아래 연락처로 접수할 수 있습니다.
          </p>
        </section>

        <section>
          <h2>7. 문의</h2>
          <p>
            개인정보 관련 문의: <a href="mailto:taehong0613@gmail.com">taehong0613@gmail.com</a>
          </p>
        </section>

        <footer>
          <Link href="/terms">이용약관</Link>
          <Link href="/">서비스로 돌아가기</Link>
        </footer>
      </article>
    </main>
  );
}
