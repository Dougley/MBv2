const { commands, alias } = require('../wildbeast-internals/command-loader')
const timeout = require('../features/timeout')
const perms = require('../features/perms')
const inq = require('../megabot-internals/controllers/inquirer')
const { touch, applyEXP, getEXP } = require('../features/exp')
const dlog = require('../megabot-internals/dlog')
const ids = require('../megabot-internals/ids')
const zd = require('../megabot-internals/zendesk')

module.exports = async (ctx) => {
  const msg = ctx[0]
  if (msg.author.bot) return
  const prefix = process.env.BOT_PREFIX
  if (msg.channel.guild) {
    if (!msg.content.startsWith(prefix)) {
      if (msg.content.match(MB_CONSTANTS.commentRegex)) {
        const matches = [...msg.content.match((MB_CONSTANTS.commentRegex))]
        zd.getComment(matches[1], matches[2]).then(() => inq.createCommentReporter(msg, matches[2], matches[1])).catch(() => {})
      } else if (msg.content.match(MB_CONSTANTS.submissionRegex)) {
        zd.getSubmission(msg.content.match(MB_CONSTANTS.submissionRegex)[1]).then(() => inq.createChatvote(msg, msg.content.match(MB_CONSTANTS.submissionRegex)[1])).catch(() => {})
      }
    }
    if (perms(0, msg.member, msg)) touch(msg.author.id, !msg.member.roles.includes(ids.custodianRole))
  }
  if (msg.content.startsWith(prefix)) {
    let cmd = msg.content.substr(prefix.length).split(' ')[0].toLowerCase()
    if (alias.has(cmd)) cmd = alias.get(cmd)
    if (commands[cmd]) {
      if (MB_CONSTANTS.limiter.stopped) {
        if (!ids.modRoles.some(x => msg.member.roles.includes(x))) return msg.channel.createMessage("I'm currently unable to process your request, try again later")
      }
      const suffix = msg.content.substr(prefix.length).split(' ').slice(1).join(' ')
      if (!msg.channel.guild) {
        if (commands[cmd].meta.noDM) return msg.channel.createMessage('You cannot use this command in DMs')
      } else {
        if (commands[cmd].meta.onlyDM) return msg.channel.createMessage('This command is only usable in DMs')
      }
      if (commands[cmd].meta.cost) {
        const data = await getEXP(msg.author.id)
        if (parseInt(data) < commands[cmd].meta.cost) return msg.channel.createMessage(`You don't have enough EXP to use this command.\nYou need \`${commands[cmd].meta.cost}\` but you have \`${data}\``)
      }
      let time = true
      if (commands[cmd].meta.timeout) time = timeout.calculate(msg.author.id, cmd, commands[cmd].meta.timeout)
      if (time !== true) return msg.channel.createMessage(`This command is still on cooldown, try again in ${Math.floor(time)} seconds.`)
      const allowed = (commands[cmd].meta.forceDM && !msg.channel.guild) ? true : perms(commands[cmd].meta.level, (msg.channel.guild ? msg.member : msg.author), msg)
      global.logger.debug(`Access: ${allowed}`)
      if (allowed) {
        try {
          commands[cmd].fn(msg, suffix)
          if (commands[cmd].meta.cost) {
            if (msg.channel.guild && !ids.modRoles.some(x => msg.member.roles.includes(x))) {
              applyEXP(msg.author.id, -Math.abs(commands[cmd].meta.cost), `Used ${cmd}`)
            }
          }
        } catch (e) {
          global.logger.error(e)
          msg.channel.createMessage('An error occurred processing this command, please try again later.')
        } finally {
          dlog(1, {
            user: msg.author,
            cmd: msg.content
          })
          global.logger.command({
            cmd: cmd,
            opts: suffix,
            m: msg
          })
        }
      } else {
        dlog(3, {
          user: msg.author,
          cmd: cmd
        })
      }
    }
  }
}
