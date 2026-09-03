export type SlackDirectoryUser = { id: string; deleted?: boolean; is_bot?: boolean; is_app_user?: boolean; profile?: { email?: string; display_name?: string; real_name?: string } };
type Member = { id: string; email: string; display_name: string };
type Link = { member_id: string; slack_user_id: string; matched_by: string; team_id: string };
const emailKey = (email: string | undefined) => (email || "").trim().toLowerCase();

export function planSlackMemberMatches(members: Member[], users: SlackDirectoryUser[], links: Link[], teamId: string) {
  const active = users.filter((user) => user.id && user.id !== "USLACKBOT" && !user.deleted && !user.is_bot && !user.is_app_user);
  return members.map((member) => {
    const linked = links.find((link) => link.member_id === member.id && link.team_id === teamId);
    if (linked && active.some((user) => user.id === linked.slack_user_id)) return { memberId: member.id, reason: "connected", match: null };
    if (linked) return { memberId: member.id, reason: "slack_account_inactive", match: null };
    const email = emailKey(member.email);
    if (!email) return { memberId: member.id, reason: "email_missing", match: null };
    const matches = active.filter((user) => emailKey(user.profile?.email) === email);
    if (members.filter((m) => emailKey(m.email) === email).length !== 1 || matches.length > 1) return { memberId: member.id, reason: "email_ambiguous", match: null };
    if (!matches.length) return { memberId: member.id, reason: "email_not_found", match: null };
    if (links.some((link) => link.team_id === teamId && link.slack_user_id === matches[0].id && link.member_id !== member.id)) return { memberId: member.id, reason: "already_linked", match: null };
    return { memberId: member.id, reason: "email_match_pending", match: matches[0] };
  });
}

export async function readSlackMemberMatches(db: D1Database, ownerId: string, teamId: string, users: SlackDirectoryUser[]) {
  const [members, links] = await Promise.all([
    db.prepare("SELECT id, email, display_name FROM workspace_members WHERE workspace_id = ? AND status = 'active'").bind(ownerId).all<Member>(),
    db.prepare("SELECT member_id, slack_user_id, matched_by, team_id FROM slack_member_links WHERE owner_id = ?").bind(ownerId).all<Link>(),
  ]);
  return { members: members.results, links: links.results, matches: planSlackMemberMatches(members.results, users, links.results, teamId) };
}

export async function attachSlackMember(db: D1Database, ownerId: string, teamId: string, memberId: string, user: SlackDirectoryUser, matchedBy: "email" | "admin") {
  if (user.deleted || user.is_bot || user.is_app_user || user.id === "USLACKBOT") throw new Error("활성 Slack 사용자만 연결할 수 있습니다.");
  const result = await db.prepare(`INSERT INTO slack_member_links
    (id, owner_id, member_id, team_id, slack_user_id, slack_email, slack_display_name, matched_by, created_at, updated_at)
    SELECT ?, ?, member.id, ?, ?, ?, ?, ?, ?, ? FROM workspace_members member
    JOIN slack_connections connection ON connection.owner_id = member.workspace_id AND connection.team_id = ?
    WHERE member.workspace_id = ? AND member.id = ? AND member.status = 'active'
      AND (? != 'email' OR (lower(trim(member.email)) = ? AND NOT EXISTS
        (SELECT 1 FROM workspace_members duplicate WHERE duplicate.workspace_id = member.workspace_id
          AND duplicate.status = 'active' AND duplicate.id != member.id AND lower(trim(duplicate.email)) = lower(trim(member.email)))))
      AND NOT EXISTS (SELECT 1 FROM slack_member_links link WHERE (link.owner_id = ? AND link.member_id = ?) OR (link.team_id = ? AND link.slack_user_id = ?))`)
    .bind(crypto.randomUUID(), ownerId, teamId, user.id, user.profile?.email || "", user.profile?.display_name || user.profile?.real_name || "Slack", matchedBy,
      new Date().toISOString(), new Date().toISOString(), teamId, ownerId, memberId, matchedBy, emailKey(user.profile?.email), ownerId, memberId, teamId, user.id).run();
  if (result.meta.changes !== 1) throw new Error("이미 연결됐거나 멤버 상태가 변경됐습니다. 연결 상태를 다시 확인해 주세요.");
}

export async function synchronizeSlackMembers(db: D1Database, ownerId: string, teamId: string, users: SlackDirectoryUser[]) {
  const plan = await readSlackMemberMatches(db, ownerId, teamId, users);
  let linked = 0;
  for (const entry of plan.matches) if (entry.match) {
    await attachSlackMember(db, ownerId, teamId, entry.memberId, entry.match, "email");
    linked++;
  }
  return { linked, unmatched: plan.matches.filter((entry) => !entry.match && entry.reason !== "connected").length };
}
