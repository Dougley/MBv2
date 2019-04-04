const db = require('../databases/lokijs')
const ids = require('../megabot-internals/ids')

module.exports = {
  meta: {
    level: 0,
    alias: ['caps']
  },
  fn: (msg) => {
    const data = db.getUser(msg.author.id)
    msg.author.getDMChannel().then(async c => {
      await c.createMessage(generateEmbed(msg.author, data))
      if (msg.channel.guild) return msg.delete()
      else await msg.addReaction(`${ids.emojis.confirm.name}:${ids.emojis.confirm.id}`)
    }).catch(() => {
      msg.channel.createMessage("Failed to DM you, make sure you've enabled them")
    })
  }
}

function generateEmbed (userdata, data) {
  const transactions = data.transactions.filter(x => {
    const then = new Date(x.time)
    const now = new Date()
    return then.getDate() === now.getDate()
  })
  const voteResults = transactions.filter(x => /Voted on ([0-9])+/.test(x.reason)).length
  const commentResults = transactions.filter(x => /Commented on ([0-9])+/.test(x.reason)).length
  const dupeResults = transactions.filter(x => /Merged a suggestion/.test(x.reason)).length
  const submitResults = transactions.filter(x => /Submitted suggestion/.test(x.reason)).length
  return {
    embed: {
      title: `${userdata.username}'s cooldowns`,
      timestamp: new Date(),
      color: 0x15f106,
      footer: {
        icon_url: global.bot.user.dynamicAvatarURL('png', 32),
        text: `MegaBot ${process.env.NODE_ENV === 'debug' ? 'Development version' : 'v' + require('../../package').version}`
      },
      thumbnail: {
        url: `https://cdn.discordapp.com/avatars/${userdata.id}/${userdata.avatar}.png`
      },
      fields: [
        {
          name: 'Votes',
          value: `${MB_CONSTANTS.limits.vote - voteResults}/${MB_CONSTANTS.limits.vote}`,
          inline: true
        },
        {
          name: 'Comments',
          value: `${MB_CONSTANTS.limits.comment - commentResults}/${MB_CONSTANTS.limits.comment}`,
          inline: true
        },
        {
          name: 'Dupe',
          value: `${MB_CONSTANTS.limits.dupe - dupeResults}/${MB_CONSTANTS.limits.dupe}`,
          inline: true
        },
        {
          name: 'Submit',
          value: `${MB_CONSTANTS.limits.submit - submitResults}/${MB_CONSTANTS.limits.submit}`,
          inline: true
        }
      ]
    }
  }
}
