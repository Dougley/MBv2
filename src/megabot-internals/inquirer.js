const { Message } = require('eris')
const ids = require('./ids')

const db = require('../databases/lokijs')
const zd = require('./zendesk')

module.exports = {
  createQuestion: (channel, opts) => {
    channel.createMessage(generateEmbed(opts, 'created')).then(c => {
      c.addReaction(`${ids.emojis.confirm.name}:${ids.emojis.confirm.id}`)
      c.addReaction(`${ids.emojis.dismiss.name}:${ids.emojis.dismiss.id}`)
      const stand = { wb_id: c.id }
      const ins = { ...stand, ...opts }
      return db.create('questions', ins)
    })
  },
  createChatvote: (msg, id, reportable = true) => {
    msg.addReaction(`${ids.emojis.upvote.name}:${ids.emojis.upvote.id}`)
    msg.addReaction(`${ids.emojis.downvote.name}:${ids.emojis.downvote.id}`)
    msg.addReaction(`${ids.emojis.xyliumsfavorite.name}:${ids.emojis.xyliumsfavorite.id}`)
    if (reportable) {
      if (!db.findSync('questions', { // prevent duplicates
        type: 2,
        zd_id: id
      })) msg.addReaction(`${ids.emojis.report.name}:${ids.emojis.report.id}`)
      else if (ids.emojis.reported) msg.addReaction(`${ids.emojis.reported.name}:${ids.emojis.reported.id}`)
    }
    const ins = {
      expire: Date.now() + 432000000, // expire in 5 days
      type: 4,
      wb_id: msg.id,
      zd_id: id
    }
    return db.create('questions', ins)
  },
  createTopvote: async (msg, id) => {
    msg.addReaction(`${ids.emojis.upvote.name}:${ids.emojis.upvote.id}`)
    msg.addReaction(`${ids.emojis.downvote.name}:${ids.emojis.downvote.id}`)
    const ins = {
      type: 4,
      wb_id: msg.id,
      zd_id: id
    }
    if (await db.get('questions', msg.id)) return db.edit(msg.id, ins, 'questions')
    else return db.create('questions', ins)
  },
  startAdminAction: async (data, msg) => {
    msg.addReaction(`${ids.emojis.confirm.name}:${ids.emojis.confirm.id}`)
    msg.addReaction(`${ids.emojis.dismiss.name}:${ids.emojis.dismiss.id}`)
    const ins = {
      wb_id: msg.id,
      ...data
    }
    return db.create('questions', ins)
  },
  createFeedvote: async (msg, id) => {
    msg.addReaction(`${ids.emojis.upvote.name}:${ids.emojis.upvote.id}`)
    msg.addReaction(`${ids.emojis.downvote.name}:${ids.emojis.downvote.id}`)
    msg.addReaction(`${ids.emojis.report.name}:${ids.emojis.report.id}`)
    msg.addReaction(`${ids.emojis.xyliumsfavorite.name}:${ids.emojis.xyliumsfavorite.id}`)
    const ins = {
      expire: Date.now() + (604800000 * 2), // expire in 2 weeks
      type: 1,
      wb_id: msg.id,
      zd_id: id
    }
    return db.create('questions', ins)
  },
  verify: async (ctx) => {
    let msg = ctx[0]
    let emoji = ctx[1]
    let userID = ctx[2]

    // dont process our own reactions
    if (userID === global.bot.user.id) return

    // emojis must be custom
    if (!emoji.id) return

    // the emoji must be a whitelisted one
    const emojiids = Object.keys(ids.emojis).map(x => ids.emojis[x].id)
    if (!emojiids.includes(emoji.id)) return

    // the message object can be incomplete
    // check for that first and complete it
    if (!(msg instanceof Message)) msg = await global.bot.getMessage(msg.channel.id, msg.id)
    global.logger.trace(msg)

    const user = msg.channel.guild.members.get(userID) ? msg.channel.guild.members.get(userID) : await msg.channel.guild.getRESTMember(userID)

    db.getQuestion(msg.id).then(async question => {
      if (!question) return
      global.logger.trace(question)

      // this notification might be expired if it has an expiry
      if (question.expire) {
        const then = new Date(question.expire)
        const now = new Date()
        if (now > then) {
          // this notification has definitely expired
          msg.removeReactions()
          return db.delete('questions', msg.id)
        }
      }

      switch (question.type) {
        case 1: { // feed vote
          if (ids.emojis.reported && emoji.id === ids.emoji.reported.id) return msg.removeReaction(`${ids.emojis.report.name}:${ids.emojis.reported.id}`, userID) // no one but us should add this emoji :angery:
          if (emoji === ids.emojis.upvote.id || emoji.id === ids.emojis.downvote.id) zd.applyVote(userID, question.zd_id, (emoji.id === ids.emojis.upvote.id) ? 'up' : 'down')
          else if (emoji.id === ids.emojis.report.id) {
            // this is likely the report reaction
            const perms = require('../features/perms')
            const queue = require('./admin-queue')
            const zd = require('./zendesk')
            if (!perms(1, user, msg)) return msg.removeReaction(`${ids.emojis.report.name}:${ids.emojis.report.id}`, userID)
            else if (msg.reactions[`${ids.emojis.report.name}:${ids.emojis.report.id}`].count === MB_CONSTANTS.thresholds.reports + 1) {
              if (ids.emojis.reported) msg.addReaction(`${ids.emojis.reported.name}:${ids.emojis.reported.id}`)
              queue.createDeletionRequest(await zd.getSubmission(question.zd_id, ['users', 'topics']))
            }
          }
          break
        }
        case 2: { // admin action: destruction
          if (emoji.id === ids.emojis.confirm.id) {
            msg.edit({ content: 'Report confirmed, submission will be destroyed.', embed: null }).then(x => setTimeout(() => { x.delete() }, MB_CONSTANTS.timeouts.queueDelete))
            zd.destroySubmission(question.zd_id).then(() => db.delete('questions', msg.id))
          }
          if (emoji.id === ids.emojis.dismiss.id) {
            msg.edit({ content: 'Report dismissed, no action taken.', embed: null }).then(x => setTimeout(() => { x.delete() }, MB_CONSTANTS.timeouts.queueDelete))
            db.delete('questions', msg.id)
          }
          break
        }
        case 3: { // admin action: merging
          break
        }
        case 4: { // chat vote
          if (emoji === ids.emojis.upvote.id || emoji.id === ids.emojis.downvote.id) zd.applyVote(userID, question.zd_id, (emoji.id === ids.emojis.upvote.id) ? 'up' : 'down')
          else if (emoji.id === ids.emojis.report.id) {
            // this is likely the report reaction
            const perms = require('../features/perms')
            const queue = require('./admin-queue')
            const zd = require('./zendesk')
            if (!perms(1, user, msg)) return msg.removeReaction(`${ids.emojis.report.name}:${ids.emojis.report.id}`, userID)
            else if (msg.reactions[`${ids.emojis.report.name}:${ids.emojis.report.id}`].count === MB_CONSTANTS.thresholds.reports + 1) {
              if (ids.emojis.reported) msg.addReaction(`${ids.emojis.reported.name}:${ids.emojis.reported.id}`)
              queue.createDeletionRequest(await zd.getSubmission(question.zd_id, ['users', 'topics']))
            }
          }
          break
        }
        case 5: { // inquiry
          // some questions are locked to 1 user
          if (question.user && question.user !== userID) return

          if (emoji.id === ids.emojis.confirm.id) {
            db.delete('questions', msg.id)
            msg.edit(generateEmbed(question, 'confirm'))
          }
          if (emoji.id === ids.emojis.dismiss.id) {
            db.delete('questions', msg.id)
            msg.edit(generateEmbed(question, 'dismiss'))
          }
          // we can now safely remove the reactions
          msg.removeReactions()
          // no ids matched? just discard
          break
        }
      }
    })
  }
}

function generateEmbed (data, state) {
  const colors = {
    created: 0x7289DA, // blurple
    expired: 0xf47a37, // orange-ish
    dismiss: 0xe51a23, // red
    confirm: 0x00693f // green
  }
  return {
    embed: {
      color: colors[state],
      description: state === 'created' ? data.question : data.messages[state],
      timestamp: new Date(),
      footer: {
        text: 'Last updated on'
      }
    }
  }
}
