import fs from "node:fs";
const changes={
  "app/page.tsx": [
    [
      "import LanguageSettings",
      "import LanguageSettings"
    ],
    [
      "systemProperty(\"project_dri\")?.name ?? t(\"책임자\")",
      "systemPropertyLabel(systemProperty(\"project_dri\"), t, \"책임자\")"
    ],
    [
      "systemProperty(\"project_workers\")?.name ?? t(\"참여자\")",
      "systemPropertyLabel(systemProperty(\"project_workers\"), t, \"참여자\")"
    ],
    [
      "systemProperty(\"status\")?.name ?? t(\"상태\")",
      "systemPropertyLabel(systemProperty(\"status\"), t, \"상태\")"
    ],
    [
      "systemProperty(\"priority\")?.name ?? t(\"우선순위\")",
      "systemPropertyLabel(systemProperty(\"priority\"), t, \"우선순위\")"
    ],
    [
      "systemProperty(\"due_date\")?.name ?? t(\"기한\")",
      "systemPropertyLabel(systemProperty(\"due_date\"), t, \"기한\")"
    ],
    [
      "assignment.role === \"project_dri\" ? \"주 담당\" : \"보조 담당\"",
      "assignment.role === \"project_dri\" ? t(\"책임자\") : t(\"참여자\")"
    ],
    [
      "{property.name}",
      "{systemPropertyLabel(property, t)}"
    ]
  ],
  "app/project-review/review-fields.tsx": [
    [
      "field(\"title\", \"Project 제목 (필수)\",",
      "field(\"title\", t(\"Project 제목 (필수)\"),"
    ],
    [
      "field(\"description\", \"설명 · 범위와 완료 기준\",",
      "field(\"description\", t(\"설명 · 범위와 완료 기준\"),"
    ],
    [
      "field(\"templateId\", \"본문 템플릿\",",
      "field(\"templateId\", t(\"본문 템플릿\"),"
    ],
    [
      ": \"미지정\"",
      ": t(\"미지정\")"
    ],
    [
      "|| \"미지정\"",
      "|| t(\"미지정\")"
    ],
    [
      "p.dueDate || t(\"미지정\")",
      "p.dueDate ? displayDate(p.dueDate) : t(\"미지정\")"
    ],
    [
      "priorityNames[p.priority]",
      "t(priorityNames[p.priority])"
    ],
    [
      "${statusNames[p.status]} · ${p.progress}%",
      "${t(statusNames[p.status])} · ${p.progress.toLocaleString(getClientLocale())}%"
    ],
    [
      "[\"본문 템플릿\",",
      "[t(\"본문 템플릿\"),"
    ],
    [
      "[\"연결 OKR 파일\",",
      "[t(\"연결 OKR 파일\"),"
    ],
    [
      "selection.cycleName ?? \"파일 없음\" : \"Initiative 선택 후 결정\"",
      "selection.cycleName ?? t(\"파일 없음\") : t(\"Initiative 선택 후 결정\")"
    ]
  ]
};
for(const [file,pairs]of Object.entries(changes)){let x=fs.readFileSync(file,"utf8");for(const[from,to]of pairs)x=x.replaceAll(from,to);fs.writeFileSync(file,x);}

