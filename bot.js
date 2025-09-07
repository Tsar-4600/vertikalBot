// dependencies
const { Telegraf, Markup } = require('telegraf');
require('dotenv').config();
const fs = require('fs').promises;
const path = require('path');

// Конфигурация
const CONFIG = {
  ADMIN_IDS: process.env.ADMIN_IDS ? process.env.ADMIN_IDS.split(',').map(id => id.trim()) : [],
  BOT_API: process.env.BOT_API,
  SALE_CHAT_ID: process.env.SALE_CHAT_ID,
  CHANNEL_ID: process.env.CHANNEL_ID,
  MANAGERS: {
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
  }
};

// Данные
const catalogProductsData = require('./catalogProducts');
let adminPosts = { posts: [] };

// Загрузка постов
async function loadPosts() {
  try {
    const postsPath = path.join(__dirname, 'post/adminPosts.json');
    const data = await fs.readFile(postsPath, 'utf8');
    adminPosts = JSON.parse(data);
  } catch (error) {
    console.log('Создаем новый файл постов');
    adminPosts = { posts: [] };
  }
}

// Инициализация бота
const bot = new Telegraf(CONFIG.BOT_API);

// Хранилища состояний
const userStates = new Map();
const userRegions = new Map();
const adminStates = new Map();

// Утилиты
const utils = {
  escapeMarkdown: (text) => text.replace(/([_*\[\]()~`>#+\-=|{}.!])/g, '\\$1'),

  getRegionName: (regionCode) => {
    const regions = {
      'moscow': 'Москва 🏢',
      'petersburg': 'Санкт-Петербург 🏛️',
      'other': 'Другой регион 🌍'
    };
    return regions[regionCode] || 'Неизвестный регион';
  },

  getManagerMentions: (region) => {
    const regionManagers = CONFIG.MANAGERS[region] || CONFIG.MANAGERS.other;
    return regionManagers.map(manager => manager.username).join(' ');
  },

  isAdmin: (userId) => CONFIG.ADMIN_IDS.includes(userId.toString())
};

// Сервис работы с постами
const postService = {
  async savePosts() {
    try {
      const postsDir = path.join(__dirname, 'post');
      try {
        await fs.access(postsDir);
      } catch {
        await fs.mkdir(postsDir, { recursive: true });
      }

      await fs.writeFile(
        path.join(postsDir, 'adminPosts.json'),
        JSON.stringify(adminPosts, null, 2)
      );
    } catch (error) {
      console.error('Ошибка сохранения постов:', error);
      throw new Error('Не удалось сохранить посты');
    }
  },

  async createPost(postData) {
    const newPost = {
      id: Date.now(),
      ...postData,
      createdAt: new Date().toISOString(),
      status: 'draft'
    };

    adminPosts.posts.push(newPost);
    await this.savePosts();
    return newPost;
  },

  async updatePost(postId, updates) {
    const post = adminPosts.posts.find(p => p.id === postId);
    if (!post) throw new Error('Пост не найден');

    Object.assign(post, updates);
    await this.savePosts();
    return post;
  },
  async deletePost(postId) {
    const index = adminPosts.posts.findIndex(p => p.id === postId);
    if (index === -1) throw new Error('Пост не найден');

    adminPosts.posts.splice(index, 1);
    await this.savePosts();
  },

  getPostStats() {
    const total = adminPosts.posts.length;
    const published = adminPosts.posts.filter(p => p.status === 'published').length;
    const drafts = adminPosts.posts.filter(p => p.status === 'draft').length;

    return { total, published, drafts };
  },

  findPost(postId) {
    return adminPosts.posts.find(p => p.id === postId);
  }
};

// Сервис работы с товарами
const productService = {
  showProduct(ctx, productIndex) {
    const products = catalogProductsData.products;

    if (products.length === 0) {
      return ctx.reply('😔 Каталог товаров пуст');
    }

    let index = productIndex;
    if (index >= products.length) index = 0;
    if (index < 0) index = products.length - 1;

    const product = products[index];
    userStates.set(ctx.from.id, index);

    const escapedName = utils.escapeMarkdown(product.name);
    const escapedSku = utils.escapeMarkdown(product.sku);

    const caption = `🏗️ *${escapedName}*\n\n` +
      `📦 Артикул: ${escapedSku}\n` +
      `💰 Цена: ${product.price.toLocaleString('ru-RU')} руб.\n\n` +
      `ℹ️ Подробное описание на нашем сайте`;

    const reply_markup = {
      inline_keyboard: [
        [
          { text: '🌐 Перейти на сайте', url: product.urlSite },
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
  },

  findProductBySku(sku) {
    return catalogProductsData.products.find(p => p.sku === sku);
  }
};

// Вспомогательная функция для создания текстового поста
async function createTextPost(ctx, text) {
  try {
    const newPost = await postService.createPost({
      text: text,
      createdBy: ctx.from.username || ctx.from.first_name
    });

    adminStates.delete(ctx.from.id);
    ctx.reply(`✅ Пост создан (без фото)! Статус: черновик\n\nИспользуйте команду /publish_${newPost.id} для публикации`);
  } catch (error) {
    console.error('Ошибка создания поста:', error);
    ctx.reply('❌ Ошибка при создании поста');
  }
}

// Обработчики команд пользователя
const userHandlers = {
  start: (ctx) => {
    const userRegion = userRegions.get(ctx.from.id);
    const regionInfo = userRegion ? `\n📍 Ваш регион: ${utils.getRegionName(userRegion)}` : '';

    const welcomeText = `🚛 Добро пожаловать в каталог спецтехники!${regionInfo}\n\n` +
      `Здесь вы можете ознакомиться с нашей продукцией.\n` +
      `Нажмите /catalog чтобы посмотреть товары\n` +
      `Используйте /region чтобы сменить регион`;

    ctx.reply(welcomeText, Markup.keyboard([
      ['📦 Показать каталог'],
      ['🌐 Наш сайт', '📞 Контакты'],
      ['📍 Сменить регион']
    ]).resize());
  },

  showCatalog: (ctx) => {
    productService.showProduct(ctx, 0);
  },

  showWebsite: (ctx) => {
    ctx.reply('🌐 Наш официальный сайт: https://gkvertikal.ru');
  },

  showContacts: (ctx) => {
    ctx.reply('📞 Для связи:\nТелефон: +7 (XXX) XXX-XX-XX\nEmail: info@gkvertikal.ru');
  },

  showRegionSelection: (ctx) => {
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
  },

  showInfo: (ctx) => {
    const productCount = catalogProductsData.products.length;
    ctx.reply(`📊 В каталоге: ${productCount} товаров\n\nИспользуйте /catalog для просмотра`);
  },

  showLinks: (ctx) => {
    ctx.reply('Полезные ссылки:', Markup.inlineKeyboard([
      [Markup.button.url('🌐 Наш сайт', 'https://gkvertikal.ru')],
      [Markup.button.url('🌐 Сайт zoomlion', 'https://zoomlion.gkvertikal.ru')]
    ]));
  },

  showId: (ctx) => {
    const user = ctx.from;
    const chat = ctx.chat;

    const safeFirstName = utils.escapeMarkdown(user.first_name || 'не указано');
    const safeLastName = utils.escapeMarkdown(user.last_name || 'не указано');
    const safeUsername = user.username ? utils.escapeMarkdown(`@${user.username}`) : 'не указан';

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
  },

  handleSetRegion: async (ctx) => {
    const region = ctx.match[1];
    userRegions.set(ctx.from.id, region);
    await ctx.editMessageText(`✅ Регион установлен: ${utils.getRegionName(region)}`);
    await ctx.answerCbQuery();
  }
};

// Обработчики админ-панели
const adminHandlers = {
  showAdminPanel: (ctx) => {
    if (!utils.isAdmin(ctx.from.id)) {
      return ctx.reply('❌ У вас нет прав доступа к админке');
    }

    ctx.reply('🛠️ Панель администратора:', Markup.keyboard([
      ['📝 Создать пост', '📊 Статистика постов'],
      ['👥 Рассылка', '⬅️ Назад']
    ]).resize());
  },

  startPostCreation: (ctx) => {
    if (!utils.isAdmin(ctx.from.id)) {
      return ctx.reply('❌ У вас нет прав доступа');
    }

    adminStates.set(ctx.from.id, { step: 'waiting_for_text' });
    ctx.reply('📝 Введите текст поста:');
  },

  handlePostText: (ctx) => {
    if (!utils.isAdmin(ctx.from.id)) return;

    const state = adminStates.get(ctx.from.id);

    if (state && state.step === 'waiting_for_text') {
      adminStates.set(ctx.from.id, {
        step: 'waiting_for_photo',
        text: ctx.message.text
      });

      ctx.reply('✅ Текст сохранен. Теперь отправьте фото для поста (или отправьте "нет" если без фото):');
    }
    else if (state && state.step === 'waiting_for_photo') {
      if (ctx.message.text && ctx.message.text.toLowerCase() === 'нет') {
        // Используем внешнюю функцию вместо this.createTextPost
        createTextPost(ctx, state.text);
      }
    }
  },

  handlePhotoUpload: async (ctx) => {
    if (!utils.isAdmin(ctx.from.id)) return;

    const state = adminStates.get(ctx.from.id);

    if (state && state.step === 'waiting_for_photo') {
      const photo = ctx.message.photo[ctx.message.photo.length - 1];
      const fileId = photo.file_id;

      try {
        const newPost = await postService.createPost({
          text: state.text,
          photo: fileId,
          createdBy: ctx.from.username || ctx.from.first_name
        });

        adminStates.delete(ctx.from.id);

        ctx.replyWithPhoto(fileId, {
          caption: `✅ Пост создан! Статус: черновик\n\nID: ${newPost.id}\n\nИспользуйте команду /publish_${newPost.id} для публикации`
        });
      } catch (error) {
        console.error('Ошибка создания поста с фото:', error);
        ctx.reply('❌ Ошибка при создании поста');
      }
    }
  },

  publishPost: async (ctx, postId) => {
    // 1. DEBUG: Начало функции
    console.log(`[DEBUG] publishPost called for post ID: ${postId} by user ${ctx.from.id}`);

    if (!utils.isAdmin(ctx.from.id)) {
      console.log('[DEBUG] User is not admin, access denied.');
      return ctx.reply('❌ У вас нет прав доступа');
    }
    console.log('[DEBUG] User is admin.');

    const post = postService.findPost(postId);
    if (!post) {
      console.log('[DEBUG] Post not found in database.');
      return ctx.reply('❌ Пост не найден');
    }
    console.log('[DEBUG] Post found:', { id: post.id, hasPhoto: !!post.photo, textLength: post.text.length });

    if (!CONFIG.CHANNEL_ID) {
      console.log('[DEBUG] CHANNEL_ID is not set in environment variables.');
      return ctx.reply('❌ CHANNEL_ID не настроен в .env файле');
    }
    console.log(`[DEBUG] CHANNEL_ID is: ${CONFIG.CHANNEL_ID}`);

    try {
      // 2. DEBUG: Проверка доступа к каналу
      console.log('[DEBUG] Checking bot access to the channel...');
      try {
        const chat = await ctx.telegram.getChat(CONFIG.CHANNEL_ID);
        console.log(`[DEBUG] Success! Channel title: ${chat.title}`);
      } catch (getChatError) {
        console.error('[DEBUG] ERROR - Bot cannot access channel:', getChatError.message);
        return ctx.reply('❌ Бот не имеет доступа к каналу. Проверьте:\n1. Добавлен ли бот в канал\n2. Является ли бот администратором канала\n3. Правильный ли CHANNEL_ID в настройках');
      }

      const targetChatId = CONFIG.CHANNEL_ID;

      // 3. DEBUG: Попытка отправки сообщения
      console.log(`[DEBUG] Attempting to send message to channel ID: ${targetChatId}`);
      if (post.photo) {
        console.log('[DEBUG] Sending photo post...');
        await ctx.telegram.sendPhoto(targetChatId, post.photo, {
          caption: post.text,
          parse_mode: 'Markdown'
        });
      } else {
        console.log('[DEBUG] Sending text post...');
        await ctx.telegram.sendMessage(targetChatId, post.text, {
          parse_mode: 'Markdown'
        });
      }
      console.log('[DEBUG] Message successfully sent to channel!');

      // 4. DEBUG: Обновление статуса поста
      console.log('[DEBUG] Updating post status to "published"...');
      await postService.updatePost(postId, {
        status: 'published',
        publishedAt: new Date().toISOString()
      });
      console.log('[DEBUG] Post status updated successfully.');

      // 5. DEBUG: Отправка отчета админу
      console.log('[DEBUG] Sending success report to admin.');
      await ctx.reply('✅ Пост успешно опубликован!');

    } catch (error) {
      // 6. DEBUG: Обработка ошибок
      console.error('[DEBUG] CATCH BLOCK - Publication error:', error);

      if (error.response) {
        console.error('[DEBUG] Telegram API error details:', error.response);

        if (error.response.error_code === 403) {
          await ctx.reply('❌ Бот не имеет прав на отправку сообщений в канал. Проверьте права администратора.');
        } else if (error.response.error_code === 400) {
          await ctx.reply('❌ Неверный CHANNEL_ID или канал не существует.');
        } else if (error.response.error_code === 429) {
          await ctx.reply('❌ Слишком много запросов. Попробуйте позже.');
        } else {
          await ctx.reply(`❌ Ошибка Telegram API (код ${error.response.error_code}): ${error.response.description}`);
        }
      } else {
        await ctx.reply('❌ Неизвестная ошибка при публикации поста: ' + error.message);
      }
    }
  },
   deletePost: async (ctx, postId) => {
    console.log(`[DELETE] Start deletePost for ID: ${postId} by user ${ctx.from.id}`);
    
    // Проверка прав администратора
    if (!utils.isAdmin(ctx.from.id)) {
      console.log('[DELETE] User is not admin, access denied.');
      return ctx.reply('❌ У вас нет прав доступа');
    }
    
    try {
      console.log('[DELETE] Attempting to delete post:', postId);
      
      // Вызываем сервис удаления из postService
      await postService.deletePost(postId);
      
      console.log('[DELETE] Post deleted successfully from database');
      await ctx.reply('✅ Пост успешно удален из базы данных!');
      
    } catch (error) {
      console.error('[DELETE] ERROR:', error);
      
      // Обрабатываем конкретную ошибку из postService.deletePost
      if (error.message === 'Пост не найден') {
        await ctx.reply('❌ Пост не найден в базе данных');
      } else {
        await ctx.reply('❌ Ошибка при удалении поста: ' + error.message);
      }
    }
  },

  showPostStats: (ctx) => {
    if (!utils.isAdmin(ctx.from.id)) {
      return ctx.reply('❌ У вас нет прав доступа');
    }

    const stats = postService.getPostStats();

    let message = `📊 Статистика постов:\n\n`;
    message += `Всего: ${stats.total}\n`;
    message += `Опубликовано: ${stats.published}\n`;
    message += `Черновиков: ${stats.drafts}\n\n`;
    message += `Последние 5 постов:\n`;

    const recentPosts = adminPosts.posts.slice(-5).reverse();
    recentPosts.forEach(post => {
      message += `\n📝 ID: ${post.id} - ${post.status === 'published' ? '✅' : '📝'} - ${new Date(post.createdAt).toLocaleDateString('ru-RU')}`;
    });

    message += `\n\nИспользуйте /view_post_[id] для просмотра`;

    ctx.reply(message);
  },

  viewPost: async (ctx, postId) => {
    if (!utils.isAdmin(ctx.from.id)) {
      return ctx.reply('❌ У вас нет прав доступа');
    }

    const post = postService.findPost(postId);

    if (!post) {
      return ctx.reply('❌ Пост не найден');
    }

    const statusEmoji = post.status === 'published' ? '✅' : '📝';
    const caption = `📝 Пост ID: ${post.id}\nСтатус: ${post.status}\nСоздан: ${new Date(post.createdAt).toLocaleString('ru-RU')}\nАвтор: ${post.createdBy}\n\n${post.text}`;

    if (post.photo) {
      await ctx.replyWithPhoto(post.photo, {
        caption: caption,
        reply_markup: Markup.inlineKeyboard([
          [
            Markup.button.callback('✅ Опубликовать', `publish_${post.id}`),
            Markup.button.callback('🗑️ Удалить', `delete_${post.id}`)
          ]
        ])
      });
    } else {
      ctx.reply(caption, {
        reply_markup: Markup.inlineKeyboard([
          [
            Markup.button.callback('✅ Опубликовать', `publish_${post.id}`),
            Markup.button.callback('🗑️ Удалить', `delete_${post.id}`)
          ]
        ])
      });
    }
  },

  handleInlinePublish: async (ctx) => {
    const postId = parseInt(ctx.match[1]);
    const post = postService.findPost(postId);

    if (!post) {
      return ctx.answerCbQuery('❌ Пост не найден');
    }

    try {
      const targetChatId = CONFIG.CHANNEL_ID;

      if (post.photo) {
        await ctx.telegram.sendPhoto(targetChatId, post.photo, {
          caption: post.text,
          parse_mode: 'Markdown'
        });
      } else {
        await ctx.telegram.sendMessage(targetChatId, post.text, {
          parse_mode: 'Markdown'
        });
      }

      await postService.updatePost(postId, {
        status: 'published',
        publishedAt: new Date().toISOString()
      });

      await ctx.editMessageText(`✅ Пост опубликован!\n\n${ctx.update.callback_query.message.text}`);
      await ctx.answerCbQuery('✅ Опубликовано');
    } catch (error) {
      console.error('Ошибка публикации:', error);
      await ctx.answerCbQuery('❌ Ошибка публикации');
    }
  },

  handleInlineDelete: async (ctx) => {
    const postId = parseInt(ctx.match[1]);

    try {
      await postService.deletePost(postId);
      await ctx.editMessageText('🗑️ Пост удален');
      await ctx.answerCbQuery('✅ Удалено');
    } catch (error) {
      await ctx.answerCbQuery('❌ Ошибка удаления');
    }
  },

  startBroadcast: (ctx) => {
    if (!utils.isAdmin(ctx.from.id)) {
      return ctx.reply('❌ У вас нет прав доступа');
    }

    adminStates.set(ctx.from.id, { step: 'waiting_for_broadcast' });
    ctx.reply('📢 Введите сообщение для рассылки:');
  },

  handleBroadcast: (ctx) => {
    if (!utils.isAdmin(ctx.from.id)) return;

    const state = adminStates.get(ctx.from.id);

    if (state && state.step === 'waiting_for_broadcast') {
      ctx.reply('⏳ Начинаю рассылку... Это может занять время');
      // Логика рассылки будет здесь
      adminStates.delete(ctx.from.id);
      ctx.reply('✅ Рассылка завершена');
    }
  }
};

// Обработчики заявок
const applicationHandlers = {
  handleApplication: async (ctx) => {
    try {
      const sku = ctx.match[1];
      const product = productService.findProductBySku(sku);

      if (!product) {
        await ctx.answerCbQuery('Товар не найден');
        return;
      }

      userStates.set(ctx.from.id + '_application', sku);

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
  },

  handleRegionSelection: async (ctx) => {
    try {
      const region = ctx.match[1];
      const userId = ctx.from.id;
      const sku = userStates.get(userId + '_application');

      if (!sku) {
        await ctx.answerCbQuery('Ошибка: данные заявки не найдены');
        return;
      }

      const product = productService.findProductBySku(sku);
      if (!product) {
        await ctx.answerCbQuery('Товар не найден');
        return;
      }

      userRegions.set(userId, region);

      const managerMentions = utils.getManagerMentions(region);

      // Проверяем доступ к чату продаж
      try {
        await bot.telegram.getChat(CONFIG.SALE_CHAT_ID);
      } catch (error) {
        console.error('Бот не имеет доступа к чату продаж');
        await ctx.answerCbQuery('Ошибка системы, попробуйте позже');
        return;
      }

      const user = ctx.from;
      const username = user.username ? `@${user.username}` : 'не указан';
      const firstName = user.first_name || 'не указано';

      const messageText = `
🎯 *НОВАЯ ЗАЯВКА НА ТОВАР* 
${managerMentions}

*📍 Регион:* ${utils.getRegionName(region)}

*📦 Информация о товаре:*
• Наименование: ${utils.escapeMarkdown(product.name)}
• Артикул: ${utils.escapeMarkdown(product.sku)}
• Цена: ${product.price.toLocaleString('ru-RU')} руб.
• Ссылка на сайте: ${product.urlSite}

*👤 Информация о клиенте:*
• Имя: ${utils.escapeMarkdown(firstName)}
• Username: ${username}
• User ID: ${user.id}

*🔗 Ссылки для связи:*
${username !== 'не указан' ? `• Написать в Telegram: https://t.me/${user.username}` : '• Telegram: недоступен'}
• Ссылка на товар: ${product.urlSite}

*⏰ Время заявки:* ${new Date().toLocaleString('ru-RU')}
      `.trim();

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

      await bot.telegram.sendMessage(
        CONFIG.SALE_CHAT_ID,
        messageText,
        {
          parse_mode: 'Markdown',
          reply_markup: replyMarkup
        }
      );

      userStates.delete(userId + '_application');

      await ctx.editMessageText('✅ Заявка отправлена менеджерам! С вами свяжутся в ближайшее время.');
      await ctx.answerCbQuery();
    } catch (error) {
      console.error('Ошибка:', error);
      await ctx.answerCbQuery('Произошла ошибка');
    }
  }
};

// Настройка обработчиков бота
function setupBotHandlers() {
  // Основные команды
  bot.start(userHandlers.start);
  bot.command('catalog', userHandlers.showCatalog);
  bot.command('admin', adminHandlers.showAdminPanel);
  bot.command('region', userHandlers.showRegionSelection);
  bot.command('info', userHandlers.showInfo);
  bot.command('links', userHandlers.showLinks);
  bot.command('id', userHandlers.showId);
  bot.command('echo', (ctx) => {
    const message = ctx.message.text.split(' ').slice(1).join(' ');
    ctx.reply(message || 'Please provide text to echo');
  });
  bot.command('test_publish', async (ctx) => {
    try {
      console.log('Тестовая публикация...');
      await ctx.telegram.sendMessage(CONFIG.CHANNEL_ID, 'Тестовое сообщение');
      console.log('Сообщение отправлено');
      ctx.reply('✅ Тест успешен!');
    } catch (error) {
      console.error('Тест failed:', error);
      ctx.reply(`❌ Тест failed: ${error.message}`);
    }
  });

  // Команды управления постами
  bot.command(/^publish_(\d+)$/, (ctx) => {
    // ДОБАВЬТЕ ЭТУ СТРОКУ ДЛЯ ДИАГНОСТИКИ
    console.log('🟢 ОБРАБОТЧИК КОМАНДЫ publish_ ЗАПУЩЕН! ID:', ctx.match[1]);

    const postId = parseInt(ctx.match[1]);
    adminHandlers.publishPost(ctx, postId);
  });
  bot.command(/^view_post_(\d+)$/, (ctx) => adminHandlers.viewPost(ctx, parseInt(ctx.match[1])));
  bot.command(/^delete_post_(\d+)$/, (ctx) => {
    console.log('🟢 ОБРАБОТЧИК КОМАНДЫ delete_post_ ЗАПУЩЕН! ID:', ctx.match[1]);
    const postId = parseInt(ctx.match[1]);
    adminHandlers.deletePost(ctx, postId);
  });
  // Текстовые обработчики
  bot.hears('📦 Показать каталог', userHandlers.showCatalog);
  bot.hears('🌐 Наш сайт', userHandlers.showWebsite);
  bot.hears('📞 Контакты', userHandlers.showContacts);
  bot.hears('📍 Сменить регион', userHandlers.showRegionSelection);



  bot.hears('📝 Создать пост', adminHandlers.startPostCreation);
  bot.hears('📊 Статистика постов', adminHandlers.showPostStats);
  bot.hears('👥 Рассылка', adminHandlers.startBroadcast);

  // Inline кнопки
  bot.action(/^set_region_(.+)$/, (ctx) => userHandlers.handleSetRegion(ctx));
  bot.action(/^prev_(\d+)$/, (ctx) => {
    const currentIndex = parseInt(ctx.match[1]);
    productService.showProduct(ctx, currentIndex - 1);
    ctx.answerCbQuery();
  });
  bot.action(/^next_(\d+)$/, (ctx) => {
    const currentIndex = parseInt(ctx.match[1]);
    productService.showProduct(ctx, currentIndex + 1);
    ctx.answerCbQuery();
  });
  bot.action(/^application_(.+)$/, (ctx) => applicationHandlers.handleApplication(ctx));
  bot.action(/^region_(.+)$/, (ctx) => applicationHandlers.handleRegionSelection(ctx));
  bot.action(/^publish_(\d+)$/, (ctx) => adminHandlers.handleInlinePublish(ctx));
  bot.action(/^delete_(\d+)$/, (ctx) => adminHandlers.handleInlineDelete(ctx));

  // Обработка медиа и текста для админов

  bot.on('text', (ctx) => adminHandlers.handlePostText(ctx));
  bot.on('text', (ctx) => adminHandlers.handleBroadcast(ctx));
  bot.on('photo', (ctx) => adminHandlers.handlePhotoUpload(ctx));


  // Fallback
  bot.on('text', (ctx) => {
    ctx.reply('Не понимаю команду. Используйте /catalog для просмотра товаров или /help для помощи');
  });

  // Обработка ошибок
  bot.catch((err, ctx) => {
    console.error(`Error for ${ctx.updateType}`, err);
    ctx.reply('Произошла ошибка. Попробуйте позже.');
  });

  // Помощь
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
}

// Запуск бота
async function startBot() {
  try {
    await loadPosts();
    setupBotHandlers();

    await bot.launch();

    console.log('Bot is running!');
    console.log(`Загружено товаров: ${catalogProductsData.products.length}`);
    console.log(`Загружено постов: ${adminPosts.posts.length}`);

    // Проверка доступа к чату продаж
    if (CONFIG.SALE_CHAT_ID) {
      try {
        const chat = await bot.telegram.getChat(CONFIG.SALE_CHAT_ID);
        console.log(`✅ Бот подключен к чату продаж: ${chat.title}`);
      } catch (error) {
        console.error('❌ Бот не имеет доступа к чату продаж');
      }
    }
  } catch (error) {
    console.error('Ошибка запуска бота:', error);
  }
}

// Graceful shutdown
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

// Запуск
startBot();