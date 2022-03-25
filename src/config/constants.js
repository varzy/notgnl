module.exports = {
  // Newsletter 支持的分类，以及其排序
  NEWSLETTER_CATEGORIES: [
    '博客更新',
    '矩阵生活指北',
    '豆瓣酱炒文娱',
    '每日一歌',
    '镇站之宝',
    '油管精选',
    '浴室沉思',
    '奇迹与日常',
    '码农诱捕器',
    '游戏人生',
  ],

  NEWSLETTER_DATABASE_ID: process.env.NOTION_NEWSLETTER_DATABASE_ID,
  CHANNEL_DATABASE_ID: process.env.NOTION_CHANNEL_DATABASE_ID,
  NOTION_AUTH_KEY: process.env.NOTION_AUTH_KEY,
};
