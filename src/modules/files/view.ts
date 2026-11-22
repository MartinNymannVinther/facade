/** Where a shared file can be seen in its place. Pure, for server and browser. */
export type FilePlace = {
  pageId: string | null;
  messageId: string | null;
  channelId: string | null;
  parentId: string | null;
};

export function placeHref(place: FilePlace): string | null {
  if (place.messageId && place.pageId) return `/pages/${place.pageId}?talk=1`;
  if (place.messageId && place.channelId)
    return `/channels/${place.channelId}?thread=${place.parentId ?? place.messageId}`;
  if (place.pageId) return `/pages/${place.pageId}`;
  return null;
}

/** 1.4 MB, 820 kB, 312 B: the way a person reads a size. */
export function formatSize(bytes: number, locale: string): string {
  const format = (n: number, unit: string) =>
    `${n.toLocaleString(locale, { maximumFractionDigits: n < 10 ? 1 : 0 })} ${unit}`;
  if (bytes >= 1024 * 1024) return format(bytes / (1024 * 1024), "MB");
  if (bytes >= 1024) return format(bytes / 1024, "kB");
  return `${bytes} B`;
}
