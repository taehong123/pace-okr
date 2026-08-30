import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "이용약관 | OKRPTR",
  description: "OKRPTR 이용약관",
};

export default function TermsPage() {
  return (
    <main className="legal-page">
      <article>
        <header>
          <Link href="/">OKRPTR</Link>
          <h1>이용약관</h1>
          <p>시행일: 2026년 8월 24일</p>
        </header>

        <section>
          <h2>1. 서비스</h2>
          <p>
            OKRPTR는 워크스페이스의 목표, 프로젝트, 업무와 Routine을 관리하고 선택한
            외부 서비스와 연동할 수 있는 업무 관리 도구입니다.
          </p>
        </section>

        <section>
          <h2>2. 계정과 권한</h2>
          <p>
            사용자는 본인의 Google 계정으로 로그인해야 하며, 계정과 워크스페이스
            접근 권한을 안전하게 관리해야 합니다. 다른 사용자의 계정이나 데이터에
            무단으로 접근해서는 안 됩니다.
          </p>
        </section>

        <section>
          <h2>3. 외부 서비스</h2>
          <p>
            Google Calendar 등 외부 서비스 연동은 사용자의 선택과 승인에 따라
            제공됩니다. 사용자는 언제든 해당 연동을 해제할 수 있습니다.
          </p>
        </section>

        <section>
          <h2>4. 책임</h2>
          <p>
            서비스는 안정적인 제공을 위해 노력하지만 점검, 장애 또는 외부 서비스
            변경으로 일시 중단될 수 있습니다. 사용자는 중요한 업무 정보를 별도로
            확인하고 필요한 경우 백업해야 합니다.
          </p>
        </section>

        <section>
          <h2>5. 문의</h2>
          <p>
            서비스 관련 문의: <a href="mailto:taehong0613@gmail.com">taehong0613@gmail.com</a>
          </p>
        </section>

        <footer>
          <Link href="/privacy">개인정보처리방침</Link>
          <Link href="/">서비스로 돌아가기</Link>
        </footer>
      </article>
    </main>
  );
}
