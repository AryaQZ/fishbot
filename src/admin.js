require('dotenv').config();
const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');

const guildId = process.env.GUILD_ID;
const dbPath = path.join(__dirname, '..', 'data', 'fish-game.sqlite');
const args = process.argv.slice(2);

function usage(){
  console.log(`Fish game admin commands:
  npm run admin -- luckboost start <luckboost|admin-abuse> <multiplier> <minutes>
  npm run admin -- luckboost status
  npm run admin -- luckboost end
  npm run admin -- give <discord_user_id> <amount>

  Luck multiplier: any finite number >=1 (supports scientific notation); duration 1-1440 minutes; amount must be a positive whole number.`);
}

function fail(message){
  console.error(`Error: ${message}`);
  process.exitCode = 1;
}

if(!guildId){
  fail('GUILD_ID is missing from .env.');
}else if(!fs.existsSync(dbPath)){
  fail(`Game database not found at ${dbPath}. Start the bot once to create it.`);
}else if(!args.length||args[0]==='help'||args[0]==='--help'||args[0]==='-h'){
  usage();
}else{
  const db = new Database(dbPath,{timeout:5000});
  try{
    const [command,action,...values] = args;
    if(command==='give'){
      const [userId,amountText] = [action,values[0]];
      if(!/^\d{1,24}$/.test(userId||''))throw new Error('Provide the player Discord user ID as digits only.');
      if(!/^\d+$/.test(amountText||''))throw new Error('Amount must be a positive whole number.');
      const amount=Number(amountText);
      if(!Number.isSafeInteger(amount)||amount<1)throw new Error('Amount must be between 1 and 9,007,199,254,740,991.');
      const balance=db.transaction(()=>{
        db.prepare('INSERT OR IGNORE INTO players(guild_id,user_id) VALUES(?,?)').run(guildId,userId);
        const current=db.prepare('SELECT coins FROM players WHERE guild_id=? AND user_id=?').get(guildId,userId).coins;
        if(!Number.isSafeInteger(current+amount))throw new Error('The resulting balance would exceed the safe integer limit.');
        db.prepare('UPDATE players SET coins=? WHERE guild_id=? AND user_id=?').run(current+amount,guildId,userId);
        return current+amount;
      })();
      console.log(`Gave ${amount} coins to ${userId}. New balance: ${balance}.`);
    }else if(command==='luckboost'){
      const now=Date.now();
      if(action==='start'){
        const [type,multiplierText,minutesText] = values;
        const typeKey=String(type||'').toLowerCase();
        const eventKey=typeKey==='luckboost'?'manual_luckboost':typeKey==='admin-abuse'||typeKey==='admin_abuse'?'admin_abuse_luckboost':null;
        if(!eventKey)throw new Error('Event type must be "luckboost" or "admin-abuse".');
        if(!/^(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(multiplierText||''))throw new Error('Multiplier must be a finite number of at least 1.');
        const multiplier=Number(multiplierText);
        if(!Number.isFinite(multiplier)||multiplier<1)throw new Error('Multiplier must be a finite number of at least 1.');
        if(!/^\d+$/.test(minutesText||''))throw new Error('Duration must be a whole number of minutes from 1 to 1440.');
        const minutes=Number(minutesText);
        if(!Number.isSafeInteger(minutes)||minutes<1||minutes>1440)throw new Error('Duration must be from 1 to 1440 minutes.');
        const durationMs=minutes*60_000,endsAt=now+durationMs;
        db.prepare(`INSERT INTO game_events(guild_id,event_key,multiplier,duration_ms,status,starts_at,ends_at,updated_at)
          VALUES(?,?,?,?,'active',?,?,?) ON CONFLICT(guild_id) DO UPDATE SET event_key=excluded.event_key,
          multiplier=excluded.multiplier,duration_ms=excluded.duration_ms,status='active',starts_at=excluded.starts_at,
          ends_at=excluded.ends_at,updated_at=excluded.updated_at`).run(guildId,eventKey,multiplier,durationMs,now,endsAt,now);
        const name=eventKey==='admin_abuse_luckboost'?'Admin Abuse':'LuckBoost';
        console.log(`${name} x${multiplier} started for ${minutes} minutes. Ends at ${new Date(endsAt).toLocaleString()}.`);
      }else if(action==='status'){
        const event=db.prepare("SELECT event_key,multiplier,starts_at,ends_at FROM game_events WHERE guild_id=? AND status='active' AND ends_at>? LIMIT 1").get(guildId,now);
        if(!event)console.log('No luck event is active.');
        else{
          const name=event.event_key==='admin_abuse_luckboost'?'Admin Abuse':'LuckBoost';
          console.log(`${name} x${event.multiplier} is active. Started at ${new Date(event.starts_at).toLocaleString()} and ends at ${new Date(event.ends_at).toLocaleString()}.`);
        }
      }else if(action==='end'){
        const result=db.prepare("UPDATE game_events SET status='expired',updated_at=? WHERE guild_id=? AND status='active' AND ends_at>? AND event_key IN ('manual_luckboost','admin_abuse_luckboost')").run(now,guildId,now);
        console.log(result.changes?'The active manual luck event has ended.':'There is no active manual luck event to end.');
      }else{
        usage();
        process.exitCode=1;
      }
    }else{
      usage();
      process.exitCode=1;
    }
  }catch(error){
    fail(error.message);
  }finally{
    db.close();
  }
}
