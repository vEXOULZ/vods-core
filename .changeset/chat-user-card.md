---
"@vexoulz/vods-core": minor
---

Chat replay: clicking a chatter's name opens their user card (platform-web's `UserCard`): picture, Twitch id, account
age, partner or affiliate, bio and a link to their channel. `createVodsApp({ userLookupUrl })` names doomtp-bot's
`/api/v2/twitch/users` for the profiles (the site's origin must be in the bot's USER_LOOKUP_ORIGINS); unset, the card
shows what the chat line knows. Live (bot) chat looks a chatter up by id, VOD chat by username; a VOD-chat name that
isn't plain ASCII has no username, so its card says so. `ChatMessage.userId` comes from the archive's `user_id`. Needs
@vexoulz/platform-web 0.8.0.
