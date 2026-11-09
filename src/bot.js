require('dotenv').config();
const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');
const { Client, GatewayIntentBits, EmbedBuilder, MessageFlags, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const MAX_SKILL_LEVEL=1000;

const required = ['DISCORD_TOKEN','CLIENT_ID','GUILD_ID'];
for (const key of required) if (!process.env[key] || process.env[key].startsWith('put_')) {
  console.error(`Configure ${key} in .env (copy .env.example first).`); process.exit(1);
}
const allowedGuild = process.env.GUILD_ID;
const admins = new Set((process.env.ADMIN_USER_IDS || '').split(',').map(s=>s.trim()).filter(Boolean));
const dataDir = path.join(__dirname, '..', 'data');
fs.mkdirSync(dataDir, {recursive:true});
const db = new Database(path.join(dataDir, 'fish-game.sqlite'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.exec(`
CREATE TABLE IF NOT EXISTS players (
 guild_id TEXT NOT NULL, user_id TEXT NOT NULL, coins INTEGER NOT NULL DEFAULT 0,
 xp INTEGER NOT NULL DEFAULT 0, total_caught INTEGER NOT NULL DEFAULT 0,
 last_fish_at INTEGER NOT NULL DEFAULT 0, daily_claim_at INTEGER NOT NULL DEFAULT 0,
 PRIMARY KEY(guild_id,user_id));
CREATE TABLE IF NOT EXISTS inventory (
 guild_id TEXT NOT NULL, user_id TEXT NOT NULL, fish_name TEXT NOT NULL,
 rarity TEXT NOT NULL, value INTEGER NOT NULL, quantity INTEGER NOT NULL,
 PRIMARY KEY(guild_id,user_id,fish_name,rarity));
CREATE TABLE IF NOT EXISTS fish_preferences (
 guild_id TEXT NOT NULL, user_id TEXT NOT NULL, fish_name TEXT NOT NULL, rarity TEXT NOT NULL,
 favorite INTEGER NOT NULL DEFAULT 0, locked INTEGER NOT NULL DEFAULT 0,
 PRIMARY KEY(guild_id,user_id,fish_name,rarity));
CREATE TABLE IF NOT EXISTS submissions (
 id INTEGER PRIMARY KEY AUTOINCREMENT, guild_id TEXT NOT NULL, user_id TEXT NOT NULL,
 type TEXT NOT NULL, name TEXT NOT NULL, description TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'pending', created_at INTEGER NOT NULL,
 reviewed_by TEXT, reviewed_at INTEGER);
CREATE TABLE IF NOT EXISTS trade_offers (
 id INTEGER PRIMARY KEY AUTOINCREMENT, guild_id TEXT NOT NULL,
 seller_id TEXT NOT NULL, buyer_id TEXT NOT NULL, fish_name TEXT NOT NULL,
 rarity TEXT NOT NULL, quantity INTEGER NOT NULL CHECK(quantity>0),
 price INTEGER NOT NULL CHECK(price>0), status TEXT NOT NULL DEFAULT 'pending',
 created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, completed_at INTEGER);
CREATE INDEX IF NOT EXISTS trade_offers_inbox ON trade_offers(guild_id,buyer_id,status,expires_at);
CREATE INDEX IF NOT EXISTS trade_offers_seller ON trade_offers(guild_id,seller_id,status,created_at);
CREATE TABLE IF NOT EXISTS player_skills (
 guild_id TEXT NOT NULL, user_id TEXT NOT NULL, luck_level INTEGER NOT NULL DEFAULT 1,
 power_level INTEGER NOT NULL DEFAULT 1, skill_points INTEGER NOT NULL DEFAULT 0,
 awarded_level INTEGER NOT NULL DEFAULT 1, best_kg REAL NOT NULL DEFAULT 0,
 PRIMARY KEY(guild_id,user_id));
CREATE TABLE IF NOT EXISTS gear_inventory (
 guild_id TEXT NOT NULL, user_id TEXT NOT NULL, item_key TEXT NOT NULL, quantity INTEGER NOT NULL,
 PRIMARY KEY(guild_id,user_id,item_key));
CREATE TABLE IF NOT EXISTS equipped_gear (
 guild_id TEXT NOT NULL, user_id TEXT NOT NULL, slot TEXT NOT NULL, item_key TEXT NOT NULL,
 PRIMARY KEY(guild_id,user_id,slot));
CREATE TABLE IF NOT EXISTS active_bait (
 guild_id TEXT NOT NULL, user_id TEXT NOT NULL, item_key TEXT NOT NULL, expires_at INTEGER NOT NULL,
 PRIMARY KEY(guild_id,user_id));
CREATE TABLE IF NOT EXISTS market_listings (
 id INTEGER PRIMARY KEY AUTOINCREMENT, guild_id TEXT NOT NULL, seller_id TEXT NOT NULL,
 fish_name TEXT NOT NULL, rarity TEXT NOT NULL, quantity INTEGER NOT NULL CHECK(quantity>0),
 price INTEGER NOT NULL CHECK(price>0), status TEXT NOT NULL DEFAULT 'pending',
 created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, completed_at INTEGER);
CREATE INDEX IF NOT EXISTS market_browse ON market_listings(guild_id,status,expires_at);
CREATE TABLE IF NOT EXISTS fishdex (
 guild_id TEXT NOT NULL, user_id TEXT NOT NULL, fish_name TEXT NOT NULL, rarity TEXT NOT NULL,
 best_kg REAL NOT NULL DEFAULT 0, discovered_at INTEGER NOT NULL,
 PRIMARY KEY(guild_id,user_id,fish_name,rarity));
CREATE TABLE IF NOT EXISTS mutationdex (
 guild_id TEXT NOT NULL, user_id TEXT NOT NULL, mutation_key TEXT NOT NULL,
 caught_count INTEGER NOT NULL DEFAULT 0, best_value INTEGER NOT NULL DEFAULT 0,
 discovered_at INTEGER NOT NULL, PRIMARY KEY(guild_id,user_id,mutation_key));
CREATE TABLE IF NOT EXISTS player_locations (
 guild_id TEXT NOT NULL, user_id TEXT NOT NULL, current_location TEXT NOT NULL DEFAULT 'pond',
 PRIMARY KEY(guild_id,user_id));
CREATE TABLE IF NOT EXISTS unlocked_locations (
 guild_id TEXT NOT NULL, user_id TEXT NOT NULL, location_key TEXT NOT NULL, unlocked_at INTEGER NOT NULL,
 PRIMARY KEY(guild_id,user_id,location_key));
CREATE TABLE IF NOT EXISTS daily_contracts (
 guild_id TEXT NOT NULL, user_id TEXT NOT NULL, day_id TEXT NOT NULL, contract_key TEXT NOT NULL,
 title TEXT NOT NULL, goal_type TEXT NOT NULL, goal_value INTEGER NOT NULL, progress INTEGER NOT NULL DEFAULT 0,
 reward INTEGER NOT NULL, claimed INTEGER NOT NULL DEFAULT 0, target_location TEXT,
 PRIMARY KEY(guild_id,user_id,day_id,contract_key));
CREATE TABLE IF NOT EXISTS game_events (
 guild_id TEXT PRIMARY KEY, event_key TEXT NOT NULL, multiplier REAL NOT NULL,
 duration_ms INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'pending',
 starts_at INTEGER, ends_at INTEGER, updated_at INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS game_event_schedules (
 guild_id TEXT PRIMARY KEY, event_key TEXT NOT NULL, multiplier REAL NOT NULL,
 duration_ms INTEGER NOT NULL, weekday INTEGER NOT NULL, hour INTEGER NOT NULL,
 minute INTEGER NOT NULL DEFAULT 0, timezone TEXT NOT NULL DEFAULT 'Asia/Jakarta',
 first_start_at INTEGER NOT NULL, enabled INTEGER NOT NULL DEFAULT 1, updated_at INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS server_weather (
 guild_id TEXT PRIMARY KEY, weather_key TEXT NOT NULL, started_at INTEGER NOT NULL, ends_at INTEGER NOT NULL
);
`);

const client = new Client({intents:[GatewayIntentBits.Guilds]});
function logInteractionActivity(i){
  if(i.isAutocomplete())return;
  let label=null;
  if(i.isChatInputCommand()){
    label=`/${i.commandName}`;
    try{const subcommand=i.options.getSubcommand(false);if(subcommand)label+=` ${subcommand}`;}catch{}
  }else if(i.isButton()){
    const id=i.customId;
    label=id.startsWith('efish_page:')?'button:pagination':id.startsWith('fishfav:')?'button:fish-protection':id.startsWith('fish_again')?'button:fish-again':id==='fish_inventory'?'button:inventory':'button';
  }
  if(label)console.log(`[${new Date().toISOString()}] ${label} | user=${i.user.username} | guild=${i.guildId||'DM'}`);
}
function logRuntimeError(context,error){
  const code=error?.code||error?.name||'Error';
  const message=String(error?.message||'Unknown error').replace(/https?:\/\/\S+/gi,'[URL redacted]').slice(0,500);
  console.error(`[${new Date().toISOString()}] ${context} (${code}): ${message}`);
}
const rarityTiers=['Common','Uncommon','Rare','Epic','Legendary','Mythic','Celestial','Astral','Eternal'];
const SHINY_CHANCE_PERCENT=0.1;
const mutationCatalog=[
  {key:'saltworn',name:'Saltworn',rarity:'Common',ratePercent:3,valueMultiplier:1.15,description:'Crystalline salt forms along the scales.'},
  {key:'albino',name:'Albino',rarity:'Uncommon',ratePercent:1.2,valueMultiplier:1.3,description:'A pale, rare color variation.'},
  {key:'gilded',name:'Gilded',rarity:'Rare',ratePercent:0.45,valueMultiplier:1.6,description:'The fish shines with a golden sheen.'},
  {key:'spectral',name:'Spectral',rarity:'Epic',ratePercent:0.16,valueMultiplier:2.1,description:'A ghostly, semi-transparent appearance.'},
  {key:'electric',name:'Electric',rarity:'Legendary',ratePercent:0.05,valueMultiplier:3,description:'Charged sparks dance around the fish.'},
  {key:'galaxy',name:'Galaxy',rarity:'Mythic',ratePercent:0.01,valueMultiplier:5,description:'A starfield pattern appears across its body.'},
  {key:'prismatic',name:'Prismatic',rarity:'Celestial',ratePercent:0.0025,valueMultiplier:8,description:'A shifting spectrum of celestial color.'},
  {key:'starborn',name:'Starborn',rarity:'Astral',ratePercent:0.0005,valueMultiplier:12,description:'A moving constellation glimmers across its scales.'},
  {key:'timeless',name:'Timeless',rarity:'Eternal',ratePercent:0.00005,valueMultiplier:20,description:'Its form seems untouched by time.'}
];
const fish = [
  {name:'Minnow',rarity:'Common',value:4,minKg:0.05,maxKg:0.3,location:'pond'},
  {name:'Bluegill',rarity:'Common',value:6,minKg:0.1,maxKg:1.2,location:'pond'},
  {name:'Pond Perch',rarity:'Common',value:7,minKg:0.15,maxKg:0.9,location:'pond'},
  {name:'Mudskipper',rarity:'Common',value:8,minKg:0.05,maxKg:0.6,location:'pond'},
  {name:'Rainbow Trout',rarity:'Uncommon',value:18,minKg:0.4,maxKg:5,location:'pond'},
  {name:'Silver Catfish',rarity:'Uncommon',value:22,minKg:0.5,maxKg:7,location:'pond'},
  {name:'River Pike',rarity:'Uncommon',value:26,minKg:0.8,maxKg:8,location:'pond'},
  {name:'Golden Koi',rarity:'Rare',value:65,minKg:1,maxKg:12,location:'pond'},
  {name:'Crystal Sturgeon',rarity:'Rare',value:95,minKg:2,maxKg:20,location:'pond'},
  {name:'Thunder Eel',rarity:'Epic',value:150,minKg:3,maxKg:35,location:'pond'},
  {name:'Sapphire Gar',rarity:'Epic',value:190,minKg:5,maxKg:45,location:'pond'},
  {name:'Moonlit Sturgeon',rarity:'Legendary',value:240,minKg:5,maxKg:70,location:'pond'},
  {name:'Frostfin Whale',rarity:'Legendary',value:400,minKg:20,maxKg:150,location:'pond'},
  {name:'Ancient Sea Serpent',rarity:'Mythic',value:900,minKg:15,maxKg:250,location:'pond'},
  {name:'Ember Leviathan',rarity:'Mythic',value:1500,minKg:40,maxKg:500,location:'pond'},
  {name:'Starfall Ray',rarity:'Celestial',value:3000,minKg:80,maxKg:1000,location:'pond'},
  {name:'Void Kraken',rarity:'Celestial',value:6000,minKg:100,maxKg:2000,location:'pond'},
  {name:'Silver Shiner',rarity:'Common',value:6,minKg:0.1,maxKg:1.1,location:'river'},
  {name:'Reed Darter',rarity:'Common',value:8,minKg:0.05,maxKg:0.8,location:'river'},
  {name:'Glass Catfish',rarity:'Uncommon',value:24,minKg:0.5,maxKg:6,location:'river'},
  {name:'River Barbel',rarity:'Uncommon',value:28,minKg:0.8,maxKg:8,location:'river'},
  {name:'Emerald Carp',rarity:'Rare',value:80,minKg:1,maxKg:14,location:'river'},
  {name:'Sunscale Perch',rarity:'Rare',value:95,minKg:1.5,maxKg:16,location:'river'},
  {name:'Riptide Eel',rarity:'Epic',value:180,minKg:3,maxKg:32,location:'river'},
  {name:'Stormfin Pike',rarity:'Epic',value:220,minKg:5,maxKg:40,location:'river'},
  {name:'Copperback Sturgeon',rarity:'Legendary',value:360,minKg:12,maxKg:110,location:'river'},
  {name:'Tempest Ray',rarity:'Legendary',value:420,minKg:15,maxKg:130,location:'river'},
  {name:'Azure Leviathan',rarity:'Mythic',value:1300,minKg:30,maxKg:380,location:'river'},
  {name:'River Wyrm',rarity:'Mythic',value:1600,minKg:35,maxKg:450,location:'river'},
  {name:'River Spirit',rarity:'Celestial',value:4000,minKg:70,maxKg:800,location:'river'},
  {name:'Crowned Serpent',rarity:'Celestial',value:5200,minKg:90,maxKg:1200,location:'river'},
  {name:'Lanternfish',rarity:'Common',value:10,minKg:0.1,maxKg:1.4,location:'deep_sea'},
  {name:'Reef Goby',rarity:'Common',value:12,minKg:0.08,maxKg:1.2,location:'deep_sea'},
  {name:'Blue Tuna',rarity:'Uncommon',value:32,minKg:1,maxKg:12,location:'deep_sea'},
  {name:'Silver Marlin',rarity:'Uncommon',value:42,minKg:2,maxKg:18,location:'deep_sea'},
  {name:'Swordfish',rarity:'Rare',value:110,minKg:5,maxKg:40,location:'deep_sea'},
  {name:'Coral Grouper',rarity:'Rare',value:125,minKg:6,maxKg:45,location:'deep_sea'},
  {name:'Storm Eel',rarity:'Epic',value:260,minKg:10,maxKg:90,location:'deep_sea'},
  {name:'Titan Squid',rarity:'Epic',value:310,minKg:15,maxKg:120,location:'deep_sea'},
  {name:'Abyssal Whale',rarity:'Legendary',value:550,minKg:50,maxKg:400,location:'deep_sea'},
  {name:'Ghost Shark',rarity:'Legendary',value:620,minKg:35,maxKg:300,location:'deep_sea'},
  {name:'Deep Kraken',rarity:'Mythic',value:1800,minKg:100,maxKg:700,location:'deep_sea'},
  {name:'Blackwater Leviathan',rarity:'Mythic',value:2200,minKg:120,maxKg:900,location:'deep_sea'},
  {name:'Trench Sovereign',rarity:'Celestial',value:6000,minKg:200,maxKg:1500,location:'deep_sea'},
  {name:'Starless Colossus',rarity:'Celestial',value:7500,minKg:300,maxKg:2000,location:'deep_sea'},
  {name:'Hadal Eelpout',rarity:'Common',value:14,minKg:0.4,maxKg:3,location:'deep_sea'},
  {name:'Lantern Ray',rarity:'Uncommon',value:55,minKg:3,maxKg:28,location:'deep_sea'},
  {name:'Glassfin Shark',rarity:'Rare',value:165,minKg:12,maxKg:90,location:'deep_sea'},
  {name:'Deepfire Angler',rarity:'Epic',value:380,minKg:25,maxKg:210,location:'deep_sea'},
  {name:'Abyss Crownfish',rarity:'Legendary',value:850,minKg:80,maxKg:620,location:'deep_sea'},
  {name:'Pressure Leviathan',rarity:'Mythic',value:2600,minKg:250,maxKg:1700,location:'deep_sea'},
  {name:'Nullstar Serpent',rarity:'Celestial',value:9200,minKg:500,maxKg:3400,location:'deep_sea'},
  {name:'Deep Orbit Whale',rarity:'Astral',value:18000,minKg:900,maxKg:6500,location:'deep_sea'},
  {name:'Trench Star Eater',rarity:'Astral',value:24000,minKg:1200,maxKg:8200,location:'deep_sea'},
  {name:'Moonpool Anchovy',rarity:'Common',value:16,minKg:0.2,maxKg:2.5,location:'twilight_reef'},
  {name:'Glasswing Butterflyfish',rarity:'Uncommon',value:62,minKg:1.5,maxKg:24,location:'twilight_reef'},
  {name:'Pearlback Ray',rarity:'Rare',value:190,minKg:8,maxKg:95,location:'twilight_reef'},
  {name:'Tideglass Dragon',rarity:'Epic',value:480,minKg:20,maxKg:230,location:'twilight_reef'},
  {name:'Lunar Crownfish',rarity:'Legendary',value:1150,minKg:70,maxKg:700,location:'twilight_reef'},
  {name:'Moonfall Leviathan',rarity:'Mythic',value:3100,minKg:220,maxKg:1900,location:'twilight_reef'},
  {name:'Tidal Stargazer',rarity:'Celestial',value:10500,minKg:480,maxKg:3600,location:'twilight_reef'},
  {name:'Eclipse Manta',rarity:'Astral',value:22000,minKg:950,maxKg:7000,location:'twilight_reef'},
  {name:'Rift Goblinfish',rarity:'Common',value:20,minKg:0.3,maxKg:3.2,location:'abyssal_chasm'},
  {name:'Blackfin Lanternshark',rarity:'Uncommon',value:78,minKg:2,maxKg:30,location:'abyssal_chasm'},
  {name:'Gloomscale Grouper',rarity:'Rare',value:240,minKg:10,maxKg:120,location:'abyssal_chasm'},
  {name:'Obsidian Angler',rarity:'Epic',value:620,minKg:35,maxKg:260,location:'abyssal_chasm'},
  {name:'Gravemaw Shark',rarity:'Legendary',value:1550,minKg:100,maxKg:850,location:'abyssal_chasm'},
  {name:'Abyss Heart Colossus',rarity:'Mythic',value:4300,minKg:320,maxKg:2300,location:'abyssal_chasm'},
  {name:'Eventide Dragonfish',rarity:'Celestial',value:13500,minKg:600,maxKg:4200,location:'abyssal_chasm'},
  {name:'Darkmatter Whale',rarity:'Astral',value:28000,minKg:1200,maxKg:8500,location:'abyssal_chasm'},
  {name:'Abyss Eternal',rarity:'Eternal',value:52000,minKg:1800,maxKg:12000,location:'abyssal_chasm'},
  {name:'Comet Shrimp',rarity:'Common',value:22,minKg:0.15,maxKg:2.8,location:'astral_expanse'},
  {name:'Starwake Flyingfish',rarity:'Uncommon',value:90,minKg:1.2,maxKg:35,location:'astral_expanse'},
  {name:'Nebula Ray',rarity:'Rare',value:300,minKg:12,maxKg:150,location:'astral_expanse'},
  {name:'Quasar Eel',rarity:'Epic',value:780,minKg:40,maxKg:320,location:'astral_expanse'},
  {name:'Supernova Sturgeon',rarity:'Legendary',value:2100,minKg:140,maxKg:1000,location:'astral_expanse'},
  {name:'Astral Leviathan',rarity:'Mythic',value:6200,minKg:420,maxKg:3000,location:'astral_expanse'},
  {name:'Universe Serpent',rarity:'Celestial',value:19000,minKg:800,maxKg:5200,location:'astral_expanse'},
  {name:'Galactic Sovereign',rarity:'Astral',value:38000,minKg:1600,maxKg:10500,location:'astral_expanse'},
  {name:'Origin Kraken',rarity:'Eternal',value:68000,minKg:2500,maxKg:15000,location:'astral_expanse'},
  {name:'Dawnfin Minnow',rarity:'Common',value:11,minKg:0.08,maxKg:0.7,location:'pond',weather:'hot'},
  {name:'Sunflare Carp',rarity:'Rare',value:125,minKg:1.5,maxKg:20,location:'river',weather:'hot'},
  {name:'Solar Lanternfish',rarity:'Epic',value:330,minKg:12,maxKg:95,location:'deep_sea',weather:'hot'},
  {name:'Raincaller Carp',rarity:'Uncommon',value:34,minKg:0.5,maxKg:9,location:'pond',weather:'spring'},
  {name:'Monsoon Pike',rarity:'Epic',value:260,minKg:5,maxKg:65,location:'river',weather:'spring'},
  {name:'Cloudburst Marlin',rarity:'Legendary',value:900,minKg:28,maxKg:250,location:'deep_sea',weather:'spring'},
  {name:'Mistveil Perch',rarity:'Rare',value:120,minKg:1,maxKg:16,location:'pond',weather:'cold'},
  {name:'Veilfin Eel',rarity:'Epic',value:240,minKg:4,maxKg:48,location:'river',weather:'cold'},
  {name:'Phantom Angler',rarity:'Legendary',value:940,minKg:40,maxKg:270,location:'deep_sea',weather:'cold'},
  {name:'Amber Minnow',rarity:'Epic',value:175,minKg:1.5,maxKg:32,location:'pond',weather:'autumn'},
  {name:'Windfall Sturgeon',rarity:'Legendary',value:620,minKg:20,maxKg:155,location:'river',weather:'autumn'},
  {name:'Autumn Glass Shark',rarity:'Mythic',value:3600,minKg:180,maxKg:1150,location:'deep_sea',weather:'autumn'},
  {name:'Aurora Ray',rarity:'Celestial',value:12500,minKg:500,maxKg:3200,location:'deep_sea',weather:'cold'},
  {name:'Borealis Manta',rarity:'Celestial',value:18000,minKg:750,maxKg:4400,location:'twilight_reef',weather:'cold'},
  {name:'Polar Leviathan',rarity:'Astral',value:42000,minKg:1400,maxKg:9000,location:'abyssal_chasm',weather:'cold'},
  {name:'Eon Aurora Serpent',rarity:'Eternal',value:105000,minKg:3000,maxKg:18000,location:'astral_expanse',weather:'cold'},
  {name:'Glintsilver Darter',rarity:'Uncommon',value:24,minKg:0.2,maxKg:3.8,location:'pond',weather:'hot'},
  {name:'Suncrest Sturgeon',rarity:'Legendary',value:520,minKg:18,maxKg:145,location:'river',weather:'hot'},
  {name:'Solar Leviathan',rarity:'Mythic',value:2800,minKg:180,maxKg:1500,location:'deep_sea',weather:'hot'},
  {name:'Helios Stargazer',rarity:'Celestial',value:14500,minKg:650,maxKg:3900,location:'twilight_reef',weather:'hot'},
  {name:'Daybreak Sovereign',rarity:'Astral',value:35000,minKg:1350,maxKg:9000,location:'abyssal_chasm',weather:'hot'},
  {name:'Firstlight Eternal',rarity:'Eternal',value:82000,minKg:2600,maxKg:16000,location:'astral_expanse',weather:'hot'},
  {name:'Raindrop Minnow',rarity:'Common',value:9,minKg:0.05,maxKg:0.5,location:'pond',weather:'spring'},
  {name:'Cloudscale Carp',rarity:'Rare',value:105,minKg:1,maxKg:15,location:'pond',weather:'spring'},
  {name:'Monsoon Leviathan',rarity:'Mythic',value:2600,minKg:160,maxKg:1400,location:'deep_sea',weather:'spring'},
  {name:'Rainstar Manta',rarity:'Celestial',value:13000,minKg:520,maxKg:3500,location:'twilight_reef',weather:'spring'},
  {name:'Tempest Star Eel',rarity:'Astral',value:32000,minKg:1250,maxKg:8400,location:'abyssal_chasm',weather:'spring'},
  {name:'Stormsea Eternal',rarity:'Eternal',value:79000,minKg:2400,maxKg:15500,location:'astral_expanse',weather:'spring'},
  {name:'Mistdrop Minnow',rarity:'Common',value:10,minKg:0.07,maxKg:0.55,location:'pond',weather:'cold'},
  {name:'Veilback Catfish',rarity:'Uncommon',value:30,minKg:0.7,maxKg:7.5,location:'river',weather:'cold'},
  {name:'Wraith Leviathan',rarity:'Mythic',value:2900,minKg:190,maxKg:1550,location:'deep_sea',weather:'cold'},
  {name:'Pale Moonray',rarity:'Celestial',value:15200,minKg:700,maxKg:4100,location:'twilight_reef',weather:'cold'},
  {name:'Fogbound Emperor',rarity:'Astral',value:37000,minKg:1450,maxKg:9300,location:'abyssal_chasm',weather:'cold'},
  {name:'Eternal Mist Wyrm',rarity:'Eternal',value:87000,minKg:2750,maxKg:16500,location:'astral_expanse',weather:'cold'},
  {name:'Saffron Minnow',rarity:'Common',value:12,minKg:0.06,maxKg:0.6,location:'pond',weather:'autumn'},
  {name:'Windrider Bluegill',rarity:'Uncommon',value:29,minKg:0.4,maxKg:6.5,location:'pond',weather:'autumn'},
  {name:'Amber Koi',rarity:'Rare',value:135,minKg:1.5,maxKg:18,location:'river',weather:'autumn'},
  {name:'Fallingleaf Crownfish',rarity:'Celestial',value:16000,minKg:720,maxKg:4300,location:'deep_sea',weather:'autumn'},
  {name:'Duskfall Sovereign',rarity:'Astral',value:39000,minKg:1550,maxKg:9600,location:'abyssal_chasm',weather:'autumn'},
  {name:'Eternal Leaf Serpent',rarity:'Eternal',value:93000,minKg:2900,maxKg:17500,location:'astral_expanse',weather:'autumn'},
  {name:'Aurora Fry',rarity:'Common',value:13,minKg:0.06,maxKg:0.65,location:'pond',weather:'cold'},
  {name:'Glacier Glowfin',rarity:'Uncommon',value:33,minKg:0.5,maxKg:8,location:'pond',weather:'cold'},
  {name:'Opal Icefish',rarity:'Rare',value:145,minKg:1.6,maxKg:19,location:'river',weather:'cold'},
  {name:'Boreal Glass Eel',rarity:'Epic',value:290,minKg:5,maxKg:72,location:'river',weather:'cold'},
  {name:'Nightlight Marlin',rarity:'Legendary',value:1050,minKg:35,maxKg:280,location:'deep_sea',weather:'cold'},
  {name:'Boreal Drift Leviathan',rarity:'Mythic',value:3400,minKg:210,maxKg:1650,location:'deep_sea',weather:'cold'}
];
const locationCatalog={
  pond:{name:'Server Pond',level:1,cost:0,description:'The starting pond, full of familiar fish.',mutationsEnabled:false},
  river:{name:'Silver River',level:10,cost:1500,description:'A fast current with river-exclusive fish.',mutationsEnabled:false},
  deep_sea:{name:'Deep Sea Trench',level:25,cost:12000,description:'A late-game trench with Astral fish and mutation rolls.',mutationsEnabled:true},
  twilight_reef:{name:'Twilight Reef',level:35,cost:35000,description:'A lightless reef where rare Astral fish drift below the shelf.',mutationsEnabled:true},
  abyssal_chasm:{name:'Abyssal Chasm',level:55,cost:120000,description:'A pressure-scarred rift that hides the first Eternal fish.',mutationsEnabled:true},
  astral_expanse:{name:'Astral Expanse',level:80,cost:300000,description:'The endgame current where Astral and Eternal species roam.',mutationsEnabled:true}
};
const weatherCatalog={
  cold:{name:'Dingin',emoji:'❄️',weight:25,minMinutes:20,maxMinutes:35,description:'Air mendingin; ikan es dan ikan bercahaya muncul lebih dalam.'},
  hot:{name:'Panas',emoji:'☀️',weight:25,minMinutes:25,maxMinutes:45,description:'Matahari terik membuka jalur ikan penghuni air hangat.'},
  spring:{name:'Semi',emoji:'🌱',weight:25,minMinutes:20,maxMinutes:40,description:'Arus baru membawa ikan sungai dan laut ke area pancing.'},
  autumn:{name:'Gugur',emoji:'🍂',weight:25,minMinutes:20,maxMinutes:35,description:'Angin dan arus gugur mengundang ikan migrasi.'}
};
function parseFishVariantName(name){
  let baseName=String(name||'').trim(),isShiny=false,mutation=null,changed=true;
  while(changed){
    changed=false;
    if(!isShiny&&baseName.toLowerCase().startsWith('shiny ')){isShiny=true;baseName=baseName.slice(6).trim();changed=true;continue;}
    if(!mutation){const found=mutationCatalog.find(item=>baseName.toLowerCase().startsWith(`${item.name.toLowerCase()} `));if(found){mutation=found;baseName=baseName.slice(found.name.length).trim();changed=true;}}
  }
  return {baseName,isShiny,mutation};
}
function fishVariantName(baseName,isShiny=false,mutation=null){
  return [...(mutation?[mutation.name]:[]),...(isShiny?['Shiny']:[]),baseName].join(' ');
}
function resolveFishSpecies(name){
  if(typeof name!=='string')return null;
  const parsed=parseFishVariantName(name),species=fish.find(item=>item.name.toLowerCase()===parsed.baseName.toLowerCase());
  return species?{...species,name:fishVariantName(species.name,parsed.isShiny,parsed.mutation),baseName:species.name,isShiny:parsed.isShiny,mutation:parsed.mutation}:null;
}
function getMutationBoost(...items){return Math.min(0.75,items.reduce((sum,item)=>sum+(item?.mutationBoost||0),0));}
function rollFishMutation(boost=0){
  let roll=Math.random()*100;
  const scale=1+Math.min(0.75,Math.max(0,boost));
  for(const mutation of [...mutationCatalog].reverse()){
    const chance=mutation.ratePercent*scale;
    if(roll<chance)return mutation;
    roll-=chance;
  }
  return null;
}
const player = db.prepare('INSERT OR IGNORE INTO players(guild_id,user_id) VALUES(?,?)');
function getPlayer(g,u){ player.run(g,u); return db.prepare('SELECT * FROM players WHERE guild_id=? AND user_id=?').get(g,u); }
function getCurrentLocation(g,u){
  const now=Date.now();
  db.prepare('INSERT OR IGNORE INTO player_locations(guild_id,user_id,current_location) VALUES(?,?,?)').run(g,u,'pond');
  db.prepare('INSERT OR IGNORE INTO unlocked_locations(guild_id,user_id,location_key,unlocked_at) VALUES(?,?,?,?)').run(g,u,'pond',now);
  return db.prepare('SELECT current_location FROM player_locations WHERE guild_id=? AND user_id=?').get(g,u).current_location;
}
function currentContractDayKey(now=Date.now()){
  const bangkokOffset=7*60*60*1000;
  return new Date(now+bangkokOffset).toISOString().slice(0,10);
}
function ensureDailyContracts(g,u){
  const day=currentContractDayKey(),count=db.prepare('SELECT COUNT(*) AS n FROM daily_contracts WHERE guild_id=? AND user_id=? AND day_id=?').get(g,u,day).n;
  if(count)return day;
  const location=getCurrentLocation(g,u),rotation=Math.floor(Date.parse(`${day}T00:00:00+07:00`)/86_400_000)%3;
  const contracts=[
    {key:'fish_any',title:`Catch ${30+rotation*5} fish today`,type:'any',goal:30+rotation*5,reward:150+rotation*50,zone:null},
    {key:'rare_plus',title:`Catch ${3+rotation} Rare-or-better fish today`,type:'rare',goal:3+rotation,reward:250+rotation*50,zone:null},
    {key:'fish_zone',title:`Catch ${15+rotation*5} fish at ${locationCatalog[location].name}`,type:'zone',goal:15+rotation*5,reward:200+rotation*50,zone:location}
  ];
  const insert=db.prepare('INSERT INTO daily_contracts(guild_id,user_id,day_id,contract_key,title,goal_type,goal_value,reward,target_location) VALUES(?,?,?,?,?,?,?,?,?)');
  const tx=db.transaction(()=>{
    db.prepare('DELETE FROM daily_contracts WHERE guild_id=? AND user_id=? AND day_id<?').run(g,u,day);
    for(const item of contracts)insert.run(g,u,day,item.key,item.title,item.type,item.goal,item.reward,item.zone);
  });tx();
  return day;
}
function trackCatchContracts(g,u,caught,location){
  const day=currentContractDayKey();
  db.prepare("UPDATE daily_contracts SET progress=MIN(goal_value,progress+1) WHERE guild_id=? AND user_id=? AND day_id=? AND contract_key='fish_any' AND claimed=0").run(g,u,day);
  if(rarityTiers.indexOf(caught.rarity)>=rarityTiers.indexOf('Rare'))db.prepare("UPDATE daily_contracts SET progress=MIN(goal_value,progress+1) WHERE guild_id=? AND user_id=? AND day_id=? AND contract_key='rare_plus' AND claimed=0").run(g,u,day);
  db.prepare("UPDATE daily_contracts SET progress=MIN(goal_value,progress+1) WHERE guild_id=? AND user_id=? AND day_id=? AND contract_key='fish_zone' AND target_location=? AND claimed=0").run(g,u,day,location);
}
function getFishPreference(g,u,name,rarity){return db.prepare('SELECT favorite,locked FROM fish_preferences WHERE guild_id=? AND user_id=? AND fish_name=? AND rarity=?').get(g,u,name,rarity)||{favorite:0,locked:0};}
function isFishProtected(g,u,name,rarity){const pref=getFishPreference(g,u,name,rarity);return !!(pref.favorite||pref.locked);}
function getFishWeights(luck=0,event=null){
  // Ordinary Luck stays capped; Admin Abuse adds a separate soft-scaled bonus.
  const baseShift=Math.min(5,Math.max(0,luck)*0.06);
  const abuseScale=event?.event_key==='admin_abuse_luckboost'?Math.max(0,Math.log10(Math.max(1,event.multiplier))):0;
  const eventShift=5*abuseScale/(1+abuseScale);
  const shift=baseShift+eventShift;
  return [77.9489798-shift*0.800101,18-shift*0.2,3+shift*0.5892,0.8+shift*0.27,0.15+shift*0.06,0.1+shift*0.08,0.001+shift*0.0008,0.00002+shift*0.0001,0.0000002+shift*0.000001];
}
function getMultiCatchChance(luck=0){return Math.min(15,Math.max(0,luck)*0.05);}
function rollFishCatch(luck,location,weatherKey,power,mutationBoost,event){
  const caughtFish=pickFish(luck,location,weatherKey,event),isShiny=Math.random()<SHINY_CHANCE_PERCENT/100;
  const mutation=locationCatalog[location]?.mutationsEnabled?rollFishMutation(mutationBoost):null;
  const f={...caughtFish,name:fishVariantName(caughtFish.name,isShiny,mutation),value:Math.max(1,Math.round(caughtFish.value*(isShiny?2:1)*(mutation?.valueMultiplier||1))),xpValue:caughtFish.value,isShiny,mutation};
  const autoLock=isShiny||!!mutation||rarityTiers.indexOf(caughtFish.rarity)>=rarityTiers.indexOf('Celestial');
  const weightKg=+(f.minKg+Math.random()*(f.maxKg-f.minKg)*(1+power*0.04)).toFixed(2);
  return {caughtFish,f,autoLock,weightKg};
}
function getActiveLuckEvent(g,now=Date.now()){
  return db.prepare("SELECT event_key,multiplier,starts_at,ends_at FROM game_events WHERE guild_id=? AND status='active' AND ends_at>? LIMIT 1").get(g,now)||null;
}
function getEffectiveLuck(baseLuck,g,now=Date.now()){
  const event=getActiveLuckEvent(g,now);
  return {baseLuck,effectiveLuck:event?Math.min(baseLuck*event.multiplier,Number.MAX_VALUE):baseLuck,event};
}
function getLatestScheduledStart(now,schedule){
  const wibOffset=7*60*60_000,local=new Date(now+wibOffset),daysBack=(local.getUTCDay()-schedule.weekday+7)%7;
  let candidate=Date.UTC(local.getUTCFullYear(),local.getUTCMonth(),local.getUTCDate(),schedule.hour,schedule.minute,0,0)-daysBack*86_400_000-wibOffset;
  if(candidate>now)candidate-=7*86_400_000;
  return candidate;
}
function runScheduledLuckEvent(g,now=Date.now()){
  db.prepare("UPDATE game_events SET status='expired',updated_at=? WHERE guild_id=? AND status='active' AND ends_at<=?").run(now,g,now);
  const active=getActiveLuckEvent(g,now);
  if(active)return active;
  const schedule=db.prepare('SELECT event_key,multiplier,duration_ms,weekday,hour,minute,timezone,first_start_at FROM game_event_schedules WHERE guild_id=? AND enabled=1').get(g);
  if(!schedule||schedule.timezone!=='Asia/Jakarta')return null;
  const startsAt=getLatestScheduledStart(now,schedule),endsAt=startsAt+schedule.duration_ms;
  if(startsAt<schedule.first_start_at||now<startsAt||now>=endsAt)return null;
  db.prepare(`INSERT INTO game_events(guild_id,event_key,multiplier,duration_ms,status,starts_at,ends_at,updated_at)
    VALUES(?,?,?,?,'active',?,?,?) ON CONFLICT(guild_id) DO UPDATE SET event_key=excluded.event_key,
    multiplier=excluded.multiplier,duration_ms=excluded.duration_ms,status='active',starts_at=excluded.starts_at,
    ends_at=excluded.ends_at,updated_at=excluded.updated_at`).run(g,schedule.event_key,schedule.multiplier,schedule.duration_ms,startsAt,endsAt,now);
  const activeEvent={event_key:schedule.event_key,multiplier:schedule.multiplier,starts_at:startsAt,ends_at:endsAt};
  console.log(`[${new Date().toISOString()}] Scheduled luck event ${activeEvent.event_key} started: x${activeEvent.multiplier} Luck until ${new Date(activeEvent.ends_at).toISOString()}.`);
  return activeEvent;
}
function armLuckEventSchedule(g){
  runScheduledLuckEvent(g);
  if(!luckEventScheduleTimer){
    luckEventScheduleTimer=setInterval(()=>{
      try{runScheduledLuckEvent(g);}catch(error){logRuntimeError('Luck event schedule error',error);}
    },15_000);
    luckEventScheduleTimer.unref?.();
  }
  const schedule=db.prepare('SELECT multiplier,duration_ms,weekday,hour,minute,timezone,first_start_at FROM game_event_schedules WHERE guild_id=? AND enabled=1').get(g);
  if(schedule)console.log(`[${new Date().toISOString()}] LuckBoost schedule: every Saturday at 22:00 WIB, x${schedule.multiplier} for ${schedule.duration_ms/60_000} minutes; first event ${new Date(schedule.first_start_at).toISOString()}.`);
}
let luckEventScheduleTimer=null;
function luckEventNotice(event){
  if(!event)return '';
  const effect=event.event_key==='admin_abuse_luckboost'?'Adds a diminishing rarity bonus; high-tier catches are still rare.':'Multiplies Luck, with diminishing returns on rarity odds.';
  return `\n**${event.event_key==='admin_abuse_luckboost'?'Admin Abuse Event':'Luck event'} x${event.multiplier}** active until <t:${Math.floor(event.ends_at/1000)}:R>. ${effect}`;
}
function rollNextWeather(previousKey=null){
  const choices=Object.entries(weatherCatalog).filter(([key])=>key!==previousKey),total=choices.reduce((sum,[,weather])=>sum+weather.weight,0);
  let roll=Math.random()*total;
  for(const [key,weather] of choices){roll-=weather.weight;if(roll<0)return key;}
  return choices.at(-1)?.[0]||'hot';
}
function getCurrentWeather(g,now=Date.now()){
  const current=db.prepare('SELECT weather_key,started_at,ends_at FROM server_weather WHERE guild_id=?').get(g);
  if(current&&current.ends_at>now&&weatherCatalog[current.weather_key])return current;
  const weatherKey=rollNextWeather(current?.weather_key),weather=weatherCatalog[weatherKey];
  const durationMinutes=weather.minMinutes+Math.floor(Math.random()*(weather.maxMinutes-weather.minMinutes+1));
  const next={weather_key:weatherKey,started_at:now,ends_at:now+durationMinutes*60_000};
  const stored=db.transaction(()=>{
    const latest=db.prepare('SELECT weather_key,started_at,ends_at FROM server_weather WHERE guild_id=?').get(g);
    if(latest&&latest.ends_at>now)return latest;
    db.prepare(`INSERT INTO server_weather(guild_id,weather_key,started_at,ends_at) VALUES(?,?,?,?)
      ON CONFLICT(guild_id) DO UPDATE SET weather_key=excluded.weather_key,started_at=excluded.started_at,ends_at=excluded.ends_at`).run(g,next.weather_key,next.started_at,next.ends_at);
    return next;
  })();
  if(stored.started_at===now&&stored.weather_key===weatherKey)console.log(`[${new Date().toISOString()}] Server weather changed to ${weather.emoji} ${weather.name}; next change at ${new Date(stored.ends_at).toISOString()}.`);
  return stored;
}
function armWeatherRotation(g){
  const weather=getCurrentWeather(g),definition=weatherCatalog[weather.weather_key];
  console.log(`[${new Date().toISOString()}] Current server weather: ${definition.emoji} ${definition.name} until ${new Date(weather.ends_at).toISOString()}.`);
  if(!weatherRotationTimer){
    weatherRotationTimer=setInterval(()=>{
      try{getCurrentWeather(g);}catch(error){logRuntimeError('Weather rotation error',error);}
    },15_000);
    weatherRotationTimer.unref?.();
  }
}
let weatherRotationTimer=null;
function getEligibleFishGroups(luck,location,weatherKey,event=null){
  const weights=getFishWeights(luck,event);
  return rarityTiers.map((tier,index)=>({tier,weight:weights[index],fish:fish.filter(item=>item.location===location&&item.rarity===tier&&(!item.weather||item.weather===weatherKey))})).filter(group=>group.fish.length&&group.weight>0);
}
function getFishTierChances(luck,location,weatherKey,event=null){
  const eligible=getEligibleFishGroups(luck,location,weatherKey,event),total=eligible.reduce((sum,group)=>sum+group.weight,0);
  const chanceByTier=new Map(eligible.map(group=>[group.tier,group.weight/total*100]));
  return rarityTiers.map(tier=>({tier,chance:chanceByTier.has(tier)?chanceByTier.get(tier):null}));
}
function pickFish(luck=0,location='pond',weatherKey=null,event=null){
  const eligible=getEligibleFishGroups(luck,location,weatherKey,event);
  const total=eligible.reduce((sum,group)=>sum+group.weight,0);
  let roll=Math.random()*total;
  for(const group of eligible){roll-=group.weight;if(roll<0)return group.fish[Math.floor(Math.random()*group.fish.length)];}
  return eligible.at(-1)?.fish[0]||fish[0];
}function embed(title, description){return new EmbedBuilder().setColor(0x238b8e).setTitle(title).setDescription(description).setFooter({text:'Server Pond • virtual game currency'});}
function listEmbed(title,fields,emptyText='No entries found.') {
  const result=new EmbedBuilder().setColor(0x238b8e).setTitle(title).setFooter({text:'Server Pond - virtual game currency'});
  if(fields.length)result.addFields(...fields.slice(0,25));else result.setDescription(emptyText);
  return result;
}const paginationSessions = new Map();
const fishProtectionSessions = new Map();
function normalizeListFields(fields){
  const normalized=[];
  for(const field of fields){
    const name=String(field.name||'Daftar').slice(0,256),value=String(field.value||'');
    if(value.length<=950){normalized.push({name,value:value||'—'});continue;}
    const parts=[];let buffer='';
    for(const rawLine of value.split('\n')){
      const lineParts=[];
      for(let offset=0;offset<rawLine.length;offset+=900)lineParts.push(rawLine.slice(offset,offset+900));
      if(!lineParts.length)lineParts.push('');
      for(const line of lineParts){
        const combined=buffer?`${buffer}\n${line}`:line;
        if(combined.length>900&&buffer){parts.push(buffer);buffer=line;}else buffer=combined;
      }
    }
    if(buffer)parts.push(buffer);
    parts.forEach((part,index)=>normalized.push({name:`${name} · Bagian ${index+1}/${parts.length}`.slice(0,256),value:part}));
  }
  return normalized;
}
function splitListPages(fields,title,description=''){
  const normalized=normalizeListFields(fields),descLength=String(description||'').length;
  const fieldBudget=Math.max(300,Math.min(4000,5500-descLength-title.length-100));
  const pages=[];let page=[],used=0;
  for(const field of normalized){
    const cost=field.name.length+field.value.length+12;
    if(page.length&&(page.length>=20||used+cost>fieldBudget)){pages.push(page);page=[];used=0;}
    page.push(field);used+=cost;
  }
  if(page.length||!pages.length)pages.push(page);
  return pages;
}
function renderListPage(state){
  const total=state.pages.length,index=state.page,entry=state.pages[index];
  const structured=!Array.isArray(entry),fields=structured?(entry.fields||[]):entry;
  const pageTitle=structured?(entry.title||state.title):state.title;
  const description=structured?(entry.description||''):state.description;
  const title=total>1?`${pageTitle} (${index+1}/${total})`:pageTitle;
  const message=listEmbed(title,fields,state.emptyText);
  if(fields.length&&description){
    const pageHint=total>1?structured?`\nHalaman ${index+1}/${total}. Gunakan tombol Sebelumnya atau Berikutnya untuk berpindah.`:`\nHalaman ${index+1} dari ${total} - gunakan tombol di bawah untuk berpindah.`:'';
    message.setDescription(`${description}${pageHint}`);
  }
  return message;
}
function listPageControls(sessionId,state){
  if(state.pages.length<2)return [];
  const previous=new ButtonBuilder().setCustomId(`efish_page:${sessionId}:prev`).setLabel('Sebelumnya').setEmoji('⬅️').setStyle(ButtonStyle.Secondary).setDisabled(state.page===0);
  const indicator=new ButtonBuilder().setCustomId(`efish_page:${sessionId}:page`).setLabel(`${state.page+1}/${state.pages.length}`).setStyle(ButtonStyle.Secondary).setDisabled(true);
  const next=new ButtonBuilder().setCustomId(`efish_page:${sessionId}:next`).setLabel('Berikutnya').setEmoji('➡️').setStyle(ButtonStyle.Primary).setDisabled(state.page===state.pages.length-1);
  return [new ActionRowBuilder().addComponents(previous,indicator,next)];
}
async function replyPaged(i,{title,description='',fields=[],emptyText='Tidak ada data.',ephemeral=true}){
  const pages=splitListPages(fields,title,description),sessionId=i.id,now=Date.now();
  for(const [key,state] of paginationSessions){if(state.expiresAt<=now)paginationSessions.delete(key);}
  while(paginationSessions.size>=250)paginationSessions.delete(paginationSessions.keys().next().value);
  const state={title,description,emptyText,ephemeral,ownerId:i.user.id,pages,page:0,expiresAt:now+3_600_000};
  if(pages.length>1)paginationSessions.set(sessionId,state);
  const response={embeds:[renderListPage(state)],components:listPageControls(sessionId,state)};
  if(ephemeral)response.flags=MessageFlags.Ephemeral;
  try{await i.reply(response);}catch(error){paginationSessions.delete(sessionId);throw error;}
}

function buildWikiPages(sections){
  const pages=[];
  for(const section of sections){
    const normalized=normalizeListFields(section.fields||[]);
    const description=String(section.description||'');
    const sectionTitle=String(section.title||'Wiki e-Fish');
    const fieldBudget=Math.max(300,Math.min(4000,5200-description.length-sectionTitle.length-100));
    const sectionPages=[];
    let page=[],used=0;
    for(const field of normalized){
      const cost=field.name.length+field.value.length+12;
      if(page.length&&(page.length>=20||used+cost>fieldBudget)){
        sectionPages.push(page);page=[];used=0;
      }
      page.push(field);used+=cost;
    }
    if(page.length||!sectionPages.length)sectionPages.push(page);
    sectionPages.forEach((fields,index)=>pages.push({
      title:sectionPages.length>1?`${sectionTitle} - Bagian ${index+1}/${sectionPages.length}`:sectionTitle,
      description,fields
    }));
  }
  return pages;
}

async function replyWikiPaged(i,sections){
  const pages=buildWikiPages(sections),sessionId=i.id,now=Date.now();
  for(const [key,state] of paginationSessions){if(state.expiresAt<=now)paginationSessions.delete(key);}
  while(paginationSessions.size>=250)paginationSessions.delete(paginationSessions.keys().next().value);
  const state={title:'Wiki e-Fish',emptyText:'Belum ada data wiki.',ephemeral:true,ownerId:i.user.id,pages,page:0,expiresAt:now+3_600_000};
  if(pages.length>1)paginationSessions.set(sessionId,state);
  const response={embeds:[renderListPage(state)],components:listPageControls(sessionId,state),flags:MessageFlags.Ephemeral};
  try{await i.reply(response);}catch(error){paginationSessions.delete(sessionId);throw error;}
}
function isAdmin(i){return admins.has(i.user.id)||i.memberPermissions?.has('ManageGuild');}
function expireTrades(g, now=Date.now()){
  db.prepare("UPDATE trade_offers SET status='expired' WHERE guild_id=? AND status='pending' AND expires_at<=?").run(g,now);
}
function reservedFish(g,u,fishName,rarity,{tradeId=null,marketId=null}={}){
  const trade=db.prepare("SELECT COALESCE(SUM(quantity),0) AS n FROM trade_offers WHERE guild_id=? AND seller_id=? AND fish_name=? AND rarity=? AND status='pending' AND expires_at>? AND id<>?").get(g,u,fishName,rarity,Date.now(),(tradeId===null?-1:tradeId)).n;
  const market=db.prepare("SELECT COALESCE(SUM(quantity),0) AS n FROM market_listings WHERE guild_id=? AND seller_id=? AND fish_name=? AND rarity=? AND status='pending' AND expires_at>? AND id<>?").get(g,u,fishName,rarity,Date.now(),(marketId===null?-1:marketId)).n;
  return trade+market;
}
function fishInventoryData(g,u){
  getPlayer(g,u);
  const rows=db.prepare('SELECT fish_name,rarity,value,quantity FROM inventory WHERE guild_id=? AND user_id=? ORDER BY value DESC').all(g,u),fields=[];
  for(const tier of rarityTiers){
    const group=rows.filter(row=>row.rarity===tier);if(!group.length)continue;
    const lines=group.map(row=>{
      const pref=getFishPreference(g,u,row.fish_name,row.rarity),protectedFish=!!(pref.favorite||pref.locked),reserved=reservedFish(g,u,row.fish_name,row.rarity);
      const available=protectedFish?0:Math.max(0,row.quantity-reserved),tags=[pref.favorite?'Favorit':null,pref.locked?'Terkunci':null].filter(Boolean);
      const note=tags.length?` · Dilindungi: ${tags.join(', ')}`:reserved?` · ${reserved} ekor dicadangkan di trade/market`:'';
      return `**${row.fish_name}** — Jumlah: **${row.quantity}** · Harga jual: **${row.value} koin/ekor** · Siap dijual/ditrade: **${available}**${note}`;
    });
    const chunks=[];let buffer='';
    for(const line of lines){const combined=buffer?`${buffer}\n${line}`:line;if(combined.length>950&&buffer){chunks.push(buffer);buffer=line;}else buffer=combined;}
    if(buffer)chunks.push(buffer);
    for(let part=0;part<chunks.length;part++){const suffix=chunks.length>1?` · Bagian ${part+1} dari ${chunks.length}`:'';fields.push({name:`Ikan ${tier}${suffix}`,value:chunks[part]});}
  }
  return {title:'Inventory Ikan',description:'Jumlah = total ikan yang kamu punya. Siap dijual/ditrade = ikan yang belum dilindungi atau dicadangkan di trade/market. Favorit dan Terkunci melindungi ikan dari penjualan atau trade. Unfavorite hanya melepas Favorit; Unlock hanya melepas Lock.',fields,emptyText:'Inventory ikanmu kosong. Coba /fish!',ephemeral:true};
}
const bulkProtectionTargets=new Set(['all','fish_tier','mutated','mutation_tier','shiny','shiny_tier']);
function matchesBulkFavoriteTarget(row,target,tier){
  const parsed=parseFishVariantName(row.fish_name),species=fish.find(item=>item.name.toLowerCase()===parsed.baseName.toLowerCase());
  if(!species)return false;
  if(target==='all')return true;
  if(target==='fish_tier')return species.rarity===tier;
  if(target==='mutated')return !!parsed.mutation;
  if(target==='mutation_tier')return parsed.mutation?.rarity===tier;
  if(target==='shiny')return parsed.isShiny;
  if(target==='shiny_tier')return parsed.isShiny&&species.rarity===tier;
  return false;
}
function getBulkProtectionMatches(g,u,action,target,tier){
  const setting=['favorite','lock'].includes(action),column=['favorite','unfavorite'].includes(action)?'favorite':'locked';
  const rows=setting
    ?db.prepare('SELECT fish_name,rarity FROM inventory WHERE guild_id=? AND user_id=? AND quantity>0 ORDER BY fish_name COLLATE NOCASE').all(g,u)
    :db.prepare(`SELECT fish_name,rarity FROM fish_preferences WHERE guild_id=? AND user_id=? AND ${column}=1 ORDER BY fish_name COLLATE NOCASE`).all(g,u);
  return rows.filter(row=>{
    if(!matchesBulkFavoriteTarget(row,target,tier))return false;
    return !setting||!getFishPreference(g,u,row.fish_name,row.rarity)[column];
  });
}
function describeBulkFavoriteTarget(target,tier){
  if(target==='all')return 'semua ikan yang saat ini kamu miliki';
  if(target==='fish_tier')return `ikan tier ${tier} (termasuk varian Shiny dan mutasi)`;
  if(target==='mutated')return 'semua ikan yang memiliki mutasi';
  if(target==='mutation_tier')return `ikan dengan mutasi tier ${tier}`;
  if(target==='shiny')return 'semua ikan Shiny';
  if(target==='shiny_tier')return `ikan Shiny dengan rarity ikan ${tier}`;
  return 'ikan';
}
async function promptBulkProtection(i,g,u,action,target,tier){
  const matches=getBulkProtectionMatches(g,u,action,target,tier);
  const setting=['favorite','lock'].includes(action),column=['favorite','unfavorite'].includes(action)?'favorite':'locked';
  if(!matches.length){
    const noun=column==='favorite'?'Favorit':'Lock';
    return i.reply({content:setting?`Tidak ada varian ikan yang cocok untuk diberi ${noun}.`:`Tidak ada ${noun} yang cocok untuk dilepas.`,flags:MessageFlags.Ephemeral});
  }
  const now=Date.now();
  for(const [key,state] of fishProtectionSessions)if(state.expiresAt<=now)fishProtectionSessions.delete(key);
  while(fishProtectionSessions.size>=250)fishProtectionSessions.delete(fishProtectionSessions.keys().next().value);
  fishProtectionSessions.set(i.id,{guildId:g,ownerId:u,action,targets:matches,expiresAt:now+5*60_000});
  const verb=action==='favorite'?'memfavoritkan':action==='lock'?'mengunci':action==='unfavorite'?'menghapus Favorit dari':'membuka Lock pada';
  const sideEffect=setting
    ?`\n${action==='favorite'?'Favorit':'Lock'} melindungi ikan dari jual/trade/market dan akan membatalkan penawaran serta listing aktif untuk ikan tersebut.`
    :`\nAksi ini hanya mengubah ${column==='favorite'?'Favorit':'Lock'}; status ${column==='favorite'?'Lock':'Favorit'} tetap aktif jika ada. Penawaran/listing yang pernah dibatalkan tidak dipulihkan.`;
  const row=new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`fishfav:${i.id}:confirm`).setLabel('Terapkan').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`fishfav:${i.id}:cancel`).setLabel('Batal').setStyle(ButtonStyle.Secondary)
  );
  return i.reply({content:`Yakin ingin ${verb} **${matches.length} varian ikan**: ${describeBulkFavoriteTarget(target,tier)}?${sideEffect}\nPilihan ini berlaku untuk ikan yang cocok saat ini; konfirmasi dalam 5 menit.`,components:[row],flags:MessageFlags.Ephemeral});
}
function applyBulkProtection(g,u,session){
  let affected=0,cancelledTrades=0,cancelledListings=0;
  const now=Date.now();
  const setting=['favorite','lock'].includes(session.action),column=['favorite','unfavorite'].includes(session.action)?'favorite':'locked';
  db.transaction(()=>{
    for(const row of session.targets){
      if(setting){
        const owned=db.prepare('SELECT 1 FROM inventory WHERE guild_id=? AND user_id=? AND fish_name=? AND rarity=? AND quantity>0').get(g,u,row.fish_name,row.rarity);
        if(!owned||getFishPreference(g,u,row.fish_name,row.rarity)[column])continue;
        db.prepare(`INSERT INTO fish_preferences(guild_id,user_id,fish_name,rarity,${column}) VALUES(?,?,?,?,1) ON CONFLICT(guild_id,user_id,fish_name,rarity) DO UPDATE SET ${column}=1`).run(g,u,row.fish_name,row.rarity);
        cancelledTrades+=db.prepare("UPDATE trade_offers SET status='cancelled',completed_at=? WHERE guild_id=? AND seller_id=? AND fish_name=? AND rarity=? AND status='pending'").run(now,g,u,row.fish_name,row.rarity).changes;
        cancelledListings+=db.prepare("UPDATE market_listings SET status='cancelled',completed_at=? WHERE guild_id=? AND seller_id=? AND fish_name=? AND rarity=? AND status='pending'").run(now,g,u,row.fish_name,row.rarity).changes;
        affected++;
      }else{
        affected+=db.prepare(`UPDATE fish_preferences SET ${column}=0 WHERE guild_id=? AND user_id=? AND fish_name=? AND rarity=? AND ${column}=1`).run(g,u,row.fish_name,row.rarity).changes;
      }
    }
  })();
  return {affected,cancelledTrades,cancelledListings};
}
async function handleFishAutocomplete(i){
  const focused=i.options.getFocused(true);
  if(focused.name!=='fish'){await i.respond([]);return;}
  if(i.commandName==='give'&&i.options.getSubcommand()!=='fish'){await i.respond([]);return;}
  if(i.commandName==='inventory'&&((i.options.getString('action')||'view')==='view'||(i.options.getString('target')||'fish')!=='fish')){await i.respond([]);return;}
  const rows=db.prepare('SELECT fish_name,rarity,quantity FROM inventory WHERE guild_id=? AND user_id=? AND quantity>0 ORDER BY fish_name COLLATE NOCASE').all(allowedGuild,i.user.id);
  const requiresAvailable=['sell','trade','market','give'].includes(i.commandName),query=String(focused.value||'').trim().toLowerCase();
  const choices=rows.flatMap(row=>{
    const pref=getFishPreference(allowedGuild,i.user.id,row.fish_name,row.rarity);
    const protectedFish=!!(pref.favorite||pref.locked),available=Math.max(0,row.quantity-reservedFish(allowedGuild,i.user.id,row.fish_name,row.rarity));
    if(requiresAvailable&&(protectedFish||available<1))return [];
    if(!row.fish_name.toLowerCase().includes(query))return [];
    const marker=[pref.favorite?'Favorite':null,pref.locked?'Locked':null].filter(Boolean).join(', ');
    const amount=requiresAvailable?`${available} available`:`x${row.quantity}`;
    return [{name:`${row.fish_name} (${row.rarity}) - ${amount}${marker&&!requiresAvailable?` - ${marker}`:''}`,value:i.commandName==='give'?`${row.fish_name}|${row.rarity}`:row.fish_name}];
  }).sort((a,b)=>{
    const ap=a.value.toLowerCase().startsWith(query)?0:1,bp=b.value.toLowerCase().startsWith(query)?0:1;
    return ap-bp||a.value.localeCompare(b.value);
  }).slice(0,25);
  await i.respond(choices);
}
async function handleGive(i,g,u){
  const action=i.options.getSubcommand(),recipient=i.options.getUser('player');
  if(recipient.id===u)return i.reply({content:'You cannot give items to yourself.',flags:MessageFlags.Ephemeral});
  if(recipient.bot)return i.reply({content:'You can only give items to another player, not a bot.',flags:MessageFlags.Ephemeral});

  if(action==='money'){
    const amount=i.options.getInteger('amount');
    const result=db.transaction(()=>{
      const sender=db.prepare('SELECT coins FROM players WHERE guild_id=? AND user_id=?').get(g,u);
      if(!sender||sender.coins<amount)return {ok:false,reason:'funds'};
      const receiver=db.prepare('SELECT coins FROM players WHERE guild_id=? AND user_id=?').get(g,recipient.id);
      if(!Number.isSafeInteger((receiver?.coins||0)+amount))return {ok:false,reason:'limit'};
      const debit=db.prepare('UPDATE players SET coins=coins-? WHERE guild_id=? AND user_id=? AND coins>=?').run(amount,g,u,amount);
      if(!debit.changes)return {ok:false,reason:'funds'};
      db.prepare('INSERT INTO players(guild_id,user_id,coins) VALUES(?,?,?) ON CONFLICT(guild_id,user_id) DO UPDATE SET coins=players.coins+excluded.coins').run(g,recipient.id,amount);
      return {ok:true};
    })();
    if(!result.ok)return i.reply({content:result.reason==='limit'?'That player’s coin balance cannot safely hold that amount.':'You do not have enough coins for that transfer.',flags:MessageFlags.Ephemeral});
    return i.reply({content:'Transferred **'+amount+' coins** to <@'+recipient.id+'>.',allowedMentions:{users:[recipient.id]}});
  }

  if(action==='fish'){
    const fishValue=i.options.getString('fish'),separator=fishValue.lastIndexOf('|');
    if(separator<1)return i.reply({content:'Choose a fish from the autocomplete list.',flags:MessageFlags.Ephemeral});
    const fishName=fishValue.slice(0,separator),rarity=fishValue.slice(separator+1),quantity=i.options.getInteger('quantity');
    const result=db.transaction(()=>{
      const item=db.prepare('SELECT value,quantity FROM inventory WHERE guild_id=? AND user_id=? AND lower(fish_name)=lower(?) AND rarity=?').get(g,u,fishName,rarity);
      if(!item||item.quantity<quantity)return {ok:false,reason:'quantity'};
      if(isFishProtected(g,u,fishName,rarity))return {ok:false,reason:'protected'};
      if(item.quantity-reservedFish(g,u,fishName,rarity)<quantity)return {ok:false,reason:'reserved'};
      const debit=db.prepare('UPDATE inventory SET quantity=quantity-? WHERE guild_id=? AND user_id=? AND lower(fish_name)=lower(?) AND rarity=? AND quantity>=?').run(quantity,g,u,fishName,rarity,quantity);
      if(!debit.changes)return {ok:false,reason:'quantity'};
      db.prepare('DELETE FROM inventory WHERE guild_id=? AND user_id=? AND lower(fish_name)=lower(?) AND rarity=? AND quantity<=0').run(g,u,fishName,rarity);
      db.prepare('INSERT OR IGNORE INTO players(guild_id,user_id) VALUES(?,?)').run(g,recipient.id);
      db.prepare('INSERT INTO inventory(guild_id,user_id,fish_name,rarity,value,quantity) VALUES(?,?,?,?,?,?) ON CONFLICT(guild_id,user_id,fish_name,rarity) DO UPDATE SET quantity=quantity+excluded.quantity,value=excluded.value').run(g,recipient.id,fishName,rarity,item.value,quantity);
      return {ok:true};
    })();
    if(!result.ok){
      const message=result.reason==='protected'?'That fish is favorited or locked. Remove its protection before giving it away.':result.reason==='reserved'?'Some of that fish is reserved in a trade or marketplace listing. Cancel those first or choose a smaller amount.':'You do not have enough of that fish.';
      return i.reply({content:message,flags:MessageFlags.Ephemeral});
    }
    return i.reply({content:'Gave **'+quantity+' × '+fishName+'** ('+rarity+') to <@'+recipient.id+'>.',allowedMentions:{users:[recipient.id]}});
  }
  return i.reply({content:'Choose money or fish.',flags:MessageFlags.Ephemeral});
}

async function handleTrade(i,g,u){
  const action=i.options.getSubcommand(), now=Date.now();
  expireTrades(g,now);
  if(action==='offer'){
    const buyer=i.options.getUser('player'), fishInput=i.options.getString('fish').trim();
    const quantity=i.options.getInteger('quantity'), price=i.options.getInteger('price');
    if(buyer.id===u) return i.reply({content:'You cannot trade with yourself.',flags:MessageFlags.Ephemeral});
    if(buyer.bot) return i.reply({content:'Trades are only available between human players.',flags:MessageFlags.Ephemeral});
    const item=db.prepare('SELECT fish_name,rarity,quantity FROM inventory WHERE guild_id=? AND user_id=? AND lower(fish_name)=lower(?)').get(g,u,fishInput);
    if(!item) return i.reply({content:'That fish is not in your inventory.',flags:MessageFlags.Ephemeral});
    if(isFishProtected(g,u,item.fish_name,item.rarity))return i.reply({content:'This fish is favorited or locked, so it cannot be traded. Unprotect it with /inventory first.',flags:MessageFlags.Ephemeral});
    if(item.quantity-reservedFish(g,u,item.fish_name,item.rarity)<quantity) return i.reply({content:'You do not have enough unlisted fish available for another offer.',flags:MessageFlags.Ephemeral});
    const pending=db.prepare("SELECT COUNT(*) AS count FROM trade_offers WHERE guild_id=? AND seller_id=? AND status='pending'").get(g,u).count;
    if(pending>=20) return i.reply({content:'You already have 20 pending offers. Cancel or wait for some to expire first.',flags:MessageFlags.Ephemeral});
    const info=db.prepare('INSERT INTO trade_offers(guild_id,seller_id,buyer_id,fish_name,rarity,quantity,price,created_at,expires_at) VALUES(?,?,?,?,?,?,?,?,?)')
      .run(g,u,buyer.id,item.fish_name,item.rarity,quantity,price,now,now+86_400_000);
    return i.reply({content:`<@${buyer.id}>`,embeds:[embed(`Trade offer #${info.lastInsertRowid}`,`<@${u}> offers **${quantity} × ${item.fish_name}** (${item.rarity}) for **${price} coins total**. The offer expires in 24 hours. The buyer can use /trade inbox, then /trade accept with this offer ID.`)],allowedMentions:{users:[buyer.id]}});
  }
  if(action==='inbox'||action==='sent'){
    const column=action==='inbox'?'buyer_id':'seller_id';
    const rows=db.prepare(`SELECT id,seller_id,buyer_id,fish_name,rarity,quantity,price,status,expires_at FROM trade_offers WHERE guild_id=? AND ${column}=? ORDER BY id DESC LIMIT 15`).all(g,u);
    const fields=rows.map(r=>{
      const direction=action==='inbox'?`From <@${r.seller_id}>`:`To <@${r.buyer_id}>`;
      const expiry=r.status==='pending'?`\nExpires <t:${Math.floor(r.expires_at/1000)}:R>`:'';
      return {name:`#${r.id} | ${r.fish_name} x${r.quantity}`,value:`${direction}\n${r.rarity} | ${r.price} coins total\nStatus: ${r.status}${expiry}`};
    });
    return replyPaged(i,{title:action==='inbox'?'Trade inbox':'Your trade offers',fields,emptyText:'No trade offers found.',ephemeral:true});
  }
  const id=i.options.getInteger('id');
  if(action==='accept'){
    getPlayer(g,u);
    const result=db.transaction(()=>{
      const offer=db.prepare('SELECT * FROM trade_offers WHERE id=? AND guild_id=?').get(id,g);
      if(!offer) return {ok:false,message:`Trade offer #${id} was not found.`};
      if(offer.buyer_id!==u) return {ok:false,message:'Only the player named in the offer can accept it.'};
      if(offer.status!=='pending') return {ok:false,message:`This offer is already ${offer.status}.`};
      if(offer.expires_at<=Date.now()){
        db.prepare("UPDATE trade_offers SET status='expired' WHERE id=? AND status='pending'").run(id);
        return {ok:false,message:'This offer has expired.'};
      }
      if(isFishProtected(g,offer.seller_id,offer.fish_name,offer.rarity))return {ok:false,message:'This fish is now favorited or locked by the seller.'};
      const item=db.prepare('SELECT value,quantity FROM inventory WHERE guild_id=? AND user_id=? AND fish_name=? AND rarity=?').get(g,offer.seller_id,offer.fish_name,offer.rarity);
      if(!item||item.quantity-reservedFish(g,offer.seller_id,offer.fish_name,offer.rarity,{tradeId:offer.id})<offer.quantity) return {ok:false,message:'The seller no longer has enough unreserved fish for this offer.'};
      const buyer=getPlayer(g,u);
      if(buyer.coins<offer.price) return {ok:false,message:`You need ${offer.price} coins, but your balance is ${buyer.coins}.`};
      db.prepare('UPDATE inventory SET quantity=quantity-? WHERE guild_id=? AND user_id=? AND fish_name=? AND rarity=?').run(offer.quantity,g,offer.seller_id,offer.fish_name,offer.rarity);
      db.prepare('DELETE FROM inventory WHERE guild_id=? AND user_id=? AND fish_name=? AND rarity=? AND quantity<=0').run(g,offer.seller_id,offer.fish_name,offer.rarity);
      db.prepare('UPDATE players SET coins=coins-? WHERE guild_id=? AND user_id=?').run(offer.price,g,u);
      db.prepare('UPDATE players SET coins=coins+? WHERE guild_id=? AND user_id=?').run(offer.price,g,offer.seller_id);
      db.prepare(`INSERT INTO inventory(guild_id,user_id,fish_name,rarity,value,quantity) VALUES(?,?,?,?,?,?)
        ON CONFLICT(guild_id,user_id,fish_name,rarity) DO UPDATE SET quantity=quantity+excluded.quantity`).run(g,u,offer.fish_name,offer.rarity,item.value,offer.quantity);
      db.prepare("UPDATE trade_offers SET status='accepted',completed_at=? WHERE id=? AND status='pending'").run(Date.now(),id);
      return {ok:true,offer};
    })();
    if(!result.ok) return i.reply({content:result.message,flags:MessageFlags.Ephemeral});
    return i.reply({embeds:[embed(`Trade #${id} completed`,`<@${u}> bought **${result.offer.quantity} × ${result.offer.fish_name}** from <@${result.offer.seller_id}> for **${result.offer.price} coins**.`)]});
  }
  const status=action==='decline'?'declined':'cancelled';
  const ownerColumn=action==='decline'?'buyer_id':'seller_id';
  const changed=db.prepare(`UPDATE trade_offers SET status=?,completed_at=? WHERE id=? AND guild_id=? AND ${ownerColumn}=? AND status='pending' AND expires_at>?`).run(status,now,id,g,u,now);
  if(!changed.changes) return i.reply({content:'No matching pending offer was found for you.',flags:MessageFlags.Ephemeral});
  return i.reply({content:`Trade offer #${id} ${status}.`,flags:MessageFlags.Ephemeral});
}const gearCatalog={
  reed_rod:{name:'Reed Rod',slot:'rod',rarity:'Common',price:100,luck:1,power:1,mutationBoost:0,consumable:false},
  carbon_rod:{name:'Carbon Rod',slot:'rod',rarity:'Uncommon',price:400,luck:2,power:3,mutationBoost:0.03,consumable:false},
  tidecaller_rod:{name:'Tidecaller Rod',slot:'rod',rarity:'Rare',price:1300,luck:4,power:7,mutationBoost:0.06,consumable:false},
  abyss_rod:{name:'Abyss Rod',slot:'rod',rarity:'Legendary',price:3500,luck:7,power:12,mutationBoost:0.1,consumable:false},
  cork_bobber:{name:'Cork Bobber',slot:'bobber',rarity:'Common',price:50,luck:1,power:0,mutationBoost:0,consumable:false},
  pearl_bobber:{name:'Pearl Bobber',slot:'bobber',rarity:'Uncommon',price:220,luck:2,power:0,mutationBoost:0.02,consumable:false},
  star_bobber:{name:'Starlight Bobber',slot:'bobber',rarity:'Rare',price:700,luck:4,power:1,mutationBoost:0.04,consumable:false},
  plain_pellets:{name:'Plain Pellets',slot:'bait',rarity:'Common',price:10,luck:1,power:0,mutationBoost:0,consumable:true,durationMinutes:10},
  glimmer_pellets:{name:'Glimmer Pellets',slot:'bait',rarity:'Uncommon',price:25,luck:2,power:0,mutationBoost:0.02,consumable:true,durationMinutes:15},
  golden_pellets:{name:'Golden Pellets',slot:'bait',rarity:'Rare',price:80,luck:5,power:0,mutationBoost:0.04,consumable:true,durationMinutes:25},
  mythic_roe:{name:'Mythic Roe Pellets',slot:'bait',rarity:'Legendary',price:180,luck:10,power:0,mutationBoost:0.06,consumable:true,durationMinutes:40},
  leviathan_rod:{name:'Leviathan Rod',slot:'rod',rarity:'Mythic',price:12000,luck:8,power:15,mutationBoost:0.14,consumable:false},
  starfall_rod:{name:'Starfall Rod',slot:'rod',rarity:'Celestial',price:40000,luck:10,power:20,mutationBoost:0.18,consumable:false},
  abyssal_bobber:{name:'Abyssal Bobber',slot:'bobber',rarity:'Mythic',price:8000,luck:7,power:2,mutationBoost:0.08,consumable:false},
  cosmic_bobber:{name:'Cosmic Bobber',slot:'bobber',rarity:'Celestial',price:30000,luck:9,power:4,mutationBoost:0.12,consumable:false},
  void_roe:{name:'Void Roe Pellets',slot:'bait',rarity:'Mythic',price:500,luck:12,power:0,mutationBoost:0.1,consumable:true,durationMinutes:60},
  celestial_roe:{name:'Celestial Roe Pellets',slot:'bait',rarity:'Celestial',price:1500,luck:15,power:0,mutationBoost:0.15,consumable:true,durationMinutes:90},
  starforged_rod:{name:'Starforged Rod',slot:'rod',rarity:'Astral',price:95000,luck:13,power:28,mutationBoost:0.23,consumable:false},
  eonbreaker_rod:{name:'Eonbreaker Rod',slot:'rod',rarity:'Eternal',price:270000,luck:17,power:38,mutationBoost:0.3,consumable:false},
  nebula_bobber:{name:'Nebula Bobber',slot:'bobber',rarity:'Astral',price:62000,luck:11,power:5,mutationBoost:0.17,consumable:false},
  eventide_bobber:{name:'Eventide Bobber',slot:'bobber',rarity:'Eternal',price:160000,luck:15,power:9,mutationBoost:0.2,consumable:false},
  astral_roe:{name:'Astral Roe Pellets',slot:'bait',rarity:'Astral',price:7000,luck:18,power:0,mutationBoost:0.2,consumable:true,durationMinutes:120},
  eternal_roe:{name:'Eternal Roe Pellets',slot:'bait',rarity:'Eternal',price:25000,luck:25,power:0,mutationBoost:0.25,consumable:true,durationMinutes:180}
};
function getSkills(g,u){
  const p=getPlayer(g,u), level=Math.floor(p.xp/100)+1;
  db.prepare('INSERT OR IGNORE INTO player_skills(guild_id,user_id,luck_level,power_level,skill_points,awarded_level) VALUES(?,?,1,1,?,?)').run(g,u,Math.floor(level/5),level);
  return db.prepare('SELECT * FROM player_skills WHERE guild_id=? AND user_id=?').get(g,u);
}
function getEquipped(g,u,slot){
  const row=db.prepare('SELECT item_key FROM equipped_gear WHERE guild_id=? AND user_id=? AND slot=?').get(g,u,slot);
  if(!row)return null;
  if(slot==='bait'){
    const active=db.prepare('SELECT item_key,expires_at FROM active_bait WHERE guild_id=? AND user_id=? AND expires_at>?').get(g,u,Date.now());
    if(active){const item=gearCatalog[active.item_key];return item?{...item,itemKey:active.item_key,active:true,expiresAt:active.expires_at}:null;}
    db.prepare('DELETE FROM active_bait WHERE guild_id=? AND user_id=? AND expires_at<=?').run(g,u,Date.now());
  }
  const owned=db.prepare('SELECT quantity FROM gear_inventory WHERE guild_id=? AND user_id=? AND item_key=?').get(g,u,row.item_key);
  if(!owned||owned.quantity<=0){db.prepare('DELETE FROM equipped_gear WHERE guild_id=? AND user_id=? AND slot=?').run(g,u,slot);return null;}
  const item=gearCatalog[row.item_key]||null;
  return item&&slot==='bait'?{...item,itemKey:row.item_key,active:false}:item;
}
function expireMarket(g,now=Date.now()){
  db.prepare("UPDATE market_listings SET status='expired' WHERE guild_id=? AND status='pending' AND expires_at<=?").run(g,now);
}
async function handleShop(i,g,u){
  const action=i.options.getSubcommand();
  if(action==='browse'){
    const categories=[['Pancing','rod'],['Pelampung','bobber'],['Pelet','bait']];
    const fields=categories.map(([title,slot])=>({name:title,value:Object.values(gearCatalog).filter(item=>item.slot===slot).map(item=>{
      const stats=[item.luck?`+${item.luck} Luck`:null,item.power?`+${item.power} Power`:null,item.mutationBoost?`+${Math.round(item.mutationBoost*100)}% Mutation Chance`:null].filter(Boolean).join(' | ');
      const durationText=item.slot==='bait'?` · berlaku ${item.durationMinutes} menit sejak cast pertama`:'';
      return `**${item.name}** — ${item.rarity} · **${item.price} koin**\n${stats}${durationText}`;
    }).join('\n\n')||'Belum ada item.'}));
    const shopDescription=`Saldo kamu: **${getPlayer(g,u).coins} koin**. Bonus Mutation Chance mengalikan peluang dasar. Pelet yang belum dipakai bisa direfund 80% melalui /shop refund.`;
    return replyPaged(i,{title:'Toko Pemancingan',description:shopDescription,fields,ephemeral:true});
  }
  if(action==='inventory'){
    const now=Date.now(),rows=db.prepare('SELECT item_key,quantity FROM gear_inventory WHERE guild_id=? AND user_id=? AND quantity>0 ORDER BY item_key').all(g,u);
    const equipped=db.prepare('SELECT slot,item_key FROM equipped_gear WHERE guild_id=? AND user_id=?').all(g,u),eq=new Map(equipped.map(x=>[x.slot,x.item_key]));
    const activeBait=db.prepare('SELECT item_key,expires_at FROM active_bait WHERE guild_id=? AND user_id=? AND expires_at>?').get(g,u,now);
    const categories=[['Pancing','rod'],['Pelampung','bobber'],['Pelet','bait']];
    const fields=categories.map(([title,slot])=>{
      const lines=rows.filter(r=>gearCatalog[r.item_key]?.slot===slot).map(r=>{const item=gearCatalog[r.item_key],activeText=activeBait?.item_key===r.item_key?` · Aktif sampai <t:${Math.floor(activeBait.expires_at/1000)}:R>`:'';return `**${item.name}** (${item.rarity}) x${r.quantity}${eq.get(slot)===r.item_key?' · Terpasang':''}${activeText}`;});
      if(slot==='bait'&&activeBait&&!rows.some(r=>r.item_key===activeBait.item_key)){const item=gearCatalog[activeBait.item_key];if(item)lines.unshift(`**${item.name}** (${item.rarity}) · Aktif sampai <t:${Math.floor(activeBait.expires_at/1000)}:R`);}
      return {name:title,value:lines.join('\n')||'Belum ada'};
    });
    const inventoryDescription=`Saldo kamu: **${getPlayer(g,u).coins} koin**`;
    return replyPaged(i,{title:'Equipment Kamu',description:inventoryDescription,fields,emptyText:'Kamu belum punya equipment. Gunakan /shop browse.',ephemeral:true});
  }
  if(action==='refund'){
    const key=i.options.getString('item'),item=gearCatalog[key],quantity=i.options.getInteger('quantity')||1;
    getPlayer(g,u);
    if(!item?.consumable)return i.reply({content:'Only consumable pellets can be refunded; permanent equipment is not refundable.',flags:MessageFlags.Ephemeral});
    const refundPerItem=Math.floor(item.price*0.8),totalRefund=refundPerItem*quantity;
    const result=db.transaction(()=>{
      const owned=db.prepare('SELECT quantity FROM gear_inventory WHERE guild_id=? AND user_id=? AND item_key=?').get(g,u,key);
      if(!owned||owned.quantity<quantity)return {ok:false,owned:owned?.quantity||0};
      const removed=db.prepare('UPDATE gear_inventory SET quantity=quantity-? WHERE guild_id=? AND user_id=? AND item_key=? AND quantity>=?').run(quantity,g,u,key,quantity);
      if(!removed.changes)return {ok:false,owned:owned.quantity};
      db.prepare('DELETE FROM gear_inventory WHERE guild_id=? AND user_id=? AND item_key=? AND quantity<=0').run(g,u,key);
      if(owned.quantity===quantity){
        const active=db.prepare('SELECT 1 FROM active_bait WHERE guild_id=? AND user_id=? AND item_key=? AND expires_at>?').get(g,u,key,Date.now());
        if(!active)db.prepare('DELETE FROM equipped_gear WHERE guild_id=? AND user_id=? AND slot=? AND item_key=?').run(g,u,item.slot,key);
      }
      db.prepare('UPDATE players SET coins=coins+? WHERE guild_id=? AND user_id=?').run(totalRefund,g,u);
      return {ok:true,remaining:owned.quantity-quantity,balance:getPlayer(g,u).coins};
    })();
    if(!result.ok)return i.reply({content:`You only have ${result.owned} unused ${item.name}. No refund was made.`,flags:MessageFlags.Ephemeral});
    return i.reply({embeds:[embed('Pellet refund complete',`Refunded **${quantity} × ${item.name}** at **80%** of shop price (**${totalRefund} coins**). Remaining stock: **${result.remaining}**. Balance: **${result.balance} coins**. Active or already used pellets cannot be refunded.`)],flags:MessageFlags.Ephemeral});
  }
  if(action==='buy'){
    const key=i.options.getString('item'),item=gearCatalog[key],quantity=i.options.getInteger('quantity')||1;
    const p=getPlayer(g,u);
    if(!item)return i.reply({content:'That shop item was not found.',flags:MessageFlags.Ephemeral});
    if(!item.consumable&&quantity>1)return i.reply({content:'Permanent equipment can only be bought once. Set quantity to 1.',flags:MessageFlags.Ephemeral});
    const total=item.price*quantity;
    const result=db.transaction(()=>{
      const owned=db.prepare('SELECT quantity FROM gear_inventory WHERE guild_id=? AND user_id=? AND item_key=?').get(g,u,key);
      if(!item.consumable&&owned?.quantity>0)return {ok:false,message:'You already own this permanent item.'};
      const debit=db.prepare('UPDATE players SET coins=coins-? WHERE guild_id=? AND user_id=? AND coins>=?').run(total,g,u,total);
      if(!debit.changes)return {ok:false,message:`You need ${total} coins for ${quantity} × ${item.name}; your balance is ${getPlayer(g,u).coins}.`};
      db.prepare('INSERT INTO gear_inventory(guild_id,user_id,item_key,quantity) VALUES(?,?,?,?) ON CONFLICT(guild_id,user_id,item_key) DO UPDATE SET quantity=quantity+excluded.quantity').run(g,u,key,quantity);
      return {ok:true};
    })();
    if(!result.ok)return i.reply({content:result.message,flags:MessageFlags.Ephemeral});
    const durationNote=item.slot==='bait'?` Each pellet gives +${item.luck} Luck for ${item.durationMinutes} minutes from its first fishing cast.`:'';
    return i.reply({embeds:[embed('Purchase complete',`You bought **${quantity} × ${item.name}** (${item.rarity}) for **${total} coins**. Balance: **${p.coins-total} coins**.${durationNote} Equip it with /shop equip.`)],flags:MessageFlags.Ephemeral});
  }
  if(action==='equip'){
    const key=i.options.getString('item'),item=gearCatalog[key];
    if(!item)return i.reply({content:'That equipment was not found.',flags:MessageFlags.Ephemeral});
    const owned=db.prepare('SELECT quantity FROM gear_inventory WHERE guild_id=? AND user_id=? AND item_key=?').get(g,u,key);
    if(!owned||owned.quantity<=0)return i.reply({content:'You do not own that item. Buy it with /shop buy first.',flags:MessageFlags.Ephemeral});
    if(item.slot==='bait'){
      const active=db.prepare('SELECT item_key,expires_at FROM active_bait WHERE guild_id=? AND user_id=? AND expires_at>?').get(g,u,Date.now());
      if(active&&active.item_key!==key)return i.reply({content:`Your ${gearCatalog[active.item_key]?.name||'pellets'} are active until <t:${Math.floor(active.expires_at/1000)}:R>. Wait for them to expire before switching pellets.`,flags:MessageFlags.Ephemeral});
    }
    db.prepare(`INSERT INTO equipped_gear(guild_id,user_id,slot,item_key) VALUES(?,?,?,?) ON CONFLICT(guild_id,user_id,slot) DO UPDATE SET item_key=excluded.item_key`).run(g,u,item.slot,key);
    const note=item.slot==='bait'?` One pellet will be consumed on your first cast and give +${item.luck} Luck for ${item.durationMinutes} minutes.`:'';
    return i.reply({content:`Equipped **${item.name}** in your ${item.slot} slot.${note}`,flags:MessageFlags.Ephemeral});
  }
  const slot=i.options.getString('slot');
  if(slot==='bait'){
    const active=db.prepare('SELECT expires_at FROM active_bait WHERE guild_id=? AND user_id=? AND expires_at>?').get(g,u,Date.now());
    if(active)return i.reply({content:`Your active pellets last until <t:${Math.floor(active.expires_at/1000)}:R>; you cannot unequip them yet.`,flags:MessageFlags.Ephemeral});
  }
  db.prepare('DELETE FROM equipped_gear WHERE guild_id=? AND user_id=? AND slot=?').run(g,u,slot);
  return i.reply({content:`Unequipped your ${slot}.`,flags:MessageFlags.Ephemeral});
}

function formatChance(value){return `${Number(value.toFixed(8))}%`;}
async function handleMutations(i,g,u){
  getPlayer(g,u);
  const rod=getEquipped(g,u,'rod'),bobber=getEquipped(g,u,'bobber'),bait=getEquipped(g,u,'bait'),boost=getMutationBoost(rod,bobber,bait),currentLocation=getCurrentLocation(g,u),mutationAvailable=!!locationCatalog[currentLocation]?.mutationsEnabled;
  const currentRows=db.prepare('SELECT mutation_key,caught_count,best_value FROM mutationdex WHERE guild_id=? AND user_id=?').all(g,u),owned=new Map(currentRows.map(row=>[row.mutation_key,row]));
  const found=currentRows.filter(row=>row.caught_count>0).length,totalChance=mutationAvailable?mutationCatalog.reduce((sum,item)=>sum+item.ratePercent,0)*(1+boost):0;
  const fields=mutationCatalog.map(item=>{
    const row=owned.get(item.key),chance=mutationAvailable?item.ratePercent*(1+boost):0;
    return {name:`${item.name} - ${item.rarity}`,value:`${item.description}\nPeluang dasar: **${formatChance(item.ratePercent)}** (sekitar 1 dari ${Math.round(100/item.ratePercent)})\nPeluang kamu: **${mutationAvailable?`${formatChance(chance)} per tangkapan`:`Tidak aktif di zona ini; buka Deep Sea Trench atau zona lebih dalam`}**\nNilai jual: **x${item.valueMultiplier}** | Ditemukan: **${row?.caught_count||0}**${row?.best_value?` | Nilai terbaik: ${row.best_value} koin`:''}`};
  });
  const message=listEmbed('Koleksi Mutasi Ikan',fields);
  message.setDescription(`Koleksi ditemukan: **${found}/${mutationCatalog.length}**. Zona saat ini: **${locationCatalog[currentLocation].name}**. Mutasi ${mutationAvailable?'aktif di sini':'belum aktif; buka Deep Sea Trench atau zona lebih dalam'}. Bonus equipment: **+${Math.round(boost*100)}% dari peluang dasar**; total peluang mutasi saat ini **${formatChance(totalChance)} per tangkapan**. Mutasi terpisah dari rarity ikan dan Luck; maksimal satu mutasi per ikan. Shiny bisa muncul bersamaan. Tidak ada pity.`);
  return replyPaged(i,{title:'Koleksi Mutasi Ikan',description:message.data.description,fields,ephemeral:true});
}
async function handleWeather(i,g){
  const current=getCurrentWeather(g),active=weatherCatalog[current.weather_key];
  const fields=Object.entries(weatherCatalog).map(([key,weather])=>{
    const zones=Object.entries(locationCatalog).map(([locationKey,location])=>{
      const found=fish.filter(item=>item.location===locationKey&&item.weather===key).sort((a,b)=>rarityTiers.indexOf(a.rarity)-rarityTiers.indexOf(b.rarity));
      return found.length?`${location.name}: ${found.map(item=>`${item.name} (${item.rarity})`).join(', ')}`:null;
    }).filter(Boolean);
    return {name:`${weather.emoji} ${weather.name}${key===current.weather_key?' — AKTIF':''}`,value:`Durasi: ${weather.minMinutes}–${weather.maxMinutes} menit (acak)\n${weather.description}\nIkan khusus cuaca:\n${zones.join('\n')||'Tidak ada ikan khusus.'}`};
  });
  const description=`Cuaca server saat ini: **${active.emoji} ${active.name}** — berubah <t:${Math.floor(current.ends_at/1000)}:R>. Cuaca berlaku untuk semua pemain. Ikan khusus hanya bisa ditangkap di zona yang tercantum saat cuacanya aktif. Cuaca mengubah jenis ikan yang masuk ke pool rarity, bukan peluang tier atau jaminan tangkapan.`;
  return replyPaged(i,{title:'Cuaca Server & Ikan Khusus',description,fields,ephemeral:true});
}
function getZoneWikiOdds(locationKey,weatherKey,weights){
  const groups=rarityTiers.map((tier,index)=>({
    tier,weight:weights[index],
    fish:fish.filter(item=>item.location===locationKey&&item.rarity===tier&&(!item.weather||item.weather===weatherKey))
  })).filter(group=>group.fish.length&&group.weight>0);
  const total=groups.reduce((sum,group)=>sum+group.weight,0),byFish=new Map(),byTier=new Map();
  for(const group of groups){
    const tierChance=total?group.weight/total*100:0;
    byTier.set(group.tier,{tierChance,count:group.fish.length});
    for(const item of group.fish)byFish.set(item.name,{tierChance,speciesChance:tierChance/group.fish.length});
  }
  return {groups,total,byFish,byTier};
}

function wikiFishLine(item,chance,condition){
  const weight=`${item.minKg.toFixed(2)}-${item.maxKg.toFixed(2)} kg`;
  return `- **${item.name}** - ${item.value} coins - ${weight} - ${formatChance(chance)} per tangkapan (${condition})`;
}

async function handleWiki(i,g,u){
  const playerData=getPlayer(g,u),skills=getSkills(g,u),currentLocation=getCurrentLocation(g,u),currentWeather=getCurrentWeather(g),activeWeather=currentWeather.weather_key;
  const rod=getEquipped(g,u,'rod'),bobber=getEquipped(g,u,'bobber'),bait=getEquipped(g,u,'bait');
  const baseLuck=Math.max(0,skills.luck_level-1)+(rod?.luck||0)+(bobber?.luck||0)+(bait?.luck||0);
  const luckState=getEffectiveLuck(baseLuck,g),luck=luckState.effectiveLuck,weights=getFishWeights(luck,luckState.event),mutationBoost=getMutationBoost(rod,bobber,bait);
  const currentZone=locationCatalog[currentLocation],weather=weatherCatalog[activeWeather],playerLevel=Math.floor(playerData.xp/100)+1;
  const unlocked=new Set(db.prepare('SELECT location_key FROM unlocked_locations WHERE guild_id=? AND user_id=?').all(g,u).map(row=>row.location_key));
  const weatherOdds=new Map();
  for(const weatherKey of Object.keys(weatherCatalog)){
    const byZone=new Map();
    for(const zoneKey of Object.keys(locationCatalog))byZone.set(zoneKey,getZoneWikiOdds(zoneKey,weatherKey,weights));
    weatherOdds.set(weatherKey,byZone);
  }

  const sections=[];
  sections.push({
    title:'Wiki e-Fish - Mulai & cara membaca peluang',
    description:`Katalog ini memuat ${fish.length} spesies, semua zona, 4 cuaca, mutasi, equipment, dan skill. Halaman dipisah per topik; gunakan tombol Sebelumnya/Berikutnya untuk berpindah.`,
    fields:[
      {name:'Mulai bermain',value:'Gunakan /fish untuk memancing. Setelah tangkapan, tombol Mancing lagi atau /inventory membantu lanjut bermain. /sell menjual ikan; /shop browse untuk gear; /skills status untuk skill; /zone list untuk progres zona.'},
      {name:'Arti angka peluang',value:`Persentase adalah peluang per satu tangkapan, di zona dan cuaca yang tertulis. Gear, skill Luck, dan event dapat mengubah peluang rarity. Ikan dalam tier yang sama dibagi rata. Cuaca dapat menambah ikan khusus ke pool sehingga peluang spesies berubah. Setiap tangkapan acak mandiri; tidak ada pity.`},
      {name:'Status kamu sekarang',value:`Level ${playerLevel} | Koin ${playerData.coins}\nZona: ${currentZone.name}\nCuaca server: ${weather.name} - berubah <t:${Math.floor(currentWeather.ends_at/1000)}:R>\nLuck untuk cast berikutnya: ${luck}${luckState.event?` (dasar ${baseLuck}, event x${luckState.event.multiplier})`:''}\nShiny: ${formatChance(SHINY_CHANCE_PERCENT)} per tangkapan, terpisah dari rarity.`}
    ]
  });

  const zoneDescriptions={
    pond:'Kolam awal untuk mulai memancing dan mengenal ikan dasar.',
    river:'Sungai berarus deras dengan koleksi ikan sungai.',
    deep_sea:'Zona laut dalam untuk ikan Astral dan tempat mutasi mulai aktif.',
    twilight_reef:'Terumbu senja yang menjadi rumah ikan laut dalam langka.',
    abyssal_chasm:'Celah jurang bertekanan tinggi yang menyimpan ikan Eternal pertama.',
    astral_expanse:'Zona endgame dengan ikan Astral dan Eternal.'
  };
  const zoneKeys=Object.keys(locationCatalog);
  const zoneFields=Object.entries(locationCatalog).map(([key,zone],index)=>{
    const prerequisite=index?locationCatalog[zoneKeys[index-1]].name:'Tidak ada';
    const status=currentLocation===key?'Lokasi kamu saat ini':unlocked.has(key)?'Sudah terbuka':'Belum terbuka';
    return {name:`${zone.name}${currentLocation===key?' - SEDANG DIPAKAI':''}`,value:`${zoneDescriptions[key]||zone.description}\nLevel minimum: ${zone.level} | Biaya buka: ${zone.cost} coins\nBuka sebelumnya: ${prerequisite}\nStatus: ${status}\nMutasi: ${zone.mutationsEnabled?'aktif':'belum aktif'}`};
  });
  const nextZoneKey=zoneKeys[zoneKeys.indexOf(currentLocation)+1],nextZone=nextZoneKey?locationCatalog[nextZoneKey]:null;
  sections.push({
    title:'Zona & progres',
    description:`Zona dibuka berurutan setelah memenuhi level dan membayar biaya sekali. Setelah terbuka, perjalanan ke zona itu gratis. Level kamu: ${playerLevel}; saldo: ${playerData.coins} coins.${nextZone?` Zona progres berikutnya: ${nextZone.name} (level ${nextZone.level}, ${nextZone.cost} coins).`:''}`,
    fields:zoneFields
  });

  for(const [zoneKey,zone] of Object.entries(locationCatalog)){
    const odds=weatherOdds.get(activeWeather).get(zoneKey),baseFish=fish.filter(item=>item.location===zoneKey&&!item.weather);
    const fields=[];
    for(const tier of rarityTiers){
      const species=baseFish.filter(item=>item.rarity===tier);
      if(!species.length)continue;
      const tierInfo=odds.byTier.get(tier);
      const value=species.map(item=>wikiFishLine(item,odds.byFish.get(item.name)?.speciesChance||0,`cuaca aktif: ${weather.name}`)).join('\n');
      fields.push({name:`${tier} - peluang tier saat ini ${formatChance(tierInfo?.tierChance||0)}`,value});
    }
    sections.push({
      title:`Ikan zona - ${zone.name}`,
      description:`Ikan non-eksklusif di zona ini. Peluang memakai Luck efektif ${luck} dan cuaca aktif (${weather.name}); peluang tier memperhitungkan seluruh pool saat ini, termasuk ikan eksklusif cuaca. Peluang ikan eksklusif dijelaskan di halaman cuacanya. Nilai adalah harga dasar; shiny dan mutasi dapat menaikkan harga jual.`,
      fields
    });
  }

  for(const [weatherKey,weatherInfo] of Object.entries(weatherCatalog)){
    const fields=[];
    for(const [zoneKey,zone] of Object.entries(locationCatalog)){
      const exclusives=fish.filter(item=>item.location===zoneKey&&item.weather===weatherKey);
      if(!exclusives.length)continue;
      const odds=weatherOdds.get(weatherKey).get(zoneKey),lines=[];
      for(const tier of rarityTiers){
        const species=exclusives.filter(item=>item.rarity===tier);
        if(!species.length)continue;
        const tierInfo=odds.byTier.get(tier);
        lines.push(`**${tier}** - tier ${formatChance(tierInfo?.tierChance||0)}`);
        for(const item of species)lines.push(wikiFishLine(item,odds.byFish.get(item.name)?.speciesChance||0,`saat ${weatherInfo.name}`));
      }
      fields.push({name:zone.name,value:lines.join('\n')});
    }
    const activeNote=weatherKey===activeWeather?` Cuaca ini sedang aktif dan berubah <t:${Math.floor(currentWeather.ends_at/1000)}:R>.`:'';
    sections.push({
      title:`Ikan khusus cuaca - ${weatherInfo.name}`,
      description:`${weatherInfo.description} Durasi: ${weatherInfo.minMinutes}-${weatherInfo.maxMinutes} menit, dipilih acak. Cuaca berlaku untuk seluruh server. Ikan berikut hanya masuk pool di zona yang tertulis saat ${weatherInfo.name} aktif.${activeNote} Peluang memakai Luck efektif ${luck}; peluang tier menghitung ikan biasa dan eksklusif bersama, lalu peluang spesies dibagi rata dalam tier.`,
      fields
    });
  }

  const activeMutationZones=Object.values(locationCatalog).filter(zone=>zone.mutationsEnabled).map(zone=>zone.name).join(', ');
  const mutationDescriptions={
    saltworn:'Sisik berlapis kristal garam.',albino:'Warna pucat yang langka.',gilded:'Sisik berkilau keemasan.',spectral:'Tubuh tampak seperti bayangan transparan.',electric:'Diselimuti percikan listrik.',galaxy:'Memiliki corak bintang dan galaksi.',prismatic:'Warna tubuh berubah seperti spektrum cahaya.',starborn:'Rasi bintang berkilau pada sisiknya.',timeless:'Tampak tidak terpengaruh oleh waktu.'
  };
  const mutationFields=mutationCatalog.map(item=>({
    name:`${item.name} - mutasi ${item.rarity}`,
    value:`${mutationDescriptions[item.key]||item.description}\nPeluang dasar: ${formatChance(item.ratePercent)} (sekitar 1 dari ${Math.round(100/item.ratePercent)})\nDengan equipment kamu: ${formatChance(item.ratePercent*(1+mutationBoost))} per tangkapan di zona mutasi\nPengali nilai jual: x${item.valueMultiplier}`
  }));
  sections.push({
    title:'Mutasi & shiny',
    description:`Mutasi hanya di zona: ${activeMutationZones}. Bonus mutasi dari equipment kamu: +${Math.round(mutationBoost*100)}% dari peluang dasar. Mutasi di-roll terpisah dari rarity dan Luck; label rarity pada mutasi adalah tier mutasinya, bukan tier ikan. Maksimal satu mutasi per ikan; shiny bisa muncul bersamaan. Ikan shiny bernilai jual x2. Mutasi ${currentZone.mutationsEnabled?'aktif':'belum aktif'} di zona kamu saat ini (${currentZone.name}). Shiny: ${formatChance(SHINY_CHANCE_PERCENT)} per tangkapan di semua zona. Tidak ada pity.`,
    fields:mutationFields
  });

  const gearSlots=[['rod','Pancingan'],['bobber','Bobber'],['bait','Pelet']];
  const gearFields=gearSlots.map(([slot,label])=>{
    const items=Object.values(gearCatalog).filter(item=>item.slot===slot);
    const lines=items.map(item=>{
      const equippedName=slot==='rod'?rod?.name:slot==='bobber'?bobber?.name:bait?.name;
      const equipped=equippedName===item.name;
      const active=slot==='bait'&&equipped&&bait?.active;
      const stats=[`+${item.luck} Luck`,`+${item.power} Power`];
      if(item.mutationBoost)stats.push(`+${Math.round(item.mutationBoost*100)}% peluang dasar mutasi`);
      const duration=slot==='bait'?` | ${item.durationMinutes} menit; 1 pelet dipakai saat cast pertama`:'';
      const state=equipped?(slot==='bait'?(active?' - AKTIF':' - dipasang; aktif pada cast berikutnya'):' - DIPAKAI'):'';
      return `- **${item.name}** (${item.rarity}) - ${item.price} coins - ${stats.join(' | ')}${duration}${state}`;
    });
    return {name:label,value:lines.join('\n')};
  });
  const gearLine=[rod?.name,bobber?.name,bait?.name].filter(Boolean).join(', ')||'belum ada';
  sections.push({
    title:'Equipment & pelet',
    description:`Peralatan terpasang: ${gearLine}. Pancingan dan bobber permanen; pelet dikonsumsi satu saat mulai cast pertama, lalu bonus bertahan sesuai durasi. Luck membantu peluang rarity; Power memperbesar rentang berat ikan; bonus mutasi hanya membantu roll mutasi.`,
    fields:gearFields
  });

  const skillLuckContribution=Math.max(0,skills.luck_level-1),skillPowerContribution=Math.max(0,skills.power_level-1);
  sections.push({
    title:'Skill & progres pemain',
    description:`Level pemain ${playerLevel}; XP ${playerData.xp}; poin skill tersedia ${skills.skill_points}. Luck skill ${skills.luck_level}/${MAX_SKILL_LEVEL} (kontribusi ${skillLuckContribution}) dan Power skill ${skills.power_level}/${MAX_SKILL_LEVEL} (kontribusi ${skillPowerContribution}).`,
    fields:[
      {name:'Luck',value:`Menaikkan bobot rarity dan peluang mendapat ikan bonus dalam satu cast. Peluang ikan bonus bertambah 0,05 poin persentase per Luck efektif, maksimal 15% per cast. Level skill maksimum ${MAX_SKILL_LEVEL}. Admin Abuse memberi bonus rarity tambahan yang meningkat makin pelan seiring multiplier; rarity tinggi tetap langka.`},
      {name:'Power',value:`Menaikkan ukuran tangkapan: setiap 1 Power efektif memperbesar rentang hasil sekitar 4%. Power dari equipment ditambahkan ke skill; ukuran hasil dapat melewati batas berat dasar spesies.`},
      {name:'Poin skill dan XP',value:`XP tangkapan saat ini mengikuti nilai dasar ikan. Level pemain naik setiap 100 XP. Poin skill didapat dari tonggak setiap 5 level pemain, maksimal 1 poin dari satu tangkapan. Ikan tidak memberi poin skill setiap kali tertangkap. Upgrade beberapa level sekaligus dengan /skills upgrade dan opsi levels.`},
      {name:'Perintah lanjutan',value:'/weather untuk cuaca | /mutations untuk koleksi mutasi | /dex untuk spesies yang pernah ditemukan | /contracts view untuk target harian | /market browse untuk jual-beli pemain | /trade inbox untuk penawaran.'}
    ]
  });

  return replyWikiPaged(i,sections);
}
async function handleDex(i,g,u){
  getPlayer(g,u);
  const now=Date.now(),owned=db.prepare('SELECT fish_name,rarity FROM inventory WHERE guild_id=? AND user_id=? AND quantity>0').all(g,u);
  const record=db.prepare(`INSERT INTO fishdex(guild_id,user_id,fish_name,rarity,best_kg,discovered_at) VALUES(?,?,?,?,?,?) ON CONFLICT(guild_id,user_id,fish_name,rarity) DO NOTHING`);
  for(const item of owned){
    const species=resolveFishSpecies(item.fish_name);if(!species)continue;
    record.run(g,u,species.baseName,species.rarity,0,now);
    if(species.isShiny)record.run(g,u,`Shiny ${species.baseName}`,species.rarity,0,now);
  }
  const rows=db.prepare('SELECT fish_name,rarity,best_kg FROM fishdex WHERE guild_id=? AND user_id=?').all(g,u),discovered=new Map(rows.map(row=>[row.fish_name,row]));
  const normalCount=fish.filter(item=>discovered.has(item.name)).length,shinyCount=fish.filter(item=>discovered.has(`Shiny ${item.name}`)).length,fields=[];
  for(const [locationKey,location] of Object.entries(locationCatalog)){
    const zoneFish=fish.filter(item=>item.location===locationKey),count=zoneFish.filter(item=>discovered.has(item.name)).length;
    const lines=zoneFish.map(item=>{
      const found=discovered.get(item.name),shiny=discovered.has(`Shiny ${item.name}`);
      const recordText=found&&found.best_kg>0?` · Rekor: ${found.best_kg.toFixed(2)} kg`:'';
      return `${found?'✅':'⬜'} **${item.name}** (${item.rarity})${recordText}${shiny?' · Shiny ditemukan':''}`;
    });
    const chunks=[];let buffer='';
    for(const line of lines){const combined=buffer?`${buffer}\n${line}`:line;if(combined.length>950&&buffer){chunks.push(buffer);buffer=line;}else buffer=combined;}
    if(buffer)chunks.push(buffer);
    for(let part=0;part<chunks.length;part++){
      const suffix=chunks.length>1?` · Bagian ${part+1} dari ${chunks.length}`:'';
      fields.push({name:`${location.name} — ${count}/${zoneFish.length} spesies ditemukan${suffix}`,value:chunks[part]});
    }
  }
  const dex=listEmbed('Fishdex — Koleksi Ikan',fields);
  dex.setDescription(`✅ Sudah tertangkap | ⬜ Belum tertangkap. Spesies ditemukan: **${normalCount}/${fish.length}** | Varian Shiny ditemukan: **${shinyCount}/${fish.length}**. Rekor berat dan catatan Shiny tetap tersimpan meskipun ikan dijual atau ditrade.`);
  return replyPaged(i,{title:'Fishdex — Koleksi Ikan',description:dex.data.description,fields,ephemeral:true});
}
async function handleZone(i,g,u){
  getPlayer(g,u);
  const action=i.options.getSubcommand(),current=getCurrentLocation(g,u),playerData=getPlayer(g,u),level=Math.floor(playerData.xp/100)+1;
  if(action==='list'){
    const unlocked=new Set(db.prepare('SELECT location_key FROM unlocked_locations WHERE guild_id=? AND user_id=?').all(g,u).map(row=>row.location_key));
    const zoneKeys=Object.keys(locationCatalog),fields=Object.entries(locationCatalog).map(([key,zone],index)=>({name:`${zone.name}${current===key?' · LOKASI KAMU':''}`,value:`${zone.description}\nLevel minimum: ${zone.level} | Biaya buka: ${zone.cost} koin\nWajib buka sebelumnya: ${index?locationCatalog[zoneKeys[index-1]].name:'Tidak ada'}\nStatus: ${unlocked.has(key)?'Sudah dibuka':'Belum dibuka'}\nMutasi: ${zone.mutationsEnabled?'Aktif':'Aktif mulai Deep Sea Trench'}`}));
    const message=listEmbed('Daftar Zona Pemancingan',fields);
    message.setDescription(`Lokasi saat ini: **${locationCatalog[current].name}** | Level: **${level}** | Koin: **${playerData.coins}**. Buka zona secara berurutan. Setelah terbuka, perjalanan ke sana gratis.`);
    return replyPaged(i,{title:'Daftar Zona Pemancingan',description:message.data.description,fields,ephemeral:true});
  }
  const destination=i.options.getString('location');
  const zone=locationCatalog[destination];
  if(!zone)return i.reply({content:'Choose a valid fishing location.',flags:MessageFlags.Ephemeral});
  const unlocked=!!db.prepare('SELECT 1 FROM unlocked_locations WHERE guild_id=? AND user_id=? AND location_key=?').get(g,u,destination);
  if(action==='unlock'){
    if(unlocked)return i.reply({content:`${zone.name} is already unlocked. Use /zone travel to go there.`,flags:MessageFlags.Ephemeral});
    const zoneKeys=Object.keys(locationCatalog),previousKey=zoneKeys[zoneKeys.indexOf(destination)-1];
    if(previousKey&&!db.prepare('SELECT 1 FROM unlocked_locations WHERE guild_id=? AND user_id=? AND location_key=?').get(g,u,previousKey))return i.reply({content:`Unlock **${locationCatalog[previousKey].name}** before **${zone.name}** to keep zone progression in order.`,flags:MessageFlags.Ephemeral});
    if(level<zone.level)return i.reply({content:`You need player level ${zone.level} to unlock ${zone.name}. Your level is ${level}.`,flags:MessageFlags.Ephemeral});
    const result=db.transaction(()=>{
      const latest=getPlayer(g,u);
      if(latest.coins<zone.cost)return {ok:false,balance:latest.coins};
      db.prepare('UPDATE players SET coins=coins-? WHERE guild_id=? AND user_id=?').run(zone.cost,g,u);
      db.prepare('INSERT OR IGNORE INTO unlocked_locations(guild_id,user_id,location_key,unlocked_at) VALUES(?,?,?,?)').run(g,u,destination,Date.now());
      return {ok:true};
    })();
    if(!result.ok)return i.reply({content:`Unlocking ${zone.name} costs ${zone.cost} coins. Your balance is ${result.balance}.`,flags:MessageFlags.Ephemeral});
    return i.reply({content:`Unlocked **${zone.name}** for **${zone.cost} coins**. Use /zone travel to fish there.`,flags:MessageFlags.Ephemeral});
  }
  if(!unlocked)return i.reply({content:`${zone.name} is locked. Use /zone unlock first.`,flags:MessageFlags.Ephemeral});
  db.prepare('UPDATE player_locations SET current_location=? WHERE guild_id=? AND user_id=?').run(destination,g,u);
  return i.reply({content:`You are now fishing at **${zone.name}**. Its fish pool is exclusive to this location. ${zone.mutationsEnabled?'Mutations are active here.':'Mutations unlock in Deep Sea Trench and deeper zones.'}`,flags:MessageFlags.Ephemeral});
}
async function handleContracts(i,g,u){
  getPlayer(g,u);
  const day=ensureDailyContracts(g,u),action=i.options.getSubcommand();
  if(action==='view'){
    const rows=db.prepare('SELECT * FROM daily_contracts WHERE guild_id=? AND user_id=? AND day_id=? ORDER BY contract_key').all(g,u,day);
    const fields=rows.map(row=>{
      const target=row.target_location?`\nLocation: ${locationCatalog[row.target_location]?.name||row.target_location}`:'';
      const status=row.claimed?'Reward claimed':row.progress>=row.goal_value?'Complete - claim available':'In progress';
      return {name:row.title,value:`Progress: **${row.progress}/${row.goal_value}**\nReward: **${row.reward} coins**${target}\nStatus: ${status}`};
    });
    const nextReset=Math.floor((Date.parse(`${day}T00:00:00+07:00`)+86_400_000)/1000);
    const message=listEmbed('Daily fishing contracts',fields,'No contracts available.');
    message.setDescription(`Daily contracts reset <t:${nextReset}:R> (00:00 Asia/Bangkok). Progress is earned automatically while fishing. Use /contracts claim when an objective is complete.`);
    return replyPaged(i,{title:'Daily fishing contracts',description:message.data.description,fields,emptyText:'No contracts available.',ephemeral:true});
  }
  const key=i.options.getString('contract');
  const result=db.transaction(()=>{
    if(key==='all'){
      const rows=db.prepare('SELECT * FROM daily_contracts WHERE guild_id=? AND user_id=? AND day_id=? AND claimed=0 AND progress>=goal_value ORDER BY contract_key').all(g,u,day);
      if(!rows.length)return {ok:false,message:'There are no completed daily contracts to claim yet.'};
      const claimed=[];
      for(const row of rows){
        const changed=db.prepare('UPDATE daily_contracts SET claimed=1 WHERE guild_id=? AND user_id=? AND day_id=? AND contract_key=? AND claimed=0 AND progress>=goal_value').run(g,u,day,row.contract_key);
        if(changed.changes)claimed.push(row);
      }
      const reward=claimed.reduce((sum,row)=>sum+row.reward,0);
      if(!claimed.length)return {ok:false,message:'Contract rewards were already claimed.'};
      db.prepare('UPDATE players SET coins=coins+? WHERE guild_id=? AND user_id=?').run(reward,g,u);
      return {ok:true,claimed,reward};
    }
    const row=db.prepare('SELECT * FROM daily_contracts WHERE guild_id=? AND user_id=? AND day_id=? AND contract_key=?').get(g,u,day,key);
    if(!row)return {ok:false,message:'That daily contract was not found. Use /contracts view.'};
    if(row.claimed)return {ok:false,message:'You already claimed this contract reward.'};
    if(row.progress<row.goal_value)return {ok:false,message:`Not complete yet: ${row.progress}/${row.goal_value}.`};
    const changed=db.prepare('UPDATE daily_contracts SET claimed=1 WHERE guild_id=? AND user_id=? AND day_id=? AND contract_key=? AND claimed=0 AND progress>=goal_value').run(g,u,day,key);
    if(!changed.changes)return {ok:false,message:'This contract reward was already claimed.'};
    db.prepare('UPDATE players SET coins=coins+? WHERE guild_id=? AND user_id=?').run(row.reward,g,u);
    return {ok:true,row};
  })();
  if(!result.ok)return i.reply({content:result.message,flags:MessageFlags.Ephemeral});
  if(result.claimed)return i.reply({content:`Claimed **${result.claimed.length} daily contracts**: ${result.claimed.map(row=>row.title).join(', ')}. Total reward: **${result.reward} coins**.`,flags:MessageFlags.Ephemeral});
  return i.reply({content:`Daily contract complete: **${result.row.title}**. You received **${result.row.reward} coins**.`,flags:MessageFlags.Ephemeral});
}
async function handleSkills(i,g,u){
  const action=i.options.getSubcommand(),skills=getSkills(g,u),p=getPlayer(g,u),level=Math.floor(p.xp/100)+1;
  if(action==='status'){
    const rod=getEquipped(g,u,'rod'),bobber=getEquipped(g,u,'bobber'),bait=getEquipped(g,u,'bait');
    const baseLuck=Math.max(0,skills.luck_level-1)+(rod?.luck||0)+(bobber?.luck||0)+(bait?.luck||0),luckState=getEffectiveLuck(baseLuck,g),luck=luckState.effectiveLuck;
      const multiCatchChance=getMultiCatchChance(luck),currentLocation=getCurrentLocation(g,u),currentWeather=getCurrentWeather(g);
      const tierChanceLines=getFishTierChances(luck,currentLocation,currentWeather.weather_key,luckState.event).map(({tier,chance})=>{
        if(chance!==null)return `${tier}: **${formatChance(chance)}** (about 1 in ${Math.round(100/chance).toLocaleString('en-US')})`;
        const weatherZones=[...new Set(fish.filter(item=>item.rarity===tier&&item.weather===currentWeather.weather_key).map(item=>item.location))];
        const availableZones=weatherZones.length?weatherZones:[...new Set(fish.filter(item=>item.rarity===tier&&(!item.weather||item.weather===currentWeather.weather_key)).map(item=>item.location))];
        const zoneNames=availableZones.map(key=>locationCatalog[key]?.name||key).join(', ');
        return zoneNames?`${tier}: no ${tier} fish in ${locationCatalog[currentLocation].name}; ${currentWeather.name} options are in ${zoneNames}`:`${tier}: no fish of this tier during ${currentWeather.name}`;
      }).join('\n');
     return i.reply({embeds:[embed('Fishing skills',`Player level **${level}** | unspent points **${skills.skill_points}**\nLuck **${skills.luck_level}/${MAX_SKILL_LEVEL}** | Power **${skills.power_level}/${MAX_SKILL_LEVEL}**\nLuck used for odds: **${luck}**${luckState.event?` (x${luckState.event.multiplier}; base ${baseLuck})`:''}\nBonus fish chance **${formatChance(multiCatchChance)} per cast**\n**Rarity chance per cast: ${locationCatalog[currentLocation].name} / ${weatherCatalog[currentWeather.weather_key].name}**\n${tierChanceLines}\nOne tier is rolled each cast; a fish species is chosen from the available fish in that tier. There is no pity or guaranteed catch count.\nBest catch **${skills.best_kg.toFixed(2)} kg**\nEarn 1 skill point every 5 player levels, at most 1 per tangkapan. Use /skills upgrade to spend points.${luckEventNotice(luckState.event)}`)],flags:MessageFlags.Ephemeral});
  }
  const which=i.options.getString('skill'),column=which==='luck'?'luck_level':'power_level',current=skills[column],levels=i.options.getInteger('levels');
  if(!Number.isInteger(levels)||levels<1||levels>MAX_SKILL_LEVEL-1)return i.reply({content:`Choose a level amount from 1 to ${MAX_SKILL_LEVEL-1}.`,flags:MessageFlags.Ephemeral});
  const available=Math.min(skills.skill_points,MAX_SKILL_LEVEL-current);
  if(available<1)return i.reply({content:current>=MAX_SKILL_LEVEL?`${which} is already at the maximum level ${MAX_SKILL_LEVEL}.`:'You do not have an unspent skill point. Gain a player level by fishing.',flags:MessageFlags.Ephemeral});
  if(levels>available)return i.reply({content:`You can upgrade at most **${available} level${available===1?'':'s'}** right now (${skills.skill_points} points available; ${which} cap is ${MAX_SKILL_LEVEL}). Lower the level count or earn more points.`,flags:MessageFlags.Ephemeral});
  const changed=db.prepare(`UPDATE player_skills SET ${column}=${column}+?,skill_points=skill_points-? WHERE guild_id=? AND user_id=? AND skill_points>=? AND ${column}+?<=${MAX_SKILL_LEVEL}`).run(levels,levels,g,u,levels,levels);
  if(!changed.changes)return i.reply({content:'Your skill points or skill level changed. Check /skills status and try again.',flags:MessageFlags.Ephemeral});
  const next=current+levels;
  return i.reply({embeds:[embed('Skill upgraded',`${which[0].toUpperCase()+which.slice(1)} is now level **${next}** (+${levels}). Spent **${levels}** skill points. Remaining points: **${skills.skill_points-levels}**.`)],flags:MessageFlags.Ephemeral});
}
async function handleMarket(i,g,u){
  const action=i.options.getSubcommand(),now=Date.now(); expireMarket(g,now);
  if(action==='sell'){
    const fishInput=i.options.getString('fish').trim(),quantity=i.options.getInteger('quantity'),price=i.options.getInteger('price');
    const item=db.prepare('SELECT fish_name,rarity,quantity FROM inventory WHERE guild_id=? AND user_id=? AND lower(fish_name)=lower(?)').get(g,u,fishInput);
    if(!item)return i.reply({content:'That fish is not in your inventory.',flags:MessageFlags.Ephemeral});
    if(isFishProtected(g,u,item.fish_name,item.rarity))return i.reply({content:'This fish is favorited or locked, so it cannot be listed. Unprotect it with /inventory first.',flags:MessageFlags.Ephemeral});
    if(item.quantity-reservedFish(g,u,item.fish_name,item.rarity)<quantity)return i.reply({content:'You do not have enough unlisted fish available for this listing.',flags:MessageFlags.Ephemeral});
    const active=db.prepare("SELECT COUNT(*) AS count FROM market_listings WHERE guild_id=? AND seller_id=? AND status='pending'").get(g,u).count;
    if(active>=20)return i.reply({content:'You have 20 active listings already. Cancel one or wait for it to expire.',flags:MessageFlags.Ephemeral});
    const info=db.prepare('INSERT INTO market_listings(guild_id,seller_id,fish_name,rarity,quantity,price,created_at,expires_at) VALUES(?,?,?,?,?,?,?,?)').run(g,u,item.fish_name,item.rarity,quantity,price,now,now+7*86_400_000);
    return i.reply({embeds:[embed(`Market listing #${info.lastInsertRowid}`,`**${quantity} × ${item.fish_name}** (${item.rarity}) listed for **${price} coins total**. Listings expire in 7 days; use /market browse to view them.`)]});
  }
  if(action==='browse'||action==='mine'){
    const rows=action==='browse'
      ?db.prepare("SELECT id,seller_id,fish_name,rarity,quantity,price,expires_at FROM market_listings WHERE guild_id=? AND status='pending' AND seller_id<>? ORDER BY id DESC LIMIT 15").all(g,u)
      :db.prepare('SELECT id,seller_id,fish_name,rarity,quantity,price,status,expires_at FROM market_listings WHERE guild_id=? AND seller_id=? ORDER BY id DESC LIMIT 15').all(g,u);
    const fields=rows.map(r=>{
      const unit=r.price/r.quantity,unitText=Number.isInteger(unit)?String(unit):unit.toFixed(2).replace(/\.?0+$/,'');
      const status=r.status?`\nStatus: ${r.status}`:'';
      const expiry=!r.status||r.status==='pending'?`\nExpires <t:${Math.floor(r.expires_at/1000)}:R>`:'';
      return {name:`#${r.id} | ${r.fish_name} x${r.quantity}`,value:`${r.rarity}\nTotal: **${r.price} coins** (${unitText} each)\nSeller: <@${r.seller_id}>${status}${expiry}`};
    });
    const balance=getPlayer(g,u).coins;
    const marketEmbed=listEmbed(action==='browse'?'Fish marketplace':'Your listings',fields,'No listings found.\n\nYour balance: **' + balance + ' coins**');
    if(rows.length)marketEmbed.setDescription(`Your balance: **${balance} coins**`);
    return replyPaged(i,{title:action==='browse'?'Fish marketplace':'Your listings',description:marketEmbed.data.description,fields,emptyText:'No listings found. Balance: '+balance+' coins',ephemeral:true});
  }
  const id=i.options.getInteger('id');
  if(action==='buy'){
    getPlayer(g,u);
    const result=db.transaction(()=>{
      const listing=db.prepare('SELECT * FROM market_listings WHERE id=? AND guild_id=?').get(id,g);
      if(!listing)return {ok:false,message:`Listing #${id} was not found.`};
      if(listing.seller_id===u)return {ok:false,message:'You cannot buy your own listing.'};
      if(listing.status!=='pending')return {ok:false,message:`This listing is already ${listing.status}.`};
      if(listing.expires_at<=Date.now()){db.prepare("UPDATE market_listings SET status='expired' WHERE id=? AND status='pending'").run(id);return {ok:false,message:'This listing has expired.'};}
      if(isFishProtected(g,listing.seller_id,listing.fish_name,listing.rarity))return {ok:false,message:'This fish is now favorited or locked by the seller.'};
      const item=db.prepare('SELECT value,quantity FROM inventory WHERE guild_id=? AND user_id=? AND fish_name=? AND rarity=?').get(g,listing.seller_id,listing.fish_name,listing.rarity);
      if(!item||item.quantity-reservedFish(g,listing.seller_id,listing.fish_name,listing.rarity,{marketId:listing.id})<listing.quantity)return {ok:false,message:'The seller no longer has enough reserved fish for this listing.'};
      const buyer=getPlayer(g,u);if(buyer.coins<listing.price)return {ok:false,message:`You need ${listing.price} coins; your balance is ${buyer.coins}.`};
      db.prepare('UPDATE inventory SET quantity=quantity-? WHERE guild_id=? AND user_id=? AND fish_name=? AND rarity=?').run(listing.quantity,g,listing.seller_id,listing.fish_name,listing.rarity);
      db.prepare('DELETE FROM inventory WHERE guild_id=? AND user_id=? AND fish_name=? AND rarity=? AND quantity<=0').run(g,listing.seller_id,listing.fish_name,listing.rarity);
      db.prepare('UPDATE players SET coins=coins-? WHERE guild_id=? AND user_id=?').run(listing.price,g,u);
      db.prepare('UPDATE players SET coins=coins+? WHERE guild_id=? AND user_id=?').run(listing.price,g,listing.seller_id);
      db.prepare(`INSERT INTO inventory(guild_id,user_id,fish_name,rarity,value,quantity) VALUES(?,?,?,?,?,?)
        ON CONFLICT(guild_id,user_id,fish_name,rarity) DO UPDATE SET quantity=quantity+excluded.quantity`).run(g,u,listing.fish_name,listing.rarity,item.value,listing.quantity);
      db.prepare("UPDATE market_listings SET status='sold',completed_at=? WHERE id=? AND status='pending'").run(Date.now(),id);
      return {ok:true,listing};
    })();
    if(!result.ok)return i.reply({content:result.message,flags:MessageFlags.Ephemeral});
    return i.reply({embeds:[embed('Purchase complete',`You bought **${result.listing.quantity} × ${result.listing.fish_name}** from <@${result.listing.seller_id}> for **${result.listing.price} coins**.`)]});
  }
  const changed=db.prepare("UPDATE market_listings SET status='cancelled',completed_at=? WHERE id=? AND guild_id=? AND seller_id=? AND status='pending'").run(now,id,g,u);
  if(!changed.changes)return i.reply({content:'No matching active listing found for you.',flags:MessageFlags.Ephemeral});
  return i.reply({content:`Market listing #${id} cancelled.`,flags:MessageFlags.Ephemeral});
}
client.once('ready',()=>{armLuckEventSchedule(allowedGuild);armWeatherRotation(allowedGuild);console.log(`Online as ${client.user.tag}. Allowed server: ${allowedGuild}. Data: ${path.join(dataDir,'fish-game.sqlite')}`);});
async function handleFish(i,g,u,fromButton=false){
  if(fromButton)await i.deferUpdate();
  const p=getPlayer(g,u),now=Date.now(),wait=5_000-(now-p.last_fish_at);
  if(wait>0){const content=`Tunggu ${Math.ceil(wait/1000)} detik sebelum memancing lagi.`;if(fromButton)await i.followUp({content,flags:MessageFlags.Ephemeral});else await i.reply({content,flags:MessageFlags.Ephemeral});return;}
  if(!fromButton)await i.deferReply();
  const location=getCurrentLocation(g,u);ensureDailyContracts(g,u);
  const skills=getSkills(g,u),rod=getEquipped(g,u,'rod'),bobber=getEquipped(g,u,'bobber');
  const activeBait=db.prepare('SELECT item_key,expires_at FROM active_bait WHERE guild_id=? AND user_id=? AND expires_at>?').get(g,u,now);
  let bait=null,baitKey=null,baitExpiresAt=null,activateBait=false;
  if(activeBait){baitKey=activeBait.item_key;bait=gearCatalog[baitKey]||null;baitExpiresAt=activeBait.expires_at;}
  else{
    db.prepare('DELETE FROM active_bait WHERE guild_id=? AND user_id=? AND expires_at<=?').run(g,u,now);
    const equippedBait=db.prepare("SELECT item_key FROM equipped_gear WHERE guild_id=? AND user_id=? AND slot='bait'").get(g,u),candidate=equippedBait?gearCatalog[equippedBait.item_key]:null;
    const owned=equippedBait?db.prepare('SELECT quantity FROM gear_inventory WHERE guild_id=? AND user_id=? AND item_key=?').get(g,u,equippedBait.item_key):null;
    if(candidate?.slot==='bait'&&owned?.quantity>0){baitKey=equippedBait.item_key;bait=candidate;baitExpiresAt=now+bait.durationMinutes*60_000;activateBait=true;}
    else if(equippedBait)db.prepare("DELETE FROM equipped_gear WHERE guild_id=? AND user_id=? AND slot='bait' AND item_key=?").run(g,u,equippedBait.item_key);
  }
  const baseLuck=Math.max(0,skills.luck_level-1)+(rod?.luck||0)+(bobber?.luck||0)+(bait?.luck||0),luckState=getEffectiveLuck(baseLuck,g,now),luck=luckState.effectiveLuck;
  const power=Math.max(0,skills.power_level-1)+(rod?.power||0)+(bobber?.power||0);
   const weatherState=getCurrentWeather(g,now),mutationBoost=getMutationBoost(rod,bobber,bait),multiCatchChance=getMultiCatchChance(luck);
   const catches=[rollFishCatch(luck,location,weatherState.weather_key,power,mutationBoost,luckState.event)];
   if(Math.random()<multiCatchChance/100)catches.push(rollFishCatch(luck,location,weatherState.weather_key,power,mutationBoost,luckState.event));
   const totalXp=catches.reduce((sum,item)=>sum+item.f.xpValue,0),newXp=p.xp+totalXp,newLevel=Math.floor(newXp/100)+1;
   const pointsEarned=Math.min(catches.length,Math.max(0,Math.floor(newLevel/5)-Math.floor(skills.awarded_level/5)));
  const tx=db.transaction(()=>{
     db.prepare('UPDATE players SET xp=?,total_caught=total_caught+?,last_fish_at=? WHERE guild_id=? AND user_id=?').run(newXp,catches.length,now,g,u);
    const dexUpsert=db.prepare(`INSERT INTO fishdex(guild_id,user_id,fish_name,rarity,best_kg,discovered_at) VALUES(?,?,?,?,?,?) ON CONFLICT(guild_id,user_id,fish_name,rarity) DO UPDATE SET best_kg=MAX(best_kg,excluded.best_kg)`);
     for(const item of catches){
       const {caughtFish,f,autoLock,weightKg}=item;
       db.prepare(`INSERT INTO inventory(guild_id,user_id,fish_name,rarity,value,quantity) VALUES(?,?,?,?,?,1) ON CONFLICT(guild_id,user_id,fish_name,rarity) DO UPDATE SET quantity=quantity+1,value=excluded.value`).run(g,u,f.name,f.rarity,f.value);
       if(autoLock)db.prepare('INSERT INTO fish_preferences(guild_id,user_id,fish_name,rarity,favorite,locked) VALUES(?,?,?,?,0,1) ON CONFLICT(guild_id,user_id,fish_name,rarity) DO UPDATE SET locked=1').run(g,u,f.name,f.rarity);
       dexUpsert.run(g,u,caughtFish.name,caughtFish.rarity,weightKg,now);
       if(f.isShiny)dexUpsert.run(g,u,`Shiny ${caughtFish.name}`,caughtFish.rarity,weightKg,now);
       if(f.mutation)db.prepare('INSERT INTO mutationdex(guild_id,user_id,mutation_key,caught_count,best_value,discovered_at) VALUES(?,?,?,?,?,?) ON CONFLICT(guild_id,user_id,mutation_key) DO UPDATE SET caught_count=caught_count+1,best_value=MAX(best_value,excluded.best_value)').run(g,u,f.mutation.key,1,f.value,now);
       trackCatchContracts(g,u,caughtFish,location);
     }
     db.prepare('UPDATE player_skills SET skill_points=skill_points+?,awarded_level=MAX(awarded_level,?),best_kg=MAX(best_kg,?) WHERE guild_id=? AND user_id=?').run(pointsEarned,newLevel,Math.max(...catches.map(item=>item.weightKg)),g,u);
    if(activateBait){
      const consumed=db.prepare('UPDATE gear_inventory SET quantity=quantity-1 WHERE guild_id=? AND user_id=? AND item_key=? AND quantity>0').run(g,u,baitKey);
      if(!consumed.changes)throw new Error('Pellet quantity changed before activation.');
      db.prepare('DELETE FROM gear_inventory WHERE guild_id=? AND user_id=? AND item_key=? AND quantity<=0').run(g,u,baitKey);
      db.prepare('INSERT INTO active_bait(guild_id,user_id,item_key,expires_at) VALUES(?,?,?,?) ON CONFLICT(guild_id,user_id) DO UPDATE SET item_key=excluded.item_key,expires_at=excluded.expires_at').run(g,u,baitKey,baitExpiresAt);
    }
  });tx();
   const gearLine=[rod?.name,bobber?.name,bait?.name].filter(Boolean).join(', ');
   const {caughtFish,f,autoLock,weightKg}=catches[0],isShiny=f.isShiny,mutation=f.mutation;
  const weatherCatchNotice=caughtFish.weather?`\n🌦️ **Ikan khusus cuaca!** Hanya muncul saat ${weatherCatalog[caughtFish.weather].name}.`:'';
  const baitNotice=baitKey?(activateBait?`\n${bait.name} activated: +${bait.luck} Luck for ${bait.durationMinutes} min (1 pellet used).`:`\n${bait.name} active until <t:${Math.floor(baitExpiresAt/1000)}:R>.`):'';
  const gained=pointsEarned?`\nLevel up! You earned **${pointsEarned} skill point${pointsEarned===1?'':'s'}**.`:'';
  const mutationNotice=mutation
    ?`\n🧬 Mutasi: ✅ **${mutation.name} (${mutation.rarity})** — nilai jual x${mutation.valueMultiplier}.`
    :locationCatalog[location]?.mutationsEnabled?'\n🧬 Mutasi: Tidak ada pada tangkapan ini.'
    :'\n🧬 Mutasi: Tidak di-roll di zona ini (mutasi hanya aktif mulai Deep Sea Trench).';
  const mutationBoostNotice=locationCatalog[location]?.mutationsEnabled&&mutationBoost?`\nBonus peluang mutasi dari equipment: +${Math.round(mutationBoost*100)}% dari peluang dasar.`:'';
  const autoLockNotice=autoLock?'\n🔒 Otomatis dikunci: terlindungi dari jual, trade, dan marketplace. Gunakan /inventory → Unlock jika ingin melepas proteksi.':'';
  const row=new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('fish_again').setLabel('\u{1F3A3} Mancing lagi').setStyle(ButtonStyle.Primary),new ButtonBuilder().setCustomId('fish_inventory').setLabel('\u{1F4E6} Inventory').setStyle(ButtonStyle.Secondary));
  const playerName=i.member?.displayName||i.member?.nick||i.user.globalName||i.user.username;
   if(catches.length>1){
     const fishDetails=catches.map((item,index)=>{
       const {caughtFish,f,autoLock,weightKg}=item;
       const lines=[`Berat: **${weightKg.toFixed(2)} kg**`,`Nilai jual: **${f.value} coins**`];
       if(caughtFish.weather)lines.push(`Ikan khusus cuaca: hanya muncul saat ${weatherCatalog[caughtFish.weather].name}.`);
       if(f.isShiny)lines.push('Varian: **Shiny**.');
       if(f.mutation)lines.push(`Mutasi: **${f.mutation.name} (${f.mutation.rarity})** — nilai jual x${f.mutation.valueMultiplier}.`);
       else if(locationCatalog[location]?.mutationsEnabled)lines.push('Mutasi: tidak ada pada tangkapan ini.');
       else lines.push('Mutasi: tidak di-roll di zona ini (aktif mulai Deep Sea Trench).');
       if(autoLock)lines.push('Otomatis dikunci: terlindungi dari jual, trade, dan marketplace.');
       return `**Ikan ${index+1}: ${f.name} [${f.rarity}]**\n${lines.join('\n')}`;
     }).join('\n\n');
     const totalSellValue=catches.reduce((sum,item)=>sum+item.f.value,0);
     const luckLine=luckState.event?`Luck used: **${luck}** (x${luckState.event.multiplier}; base ${baseLuck})`:`Luck bonus: **${luck}**`;
     const description=`${fishDetails}\n\n**Total: ${catches.length} fish** | Total sell value: **${totalSellValue} coins**\n**${locationCatalog[location].name}** | ${weatherCatalog[weatherState.weather_key].emoji} **${weatherCatalog[weatherState.weather_key].name}**\n${luckLine} | Power bonus: **${power}**${gearLine?`\nGear: ${gearLine}`:''}${baitNotice}${gained}${mutationBoostNotice}${luckEventNotice(luckState.event)}\nUse /inventory, /dex, or /mutations to view your collection.`;
     const response={embeds:[embed(`${playerName} got a lucky double catch!`,description)],components:[row]};
     if(fromButton)await i.followUp(response);else await i.editReply(response);
     return;
   }
   const catchTitle=catches.length>1?`${playerName} got a lucky double catch!`:`${playerName} caught a ${f.name} [${f.rarity}]!`;
   const extraCatchNotice=catches.slice(1).map(item=>{
     const notes=[];
     if(item.caughtFish.weather)notes.push(`Weather-exclusive: ${weatherCatalog[item.caughtFish.weather].name}`);
     if(item.f.isShiny)notes.push('Shiny');
     if(item.f.mutation)notes.push(`Mutation: ${item.f.mutation.name} (x${item.f.mutation.valueMultiplier})`);
     if(item.autoLock)notes.push('Auto-locked');
     return `\nBonus fish: **${item.f.name} [${item.f.rarity}]** — ${item.weightKg.toFixed(2)} kg | ${item.f.value} coins${notes.length?`\n${notes.join(' | ')}`:''}`;
   }).join('');
   const totalSellValue=catches.reduce((sum,item)=>sum+item.f.value,0);
   const multiCatchSummary=catches.length>1?`\nTotal: **${catches.length} fish** | Total sell value: **${totalSellValue} coins**`:'';
  const luckLine=luckState.event?`Luck used: **${luck}** (x${luckState.event.multiplier}; base ${baseLuck})`:`Luck bonus: **${luck}**`;
   const response={embeds:[embed(catchTitle,`**${weightKg.toFixed(2)} kg** | **${locationCatalog[location].name}** | ${weatherCatalog[weatherState.weather_key].emoji} **${weatherCatalog[weatherState.weather_key].name}** | Nilai jual: **${f.value} coins**\n${luckLine} | Power bonus: **${power}**${gearLine?`\nGear: ${gearLine}`:''}${weatherCatchNotice}${baitNotice}${gained}${mutationNotice}${mutationBoostNotice}${autoLockNotice}${extraCatchNotice}${multiCatchSummary}${luckEventNotice(luckState.event)}\nUse /inventory, /dex, or /mutations to view your collection.`)],components:[row]};
  if(fromButton)await i.followUp(response);else await i.editReply(response);
}
client.on('error',error=>logRuntimeError('Discord client error',error));
client.on('interactionCreate',async i=>{
  logInteractionActivity(i);
  if(i.isButton()&&i.customId.startsWith('fishfav:')){
    const [,sessionId,decision]=i.customId.split(':'),state=fishProtectionSessions.get(sessionId);
    if(!state||state.expiresAt<=Date.now()){
      fishProtectionSessions.delete(sessionId);
      await i.reply({content:'Pilihan ini sudah kedaluwarsa. Jalankan /inventory lagi.',flags:MessageFlags.Ephemeral}).catch(()=>{});
      return;
    }
    if(i.user.id!==state.ownerId||i.guildId!==state.guildId||i.guildId!==allowedGuild){
      await i.reply({content:'Tombol ini hanya bisa dipakai oleh pemain yang membuat pilihan.',flags:MessageFlags.Ephemeral}).catch(()=>{});
      return;
    }
    if(decision==='cancel'){
      fishProtectionSessions.delete(sessionId);
      await i.update({content:'Dibatalkan. Tidak ada perubahan pada Favorit.',embeds:[],components:[]}).catch(()=>{});
      return;
    }
    if(decision!=='confirm')return;
    try{
      await i.deferUpdate();
      fishProtectionSessions.delete(sessionId);
      const result=applyBulkProtection(state.guildId,state.ownerId,state),setting=['favorite','lock'].includes(state.action),column=['favorite','unfavorite'].includes(state.action)?'Favorit':'Lock';
      const operation=state.action==='favorite'?'ditambahkan ke Favorit':state.action==='lock'?'dikunci':state.action==='unfavorite'?'dihapus dari Favorit':'dibuka kuncinya';
      const other=column==='Favorit'?'Lock':'Favorit';
      const content=setting
        ?`Selesai: **${result.affected} varian ikan** ${operation}. **${result.cancelledTrades}** penawaran trade dan **${result.cancelledListings}** listing marketplace dibatalkan.`
        :`Selesai: **${result.affected} varian ikan** ${operation}. Status ${other} tetap aktif jika ada; penawaran/listing yang sudah dibatalkan tidak dipulihkan.`;
      await i.editReply({content,embeds:[],components:[]});
    }catch(error){
      fishProtectionSessions.delete(sessionId);
      logRuntimeError('Bulk fish protection action failed',error);
      await i.editReply({content:'Aksi Favorit gagal diproses. Coba jalankan /inventory lagi.',embeds:[],components:[]}).catch(()=>{});
    }
    return;
  }
  if(i.isButton()&&i.customId.startsWith('efish_page:')){
    const [,sessionId,direction]=i.customId.split(':'),state=paginationSessions.get(sessionId);
    if(!state||state.expiresAt<=Date.now()){
      paginationSessions.delete(sessionId);
      await i.reply({content:'Halaman ini sudah kedaluwarsa. Jalankan command terkait lagi.',flags:MessageFlags.Ephemeral}).catch(()=>{});
      return;
    }
    if(state.ephemeral&&i.user.id!==state.ownerId){await i.reply({content:'Tombol daftar ini hanya bisa dipakai oleh pemain yang membukanya.',flags:MessageFlags.Ephemeral}).catch(()=>{});return;}
    if(direction==='prev')state.page=Math.max(0,state.page-1);
    if(direction==='next')state.page=Math.min(state.pages.length-1,state.page+1);
    try{await i.update({embeds:[renderListPage(state)],components:listPageControls(sessionId,state)});}
    catch(error){if(error?.code===10062){console.warn('Discord rejected an expired list pagination interaction (10062).');return;}logRuntimeError('List pagination button error',error);}
    return;
  }
  if(i.isButton()&&i.customId==='fish_inventory'){
    if(!i.guildId||i.guildId!==allowedGuild){await i.reply({content:'Game ini hanya aktif di server yang diizinkan.',flags:MessageFlags.Ephemeral}).catch(()=>{});return;}
    try{await replyPaged(i,fishInventoryData(allowedGuild,i.user.id));}catch(error){if(error?.code===10062){console.warn('Discord rejected the inventory button interaction (10062).');return;}logRuntimeError('Inventory button error',error);if(i.deferred||i.replied)await i.followUp({content:'Inventory tidak bisa dibuka sekarang. Coba gunakan /inventory.',flags:MessageFlags.Ephemeral}).catch(()=>{});else await i.reply({content:'Inventory tidak bisa dibuka sekarang. Coba gunakan /inventory.',flags:MessageFlags.Ephemeral}).catch(()=>{});}return;
  }
  if(i.isButton()&&(i.customId==='fish_again'||i.customId.startsWith('fish_again:'))){
    if(!i.guildId||i.guildId!==allowedGuild){await i.reply({content:'Game ini hanya aktif di server yang diizinkan.',flags:MessageFlags.Ephemeral}).catch(()=>{});return;}
    try{await handleFish(i,allowedGuild,i.user.id,true);}catch(error){if(error?.code===10062){console.warn('Discord rejected the button interaction (10062). Another client may have acknowledged it, or it arrived too late.');return;}logRuntimeError('Fish button error',error);const msg='Tombol mancing gagal diproses. Coba gunakan /fish.';if(i.deferred||i.replied)await i.followUp({content:msg,flags:MessageFlags.Ephemeral}).catch(()=>{});else await i.reply({content:msg,flags:MessageFlags.Ephemeral}).catch(()=>{});}return;
  }
  if(i.isAutocomplete()){
    if(!i.guildId||i.guildId!==allowedGuild){await i.respond([]).catch(()=>{});return;}
    try{await handleFishAutocomplete(i);}catch(error){logRuntimeError('Fish autocomplete error',error);await i.respond([]).catch(()=>{});}
    return;
  }
  if(!i.isChatInputCommand()) return;
  if(!i.guildId || i.guildId!==allowedGuild){ await i.reply({content:'Game ini hanya aktif di server yang diizinkan.',flags:MessageFlags.Ephemeral}); return; }
  try{
    const g=allowedGuild,u=i.user.id;
    if(i.commandName==='mutations'){await handleMutations(i,g,u);} else if(i.commandName==='weather'){await handleWeather(i,g);} else if(i.commandName==='wiki'){await handleWiki(i,g,u);} else if(i.commandName==='dex'){await handleDex(i,g,u);} else if(i.commandName==='zone'){await handleZone(i,g,u);} else if(i.commandName==='contracts'){await handleContracts(i,g,u);} else if(i.commandName==='fish'){
      await handleFish(i,g,u);    } else if(i.commandName==='inventory'){
      getPlayer(g,u);
      const action=i.options.getString('action')||'view',fishName=i.options.getString('fish'),target=i.options.getString('target')||'fish',tier=i.options.getString('tier');
      if(action!=='view'){
        if(!['favorite','unfavorite','lock','unlock'].includes(action)){await i.reply({content:'Pilih aksi Favorite, Unfavorite, Lock, atau Unlock.',flags:MessageFlags.Ephemeral});return;}
        if(target!=='fish'){
          if(!bulkProtectionTargets.has(target)){await i.reply({content:'Target proteksi tidak dikenal. Pilih target yang tersedia di opsi /inventory.',flags:MessageFlags.Ephemeral});return;}
          const needsTier=['fish_tier','mutation_tier','shiny_tier'].includes(target);
          if(needsTier&&!tier){await i.reply({content:'Pilih tier yang ingin diproses.',flags:MessageFlags.Ephemeral});return;}
          if(!needsTier&&tier){await i.reply({content:'Opsi tier hanya diperlukan untuk Tier ikan, Tier mutasi, atau Tier ikan Shiny.',flags:MessageFlags.Ephemeral});return;}
          await promptBulkProtection(i,g,u,action,target,tier);return;
        }
        if(tier){await i.reply({content:'Untuk ikan tertentu, kosongkan opsi tier.',flags:MessageFlags.Ephemeral});return;}
        if(!fishName){await i.reply({content:'Choose a fish species for this action.',flags:MessageFlags.Ephemeral});return;}
        const species=resolveFishSpecies(fishName);
        if(!species){await i.reply({content:'Unknown fish species.',flags:MessageFlags.Ephemeral});return;}
        const setting=action==='favorite'||action==='lock'?1:0,column=action==='favorite'||action==='unfavorite'?'favorite':'locked';
        if(setting&&!db.prepare('SELECT 1 FROM inventory WHERE guild_id=? AND user_id=? AND fish_name=? AND rarity=? AND quantity>0').get(g,u,species.name,species.rarity)){await i.reply({content:`Catch at least one ${species.name} before protecting it.`,flags:MessageFlags.Ephemeral});return;}
        const now=Date.now();let cancelledTrades=0,cancelledListings=0;
        db.transaction(()=>{
          db.prepare(`INSERT INTO fish_preferences(guild_id,user_id,fish_name,rarity,${column}) VALUES(?,?,?,?,?) ON CONFLICT(guild_id,user_id,fish_name,rarity) DO UPDATE SET ${column}=excluded.${column}`).run(g,u,species.name,species.rarity,setting);
          if(setting){
            cancelledTrades=db.prepare("UPDATE trade_offers SET status='cancelled',completed_at=? WHERE guild_id=? AND seller_id=? AND fish_name=? AND rarity=? AND status='pending'").run(now,g,u,species.name,species.rarity).changes;
            cancelledListings=db.prepare("UPDATE market_listings SET status='cancelled',completed_at=? WHERE guild_id=? AND seller_id=? AND fish_name=? AND rarity=? AND status='pending'").run(now,g,u,species.name,species.rarity).changes;
          }
        })();
        const pref=getFishPreference(g,u,species.name,species.rarity),protectedNow=!!(pref.favorite||pref.locked);
        const labels=[pref.favorite?'favorited':null,pref.locked?'locked':null].filter(Boolean).join(' and ');
        const content=setting?`**${species.name}** is now ${action==='favorite'?'favorited':'locked'} and protected from selling or trading. Cancelled ${cancelledTrades} trade offer(s) and ${cancelledListings} marketplace listing(s).`:`Protection setting removed for **${species.name}**. ${protectedNow?`It is still protected because it is ${labels}.`:'It can now be sold or traded.'}`;
        await i.reply({content,flags:MessageFlags.Ephemeral});return;
      }
      await replyPaged(i,fishInventoryData(g,u));
    } else if(i.commandName==='give'){
      await handleGive(i,g,u);
    } else if(i.commandName==='sell'){
      getPlayer(g,u);const amount=i.options.getInteger('amount'),fishName=i.options.getString('fish');
      if(fishName){
        const species=resolveFishSpecies(fishName),item=species?db.prepare('SELECT value,quantity FROM inventory WHERE guild_id=? AND user_id=? AND fish_name=? AND rarity=?').get(g,u,species.name,species.rarity):null;
        if(!item){await i.reply({content:'You do not have that fish in your inventory.',flags:MessageFlags.Ephemeral});return;}
        if(isFishProtected(g,u,species.name,species.rarity)){await i.reply({content:'Ikan ini masih dilindungi Favorite atau Lock. Di /inventory, pilih Unfavorite untuk melepas Favorite dan Unlock untuk melepas Lock.',flags:MessageFlags.Ephemeral});return;}
        const available=Math.max(0,item.quantity-reservedFish(g,u,species.name,species.rarity));
        if(amount!==null&&amount>available){await i.reply({content:`Only ${available} ${species.name} are available to sell; the rest may be reserved in a trade or marketplace listing.`,flags:MessageFlags.Ephemeral});return;}
        const quantity=amount??available;if(quantity<1){await i.reply({content:`No ${species.name} are currently available to sell.`,flags:MessageFlags.Ephemeral});return;}
        const coins=db.transaction(()=>{db.prepare('UPDATE inventory SET quantity=quantity-? WHERE guild_id=? AND user_id=? AND fish_name=? AND rarity=?').run(quantity,g,u,species.name,species.rarity);db.prepare('DELETE FROM inventory WHERE guild_id=? AND user_id=? AND fish_name=? AND rarity=? AND quantity<=0').run(g,u,species.name,species.rarity);const total=quantity*item.value;db.prepare('UPDATE players SET coins=coins+? WHERE guild_id=? AND user_id=?').run(total,g,u);return total;})();
        await i.reply({embeds:[embed('Fish sold',`Sold **${quantity} x ${species.name}** for **${coins} coins**.`)]});return;
      }
      const tx=db.transaction(()=>{const rows=db.prepare('SELECT fish_name,rarity,value,quantity FROM inventory WHERE guild_id=? AND user_id=? ORDER BY value ASC').all(g,u);let remaining=amount??Infinity,sold=0,coins=0;
        for(const r of rows){if(remaining<=0)break;if(isFishProtected(g,u,r.fish_name,r.rarity))continue;const available=Math.max(0,r.quantity-reservedFish(g,u,r.fish_name,r.rarity));const n=Math.min(available,remaining);if(!n)continue;sold+=n;remaining-=n;coins+=n*r.value;db.prepare('UPDATE inventory SET quantity=quantity-? WHERE guild_id=? AND user_id=? AND fish_name=? AND rarity=?').run(n,g,u,r.fish_name,r.rarity);}
        db.prepare('DELETE FROM inventory WHERE guild_id=? AND user_id=? AND quantity<=0').run(g,u);if(coins)db.prepare('UPDATE players SET coins=coins+? WHERE guild_id=? AND user_id=?').run(coins,g,u);return {sold,coins};});
      const result=tx();await i.reply({embeds:[embed('Fish sold',result.sold?`Sold **${result.sold}** fish for **${result.coins} coins**.`:'Tidak ada ikan yang bisa dijual. Favorite dan Lock sama-sama melindungi ikan; Unfavorite hanya melepas Favorite. Buka /inventory, pilih Unlock untuk menghapus Lock, lalu coba /sell lagi. Ikan yang dicadangkan di trade atau marketplace harus dibatalkan atau menunggu selesai.')]});
    } else if(i.commandName==='trade'){
      await handleTrade(i,g,u);
    } else if(i.commandName==='market'){
      await handleMarket(i,g,u);
    } else if(i.commandName==='shop'){
      await handleShop(i,g,u);
    } else if(i.commandName==='skills'){
      await handleSkills(i,g,u);
    } else if(i.commandName==='profile'){
      const p=getPlayer(g,u),level=Math.floor(p.xp/100)+1;
      const rod=getEquipped(g,u,'rod'),bobber=getEquipped(g,u,'bobber');
      const pelletSlot=db.prepare("SELECT item_key FROM equipped_gear WHERE guild_id=? AND user_id=? AND slot='bait'").get(g,u);
      const pellets=getEquipped(g,u,'bait'),pelletKey=pellets?.itemKey||pelletSlot?.item_key;
      const pelletCount=pelletKey?db.prepare('SELECT quantity FROM gear_inventory WHERE guild_id=? AND user_id=? AND item_key=?').get(g,u,pelletKey)?.quantity||0:0;
      const pelletStatus=pellets?(pellets.active?`active until <t:${Math.floor(pellets.expiresAt/1000)}:R>`:`ready; next cast uses 1 for ${pellets.durationMinutes} min`):'None equipped';
      const mutationBoost=getMutationBoost(rod,bobber,pellets);
      const gearText=[
        `Rod: ${rod?`${rod.name} (+${rod.luck} Luck, +${rod.power} Power)`:'None equipped'}` ,
        `Bobber: ${bobber?`${bobber.name} (+${bobber.luck} Luck, +${bobber.power} Power)`:'None equipped'}` ,
        `Pellets: ${pellets?`${pellets.name} x${pelletCount} remaining (+${pellets.luck} Luck) - ${pelletStatus}`:'None equipped'}`,
        `Mutation Chance: +${Math.round(mutationBoost*100)}% relative to base odds`
      ].join('\n');
      const profile=embed(`${i.user.username}'s profile`,`Level **${level}** | XP **${p.xp}**\nCoins **${p.coins}** | Fish caught **${p.total_caught}**`);
      profile.addFields({name:'Currently equipped',value:gearText});
      await i.reply({embeds:[profile]});
    } else if(i.commandName==='daily'){
      const p=getPlayer(g,u),now=Date.now(),day=86_400_000;
      if(now-p.daily_claim_at<day){await i.reply({content:`Daily reward available in ${Math.ceil((day-(now-p.daily_claim_at))/3_600_000)}h.`,flags:MessageFlags.Ephemeral});return;}
      db.prepare('UPDATE players SET coins=coins+30,daily_claim_at=? WHERE guild_id=? AND user_id=?').run(now,g,u);
      await i.reply({embeds:[embed('Daily catch',`You received **30 coins**. Come back tomorrow!`)]});
    } else if(i.commandName==='leaderboard'){
      const rows=db.prepare('SELECT user_id,coins,xp,total_caught FROM players WHERE guild_id=? ORDER BY coins DESC LIMIT 10').all(g);
      const fields=await Promise.all(rows.map(async(r,n)=>{let name=`User ${r.user_id}`;try{name=(await client.users.fetch(r.user_id)).username;}catch{}return {name:`#${n+1} | ${name}`,value:`Coins: **${r.coins}**\nLevel: **${Math.floor(r.xp/100)+1}** | Caught: ${r.total_caught}`};}));
      await replyPaged(i,{title:'Server leaderboard',fields,emptyText:'No anglers yet.',ephemeral:false});
    } else if(i.commandName==='submit'){
      const type=i.options.getString('type'),name=i.options.getString('name').trim(),description=i.options.getString('description').trim();
      if(!name||!description){await i.reply({content:'Name and description cannot be blank.',flags:MessageFlags.Ephemeral});return;}
      const info=db.prepare('INSERT INTO submissions(guild_id,user_id,type,name,description,created_at) VALUES(?,?,?,?,?,?)').run(g,u,type,name,description,Date.now());
      await i.reply({embeds:[embed('Idea submitted',`Proposal **#${info.lastInsertRowid}** is in the moderator queue. Thanks for contributing!`)],flags:MessageFlags.Ephemeral});
    } else if(i.commandName==='my-submissions'){
      const rows=db.prepare('SELECT id,type,name,status FROM submissions WHERE guild_id=? AND user_id=? ORDER BY id DESC LIMIT 10').all(g,u);
      const fields=rows.map(r=>({name:`#${r.id} | ${r.type} | ${r.name}`,value:`Status: **${r.status}**`}));
      await replyPaged(i,{title:'Your submissions',fields,emptyText:'You have not submitted anything yet.',ephemeral:true});
    } else if(i.commandName==='ugc'){
      if(!isAdmin(i)){await i.reply({content:'Only server moderators can do that.',flags:MessageFlags.Ephemeral});return;}
      const action=i.options.getSubcommand();
      if(action==='queue'){
        const rows=db.prepare("SELECT id,type,name,description,user_id FROM submissions WHERE guild_id=? AND status='pending' ORDER BY id LIMIT 10").all(g);
        const fields=rows.map(r=>({name:`#${r.id} | ${r.type} | ${r.name}`,value:`${r.description}\nBy <@${r.user_id}>`}));
        await replyPaged(i,{title:'Pending proposals',fields,emptyText:'The queue is clear.',ephemeral:true});
      } else {
        const id=i.options.getInteger('id'),status=action==='approve'?'approved':'rejected';
        const result=db.prepare("UPDATE submissions SET status=?,reviewed_by=?,reviewed_at=? WHERE id=? AND guild_id=? AND status='pending'").run(status,u,Date.now(),id,g);
        await i.reply({content:result.changes?`Proposal #${id} ${status}. Approval records the decision; it does not automatically add unreviewed text to gameplay.`:`No pending proposal #${id} found.`,flags:MessageFlags.Ephemeral});
      }
    }
  }catch(error){logRuntimeError(`Command /${i.commandName} failed`,error);const msg='Something went wrong. The error was logged locally.';if(i.deferred||i.replied)await i.followUp({content:msg,flags:MessageFlags.Ephemeral}).catch(()=>{});else await i.reply({content:msg,flags:MessageFlags.Ephemeral}).catch(()=>{});}
});

let stopping=false;
async function shutdown(signal){if(stopping)return;stopping=true;console.log(`\n${signal} received. Closing Discord connection and database...`);try{client.destroy();db.pragma('wal_checkpoint(TRUNCATE)');db.close();console.log('Saved and closed. Run npm run start to resume.');process.exit(0);}catch(e){console.error('Shutdown error:',e);process.exit(1);}}
process.on('SIGINT',()=>shutdown('Ctrl+C'));process.on('SIGTERM',()=>shutdown('SIGTERM'));
client.login(process.env.DISCORD_TOKEN).catch(error=>{console.error('Discord login failed:',error.message);db.close();process.exit(1);});
