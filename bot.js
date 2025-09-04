const { Telegraf } = require('telegraf');
require('dotenv').config();
// Replace 'YOUR_BOT_TOKEN' with the token from BotFather
const bot = new Telegraf(`${process.env.BOT_API}`);

// Basic command handler
bot.start((ctx) => {
  ctx.reply('Welcome to my bot!');
});

// Echo command
bot.command('echo', (ctx) => {
  const message = ctx.message.text.split(' ').slice(1).join(' ');
  ctx.reply(message || 'Please provide text to echo');
});

// Handle text messages
bot.on('text', (ctx) => {
  ctx.reply(`You said: ${ctx.message.text}`);
});

// Error handling
bot.catch((err, ctx) => {
  console.error(`Error for ${ctx.updateType}`, err);
});

// Launch the bot
bot.launch().then(() => {
  console.log('Bot is running!');
});

// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));