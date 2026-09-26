export function formatMessageTimestamp(createdAt: string, now: Date): string {
  const date = new Date(createdAt);
  const time = new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).format(date);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);

  if (date >= today && date < tomorrow) return time;
  if (date >= yesterday && date < today) return `昨天 ${time}`;
  return `${date.getMonth() + 1}月${date.getDate()}日 ${time}`;
}
