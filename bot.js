// dependencies
const { Telegraf, Markup } = require('telegraf');
require('dotenv').config();
// Products DATA
const catalogProductsData = require('./catalogProducts');
// chat saleChatId
const chatSaleDepartmentId = process.env.SALE_CHAT_ID;
//  the token from BotFather
const bot = new Telegraf(`${process.env.BOT_API}`);

// Хранилище текущих позиций пользователей
const userStates = new Map();
// Функции // Функция показа товара
function showProduct(ctx, productIndex) {
  const products = catalogProductsData.products;

  if (products.length === 0) {
    return ctx.reply('😔 Каталог товаров пуст');
  }

  let index = productIndex;
  if (index >= products.length) index = 0;
  if (index < 0) index = products.length - 1;

  const product = products[index];
  userStates.set(ctx.from.id, index);

  const escapedName = escapeMarkdown(product.name);
  const escapedSku = escapeMarkdown(product.sku);

  const caption = `🏗️ *${escapedName}*\n\n` +
    `📦 Артикул: ${escapedSku}\n` +
    `💰 Цена: ${product.price.toLocaleString('ru-RU')} руб.\n\n` +
    `ℹ️ Подробное описание на нашем сайте`;

  // Создаем клавиатуру напрямую как объект
  const reply_markup = {
    inline_keyboard: [
      [
        { text: '🌐 Перейти на сайт', url: product.urlSite },
        { text: '📝 Оставить заявку', callback_data: `application_${product.sku}` }
      ],
      [
        { text: '⬅️ Предыдущая', callback_data: `prev_${index}` },
        { text: '➡️ Следующая', callback_data: `next_${index}` }
      ]
    ]
  };

  ctx.replyWithPhoto(product.urlSiteImage, {
    caption: caption,
    parse_mode: 'Markdown',
    reply_markup: reply_markup
  }).catch(err => {
    console.error('Ошибка отправки фото:', err);
    ctx.reply(caption, {
      parse_mode: 'Markdown',
      reply_markup: reply_markup
    });
  });
}
//Функция экранирования Markdown символов 
function escapeMarkdown(text) {
  return text.replace(/([_*\[\]()~`>#+\-=|{}.!])/g, '\\$1');
}


// Basic command handler
bot.start((ctx) => {
  const welcomeText = `🚛 Добро пожаловать в каталог спецтехники!\n\n` +
    `Здесь вы можете ознакомиться с нашей продукцией.\n` +
    `Нажмите /catalog чтобы посмотреть товары`;

  ctx.reply(welcomeText, Markup.keyboard([
    ['📦 Показать каталог'],
    ['🌐 Наш сайт', '📞 Контакты']
  ]).resize());
});

// Команда каталога
bot.command('catalog', (ctx) => {
  showProduct(ctx, 0);
});

// Обработка текстовых сообщений
bot.hears('📦 Показать каталог', (ctx) => {
  showProduct(ctx, 0);
});

bot.hears('🌐 Наш сайт', (ctx) => {
  ctx.reply('🌐 Наш официальный сайт: https://gkvertikal.ru');
});

bot.hears('📞 Контакты', (ctx) => {
  ctx.reply('📞 Для связи:\nТелефон: +7 (XXX) XXX-XX-XX\nEmail: info@gkvertikal.ru');
});




// Команда для информации о боте
bot.command('info', (ctx) => {
  const productCount = catalogProductsData.products.length;
  ctx.reply(`📊 В каталоге: ${productCount} товаров\n\n` +
    `Используйте /catalog для просмотра`);
});

// Echo command (оставлю для демонстрации)
bot.command('echo', (ctx) => {
  const message = ctx.message.text.split(' ').slice(1).join(' ');
  ctx.reply(message || 'Please provide text to echo');
});

bot.command('links', (ctx) => {
  ctx.reply('Полезные ссылки:', Markup.inlineKeyboard([
    [Markup.button.url('🌐 Наш сайт', 'https://gkvertikal.ru')],
    [Markup.button.url('🌐 Сайт zoomlion', 'https://zoomlion.gkvertikal.ru')]
  ]));
});
// Обработка callback кнопок
bot.action(/prev_(\d+)/, (ctx) => {
  const currentIndex = parseInt(ctx.match[1]);
  showProduct(ctx, currentIndex - 1);
  ctx.answerCbQuery();
});

bot.action(/next_(\d+)/, (ctx) => {
  const currentIndex = parseInt(ctx.match[1]);
  showProduct(ctx, currentIndex + 1);
  ctx.answerCbQuery();
});

bot.action(/application_(.+)/, async (ctx) => {
  try {
    const sku = ctx.match[1];
    const product = catalogProductsData.products.find(p => p.sku === sku);

    if (!product) {
      await ctx.answerCbQuery('Товар не найден');
      return;
    }

    // Проверяем доступ к чату продаж
    try {
      await bot.telegram.getChat(process.env.SALE_CHAT_ID);
    } catch (error) {
      console.error('Бот не имеет доступа к чату продаж');
      await ctx.answerCbQuery('Ошибка системы, попробуйте позже');
      return;
    }

    // Получаем данные пользователя
    const user = ctx.from;
    const username = user.username ? `@${user.username}` : 'не указан';
    const firstName = user.first_name || 'не указано';
    // Формируем подробное сообщение с данными из карточки товара
    const messageText = `
🎯 *НОВАЯ ЗАЯВКА НА ТОВАР*

*📦 Информация о товаре:*
• Наименование: ${escapeMarkdown(product.name)}
• Артикул: ${escapeMarkdown(product.sku)}
• Цена: ${product.price.toLocaleString('ru-RU')} руб.
• Ссылка на сайте: ${product.urlSite}

*👤 Информация о клиенте:*
• Имя: ${escapeMarkdown(firstName)}
• Username: ${username}
• User ID: ${user.id}

*🔗 Ссылки для связи:*
${username !== 'не указан' ? `• Написать в Telegram: https://t.me/${user.username}` : '• Telegram: недоступен'}
• Ссылка на товар: ${product.urlSite}

*⏰ Время заявки:* ${new Date().toLocaleString('ru-RU')}
    `.trim();

    // Отправляем в чат продаж
    await bot.telegram.sendMessage(
      process.env.SALE_CHAT_ID,
      messageText,
      {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: '📞 Написать клиенту',
                url: `https://t.me/${user.username}`
              },
              {
                text: '🌐 Открыть товар на сайте',
                url: product.urlSite
              }
            ],
          ]
        }
      }
    );

    await ctx.answerCbQuery('✅ Заявка отправлена менеджерам');

  } catch (error) {
    console.error('Ошибка:', error);
    await ctx.answerCbQuery('Произошла ошибка');
  }
});


// Handle text messages (fallback)
bot.on('text', (ctx) => {
  ctx.reply(`Не понимаю команду. Используйте /catalog для просмотра товаров или /help для помощи`);
});

// Error handling
bot.catch((err, ctx) => {
  console.error(`Error for ${ctx.updateType}`, err);
  ctx.reply('Произошла ошибка. Попробуйте позже.');
});

// Launch the bot
bot.launch().then(async () => {
  console.log('Bot is running!');
  console.log(`Загружено товаров: ${catalogProductsData.products.length}`);
  // Проверка доступа к чату продаж
  try {
    const chat = await bot.telegram.getChat(SALES_CHAT_ID);
    console.log(`✅ Бот подключен к чату: ${chat.title}`);
  } catch (error) {

  }
});

// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

// Добавляем команду помощи
bot.help((ctx) => {
  ctx.reply(
    `🤖 Команды бота:\n\n` +
    `/start - Начать работу\n` +
    `/catalog - Показать каталог товаров\n` +
    `/info - Информация о каталоге\n` +
    `/links - Полезные ссылки\n\n` +
    `Или используйте кнопки меню!`
  );
});