const { readFileSync } = require('node:fs')

const groups = { Added: [], Fixed: [], Changed: [] }
for (const line of readFileSync(process.argv[2], 'utf8').split('\n')) {
  const subject = line.trim()
  if (!subject || /^release v/i.test(subject)) continue
  const group = /^add\b/i.test(subject) ? 'Added' : /^fix\b/i.test(subject) ? 'Fixed' : 'Changed'
  groups[group].push(`- ${subject}`)
}
const notes = Object.entries(groups)
  .filter(([, items]) => items.length)
  .map(([title, items]) => `**${title}**\n${items.join('\n')}`)
  .join('\n\n')
console.log(notes || 'Small fixes and improvements.')
