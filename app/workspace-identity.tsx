"use client";

import { Check, Copy, LoaderCircle, RefreshCw, Save } from "lucide-react";
import { useCallback, useEffect, useId, useState, type FormEvent } from "react";
import { useAppConfirm } from "./overlay-dialog";
import "./workspace-identity.css";
import { languages, type Language } from "@/lib/language";
import { t, useLanguage , apiError } from "@/lib/client-language";

type Profile = { id: string; name: string; address: string | null; revision: number; canManage: boolean; subdomainsEnabled: boolean; url: string | null; messageLanguage: Language };

export default function WorkspaceIdentity({ workspaceId, onNameChanged }: { workspaceId: string; onNameChanged: (name: string) => void }) {
  useLanguage();
  const id = useId();
  const confirm = useAppConfirm();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [messageLanguage, setMessageLanguage] = useState<Language>("ko");
  const [attempt, setAttempt] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<"name" | "address" | "messageLanguage" | null>(null);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");
  const [copied, setCopied] = useState(false);
  const apply = useCallback((value: Profile) => {
    setProfile(value); setName(value.name); setAddress(value.address ?? ""); setMessageLanguage(value.messageLanguage ?? "ko");
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/workspaces/profile", { cache: "no-store", headers: { "x-okrptr-workspace-id": workspaceId }, signal: controller.signal })
      .then(async (response) => {
        const data = await response.json() as { profile?: Profile; error?: string };
        if (!response.ok || !data.profile || data.profile.id !== workspaceId) throw new Error(apiError(data, "워크스페이스 정보를 불러오지 못했습니다."));
        if (!controller.signal.aborted) apply(data.profile);
      }).catch((failure: unknown) => {
        if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : "워크스페이스 정보를 불러오지 못했습니다.");
      }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [workspaceId, attempt, apply]);

  async function save(event: FormEvent, kind: "name" | "address" | "messageLanguage") {
    event.preventDefault();
    if (!profile || busy || !profile.canManage) return;
    if (kind === "address" && profile.address && !await confirm({ title: "워크스페이스 주소 변경", message: "이전 주소도 계속 이 워크스페이스로 연결됩니다.", confirmLabel: "주소 변경" })) return;
    setBusy(kind); setError(""); setSaved(""); setCopied(false);
    try {
      const value = kind === "name" ? name.trim() : kind === "address" ? address.trim().toLowerCase() : messageLanguage;
      const response = await fetch("/api/workspaces/profile", { method: "PATCH", headers: { "Content-Type": "application/json", "x-okrptr-workspace-id": workspaceId }, body: JSON.stringify({ [kind]: value, revision: profile.revision }) });
      const data = await response.json() as { profile?: Profile; error?: string };
      if (!response.ok || !data.profile || data.profile.id !== workspaceId) throw new Error(apiError(data, "저장하지 못했습니다. 다시 시도해 주세요."));
      setProfile(data.profile);
      if (kind === "name") { setName(data.profile.name); onNameChanged(data.profile.name); }
      else if (kind === "address") setAddress(data.profile.address ?? "");
      else setMessageLanguage(data.profile.messageLanguage);
      setSaved(kind === "name" ? "이름을 저장했습니다." : kind === "address" ? "주소를 저장했습니다." : "언어를 저장했습니다.");
    } catch (failure) { setError(failure instanceof Error ? failure.message : "저장하지 못했습니다."); }
    finally { setBusy(null); }
  }

  async function copyLink() {
    if (!profile?.url) return;
    try { await navigator.clipboard.writeText(new URL(profile.url, window.location.origin).toString()); setCopied(true); }
    catch { setError(t("링크를 복사하지 못했습니다. 다시 시도해 주세요.")); }
  }

  async function reload() {
    if (profile && (name !== profile.name || address !== (profile.address ?? "") || messageLanguage !== (profile.messageLanguage ?? "ko")) && !await confirm({ title: t("다시 불러오기"), message: t("저장하지 않은 입력을 버리고 현재 정보를 다시 불러올까요?"), confirmLabel: t("다시 불러오기") })) return;
    setLoading(true); setError(""); setSaved(""); setAttempt((value) => value + 1);
  }

  const disabled = loading || Boolean(busy) || !profile?.canManage;
  return <section className="workspace-identity" aria-label={t("워크스페이스 이름과 주소")} aria-busy={loading || Boolean(busy)}>
    {loading && <p role="status"><LoaderCircle size={16} className="spin" />{t("불러오는 중")}</p>}
    {profile && <>
      <form onSubmit={(event) => void save(event, "messageLanguage")}>
        <label htmlFor={`${id}-language`}>{t("공용 메시지 언어")}</label>
        <div className="language-settings-controls">
          <select id={`${id}-language`} value={messageLanguage} disabled={disabled} onChange={(event) => { setMessageLanguage(event.target.value as Language); setSaved(""); }}>
            {languages.map(({ id: language, label }) => <option key={language} value={language} lang={language === "zh" ? "zh-Hans" : language}>{label}</option>)}
          </select>
          {profile.canManage && <button className="primary-action" type="submit" disabled={disabled || messageLanguage === (profile.messageLanguage ?? "ko")}>{busy === "messageLanguage" && <LoaderCircle size={16} className="spin" />}{t("언어 저장")}</button>}
        </div>
        <p>{t("팀 채널의 봇 메시지에 적용됩니다. 개인 화면과 DM은 개인 언어를 따릅니다.")}</p>
      </form>
      <form onSubmit={(event) => void save(event, "name")}>
        <label htmlFor={`${id}-name`}>{t("워크스페이스 이름")}</label>
        <div className="workspace-identity-edit"><input id={`${id}-name`} value={name} onChange={(event) => { setName(event.target.value); setSaved(""); }} maxLength={80} disabled={disabled} autoComplete="off" />
          {profile.canManage && <button className="primary-action" type="submit" disabled={disabled || !name.trim() || name.trim() === profile.name}>{busy === "name" ? <LoaderCircle size={16} className="spin" /> : <Save size={16} />}{t("이름 저장")}</button>}
        </div>
      </form>
      <form onSubmit={(event) => void save(event, "address")}>
        <label htmlFor={`${id}-address`}>{t("워크스페이스 주소")}</label>
        <div className="workspace-identity-edit"><div className="workspace-address-input"><input id={`${id}-address`} value={address} onChange={(event) => { setAddress(event.target.value.toLowerCase()); setSaved(""); }} placeholder="team-name" maxLength={48} autoCapitalize="none" autoCorrect="off" spellCheck={false} disabled={disabled} aria-describedby={`${id}-address-hint`} /><span>.okrptr.com</span></div>
          {profile.canManage && <button className="primary-action" type="submit" disabled={disabled || address.trim().length < 3 || address.trim() === profile.address}>{busy === "address" ? <LoaderCircle size={16} className="spin" /> : <Save size={16} />}{t("주소 저장")}</button>}
        </div>
        <small id={`${id}-address-hint`}>{t("영문 소문자·숫자·하이픈, 3~48자")}</small>
        {!profile.subdomainsEnabled && <p className="workspace-address-pending">{t("하위도메인은 아직 사용할 수 없습니다. 저장한 주소는 아래 워크스페이스 링크로 이용할 수 있습니다.")}</p>}
        {profile.url && <div className="workspace-identity-link"><a href={profile.url}>{profile.subdomainsEnabled ? `${profile.address}.okrptr.com` : t("워크스페이스 열기")}</a><button className="icon-button" type="button" onClick={() => void copyLink()} aria-label={copied ? t("링크 복사됨") : t("워크스페이스 링크 복사")} title={copied ? t("복사됨") : t("워크스페이스 링크 복사")}>{copied ? <Check size={16} /> : <Copy size={16} />}</button></div>}
      </form>
    </>}
    {error && <div className="workspace-identity-error"><p role="alert">{error}</p><button className="secondary" type="button" disabled={Boolean(busy)} onClick={() => void reload()}><RefreshCw size={16} />{t("다시 불러오기")}</button></div>}
    {saved && <p role="status">{saved}</p>}
  </section>;
}
