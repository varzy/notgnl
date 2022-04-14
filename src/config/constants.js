module.exports = {
  // Newsletter 支持的分类，以及其排序
  // NEWSLETTER_CATEGORIES: [
  //   '博客更新',
  //   '矩阵生活指北',
  //   '豆瓣酱炒文娱',
  //   '每日一歌',
  //   '镇站之宝',
  //   '油管精选',
  //   '浴室沉思',
  //   '奇迹与日常',
  //   '码农诱捕器',
  //   '游戏人生',
  // ],
  NEWSLETTER_DATABASE_ID: process.env.NOTION_NEWSLETTER_DATABASE_ID,
  CHANNEL_DATABASE_ID: process.env.NOTION_CHANNEL_DATABASE_ID,
  NOTION_AUTH_KEY: process.env.NOTION_AUTH_KEY,

  NEWSLETTER_GENERATING_PREFACE: [
    ['见信好👋！'],
    [
      '「不正集」是一档由 ',
      { text: 'ZY', link: 'https://varzy.me' },
      ' 维护的个人 Newsletter，聚焦且不止步于有趣的互联网内容，每周五快六常规更新，内容与 Telegram 频道 ',
      { text: '贼歪说', link: 'https://t.me/aboutzy' },
      ' 基本同步。除此之外我还会不定期更新一些 Bonus 内容。',
    ],
  ],
};
