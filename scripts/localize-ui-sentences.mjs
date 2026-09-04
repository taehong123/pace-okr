// Full-sentence localization. Only exact display fragments; never persisted data.
import fs from "node:fs";
const replacements = {
  "app/page.tsx": [
    [
      "{selectedDeleteItemIds.size}개 선택",
      "{t(\"{count}개 선택\", { count: selectedDeleteItemIds.size })}"
    ],
    [
      "{preview.inviterName} 님이 {teamRoleLabel(preview.role)} 역할로 초대했습니다.",
      "{t(\"{name}님이 {role} 역할로 초대했습니다.\", { name: preview.inviterName, role: teamRoleLabel(preview.role) })}"
    ],
    [
      "{new Date(preview.expiresAt).toLocaleDateString(getClientLocale())}까지",
      "{t(\"{date}까지\", { date: new Date(preview.expiresAt).toLocaleDateString(getClientLocale()) })}"
    ],
    [
      "{selectedVisibleCount}개 선택",
      "{t(\"{count}개 선택\", { count: selectedVisibleCount })}"
    ],
    [
      "조건에 맞는 {emptyLabel}가 없습니다.",
      "{t(\"조건에 맞는 {kind}가 없습니다.\", { kind: emptyLabel })}"
    ],
    [
      "{linkedTasks.length}개",
      "{t(\"{count}개\", { count: linkedTasks.length })}"
    ],
    [
      "{currentMember.displayName}의 업무",
      "{t(\"{name}의 업무\", { name: currentMember.displayName })}"
    ],
    [
      "담당된 {title}가 없습니다.",
      "{t(\"담당된 {kind}가 없습니다.\", { kind: title })}"
    ],
    [
      "{row.itemIds.length}개 항목 · 우선순위 {row.score}",
      "{t(\"{count}개 항목 · 우선순위 {score}\", { count: row.itemIds.length, score: row.score })}"
    ],
    [
      " · KR {counts.keyResults}개 · Initiative {counts.initiatives}개",
      " · {t(\"KR {kr}개 · Initiative {initiative}개\", { kr: counts.keyResults, initiative: counts.initiatives })}"
    ],
    [
      "{cycles.length}개",
      "{t(\"{count}개\", { count: cycles.length })}"
    ],
    [
      "{itemCount}개 항목{slowDeleting ? \" · 삭제 중\" : \"\"}",
      "{t(\"{count}개 항목\", { count: itemCount })}{slowDeleting ? ` · ${t(\"삭제 중\")}` : \"\"}"
    ],
    [
      "{t(\"Task\")}{items.length}개",
      "{t(\"{kind} · {count}\", { kind: t(\"Task\"), count: items.length })}"
    ],
    [
      "{orphanedIds.length}개 선택",
      "{t(\"{count}개 선택\", { count: orphanedIds.length })}"
    ],
    [
      " · 값 {property.valueCount}개{!property.active && \" · 제거됨\"}",
      " · {t(\"값 {count}개\", { count: property.valueCount })}{!property.active && ` · ${t(\"제거됨\")}`}"
    ],
    [
      "{workspace.name}을 알아보기 쉽게 꾸며보세요.",
      "{t(\"{name}을 알아보기 쉽게 꾸며보세요.\", { name: workspace.name })}"
    ],
    [
      "내 권한 · {teamRoleLabel(currentWorkspace.role)}",
      "{t(\"내 권한 · {role}\", { role: teamRoleLabel(currentWorkspace.role) })}"
    ],
    [
      "{snapshot.totalCount}개",
      "{t(\"{count}개\", { count: snapshot.totalCount })}"
    ],
    [
      "{delivery.targetCount}명 중 {delivery.scheduledCount}명 예약됨 · {delivery.failedCount}명 예약 확인 필요",
      "{t(\"{total}명 중 {scheduled}명 예약됨 · {failed}명 예약 확인 필요\", { total: delivery.targetCount, scheduled: delivery.scheduledCount, failed: delivery.failedCount })}"
    ],
    [
      "{targetMembers.length}명",
      "{t(\"{count}명\", { count: targetMembers.length })}"
    ],
    [
      "예약 실패 · {admin.members.find((member) => member.memberId === entry.memberId)?.displayName || entry.memberId}",
      "{t(\"예약 실패 · {name}\", { name: admin.members.find((member) => member.memberId === entry.memberId)?.displayName || t(\"미지정\") })}"
    ],
    [
      "{admin.members.filter((member) => member.linked).length}/{admin.members.length}명 연결",
      "{t(\"{total}명 중 {linked}명 연결\", { total: admin.members.length, linked: admin.members.filter((member) => member.linked).length })}"
    ],
    [
      "{workspaceName}에서 작동하는 규칙입니다.",
      "{t(\"{workspace}에서 작동하는 규칙입니다.\", { workspace: workspaceName })}"
    ],
    [
      "각 자동화는 독립된 규칙으로 작동하며, 메시지는 연결된 <b>{t(\"OKRI 봇\")}</b> 이름으로 전송됩니다.",
      "{t(\"각 자동화는 독립된 규칙으로 작동하며, 메시지는 연결된 OKRI 봇 이름으로 전송됩니다.\")}"
    ],
    [
      "? \" · 비공개\" : \"\"",
      "? ` · ${t(\"비공개\")}` : \"\""
    ]
  ],
  "app/okr-file-surface.tsx": [
    [
      "{t(\"하위 Task\")}{project.taskCount}개",
      "{t(\"{kind} · {count}\", { kind: t(\"하위 Task\"), count: project.taskCount })}"
    ],
    [
      "이 파일에는 Objective가 {readFile.objectiveCount}개 있습니다. 데이터는 자동으로 바꾸지 않았습니다.",
      "{t(\"이 파일에는 Objective가 {count}개 있습니다. 데이터는 자동으로 바꾸지 않았습니다.\", { count: readFile.objectiveCount })}"
    ],
    [
      "OKR 파일 · v{readFile.cycle.version}",
      "{t(\"OKR 파일 · v{version}\", { version: readFile.cycle.version })}"
    ],
    [
      "{t(\"Initiative\")}{keyResult.initiatives.length}개",
      "{t(\"{kind} · {count}\", { kind: t(\"Initiative\"), count: keyResult.initiatives.length })}"
    ],
    [
      "{t(\"Project\")}{projects.length}개",
      "{t(\"{kind} · {count}\", { kind: t(\"Project\"), count: projects.length })}"
    ],
    [
      "{t(\"Task\")}{tasks.length}개",
      "{t(\"{kind} · {count}\", { kind: t(\"Task\"), count: tasks.length })}"
    ]
  ],
  "app/kr-data-view.tsx": [
    [
      "이 {targetLabels[item.kind]}에 API 연결",
      "{t(\"이 {kind}에 API 연결\", { kind: targetLabels[item.kind] })}"
    ]
  ],
  "app/workspace-backups.tsx": [
    [
      "{formatTime(preview.expiresAt)}까지 보관",
      "{t(\"{date}까지 보관\", { date: formatTime(preview.expiresAt) })}"
    ]
  ]
};
for (const [file, pairs] of Object.entries(replacements)) {
const source=fs.readFileSync(file,"utf8"); let next=source;
for(const [from,to] of pairs) next=next.replaceAll(from,to);
if(next!==source)fs.writeFileSync(file,next);
}

