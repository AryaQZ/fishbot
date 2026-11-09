# Single-server Fish Game Bot

Discord fishing mini-game for one guild. The app, configuration, and SQLite database live in this folder. Game data is stored in `data/fish-game.sqlite` and survives Ctrl+C and restart.

## Requirements

- Node.js 20 or newer
- A Discord application and bot created in the Discord Developer Portal
- Bot invited to your server with `applications.commands` and permission to use application commands/send messages

## First run (Windows PowerShell)

```powershell
cd C:\path\to\fish-game-discord-bot
Copy-Item .env.example .env
notepad .env
npm install
npm run register
npm run start
```

Fill in `DISCORD_TOKEN`, `CLIENT_ID`, `GUILD_ID`, and `ADMIN_USER_IDS` in `.env`. Keep `.env` private. Guild commands are registered only for the configured server; the running bot also rejects commands from any other guild.

## Stop and resume

Press `Ctrl+C` in the bot terminal. The process closes SQLite cleanly. To resume, run:

```powershell
npm run start
```

Do not delete the `data` folder if you want to keep player progress. To remove the whole app and its saved data together, delete this `fish-game-discord-bot` folder. Back up the folder before moving or reinstalling the app.

## Commands

- `/fish`, `/inventory`, `/sell`, `/profile`, `/daily`, `/leaderboard`. `/inventory` supports single-fish and bulk favorite/unfavorite/lock/unlock by all owned fish, fish rarity tier, mutated fish, mutation tier, all Shiny fish, or Shiny fish rarity tier. Bulk changes require confirmation. Applying protection cancels matching open offers/listings; removing one protection leaves the other active and does not restore cancelled listings. `/sell` can target a fish species and optional quantity.
- `/give money` and `/give fish` let any player immediately transfer their own coins or unprotected, unreserved fish to another player without a trade offer.
- `/trade offer|inbox|sent|accept|decline|cancel` for direct player-to-player fish offers
- `/market sell|browse|mine|buy|cancel` for public fish listings. Listings last 7 days; fish committed to an active trade or listing are reserved from other sales. Buy transfers fish and coins together.
- `/shop browse|buy|inventory|equip|unequip` for rods, bobbers, and pellets. Rods and bobbers are permanent; pellets are consumed on a catch. Better gear grants Luck and/or Power bonuses.
- `/skills status|upgrade` for Luck and Power. Every player level grants one point; Luck shifts catch odds toward rarer fish and grants up to a 15% chance for one extra fish per cast, while Power increases possible catch weight. Both skills cap at level 1000. Mythic starts at 0.1% per cast and reaches at most about 0.5% with ordinary Luck and gear; Admin Abuse adds a separate diminishing rarity bonus. Each cast is an independent roll with no pity counter or guaranteed catch count; `/skills status` shows current chances.
- `/submit` and `/my-submissions` for user-generated content proposals
- `/ugc queue|approve|reject` for moderators

Trade offers expire after 24 hours. Market listings expire after 7 days. Both transfers check stock and balance before moving fish and coins atomically. Cancel pending offers/listings with their ID to free the reserved fish.

Approved UGC proposals are recorded but do not automatically change the game. That keeps human review in the loop until a safe content-publishing workflow is added.

## Data and permissions

The bot uses only the Guilds intent and application commands. It does not read general server message history. SQLite database, WAL, and SHM files are kept under this app's `data` folder. Only grant the bot the permissions it needs; never share the bot token.
