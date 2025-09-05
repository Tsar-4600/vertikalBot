// dependencies
const { Telegraf, Markup } = require('telegraf');
require('dotenv').config();
// Products DATA
const catalogProductsData = require('./catalogProducts');
// chat saleChatId
const chatSaleDepartmentId = process.env.SALE_CHAT_ID;
//  the token from BotFather
const bot = new Telegraf(`${process.env.BOT_API}`);

// Данные менеджеров по регионам (массив для каждого региона)
const managers = {
  'moscow': [
    {
      username: process.env.MOSCOW_MANAGER_USERNAME_1 || '@manager_msk1',
      chatId: process.env.MOSCOW_MANAGER_CHAT_ID_1
    },
  ],
  'petersburg': [
    {
      username: process.env.PETERSBURG_MANAGER_USERNAME_1 || '@manager_spb1',
      chatId: process.env.PETERSBURG_MANAGER_CHAT_ID_1
    },
  ],
  'other': [
    {
      username: process.env.GENERAL_MANAGER_USERNAME_1 || '@general_manager1',
      chatId: process.env.GENERAL_MANAGER_CHAT_ID_1
    },
  ]
};

// Хранилище текущих позиций пользователей
const userStates = new Map();
// Хранилище регионов пользователей
const userRegions = new Map();

// Функция показа товара
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

// Функция экранирования Markdown символов 
function escapeMarkdown(text) {
  return text.replace(/([_*\[\]()~`>#+\-=|{}.!])/g, '\\$1');
}

// Функция для получения названия региона
function getRegionName(regionCode) {
  const regions = {
    'moscow': 'Москва 🏢',
    'petersburg': 'Санкт-Петербург 🏛️', 
    'other': 'Другой регион 🌍'
  };
  return regions[regionCode] || 'Неизвестный регион';
}

// Функция для получения упоминаний всех менеджеров региона
function getManagerMentions(region) {
  const regionManagers = managers[region] || managers.other;
  return regionManagers.map(manager => manager.username).join(' ');
}




// Basic command handler
bot.start((ctx) => {
  const userRegion = userRegions.get(ctx.from.id);
  const regionInfo = userRegion ? `\n📍 Ваш регион: ${getRegionName(userRegion)}` : '';
  
  const welcomeText = `🚛 Добро пожаловать в каталог спецтехники!${regionInfo}\n\n` +
                     `Здесь вы можете ознакомиться с нашей продукцией.\n` +
                     `Нажмите /catalog чтобы посмотреть товары\n` +
                     `Используйте /region чтобы сменить регион`;

  ctx.reply(welcomeText, Markup.keyboard([
    ['📦 Показать каталог'],
    ['🌐 Наш сайт', '📞 Контакты'],
    ['📍 Сменить регион']
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
  ctx.reply('📞 Для связи:\nТелеphone: +7 (XXX) XXX-XX-XX\nEmail: info@gkvertikal.ru');
});

bot.hears('📍 Сменить регион', (ctx) => {
  ctx.reply(
    '📍 Выберите ваш регион:',
    Markup.inlineKeyboard([
      [
        Markup.button.callback('🏢 Москва', 'set_region_moscow'),
        Markup.button.callback('🏛️ Санкт-Петербург', 'set_region_petersburg')
      ],
      [
        Markup.button.callback('🌍 Другой регион', 'set_region_other')
      ]
    ])
  );
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

// Команда для смены региона
bot.command('region', (ctx) => {
  ctx.reply(
    '📍 Выберите ваш регион:',
    Markup.inlineKeyboard([
      [
        Markup.button.callback('🏢 Москва', 'set_region_moscow'),
        Markup.button.callback('🏛️ Санкт-Петербург', 'set_region_petersburg')
      ],
      [
        Markup.button.callback('🌍 Другой регион', 'set_region_other')
      ]
    ])
  );
});

// Команда /id
bot.command('id', (ctx) => {
  const user = ctx.from;
  const chat = ctx.chat;
  
  // Экранируем все данные пользователя
  const safeFirstName = escapeMarkdown(user.first_name || 'не указано');
  const safeLastName = escapeMarkdown(user.last_name || 'не указано');
  const safeUsername = user.username ? escapeMarkdown(`@${user.username}`) : 'не указан';
  
  const idMessage = `
👤 *Ваши идентификаторы:*

*User ID:* \`${user.id}\`
*Chat ID:* \`${chat.id}\`
*Username:* ${safeUsername}
*Имя:* ${safeFirstName}
*Фамилия:* ${safeLastName}

*💡 User ID* \\- ваш уникальный ID в Telegram
*💡 Chat ID* \\- ID этого чата
*💡 Message ID:* \`${ctx.message.message_id}\`
  `.trim();

  ctx.reply(idMessage, { 
    parse_mode: 'MarkdownV2',
    reply_to_message_id: ctx.message.message_id
  });
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

// Обработчик установки региона
bot.action(/set_region_(.+)/, async (ctx) => {
  const region = ctx.match[1];
  userRegions.set(ctx.from.id, region);
  await ctx.editMessageText(`✅ Регион установлен: ${getRegionName(region)}`);
  await ctx.answerCbQuery();
});

// Обработчик создания заявки
bot.action(/application_(.+)/, async (ctx) => {
  try {
    const sku = ctx.match[1];
    const product = catalogProductsData.products.find(p => p.sku === sku);
    
    if (!product) {
      await ctx.answerCbQuery('Товар не найден');
      return;
    }

    // Сохраняем SKU товара для последующего использования
    userStates.set(ctx.from.id + '_application', sku);

    // Предлагаем выбрать регион
    await ctx.reply(
      '📍 Выберите ваш регион:',
      Markup.inlineKeyboard([
        [
          Markup.button.callback('🏢 Москва', 'region_moscow'),
          Markup.button.callback('🏛️ Санкт-Петербург', 'region_petersburg')
        ],
        [
          Markup.button.callback('🌍 Другой регион', 'region_other')
        ]
      ])
    );

    await ctx.answerCbQuery();

  } catch (error) {
    console.error('Ошибка:', error);
    await ctx.answerCbQuery('Произошла ошибка');
  }
});

// Обработчики выбора региона для заявки
// Обработчики выбора региона для заявки
bot.action(/region_(.+)/, async (ctx) => {
  try {
    const region = ctx.match[1];
    const userId = ctx.from.id;
    const sku = userStates.get(userId + '_application');
    
    if (!sku) {
      await ctx.answerCbQuery('Ошибка: данные заявки не найдены');
      return;
    }

    const product = catalogProductsData.products.find(p => p.sku === sku);
    if (!product) {
      await ctx.answerCbQuery('Товар не найден');
      return;
    }

    // Сохраняем регион пользователя
    userRegions.set(userId, region);
    
    // Получаем менеджеров для региона
    const regionManagers = managers[region] || managers.other;
    const managerMentions = getManagerMentions(region);

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

    // Формируем сообщение с упоминанием ВСЕХ менеджеров региона
    const messageText = `
🎯 *НОВАЯ ЗАЯВКА НА ТОВАР* 
${managerMentions}

*📍 Регион:* ${getRegionName(region)}

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

    // Простая клавиатура только со ссылками
    const replyMarkup = {
      inline_keyboard: [
        [
          {
            text: '📞 Написать клиенту',
            url: username !== 'не указан' ? `https://t.me/${user.username}` : 'https://t.me/'
          },
          {
            text: '🌐 Открыть товар на сайте',
            url: product.urlSite
          }
        ]
      ]
    };

    // Отправляем в чат продаж с упоминанием всех менеджеров
    await bot.telegram.sendMessage(
      process.env.SALE_CHAT_ID,
      messageText,
      {
        parse_mode: 'Markdown',
        reply_markup: replyMarkup
      }
    );

    // Удаляем временные данные
    userStates.delete(userId + '_application');
    
    await ctx.editMessageText('✅ Заявка отправлена менеджерам! С вами свяжутся в ближайшее время.');
    await ctx.answerCbQuery();

  } catch (error) {
    console.error('Ошибка:', error);
    await ctx.answerCbQuery('Произошла ошибка');
  }
});

// Удаляем обработчик кнопки "Обработано" полностью
// bot.action(/processed_(.+)/, async (ctx) => { ... });

// Обработчик для кнопки "Обработано"
bot.action(/processed_(.+)/, async (ctx) => {
  try {
    const encodedData = ctx.match[1];
    const data = decodeCallbackData(encodedData);
    
    if (!data) {
      await ctx.answerCbQuery('Ошибка: неверные данные');
      return;
    }

    const { userId, sku, managerUsername } = data;
    
    // Обновляем сообщение о заявке
    await ctx.editMessageText(
      `✅ ЗАЯВКА ОБРАБОТАНА\n\n` +
      `Обработал: ${ctx.from.first_name || 'Менеджер'} ${ctx.from.username ? '@' + ctx.from.username : ''}\n` +
      `Ответственный: ${managerUsername}\n` +
      `Время обработки: ${new Date().toLocaleString('ru-RU')}`,
      { 
        parse_mode: 'Markdown',
        reply_markup: { 
          inline_keyboard: [
            [
              {
                text: '📞 Написать клиенту',
                url: `https://t.me/${ctx.from.username || 'username'}`
              }
            ]
          ]
        } 
      }
    );
    
    // Уведомляем пользователя
    try {
      await bot.telegram.sendMessage(
        userId,
        `✅ Ваша заявка обработана менеджером ${managerUsername}. Скоро с вами свяжутся!`
      );
    } catch (userError) {
      console.log('Пользователь заблокировал бот или недоступен');
    }
    
    await ctx.answerCbQuery('Заявка отмечена как обработанная');
    
  } catch (error) {
    console.error('Ошибка обработки заявки:', error);
    await ctx.answerCbQuery('Ошибка при обработке');
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
bot.launch().then(async() => {
  console.log('Bot is running!');
  console.log(`Загружено товаров: ${catalogProductsData.products.length}`);
   // Проверка доступа к чату продаж
  try {
    const chat = await bot.telegram.getChat(process.env.SALE_CHAT_ID);
    console.log(`✅ Бот подключен к чату продаж: ${chat.title}`);
  } catch (error) {
    console.error('❌ Бот не имеет доступа к чату продаж');
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
    `/region - Сменить регион\n` +
    `/id - Показать ID\n` +
    `/info - Информация о каталоге\n` +
    `/links - Полезные ссылки\n\n` +
    `Или используйте кнопки меню!`
  );
});