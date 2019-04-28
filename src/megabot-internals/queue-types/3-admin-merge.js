const perms = require('../../features/perms')
const xp = require('../../features/exp')
const ids = require('../ids')
const zd = require('../zendesk')
const dlog = require('../dlog')
const db = require('../../databases/lokijs')

module.exports = async (question, user, emoji, msg, userID) => {
  if (!perms(2, user, msg)) return
  if (emoji.id === ids.emojis.confirm.id) {
    dlog(5, {
      user: user,
      action: 'confirmed',
      zd_id: `${question.ids.dupe} > ${question.ids.target}`
    })
    msg.edit({ content: 'Report confirmed, cards will be merged.', embed: null }).then(async x => {
      await zd.createComment({
        discordId: userID,
        id: question.ids.dupe
      }, {
        body: MB_CONSTANTS.strings.dupe(question.ids.target),
        official: true
      })
      await zd.editSubmission(question.ids.dupe, {
        status: 'answered',
        closed: true
      })
      const votes = await getAllVotes(question.ids.dupe)
      const comments = await getAllComments(question.ids.dupe)
      votes.forEach(x => {
        // zd.applyVote(x.userId, question.ids.target, x.value > 0 ? 'up' : 'down', true)
        zd.applyVote({
          priority: 9, // low priority
          cardId: question.ids.target,
          type: x.value > 0 ? 'up' : 'down'
        }, {
          user_id: x.userId
        })
      })
      comments.forEach(x => {
        zd.createComment({
          id: question.ids.target,
          priority: 9 // low priority
        }, {
          body: x.rawContent,
          author_id: x.authorId,
          created_at: x.createdAt
        })
      })
      db.create('system', {
        type: 'dupe-delete',
        zd_id: question.ids.dupe,
        executeTime: Date.now() + 604800000 // 1 week
      })
      xp.processHolds(msg.id, 4)
      setTimeout(() => {
        x.delete()
      }, MB_CONSTANTS.timeouts.queueDelete)
    })
    db.delete('questions', msg.id)
  } else if (emoji.id === ids.emojis.reverse.id) {
    dlog(5, {
      user: user,
      action: 'reverse-confirmed',
      zd_id: `${question.ids.dupe} > ${question.ids.target}`
    })
    msg.edit({ content: 'Report confirmed, cards will be flip-merged.', embed: null }).then(async x => {
      await zd.createComment({
        discordId: userID,
        id: question.ids.target
      }, {
        body: MB_CONSTANTS.strings.dupe(question.ids.dupe),
        official: true
      })
      await zd.editSubmission(question.ids.target, {
        status: 'answered',
        closed: true
      })
      const votes = await getAllVotes(question.ids.target)
      const comments = await getAllComments(question.ids.target)
      votes.forEach(x => {
        zd.applyVote({
          priority: 9, // low priority
          cardId: question.ids.dupe,
          type: x.value > 0 ? 'up' : 'down'
        }, {
          user_id: x.userId
        })
      })
      comments.forEach(x => {
        zd.createComment({
          id: question.ids.dupe,
          priority: 9 // low priority
        }, {
          body: x.rawContent,
          author_id: x.authorId,
          created_at: x.createdAt
        })
      })
      db.create('system', {
        type: 'dupe-delete',
        zd_id: question.ids.target,
        executeTime: Date.now() + 604800000 // 1 week
      })
      xp.processHolds(msg.id, 4)
      setTimeout(() => {
        x.delete()
      }, MB_CONSTANTS.timeouts.queueDelete)
    })
    db.delete('questions', msg.id)
  } else if (emoji.id === ids.emojis.dismiss.id) {
    dlog(5, {
      user: user,
      action: 'dismissed',
      zd_id: `${question.ids.dupe} > ${question.ids.target}`
    })
    bot.createMessage(ids.deniedFeed, {
      content: `${user.username} denied the following merge request`,
      embed: msg.embeds[0]
    })
    msg.edit({ content: 'Report dismissed, left cards untouched.', embed: null }).then(x => {
      xp.processHolds(msg.id, 5)
      setTimeout(() => {
        x.delete()
      }, MB_CONSTANTS.timeouts.queueDelete)
    })
    db.delete('questions', msg.id)
  }
}

const getAllVotes = async (id) => {
  let votes = []
  let keepGoing = true
  let page = 1
  while (keepGoing) {
    let data = await zd.getVotes(id, {
      page: page,
      priority: 9
    })
    await votes.push.apply(votes, data)
    if (data[0] && data[0].pagination.nextPage !== null) page++
    else keepGoing = false
  }
  return votes
}

const getAllComments = async (id) => {
  let comments = []
  let keepGoing = true
  let page = 1
  while (keepGoing) {
    let data = await zd.listComments(id, {
      page: page,
      priority: 9
    })
    await comments.push.apply(comments, data)
    if (data[0] && data[0].pagination.nextPage !== null) page++
    else keepGoing = false
  }
  return comments.filter(x => !x.official)
}
