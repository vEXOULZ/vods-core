---
"@vexoulz/vods-core": minor
---

Chat replay: clicking a chatter's name opens their user card (platform-web's `UserCard`): picture, Twitch id, account
age, followers, roles, bio and a link to their channel. Live (bot) chat looks them up by id, VOD chat by username;
a VOD-chat name that isn't plain ASCII has no username, so its card says so. `ChatMessage.userId` comes from the
archive's `user_id`. Needs @vexoulz/platform-web 0.8.0.
