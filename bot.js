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
  ALLOWED_FILE_TYPES: ['application/json', 'text/plain'],
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
    'rostov': [
      {
        username: process.env.ROSTOV_MANAGER_USERNAME_1 || '@manager_rostov',
        chatId: process.env.ROSTOV_MANAGER_CHAT_ID_1
      },
    ],
    'sochi': [
      {
        username: process.env.SOCHI_MANAGER_USERNAME_1 || '@manager_sochi1',
        chatId: process.env.SOCHI_MANAGER_CHAT_ID_1
      },
    ],
    'simferopl': [
      {
        username: process.env.SIMFEROPL_MANAGER_USERNAME_1 || '@manager_simferopl1',
        chatId: process.env.SIMFEROPL_MANAGER_CHAT_ID_1
      },
    ],
    'ekaterinburg': [
      {
        username: process.env.EKB_MANAGER_USERNAME_1 || '@manager_ekb1',
        chatId: process.env.EKB_MANAGER_CHAT_ID_1
      },
    ],
    'kazan': [
      {
        username: process.env.KAZAN_MANAGER_USERNAME_1 || '@manager_kazan1',
        chatId: process.env.KAZAN_MANAGER_CHAT_ID_1
      },
    ],

    'other': [
      {
        username: process.env.GENERAL_MANAGER_USERNAME_1 || '@general_manager1',
        chatId: process.env.GENERAL_MANAGER_CHAT_ID_1
      },
    ]
  },

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
  escapeHtml: (text) => {
    if (!text) return '';
    return text.toString()
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  },

  escapeMarkdown: (text) => {
    if (!text) return '';
    return text.toString()
      .replace(/\_/g, '\\_')
      .replace(/\*/g, '\\*')
      .replace(/\[/g, '\\[')
      .replace(/\]/g, '\\]')
      .replace(/\(/g, '\\(')
      .replace(/\)/g, '\\)')
      .replace(/\~/g, '\\~')
      .replace(/\`/g, '\\`')
      .replace(/\>/g, '\\>')
      .replace(/\#/g, '\\#')
      .replace(/\+/g, '\\+')
      .replace(/\-/g, '\\-')  // ← Экранирование дефиса
      .replace(/\=/g, '\\=')
      .replace(/\|/g, '\\|')
      .replace(/\{/g, '\\{')
      .replace(/\}/g, '\\}')
      .replace(/\./g, '\\.')
      .replace(/\!/g, '\\!');
  },

  getRegionName: (regionCode) => {
    const regions = {
      'moscow': 'Москва',
      'petersburg': 'Санкт-Петербург',
      'rostov': 'Ростов',
      'sochi': 'Сочи',
      'simferopl': 'Симферопль',
      'ekaterinburg': 'Екатеринбург',
      'kazan': 'Казань',
      'other': 'Другой регион'
    };
    return regions[regionCode] || 'Неизвестный регион';
  },

  getManagerMentions: (region) => {
    const regionManagers = CONFIG.MANAGERS[region] || CONFIG.MANAGERS.other;
    return regionManagers.map(manager => manager.username).join(' ');
  },


  // Форматирование названий категорий
  formatCategoryName: (category) => {
    const categoryMap = {
      'Спецтехника': '🚜 Спецтехника',
      'Запчасти': '🔧 Запчасти'
      // добавьте другие маппинги по необходимости
    };

    return categoryMap[category] || category;
  },
  isAdmin: (userId) => CONFIG.ADMIN_IDS.includes(userId.toString())
};

// Добавляем middleware для обработки состояний
bot.use(async (ctx, next) => {
  const userId = ctx.from.id;
  const state = adminStates.get(userId);

  // Если пользователь в состоянии ожидания файла каталога и это документ
  if (state && state.step === 'waiting_for_catalog_file' && ctx.message && ctx.message.document) {
    await handleCatalogUpload(ctx);
    return; // Прерываем цепочку middleware
  }

  // Если пользователь в состоянии ожидания текста поста и это текст
  if (state && state.step === 'waiting_for_text' && ctx.message && ctx.message.text) {
    await handlePostText(ctx);
    return;
  }

  // Если пользователь в состоянии ожидания фото поста
  if (state && state.step === 'waiting_for_photo') {
    if (ctx.message && ctx.message.photo) {
      await handlePhotoUpload(ctx);
      return;
    } else if (ctx.message && ctx.message.text && ctx.message.text.toLowerCase() === 'нет') {
      await createTextPost(ctx, state.text);
      return;
    }
  }

  // Если пользователь в состоянии ожидания рассылки и это текст
  if (state && state.step === 'waiting_for_broadcast' && ctx.message && ctx.message.text) {
    await handleBroadcast(ctx);
    return;
  }

  // Продолжаем обработку другими обработчиками
  await next();
});

// Выносим обработчики в отдельные функции
async function handleCatalogUpload(ctx) {
  if (!utils.isAdmin(ctx.from.id)) return;

  const document = ctx.message.document;

  // Проверка типа файла
  if (!CONFIG.ALLOWED_FILE_TYPES.includes(document.mime_type)) {
    return ctx.reply('❌ Неверный формат файла. Отправьте JSON файл.');
  }

  try {
    // Получаем файл
    const fileLink = await ctx.telegram.getFileLink(document.file_id);
    const response = await fetch(fileLink);
    const jsonData = await response.json();

    // Валидация данных
    if (!jsonData.products || !Array.isArray(jsonData.products)) {
      return ctx.reply('❌ Неверный формат JSON. Ожидается массив products');
    }

    // Проверяем обязательные поля
    for (const product of jsonData.products) {
      if (!product.sku || !product.name || !product.price || !product.urlSite || !product.urlSiteImage) {
        return ctx.reply('❌ В JSON отсутствуют обязательные поля (sku, name, price, urlSite, urlSiteImage)');
      }
    }

    // Сохраняем в JS файл с правильным форматом
    const catalogPath = path.join(__dirname, 'catalogProducts.js');
    const jsContent = `const catalogProductsData = ${JSON.stringify(jsonData, null, 2)};\n\nmodule.exports = catalogProductsData;`;

    await fs.writeFile(catalogPath, jsContent);

    // Обновляем кэш
    catalogProductsData.products = jsonData.products;

    adminStates.delete(ctx.from.id);
    ctx.reply(`✅ Каталог обновлен! Добавлено товаров: ${jsonData.products.length}`);

  } catch (error) {
    console.error('Ошибка загрузки каталога:', error);
    ctx.reply('❌ Ошибка при обработке файла: ' + error.message);
  }
}

async function handlePostText(ctx) {
  if (!utils.isAdmin(ctx.from.id)) return;

  adminStates.set(ctx.from.id, {
    step: 'waiting_for_photo',
    text: ctx.message.text
  });

  ctx.reply('✅ Текст сохранен. Теперь отправьте фото для поста (или отправьте "нет" если без фото):');
}

async function handlePhotoUpload(ctx) {
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
}

//
// Сервис работы с постами
//
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
//
// Сервис работы с товарами
//
const productService = {
  // Получение всех уникальных категорий
  getAllCategories() {
    const categories = [...new Set(catalogProductsData.products.map(item => item.category))];
    return categories.sort();
  },

  // Получение товаров по категории
  getProductsByCategory(category) {
    return catalogProductsData.products.filter(item => item.category === category);
  },

  // Показ товара с навигацией
  showProduct(ctx, category, productIndex) {
    const products = this.getProductsByCategory(category);

    if (products.length === 0) {
      return ctx.reply('😔 В этой категории нет товаров');
    }

    let index = productIndex;
    if (index >= products.length) index = 0;
    if (index < 0) index = products.length - 1;

    const product = products[index];

    // Сохраняем состояние пользователя
    userStates.set(ctx.from.id, {
      category: category,
      index: index,
      total: products.length
    });

    const escapedName = utils.escapeMarkdown(product.name);

    const caption = `🏗️ *${escapedName}*\n\n` +
      `📂 Категория: ${utils.escapeMarkdown(product.category)}\n` +
      `💰 Цена: ${product.price.toLocaleString('ru-RU')} руб.\n\n` +
      `ℹ️ Подробное описание на нашем сайте`;

    const navigationButtons = [];

    if (products.length > 1) {
      if (index > 0) {
        navigationButtons.push({
          text: '⬅️ Назад',
          callback_data: `nav_${category}_${index - 1}`
        });
      }

      navigationButtons.push({
        text: `${index + 1}/${products.length}`,
        callback_data: 'page_info'
      });

      if (index < products.length - 1) {
        navigationButtons.push({
          text: 'Вперед ➡️',
          callback_data: `nav_${category}_${index + 1}`
        });
      }
    }

    const reply_markup = {
      inline_keyboard: [
        [
          { text: '🌐 Перейти на сайт', url: product.urlSite },
          { text: '📝 Оставить заявку', callback_data: `application_${product.sku}` }
        ],
        navigationButtons,
        [
          { text: '↩️ К категориям', callback_data: 'back_to_categories' }
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

  // Показ категорий с пагинацией
  showCategories: async function (ctx, page = 0, itemsPerPage = 8) {
    const categories = this.getAllCategories(); // Теперь this будет корректным

    if (categories.length === 0) {
      return ctx.reply('😔 Категории не найдены');
    }

    // Рассчитываем пагинацию
    const totalPages = Math.ceil(categories.length / itemsPerPage);
    const startIndex = page * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const currentCategories = categories.slice(startIndex, endIndex);

    // Создаем кнопки категорий (по 2 в ряд)
    const categoryButtons = [];
    for (let i = 0; i < currentCategories.length; i += 2) {
      const row = [];
      if (currentCategories[i]) {
        row.push({
          text: utils.formatCategoryName(currentCategories[i]),
          callback_data: `category_${currentCategories[i]}_0`
        });
      }
      if (currentCategories[i + 1]) {
        row.push({
          text: utils.formatCategoryName(currentCategories[i + 1]),
          callback_data: `category_${currentCategories[i + 1]}_0`
        });
      }
      categoryButtons.push(row);
    }

    // Добавляем кнопки навигации
    const navigationButtons = [];

    if (page > 0) {
      navigationButtons.push({
        text: '⬅️ Назад',
        callback_data: `categories_page_${page - 1}`
      });
    }

    navigationButtons.push({
      text: `${page + 1}/${totalPages}`,
      callback_data: 'categories_info'
    });

    if (page < totalPages - 1) {
      navigationButtons.push({
        text: 'Вперед ➡️',
        callback_data: `categories_page_${page + 1}`
      });
    }

    if (navigationButtons.length > 0) {
      categoryButtons.push(navigationButtons);
    }

    // Добавляем кнопку закрытия
    categoryButtons.push([{ text: '❌ Закрыть', callback_data: 'close_catalog' }]);

    const messageText = `📂 Выберите категорию (страница ${page + 1}/${totalPages}):`;

    // Если это callback query (нажатие на кнопку) и есть message
    if (ctx.update.callback_query && ctx.update.callback_query.message) {
      const message = ctx.update.callback_query.message;

      try {
        // Пытаемся отредактировать сообщение
        await ctx.editMessageText(messageText, {
          reply_markup: {
            inline_keyboard: categoryButtons
          }
        });
        return;
      } catch (editError) {
        // Если не удалось отредактировать (например, сообщение с фото), 
        // удаляем старое и создаем новое
        try {
          await ctx.deleteMessage();
        } catch (deleteError) {
          // Игнорируем ошибку удаления
        }
      }
    }

    // Создаем новое сообщение
    return ctx.reply(messageText, {
      reply_markup: {
        inline_keyboard: categoryButtons
      }
    });
  },

  findProductBySku(sku) {
    return catalogProductsData.products.find(p => p.sku === sku);
  }
};

// Обработчики каталога
const catalogHandlers = {
  // Показ категорий
  showCatalog: (ctx) => {
    productService.showCategories(ctx, 0);
  },

  // Обработка пагинации категорий с обработкой ошибок
  handleCategoriesPage: async (ctx) => {
    try {
      const page = parseInt(ctx.match[1]);
      await productService.showCategories(ctx, page);
      await ctx.answerCbQuery();
    } catch (error) {
      console.error('Ошибка при пагинации категорий:', error);
      // Если не удалось отредактировать, создаем новое сообщение
      await ctx.answerCbQuery('⚠️ Обновление...');
      await productService.showCategories(ctx, parseInt(ctx.match[1]));
    }
  },

  // Информация о странице категорий
  handleCategoriesInfo: (ctx) => {
    ctx.answerCbQuery('Страница категорий');
  },

  // Обработка выбора категории
  handleCategorySelect: (ctx) => {
    const category = ctx.match[1];
    const productIndex = parseInt(ctx.match[2]);

    productService.showProduct(ctx, category, productIndex);
    ctx.answerCbQuery();
  },

  // Навигация по товарам
  handleNavigation: (ctx) => {
    const category = ctx.match[1];
    const productIndex = parseInt(ctx.match[2]);

    productService.showProduct(ctx, category, productIndex);
    ctx.answerCbQuery();
  },
  // Возврат к категориям
  handleBackToCategories: async (ctx) => {
    try {
      // Вместо удаления сообщения, редактируем его чтобы показать категории
      if (ctx.update.callback_query && ctx.update.callback_query.message) {
        const message = ctx.update.callback_query.message;

        // Проверяем, есть ли фото в сообщении (это сообщение с товаром)
        if (message.photo) {
          // Если это сообщение с фото, удаляем его и создаем новое с категориями
          try {
            await ctx.deleteMessage();
          } catch (deleteError) {
            // Игнорируем ошибку "message to delete not found"
            if (deleteError.response && deleteError.response.error_code === 400 &&
              deleteError.response.description.includes('message to delete not found')) {
              console.log('Сообщение уже удалено, продолжаем...');
            } else {
              console.error('Ошибка при удалении сообщения:', deleteError);
            }
          }
          // Показываем категории
          await productService.showCategories(ctx, 0);
        } else {
          // Если это текстовое сообщение, редактируем его
          try {
            await productService.showCategories(ctx, 0);
          } catch (editError) {
            // Если не удалось отредактировать, создаем новое сообщение
            console.error('Ошибка при редактировании сообщения:', editError);
            await productService.showCategories(ctx, 0);
          }
        }
      } else {
        // Если нет сообщения callback_query, просто показываем категории
        await productService.showCategories(ctx, 0);
      }

      await ctx.answerCbQuery();
    } catch (error) {
      console.error('Ошибка в handleBackToCategories:', error);

      // Если не удалось отредактировать, создаем новое сообщение
      try {
        await ctx.reply('📂 Выберите категорию:', {
          reply_markup: {
            inline_keyboard: [
              [{ text: '🔄 Попробовать снова', callback_data: 'back_to_categories' }],
              [{ text: '❌ Закрыть', callback_data: 'close_catalog' }]
            ]
          }
        });
      } catch (fallbackError) {
        console.error('Не удалось отправить fallback сообщение:', fallbackError);
      }

      await ctx.answerCbQuery('⚠️ Произошла ошибка');
    }
  },

  // Закрытие каталога
  handleCloseCatalog: (ctx) => {
    if (ctx.update.callback_query && ctx.update.callback_query.message) {
      ctx.deleteMessage().catch(console.error);
    }
    ctx.answerCbQuery('Каталог закрыт');
  },

  // Информация о странице
  handlePageInfo: (ctx) => {
    ctx.answerCbQuery('Текущая страница товара');
  }
};
//
// Сервис работы с подписками
//
const subscriptionService = {
  usersFilePath: path.join(__dirname, 'broadcast', 'users.json'),

  // Загрузка пользователей из файла
  async loadUsers() {
    try {
      const data = await fs.readFile(this.usersFilePath, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      console.log('Создаем новый файл пользователей');
      return { users: [] };
    }
  },

  // Сохранение пользователей в файл
  async saveUsers(usersData) {
    try {
      const broadcastDir = path.join(__dirname, 'broadcast');
      try {
        await fs.access(broadcastDir);
      } catch {
        await fs.mkdir(broadcastDir, { recursive: true });
      }

      await fs.writeFile(this.usersFilePath, JSON.stringify(usersData, null, 2));
    } catch (error) {
      console.error('Ошибка сохранения пользователей:', error);
      throw new Error('Не удалось сохранить пользователей');
    }
  },

  // Добавление/обновление пользователя
  async subscribeUser(userId, username = '', firstName = '', lastName = '') {
    try {
      const usersData = await this.loadUsers();
      const existingUserIndex = usersData.users.findIndex(user => user.id === userId);

      if (existingUserIndex !== -1) {
        // Обновляем существующего пользователя
        usersData.users[existingUserIndex] = {
          ...usersData.users[existingUserIndex],
          subscribe: true,
          username: username || usersData.users[existingUserIndex].username,
          firstName: firstName || usersData.users[existingUserIndex].firstName,
          lastName: lastName || usersData.users[existingUserIndex].lastName,
          updatedAt: new Date().toISOString()
        };
      } else {
        // Добавляем нового пользователя
        usersData.users.push({
          id: userId,
          subscribe: true,
          username: username,
          firstName: firstName,
          lastName: lastName,
          subscribedAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });
      }

      await this.saveUsers(usersData);
      return true;
    } catch (error) {
      console.error('Ошибка подписки пользователя:', error);
      return false;
    }
  },

  // Отписка пользователя
  async unsubscribeUser(userId) {
    try {
      const usersData = await this.loadUsers();
      const userIndex = usersData.users.findIndex(user => user.id === userId);

      if (userIndex !== -1) {
        usersData.users[userIndex].subscribe = false;
        usersData.users[userIndex].updatedAt = new Date().toISOString();
        await this.saveUsers(usersData);
      }

      return true;
    } catch (error) {
      console.error('Ошибка отписки пользователя:', error);
      return false;
    }
  },

  // Получение всех подписанных пользователей
  async getSubscribedUsers() {
    try {
      const usersData = await this.loadUsers();
      return usersData.users.filter(user => user.subscribe === true);
    } catch (error) {
      console.error('Ошибка получения подписанных пользователей:', error);
      return [];
    }
  },

  // Проверка подписки пользователя
  async isUserSubscribed(userId) {
    try {
      const usersData = await this.loadUsers();
      const user = usersData.users.find(user => user.id === userId);
      return user ? user.subscribe : false;
    } catch (error) {
      console.error('Ошибка проверки подписки:', error);
      return false;
    }
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
  start: async (ctx) => {
    const user = ctx.from;

    // Добавляем пользователя в подписки
    const subscribed = await subscriptionService.subscribeUser(
      user.id,
      user.username,
      user.first_name,
      user.last_name
    );

    const subscriptionStatus = subscribed ?
      '✅ Вы подписаны на рассылку' :
      '❌ Не удалось оформить подписку';

   const welcomeText = `🏗️ Добро пожаловать в официальный бот ГК «ВЕРТИКАЛЬ» — вашего надежного партнера в мире качественной спецтехники, запчастей и сервиса!\n\n` +
      `${subscriptionStatus}\n\n` +

      `В этом боте вы можете:\n` +
      `• 📖 Изучить каталог спецтехники и запчастей\n` +
      `• 🔍 Узнать актуальные цены и наличие на складе\n` +
      `• 🛠️ Узнать об услугах сервиса и технического обслуживания\n` +
      `• 📩 Получить персональное коммерческое предложение\n` +
      `• ✅ Следить за акциями и специальными предложениями\n\n` +

      `➡️ Чтобы начать, нажмите /catalog\n` +
      `❓ Возникли трудности? Команда /help всегда к вашим услугам.\n\n` +

      `ℹ️ Вы в любой момент можете управлять подпиской на рассылку через меню бота.`;

    ctx.reply(welcomeText, Markup.keyboard([
      ['📦 Показать каталог'],
      ['🌐 Наш сайт', '📞 Контакты'],
      ['❌ Отказаться от рассылки']
    ]).resize());
  },

  showCatalog: (ctx) => {
    catalogHandlers.showCatalog(ctx);
  },

  showWebsite: (ctx) => {
    ctx.reply('🌐 Наш официальный сайт: https://gkvertikal.ru');
  },

  showContacts: (ctx) => {
    ctx.reply('📞 Для связи:\nТелефон: +7 (XXX) XXX-XX-XX\nEmail: info@gkvertikal.ru');
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
  },
  handleUnsubscribe: async (ctx) => {
    const userId = ctx.from.id;

    const unsubscribed = await subscriptionService.unsubscribeUser(userId);

    if (unsubscribed) {
      ctx.reply('❌ Вы отписались от рассылки. Чтобы снова подписаться, используйте команду /start');
    } else {
      ctx.reply('❌ Не удалось отписаться от рассылки. Попробуйте позже.');
    }
  },
  checkSubscription: async (ctx) => {
    const isSubscribed = await subscriptionService.isUserSubscribed(ctx.from.id);

    if (isSubscribed) {
      ctx.reply('✅ Вы подписаны на рассылку. Чтобы отписаться, нажмите "Отказаться от рассылки"');
    } else {
      ctx.reply('❌ Вы не подписаны на рассылку. Используйте /start чтобы подписаться');
    }
  },

};

// Обработчики админ-панели
const adminHandlers = {
  showAdminPanel: (ctx) => {
    if (!utils.isAdmin(ctx.from.id)) {
      return ctx.reply('❌ У вас нет прав доступа к админке');
    }

    ctx.reply('🛠️ Панель администратора:', Markup.keyboard([
      ['📝 Создать пост', '📊 Статистика постов'],
      ['📤 Загрузить каталог'],
      ['📊 Подписчики']
    ]).resize());
  },
  uploadCatalog: (ctx) => {
    if (!utils.isAdmin(ctx.from.id)) {
      return ctx.reply('❌ У вас нет прав доступа');
    }

    adminStates.set(ctx.from.id, { step: 'waiting_for_catalog_file' });
    ctx.reply('📤 Отправьте JSON файл с товарами. Формат:\n\n' +
      '{\n' +
      '  "products": [\n' +
      '    {\n' +
      '      "sku": "артикул",\n' +
      '      "name": "Название товара",\n' +
      '      "price": 100000,\n' +
      '      "urlSite": "https://...",\n' +
      '      "urlSiteImage": "https://..."\n' +
      '    }\n' +
      '  ]\n' +
      '}');
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
    console.log(`[DEBUG] publishPost called for post ID: ${postId} by user ${ctx.from.id}`);

    if (!utils.isAdmin(ctx.from.id)) {
      console.log('[DEBUG] User is not admin, access denied.');
      return ctx.reply('❌ У вас нет прав доступа');
    }

    const post = postService.findPost(postId);
    if (!post) {
      console.log('[DEBUG] Post not found in database.');
      return ctx.reply('❌ Пост не найден');
    }

    if (!CONFIG.CHANNEL_ID) {
      console.log('[DEBUG] CHANNEL_ID is not set in environment variables.');
      return ctx.reply('❌ CHANNEL_ID не настроен в .env файле');
    }

    try {
      // Проверка доступа к каналу
      console.log('[DEBUG] Checking bot access to the channel...');
      try {
        const chat = await ctx.telegram.getChat(CONFIG.CHANNEL_ID);
        console.log(`[DEBUG] Success! Channel title: ${chat.title}`);
      } catch (getChatError) {
        console.error('[DEBUG] ERROR - Bot cannot access channel:', getChatError.message);
        return ctx.reply('❌ Бот не имеет доступа к каналу. Проверьте:\n1. Добавлен ли бот в канал\n2. Является ли бот администратором канала\n3. Правильный ли CHANNEL_ID в настройках');
      }

      const targetChatId = CONFIG.CHANNEL_ID;

      // Публикация в канал
      console.log(`[DEBUG] Attempting to send message to channel ID: ${targetChatId}`);
      if (post.photo) {
        console.log('[DEBUG] Sending photo post to channel...');
        await ctx.telegram.sendPhoto(targetChatId, post.photo, {
          caption: post.text,
          parse_mode: 'Markdown'
        });
      } else {
        console.log('[DEBUG] Sending text post to channel...');
        await ctx.telegram.sendMessage(targetChatId, post.text, {
          parse_mode: 'Markdown'
        });
      }
      console.log('[DEBUG] Message successfully sent to channel!');

      // Рассылка подписанным пользователям
      console.log('[DEBUG] Starting broadcast to subscribed users...');
      const subscribedUsers = await subscriptionService.getSubscribedUsers();
      console.log(`[DEBUG] Found ${subscribedUsers.length} subscribed users`);

      let successCount = 0;
      let failCount = 0;

      for (const user of subscribedUsers) {
        try {
          if (post.photo) {
            await ctx.telegram.sendPhoto(user.id, post.photo, {
              caption: post.text,
              parse_mode: 'Markdown'
            });
          } else {
            await ctx.telegram.sendMessage(user.id, post.text, {
              parse_mode: 'Markdown'
            });
          }
          successCount++;

          // Небольшая задержка чтобы не превысить лимиты Telegram
          await new Promise(resolve => setTimeout(resolve, 100));
        } catch (error) {
          console.error(`[DEBUG] Error sending to user ${user.id}:`, error.message);
          failCount++;

          // Если пользователь заблокировал бота, отписываем его
          if (error.response && error.response.error_code === 403) {
            await subscriptionService.unsubscribeUser(user.id);
            console.log(`[DEBUG] User ${user.id} blocked bot, unsubscribed`);
          }
        }
      }

      // Обновление статуса поста
      console.log('[DEBUG] Updating post status to "published"...');
      await postService.updatePost(postId, {
        status: 'published',
        publishedAt: new Date().toISOString()
      });

      console.log('[DEBUG] Post status updated successfully.');

      // Отправка отчета админу
      const reportMessage = `✅ Пост успешно опубликован!\n\n` +
        `📊 Статистика рассылки:\n` +
        `• Успешно: ${successCount}\n` +
        `• Не удалось: ${failCount}\n` +
        `• Всего подписчиков: ${subscribedUsers.length}`;

      await ctx.reply(reportMessage);

    } catch (error) {
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

  handleBroadcast: async (ctx) => {
    if (!utils.isAdmin(ctx.from.id)) return;

    const state = adminStates.get(ctx.from.id);

    if (state && state.step === 'waiting_for_broadcast') {
      const message = ctx.message.text;

      ctx.reply('⏳ Начинаю рассылку... Это может занять время');

      const subscribedUsers = await subscriptionService.getSubscribedUsers();
      let successCount = 0;
      let failCount = 0;

      for (const user of subscribedUsers) {
        try {
          await ctx.telegram.sendMessage(user.id, message, {
            parse_mode: 'Markdown'
          });
          successCount++;

          // Небольшая задержка
          await new Promise(resolve => setTimeout(resolve, 100));
        } catch (error) {
          console.error(`Error sending to user ${user.id}:`, error.message);
          failCount++;

          // Если пользователь заблокировал бота, отписываем его
          if (error.response && error.response.error_code === 403) {
            await subscriptionService.unsubscribeUser(user.id);
          }
        }
      }

      adminStates.delete(ctx.from.id);

      const reportMessage = `✅ Рассылка завершена!\n\n` +
        `📊 Статистика:\n` +
        `• Успешно: ${successCount}\n` +
        `• Не удалось: ${failCount}\n` +
        `• Всего подписчиков: ${subscribedUsers.length}`;

      ctx.reply(reportMessage);
    }
  },

  showSubscriberStats: async (ctx) => {
    if (!utils.isAdmin(ctx.from.id)) {
      return ctx.reply('❌ У вас нет прав доступа');
    }

    const usersData = await subscriptionService.loadUsers();
    const totalUsers = usersData.users.length;
    const subscribedUsers = usersData.users.filter(user => user.subscribe === true).length;
    const unsubscribedUsers = totalUsers - subscribedUsers;

    let message = `📊 Статистика подписчиков:\n\n`;
    message += `Всего пользователей: ${totalUsers}\n`;
    message += `Подписано: ${subscribedUsers}\n`;
    message += `Отписано: ${unsubscribedUsers}\n\n`;

    // Последние 5 подписанных пользователей
    const recentSubscribed = usersData.users
      .filter(user => user.subscribe)
      .sort((a, b) => new Date(b.subscribedAt || b.updatedAt) - new Date(a.subscribedAt || a.updatedAt))
      .slice(0, 5);

    if (recentSubscribed.length > 0) {
      message += `Последние подписчики:\n`;
      recentSubscribed.forEach(user => {
        const username = user.username ? `@${user.username}` : 'без username';
        const date = new Date(user.subscribedAt || user.updatedAt).toLocaleDateString('ru-RU');
        message += `• ${username} (${date})\n`;
      });
    }

    ctx.reply(message);
  },

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
            Markup.button.callback('Санкт-Петербург', 'region_petersburg'),

          ],
          [
            Markup.button.callback('Ростов', 'region_rostov'),
            Markup.button.callback('Сочи', 'region_sochi')
          ],
          [
            Markup.button.callback('Симферополь', 'region_simferopl'),
            Markup.button.callback('Екатеринбург', 'region_ekaterinburg'),
          ],
          [
            Markup.button.callback('Казань', 'region_kazan'),
            Markup.button.callback('Москва', 'region_moscow'),

          ],
          [
            Markup.button.callback('🌍 Другой регион', 'region_other')
          ],
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
<b>🎯 НОВАЯ ЗАЯВКА НА ТОВАР</b> 
${managerMentions}

<b>📍 Регион:</b> ${utils.escapeHtml(utils.getRegionName(region))}

<b>📦 Информация о товаре:</b>
• Наименование: ${utils.escapeHtml(product.name)}
• Цена: ${product.price.toLocaleString('ru-RU')} руб.
• Ссылка на сайте: ${product.urlSite}

<b>👤 Информация о клиенте:</b>
• Имя: ${utils.escapeHtml(firstName)}
• Username: ${username}

<b>🔗 Ссылки для связи:</b>
${username !== 'не указан' ? `• Написать в Telegram: https://t.me/${user.username}` : '• Telegram: недоступен'}
• Ссылка на товар: ${product.urlSite}

<b>⏰ Время заявки:</b> ${new Date().toLocaleString('ru-RU')}
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
          parse_mode: 'HTML', // ← Используйте HTML
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
  // Помощь
  bot.help((ctx) => {
    ctx.reply(
      `🤖 Команды бота:\n\n` +
      `/start - Начать работу\n` +
      `/catalog - Показать каталог товаров\n` +
      `/id - Показать ID\n` +
      `/info - Информация о каталоге\n` +
      `/links - Полезные ссылки\n\n` +
      `Или используйте кнопки меню!`
    );
  });
  bot.command('catalog', userHandlers.showCatalog);
  bot.command('admin', adminHandlers.showAdminPanel);
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
  bot.command('upload_catalog', adminHandlers.uploadCatalog);
  bot.command('subscribers', adminHandlers.showSubscriberStats);
  // Текстовые обработчики
  bot.hears('📦 Показать каталог', userHandlers.showCatalog);
  bot.hears('🌐 Наш сайт', userHandlers.showWebsite);
  bot.hears('📞 Контакты', userHandlers.showContacts);
  bot.hears('❌ Отказаться от рассылки', userHandlers.handleUnsubscribe);



  bot.hears('📝 Создать пост', adminHandlers.startPostCreation);
  bot.hears('📊 Статистика постов', adminHandlers.showPostStats);
  bot.hears('📤 Загрузить каталог', adminHandlers.uploadCatalog);
  bot.hears('📊 Подписчики', adminHandlers.showSubscriberStats);

  // Inline кнопки
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

  // Inline кнопки каталога
  bot.action(/^categories_page_(\d+)$/, (ctx) => catalogHandlers.handleCategoriesPage(ctx));
  bot.action('categories_info', (ctx) => catalogHandlers.handleCategoriesInfo(ctx));
  bot.action(/^category_(.+)_(\d+)$/, (ctx) => catalogHandlers.handleCategorySelect(ctx));
  bot.action(/^nav_(.+)_(\d+)$/, (ctx) => catalogHandlers.handleNavigation(ctx));
  bot.action('back_to_categories', (ctx) => catalogHandlers.handleBackToCategories(ctx));
  bot.action('close_catalog', (ctx) => catalogHandlers.handleCloseCatalog(ctx));
  bot.action('page_info', (ctx) => catalogHandlers.handlePageInfo(ctx));



  // Fallback
  bot.on('text', (ctx) => {
    ctx.reply('Не понимаю команду. Используйте /catalog для просмотра товаров или /help для помощи');
  });

  // Обработка ошибок
  bot.catch((err, ctx) => {
    console.error(`Error for ${ctx.updateType}`, err);
    ctx.reply('Произошла ошибка. Попробуйте позже.');
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