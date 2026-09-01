import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "이용약관 | OKRPTR", description: "OKRPTR 이용약관" };

export default function TermsPage() {
  return <main className="legal-page"><article>
    <header><Link href="/">OKRPTR</Link><h1>이용약관</h1><p>시행일: 2026년 9월 1일</p></header>
    <section><h2>1. 서비스</h2><p>OKRPTR는 워크스페이스의 목표, Project, Task, Routine과 선택한 외부 서비스 연동을 관리하는 업무 도구입니다.</p></section>
    <section><h2>2. 가입과 계정</h2><p>사용자는 본인의 Google 계정으로 로그인하고 본인이 소유하거나 정당하게 사용할 수 있는 휴대전화 번호를 확인해야 합니다. 휴대전화 확인은 번호 소유 여부를 확인하는 절차이며 법적 실명 인증을 의미하지 않습니다. 사용자는 계정과 워크스페이스 접근 권한을 안전하게 관리해야 합니다.</p></section>
    <section><h2>3. 연령</h2><p>현재 가입 대상은 만 14세 이상입니다. 만 14세 미만 사용자를 위한 법정대리인 동의 절차는 별도로 제공하지 않습니다.</p></section>
    <section><h2>4. 마케팅 동의</h2><p>마케팅 목적 개인정보 이용 및 광고성 정보 수신 동의는 선택 사항이며 서비스 이용 대가나 가입 조건이 아닙니다. 동의하지 않거나 나중에 철회해도 서비스의 일반 기능을 계속 이용할 수 있습니다.</p></section>
    <section><h2>5. 외부 서비스</h2><p>Google Calendar, Slack 등 외부 서비스 연동은 사용자의 선택과 해당 서비스의 정책에 따라 제공됩니다. 사용자는 언제든 연동을 해제할 수 있습니다.</p></section>
    <section><h2>6. 책임과 서비스 변경</h2><p>서비스는 안정적인 제공을 위해 노력하지만 점검, 장애 또는 외부 서비스 변경으로 일시 중단될 수 있습니다. 중요한 업무 정보는 사용자가 별도로 확인하고 필요한 경우 백업해야 합니다.</p></section>
    <section><h2>7. 문의</h2><p>서비스 관련 문의: <a href="mailto:taehong0613@gmail.com">taehong0613@gmail.com</a></p></section>
    <footer><Link href="/privacy">개인정보처리방침</Link><Link href="/">서비스로 돌아가기</Link></footer>
  </article></main>;
}
