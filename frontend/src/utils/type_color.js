const TAG_COLOR_PALETTE = [
  "magenta",
  "red",
  "volcano",
  "orange",
  "gold",
  "lime",
  "green",
  "cyan",
  "blue",
  "geekblue",
  "purple",
];

function hashText(value) {
  const text = String(value || "");
  let hash = 0;
  for (let index = 0; index < text.length; index += 1) {
    hash = (hash * 31 + text.charCodeAt(index)) >>> 0;
  }
  return hash;
}

export function getTypeColor(type) {
  if (!type || type === "未分类") {
    return "default";
  }

  const hash = hashText(type);
  return TAG_COLOR_PALETTE[hash % TAG_COLOR_PALETTE.length];
}
