// Short unique IDs for tables, nodes, sections
export function makeId(prefix = '') {
  const base = Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4)
  return prefix ? `${prefix}_${base}` : base
}

// Compute the next localNumber for a section, filling gaps
export function nextLocalNumber(nodes, sectionId) {
  const used = new Set(
    nodes.filter((n) => n.sectionId === sectionId).map((n) => n.localNumber)
  )
  let n = 1
  while (used.has(n)) n++
  return n
}

// Get the display label for a node based on its section's prefix settings
export function displayNodeLabel(node, sections) {
  const s = sections.find((x) => x.id === node.sectionId)
  if (!s) return String(node.localNumber)
  if (s.showPrefix && s.prefix) return `${s.prefix}-${node.localNumber}`
  return String(node.localNumber)
}
