export function formatApproximateTimeAgo(value: string | Date): string {
  const timestamp = value instanceof Date ? value.getTime() : new Date(value).getTime();
  const elapsedMs = Math.max(0, Date.now() - timestamp);
  const minutes = Math.max(1, Math.round(elapsedMs / 60_000));

  if (minutes < 60) {
    return `~${minutes} ${minutes === 1 ? 'minute' : 'minutes'} ago`;
  }

  const hours = Math.max(1, Math.round(minutes / 60));
  if (hours < 24) {
    return `~${hours} ${hours === 1 ? 'hour' : 'hours'} ago`;
  }

  const days = Math.max(1, Math.round(hours / 24));
  return `~${days} ${days === 1 ? 'day' : 'days'} ago`;
}