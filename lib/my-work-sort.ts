export type MyWorkSort = "due" | "priority";

type SortableWork = {
  dueDate: string | null;
  priority: "low" | "medium" | "high" | "urgent";
};

const priorityRank = { urgent: 0, high: 1, medium: 2, low: 3 };

export function sortMyWorkItems<T extends SortableWork>(items: readonly T[], sort: MyWorkSort): T[] {
  return [...items].sort((left, right) => {
    const due = left.dueDate && right.dueDate
      ? left.dueDate.localeCompare(right.dueDate)
      : left.dueDate ? -1 : right.dueDate ? 1 : 0;
    const priority = priorityRank[left.priority] - priorityRank[right.priority];
    return sort === "priority" ? priority || due : due || priority;
  });
}

export function myWorkSortStorageKey(workspaceId: string, memberId: string): string | null {
  return workspaceId && memberId ? `okrptr.my-work-sort:${workspaceId}:${memberId}` : null;
}

export function readMyWorkSort(workspaceId: string, memberId: string): MyWorkSort {
  const key = myWorkSortStorageKey(workspaceId, memberId);
  if (key && typeof window !== "undefined") {
    try {
      if (window.localStorage.getItem(key) === "priority") return "priority";
    } catch { /* Storage access is optional for this local preference. */ }
  }
  return "due";
}

export function saveMyWorkSort(workspaceId: string, memberId: string, sort: MyWorkSort): void {
  const key = myWorkSortStorageKey(workspaceId, memberId);
  if (key && typeof window !== "undefined") {
    try {
      window.localStorage.setItem(key, sort);
    } catch { /* Keep the in-memory selection when storage is unavailable. */ }
  }
}
