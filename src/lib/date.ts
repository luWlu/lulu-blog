const siteDate = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Shanghai',
  calendar: 'gregory',
  numberingSystem: 'latn',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** 仅格式化展示日期；保留原始时间戳供排序、RSS 和 datetime 使用。 */
export function dateLabel(date: Date): string {
  const parts = siteDate.formatToParts(date);
  return ['year', 'month', 'day']
    .map(type => parts.find(part => part.type === type)!.value)
    .join('.');
}
