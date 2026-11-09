require('dotenv').config();
const { REST, Routes, SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

for (const name of ['DISCORD_TOKEN', 'CLIENT_ID', 'GUILD_ID']) {
  if (!process.env[name] || process.env[name].startsWith('put_')) throw new Error(`Set ${name} in .env first.`);
}


const commands = [
  new SlashCommandBuilder().setName('fish').setDescription('Cast your line and catch a fish.'),
  new SlashCommandBuilder().setName('give').setDescription('Give your coins or fish to another player.')
    .addSubcommand(s=>s.setName('money').setDescription('Transfer coins from your balance to a player.')
      .addUserOption(o=>o.setName('player').setDescription('Player who will receive the coins').setRequired(true))
      .addIntegerOption(o=>o.setName('amount').setDescription('Number of coins to transfer').setRequired(true).setMinValue(1).setMaxValue(1000000000)))
    .addSubcommand(s=>s.setName('fish').setDescription('Transfer fish from your inventory to a player.')
      .addUserOption(o=>o.setName('player').setDescription('Player who will receive the fish').setRequired(true))
      .addStringOption(o=>o.setName('fish').setDescription('Choose an available fish from your inventory').setRequired(true).setAutocomplete(true))
      .addIntegerOption(o=>o.setName('quantity').setDescription('Number of fish to transfer').setRequired(true).setMinValue(1).setMaxValue(1000))),
  new SlashCommandBuilder().setName('weather').setDescription('Check current server weather and weather-exclusive fish.'),
  new SlashCommandBuilder().setName('wiki').setDescription('Panduan ikan, zona, cuaca, mutasi, equipment, dan mekanik game.'),
  new SlashCommandBuilder().setName('dex').setDescription('View lifetime fish discoveries and shiny records.'),
  new SlashCommandBuilder().setName('mutations').setDescription('View mutation odds, collection, and gear bonuses.'),
  new SlashCommandBuilder().setName('zone').setDescription('View, unlock, and travel between fishing locations.')
    .addSubcommand(s=>s.setName('list').setDescription('View locations, level requirements, and unlock costs.'))
    .addSubcommand(s=>s.setName('unlock').setDescription('Unlock a location permanently.')
      .addStringOption(o=>o.setName('location').setDescription('Location to unlock').setRequired(true).addChoices({name:'Silver River',value:'river'},{name:'Deep Sea Trench',value:'deep_sea'},{name:'Twilight Reef',value:'twilight_reef'},{name:'Abyssal Chasm',value:'abyssal_chasm'},{name:'Astral Expanse',value:'astral_expanse'})))
    .addSubcommand(s=>s.setName('travel').setDescription('Travel to an unlocked fishing location.')
      .addStringOption(o=>o.setName('location').setDescription('Location to visit').setRequired(true).addChoices({name:'Server Pond',value:'pond'},{name:'Silver River',value:'river'},{name:'Deep Sea Trench',value:'deep_sea'},{name:'Twilight Reef',value:'twilight_reef'},{name:'Abyssal Chasm',value:'abyssal_chasm'},{name:'Astral Expanse',value:'astral_expanse'}))),
  new SlashCommandBuilder().setName('contracts').setDescription('View and claim daily fishing contracts.')
    .addSubcommand(s=>s.setName('view').setDescription('View current daily fishing objectives.'))
    .addSubcommand(s=>s.setName('claim').setDescription('Claim one or all completed daily contracts.')
      .addStringOption(o=>o.setName('contract').setDescription('Contract reward to claim').setRequired(true).addChoices({name:'Catch fish anywhere',value:'fish_any'},{name:'Catch Rare or better fish',value:'rare_plus'},{name:'Fish at daily target location',value:'fish_zone'},{name:'Claim all completed',value:'all'}))),
  new SlashCommandBuilder().setName('inventory').setDescription('View, favorite, and protect fish in your collection.')
    .addStringOption(o=>o.setName('action').setDescription('View, favorite, lock, or remove protection').addChoices({name:'View inventory',value:'view'},{name:'Favorite (protect)',value:'favorite'},{name:'Unfavorite',value:'unfavorite'},{name:'Lock (protect)',value:'lock'},{name:'Unlock',value:'unlock'}))
    .addStringOption(o=>o.setName('fish').setDescription('Fish to favorite, lock, unfavorite, or unlock').setAutocomplete(true))
    .addStringOption(o=>o.setName('target').setDescription('Pilih ikan tertentu atau kelompok ikan').addChoices({name:'Ikan tertentu',value:'fish'},{name:'Semua ikan yang dimiliki',value:'all'},{name:'Tier ikan',value:'fish_tier'},{name:'Semua ikan bermutasi',value:'mutated'},{name:'Tier mutasi',value:'mutation_tier'},{name:'Semua ikan Shiny',value:'shiny'},{name:'Tier ikan Shiny',value:'shiny_tier'}))
    .addStringOption(o=>o.setName('tier').setDescription('Tier ikan atau tier mutasi yang ditargetkan').addChoices({name:'Common',value:'Common'},{name:'Uncommon',value:'Uncommon'},{name:'Rare',value:'Rare'},{name:'Epic',value:'Epic'},{name:'Legendary',value:'Legendary'},{name:'Mythic',value:'Mythic'},{name:'Celestial',value:'Celestial'},{name:'Astral',value:'Astral'},{name:'Eternal',value:'Eternal'})),
  new SlashCommandBuilder().setName('sell').setDescription('Sell selected fish or available fish from your inventory.')
    .addIntegerOption(o => o.setName('amount').setDescription('Quantity (omit to sell all selected fish)').setMinValue(1))
    .addStringOption(o=>o.setName('fish').setDescription('Search fish you own; omit to sell all available').setAutocomplete(true)),
  new SlashCommandBuilder().setName('profile').setDescription('See your fishing profile.'),
  new SlashCommandBuilder().setName('daily').setDescription('Claim your daily fishing allowance.'),
  new SlashCommandBuilder().setName('leaderboard').setDescription('See the top anglers in this server.'),
  new SlashCommandBuilder().setName('submit').setDescription('Submit an idea for community game content.')
    .addStringOption(o => o.setName('type').setDescription('What are you proposing?').setRequired(true)
      .addChoices({name:'Fish',value:'fish'},{name:'Location',value:'location'},{name:'Event',value:'event'}))
    .addStringOption(o => o.setName('name').setDescription('Name for your idea').setRequired(true).setMaxLength(60))
    .addStringOption(o => o.setName('description').setDescription('Short description').setRequired(true).setMaxLength(300)),
  new SlashCommandBuilder().setName('my-submissions').setDescription('View your recent content proposals.'),
  new SlashCommandBuilder().setName('ugc').setDescription('Moderate community content proposals.')
    .addSubcommand(s=>s.setName('queue').setDescription('List pending proposals.'))
    .addSubcommand(s=>s.setName('approve').setDescription('Approve a proposal.')
      .addIntegerOption(o=>o.setName('id').setDescription('Proposal ID').setRequired(true).setMinValue(1)))
    .addSubcommand(s=>s.setName('reject').setDescription('Reject a proposal.')
      .addIntegerOption(o=>o.setName('id').setDescription('Proposal ID').setRequired(true).setMinValue(1)))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  new SlashCommandBuilder().setName('trade').setDescription('Trade fish with another player.')
    .addSubcommand(s=>s.setName('offer').setDescription('Offer fish to a player for coins.')
      .addUserOption(o=>o.setName('player').setDescription('Player who can accept the offer').setRequired(true))
      .addStringOption(o=>o.setName('fish').setDescription('Search fish you own').setRequired(true).setMaxLength(60).setAutocomplete(true))
      .addIntegerOption(o=>o.setName('quantity').setDescription('Number of fish').setRequired(true).setMinValue(1).setMaxValue(1000))
      .addIntegerOption(o=>o.setName('price').setDescription('Total price in coins').setRequired(true).setMinValue(1).setMaxValue(1000000000)))
    .addSubcommand(s=>s.setName('inbox').setDescription('View offers made to you.'))
    .addSubcommand(s=>s.setName('sent').setDescription('View offers you have made.'))
    .addSubcommand(s=>s.setName('accept').setDescription('Accept an offer sent to you.')
      .addIntegerOption(o=>o.setName('id').setDescription('Offer ID').setRequired(true).setMinValue(1)))
    .addSubcommand(s=>s.setName('decline').setDescription('Decline an offer sent to you.')
      .addIntegerOption(o=>o.setName('id').setDescription('Offer ID').setRequired(true).setMinValue(1)))
    .addSubcommand(s=>s.setName('cancel').setDescription('Cancel an offer you sent.')
      .addIntegerOption(o=>o.setName('id').setDescription('Offer ID').setRequired(true).setMinValue(1))),
  new SlashCommandBuilder().setName('market').setDescription('Buy and sell fish with other players.')
    .addSubcommand(s=>s.setName('sell').setDescription('List fish for sale to any player.')
      .addStringOption(o=>o.setName('fish').setDescription('Search fish you own').setRequired(true).setMaxLength(60).setAutocomplete(true))
      .addIntegerOption(o=>o.setName('quantity').setDescription('Number of fish').setRequired(true).setMinValue(1).setMaxValue(1000))
      .addIntegerOption(o=>o.setName('price').setDescription('Total listing price in coins').setRequired(true).setMinValue(1).setMaxValue(1000000000)))
    .addSubcommand(s=>s.setName('browse').setDescription('Browse fish listed by other players.'))
    .addSubcommand(s=>s.setName('mine').setDescription('View your listings.'))
    .addSubcommand(s=>s.setName('buy').setDescription('Buy a marketplace listing.')
      .addIntegerOption(o=>o.setName('id').setDescription('Listing ID').setRequired(true).setMinValue(1)))
    .addSubcommand(s=>s.setName('cancel').setDescription('Cancel one of your active listings.')
      .addIntegerOption(o=>o.setName('id').setDescription('Listing ID').setRequired(true).setMinValue(1))),
  new SlashCommandBuilder().setName('shop').setDescription('Buy and equip fishing gear.')
    .addSubcommand(s=>s.setName('browse').setDescription('Browse rods, bobbers, and pellets.'))
    .addSubcommand(s=>s.setName('inventory').setDescription('View your owned and equipped gear.'))
    .addSubcommand(s=>s.setName('buy').setDescription('Buy gear or a stack of pellets.')
      .addStringOption(o=>o.setName('item').setDescription('Shop item').setRequired(true).addChoices(
        {name:'Reed Rod - Common - 100',value:'reed_rod'},{name:'Carbon Rod - Uncommon - 400',value:'carbon_rod'},
        {name:'Tidecaller Rod - Rare - 1300',value:'tidecaller_rod'},{name:'Abyss Rod - Legendary - 3500',value:'abyss_rod'},
        {name:'Leviathan Rod - Mythic - 12000',value:'leviathan_rod'},{name:'Starfall Rod - Celestial - 40000',value:'starfall_rod'},
        {name:'Cork Bobber - Common - 50',value:'cork_bobber'},{name:'Pearl Bobber - Uncommon - 220',value:'pearl_bobber'},
        {name:'Starlight Bobber - Rare - 700',value:'star_bobber'},{name:'Abyssal Bobber - Mythic - 8000',value:'abyssal_bobber'},
        {name:'Cosmic Bobber - Celestial - 30000',value:'cosmic_bobber'},{name:'Plain Pellets - Common - 10',value:'plain_pellets'},
        {name:'Glimmer Pellets - Uncommon - 25',value:'glimmer_pellets'},{name:'Golden Pellets - Rare - 80',value:'golden_pellets'},
        {name:'Mythic Roe Pellets - Legendary - 180',value:'mythic_roe'},{name:'Void Roe Pellets - Mythic - 500',value:'void_roe'},
        {name:'Celestial Roe Pellets - Celestial - 1500',value:'celestial_roe'},{name:'Starforged Rod - Astral - 95000',value:'starforged_rod'},{name:'Eonbreaker Rod - Eternal - 270000',value:'eonbreaker_rod'},{name:'Nebula Bobber - Astral - 62000',value:'nebula_bobber'},{name:'Eventide Bobber - Eternal - 160000',value:'eventide_bobber'},{name:'Astral Roe Pellets - Astral - 7000',value:'astral_roe'},{name:'Eternal Roe Pellets - Eternal - 25000',value:'eternal_roe'})).addIntegerOption(o=>o.setName('quantity').setDescription('Pellet stock to buy; permanent gear is limited to 1').setMinValue(1).setMaxValue(1000)))
    .addSubcommand(s=>s.setName('refund').setDescription('Return unused pellets for 80% of their shop price.')
      .addStringOption(o=>o.setName('item').setDescription('Unused pellets to refund').setRequired(true).addChoices(
        {name:'Plain Pellets (Common)',value:'plain_pellets'},{name:'Glimmer Pellets (Uncommon)',value:'glimmer_pellets'},
        {name:'Golden Pellets (Rare)',value:'golden_pellets'},{name:'Mythic Roe Pellets (Legendary)',value:'mythic_roe'},
        {name:'Void Roe Pellets (Mythic)',value:'void_roe'},{name:'Celestial Roe Pellets',value:'celestial_roe'},
        {name:'Astral Roe Pellets',value:'astral_roe'},{name:'Eternal Roe Pellets',value:'eternal_roe'}))
      .addIntegerOption(o=>o.setName('quantity').setDescription('Number to refund (defaults to 1)').setMinValue(1).setMaxValue(1000)))
    .addSubcommand(s=>s.setName('equip').setDescription('Equip owned gear in its slot.')
      .addStringOption(o=>o.setName('item').setDescription('Owned gear item').setRequired(true).addChoices(
        {name:'Reed Rod',value:'reed_rod'},{name:'Carbon Rod',value:'carbon_rod'},{name:'Tidecaller Rod',value:'tidecaller_rod'},{name:'Abyss Rod',value:'abyss_rod'},
        {name:'Leviathan Rod',value:'leviathan_rod'},{name:'Starfall Rod',value:'starfall_rod'},
        {name:'Cork Bobber',value:'cork_bobber'},{name:'Pearl Bobber',value:'pearl_bobber'},{name:'Starlight Bobber',value:'star_bobber'},
        {name:'Abyssal Bobber',value:'abyssal_bobber'},{name:'Cosmic Bobber',value:'cosmic_bobber'},
        {name:'Plain Pellets',value:'plain_pellets'},{name:'Glimmer Pellets',value:'glimmer_pellets'},{name:'Golden Pellets',value:'golden_pellets'},
        {name:'Mythic Roe Pellets',value:'mythic_roe'},{name:'Void Roe Pellets',value:'void_roe'},{name:'Celestial Roe Pellets',value:'celestial_roe'},{name:'Starforged Rod',value:'starforged_rod'},{name:'Eonbreaker Rod',value:'eonbreaker_rod'},{name:'Nebula Bobber',value:'nebula_bobber'},{name:'Eventide Bobber',value:'eventide_bobber'},{name:'Astral Roe Pellets',value:'astral_roe'},{name:'Eternal Roe Pellets',value:'eternal_roe'})))
    .addSubcommand(s=>s.setName('unequip').setDescription('Remove gear from a slot.')
      .addStringOption(o=>o.setName('slot').setDescription('Gear slot').setRequired(true).addChoices({name:'Rod',value:'rod'},{name:'Bobber',value:'bobber'},{name:'Pellets',value:'bait'}))),
  new SlashCommandBuilder().setName('skills').setDescription('Check and upgrade your fishing skills.')
    .addSubcommand(s=>s.setName('status').setDescription('View your level, skills, and points.'))
    .addSubcommand(s=>s.setName('upgrade').setDescription('Upgrade one or more levels with your skill points.')
      .addStringOption(o=>o.setName('skill').setDescription('Choose a skill').setRequired(true).addChoices({name:'Luck',value:'luck'},{name:'Power',value:'power'}))
      .addIntegerOption(o=>o.setName('levels').setDescription('How many levels to add').setRequired(true).setMinValue(1).setMaxValue(999))),].map(c=>c.toJSON());

const rest = new REST({version:'10'}).setToken(process.env.DISCORD_TOKEN);
rest.put(Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID), {body:commands})
  .then(()=>console.log(`Registered ${commands.length} commands for guild ${process.env.GUILD_ID}.`))
  .catch(error=>{console.error(error); process.exitCode=1;});
