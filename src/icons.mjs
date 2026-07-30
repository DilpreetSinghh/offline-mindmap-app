export const BUILT_IN_ICONS = [
  ["⭐", "Star", "favourite priority important"], ["⚑", "Flag", "milestone priority"], ["💡", "Idea", "insight lightbulb"],
  ["🎯", "Target", "goal objective"], ["✅", "Done", "complete check"], ["⏳", "Waiting", "time pending"],
  ["📌", "Pin", "remember location"], ["🔖", "Bookmark", "save reference"], ["📅", "Calendar", "date schedule"],
  ["📝", "Note", "write document"], ["📚", "Books", "study learn"], ["🎓", "Education", "school university"],
  ["💼", "Work", "business career"], ["📈", "Growth", "finance chart increase"], ["📉", "Decline", "finance chart decrease"],
  ["💰", "Money", "finance investment"], ["🏦", "Bank", "banking finance"], ["🧾", "Receipt", "tax invoice"],
  ["🔍", "Research", "search inspect"], ["🧪", "Experiment", "test science"], ["⚙️", "Settings", "system process"],
  ["🔧", "Fix", "repair tool"], ["🚀", "Launch", "start ship"], ["🧭", "Direction", "strategy compass"],
  ["🗺️", "Map", "plan route"], ["🔗", "Link", "connection relationship"], ["🧩", "Piece", "component puzzle"],
  ["🌱", "Seed", "new growth"], ["🌳", "Tree", "mature growth hierarchy"], ["🌍", "World", "global earth"],
  ["☀️", "Sun", "positive daytime"], ["🌧️", "Rain", "risk weather"], ["🔥", "Hot", "urgent trend"],
  ["⚡", "Energy", "fast power"], ["❤️", "Heart", "love care"], ["🧠", "Mind", "thinking knowledge"],
  ["👤", "Person", "user owner"], ["👥", "Team", "people group"], ["🏠", "Home", "house personal"],
  ["📞", "Call", "phone contact"], ["✉️", "Message", "email communication"], ["🔒", "Private", "security lock"],
  ["⚠️", "Warning", "risk caution"], ["❓", "Question", "unknown doubt"], ["❗", "Important", "alert attention"],
  ["➕", "Add", "new plus"], ["➖", "Remove", "minus reduce"], ["➡️", "Next", "forward right"],
].map(([emoji, name, keywords]) => ({ emoji, name, keywords }));

export function searchBuiltInIcons(query) {
  const value = String(query ?? "").trim().toLowerCase();
  return BUILT_IN_ICONS.filter((icon) => !value || `${icon.emoji} ${icon.name} ${icon.keywords}`.toLowerCase().includes(value));
}

export function builtInIconName(emoji) {
  return BUILT_IN_ICONS.find((icon) => icon.emoji === emoji)?.name ?? "";
}
