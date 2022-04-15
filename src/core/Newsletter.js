const Day = require('../utils/day');
const {
  // NEWSLETTER_CATEGORIES,
  CHANNEL_DATABASE_ID,
  NEWSLETTER_DATABASE_ID,
} = require('../config/constants');
const { NotionClient } = require('./NotionClient');
const { ImageHosting } = require('./ImageHosting');
const { logger } = require('../utils/logger');

class Newsletter {
  constructor() {
    this.$no = new NotionClient();
  }

  /**
   * 根据日期生成一期新的 Newsletter
   */
  async generateNewsletter(startTime, endTime) {
    // 获取准备发布的 posts
    const publishingPosts = await this._getPublishingPosts(startTime, endTime);
    if (!publishingPosts) return { code: 1, message: 'Nothing to build Newsletter.' };

    // 创建新的 newsletter 页面
    const newsletterPageCtx = await this._createNewNewsletterPage(
      // newsletterGroups,
      publishingPosts
    );

    // 插入目录
    await this._insertTableOfContents(newsletterPageCtx);
    // 插入序言
    await this._insertPreface(newsletterPageCtx, startTime, endTime);
    // 插入本周分享
    await this._insertSharedContents(newsletterPageCtx, publishingPosts);
    // 插入 One More Thing
    await this._insertOneMoreThing(newsletterPageCtx);
    // 插入友情链接
    await this._insertFriendlyLinks(newsletterPageCtx);
    // 插入 copyright
    await this._insertCopyright(newsletterPageCtx);

    return { code: 0, message: 'GENERATED' };
  }

  /**
   * 发布 Newsletter
   */
  async publishNewsletter(newsletterId, dryRun) {
    // 获取要发布的 id。如果目标 newsletterId 不存在，则自动取列表中未发布的最后一个
    let targetNewsletterId = newsletterId;
    if (!targetNewsletterId) {
      const unpublishedNewsletters = await this.$no.queryDatabase({
        database_id: NEWSLETTER_DATABASE_ID,
        filter: {
          property: 'IsPublished',
          checkbox: { equals: false },
        },
      });
      const sortedNewsletters = unpublishedNewsletters.results.sort(
        (a, b) =>
          +new Date(b.properties.CreatedAt.date.start) -
          +new Date(a.properties.CreatedAt.date.start)
      );
      if (!sortedNewsletters.length) return { code: 1, message: 'Nothing to publish.' };

      targetNewsletterId = sortedNewsletters[0].id;
    }

    logger.info(`Ready to Publish NewsletterId: ${targetNewsletterId}`);

    // 获取页面信息
    const pageCtx = await this.$no.getPageCtx(targetNewsletterId);

    // 更新此 newsletter 关联的 channel post 状态
    for (const post of NotionClient.getProperty(pageCtx, 'RelatedToChannelPosts')) {
      await this.$no.updateProperty(post.id, {
        Status: { select: { name: dryRun ? 'UnNewsletter' : 'Published' } },
      });
      logger.info(`RelatedToChannelPost Status Updated: ${post.id}`);
    }
    logger.info(`RelatedToChannelPosts Statuses All Updated`);

    // 更新此 newsletter 的自身发布状态
    await this.$no.updateProperty(pageCtx.id, { IsPublished: { checkbox: !dryRun } });
    logger.info(`Newsletter IsPublished checkbox has been Checked`);

    return { code: 0, message: 'PUBLISHED' };
  }

  /**
   * Notion Api 关于时间的 filter 规则实在太难用，因此获取前 100 条后在本地进行时间匹配
   */
  async _getPublishingPosts(startTime, endTime) {
    const unNewsletterPosts = await this.$no.queryDatabase({
      database_id: CHANNEL_DATABASE_ID,
      page_size: 100,
      filter: {
        property: 'Status',
        select: { equals: 'UnNewsletter' },
      },
    });

    return (
      unNewsletterPosts.results
        // 根据时间进行过滤
        .filter((post) => {
          const realPubTime = Day(NotionClient.getProperty(post, 'RealPubTime').start);
          const filterStartTime = Day(startTime).startOf('day');
          const filterEndTime = Day(endTime).endOf('day');
          return (
            realPubTime.isSameOrBefore(filterEndTime) && realPubTime.isSameOrAfter(filterStartTime)
          );
        })
        // 根据真实发布时间进行排序
        .sort(
          (a, b) =>
            +new Date(a.properties.RealPubTime.date.start) -
            +new Date(b.properties.RealPubTime.date.start)
        )
        // 根据生成排序属性进行重排序
        .sort((a, b) => b.properties.NLGenPriority.number - a.properties.NLGenPriority.number)
    );
  }

  /**
   *  创建新一期的 newsletter 页面，并且自动生成期号和标题
   */
  async _createNewNewsletterPage(publishingPosts) {
    const publishedPages = await this.$no.queryDatabase({
      // ============ 生成期号 ============
      database_id: NEWSLETTER_DATABASE_ID,
      filter: { property: 'IsPublished', checkbox: { equals: true } },
      sort: [{ property: 'created_time', direction: 'descending' }],
    });
    const latestPage = publishedPages.results[0];
    const latestNO = latestPage ? NotionClient.getProperty(latestPage, 'NO') : 0;
    // 考虑到可能存在 .5 期的情况，因此向下取整
    const currentNO = Math.floor(latestNO) + 1;

    logger.info(`New Newsletter Create Params: NO: ${currentNO}`);

    // ============ 生成标题 ============
    let emojiFromFirstPost;
    // 取每个分类下的第一个 Post 的标题组合成新标题
    const pageTitleItems = publishingPosts.map((post) => {
      // 记录第一个 emoji
      if (!emojiFromFirstPost && post.icon?.emoji) {
        emojiFromFirstPost = post.icon.emoji;
      }
      return post.properties.Name.title.map((title) => title.plain_text).join('');
    });
    const pageTitleContent = pageTitleItems.join('、').replaceAll('《', '').replaceAll('》', '');

    logger.info(`New Newsletter Create Params: TitleContent: ${pageTitleContent}`);

    return await this.$no.createPage({
      parent: { database_id: NEWSLETTER_DATABASE_ID },
      icon: { type: 'emoji', emoji: emojiFromFirstPost },
      properties: {
        Name: {
          title: [
            {
              text: { content: `#${currentNO}｜${pageTitleContent}` },
            },
          ],
        },
        NO: { number: latestNO + 1 },
        RelatedToChannelPosts: {
          relation: publishingPosts.map((post) => ({ id: post.id })),
        },
        CreatedAt: {
          date: { start: Day().toISOString(), time_zone: Day.tz.guess() },
        },
      },
    });
  }

  // ================================================================
  // 在页面中插入不同的 Blocks
  // ================================================================

  async _insertBlocks(newsletterPageId, children, label) {
    try {
      await this.$no.appendChildren(newsletterPageId, children);
      logger.info(`Insert Blocks: Success: ${label}`);
    } catch (e) {
      logger.error(`Insert Blocks: Error: ${label}: ${e}`);
    }
  }

  /**
   * 插入序言
   */
  async _insertPreface(newsletterPageCtx, startTime, endTime) {
    await this._insertBlocks(
      newsletterPageCtx.id,
      [
        // 第一段
        NotionClient.buildBlock('paragraph', {
          rich_text: [NotionClient.buildBlock('text', { content: '见信好👋！' })],
        }),
        // 第二段
        NotionClient.buildBlock('paragraph', {
          rich_text: [
            NotionClient.buildBlock('text', { content: '「不正集」是一档由 ' }),
            NotionClient.buildBlock('text', { content: 'ZY', link: { url: 'https://varzy.me' } }),
            NotionClient.buildBlock('text', {
              content:
                ' 维护的个人 Newsletter，聚焦且不止步于有趣的互联网内容，每周五快六常规更新，内容与 Telegram 频道 ',
            }),
            NotionClient.buildBlock('text', {
              content: '贼歪说',
              link: { url: 'https://t.me/aboutzy' },
            }),
            NotionClient.buildBlock('text', {
              content: ' 基本同步。除此之外我还会不定期更新一些 Bonus 内容。',
            }),
          ],
        }),
        // 第三段
        NotionClient.buildBlock('paragraph', {
          rich_text: [
            NotionClient.buildBlock('text', {
              content: `本期是「常规更新」，收录了贼歪说从 ${startTime} 至 ${endTime} 的更新内容。`,
            }),
          ],
        }),
      ],
      'PREFACE'
    );
  }

  /**
   * 为页面插入目录
   */
  async _insertTableOfContents(newsletterPageCtx) {
    await this._insertBlocks(
      newsletterPageCtx.id,
      [
        NotionClient.buildBlock('table_of_contents', { color: 'gray_background' }),
        NotionClient.buildBlock('paragraph', { rich_text: [] }),
      ],
      'TOC'
    );
  }

  /**
   * 为页面插入内容
   */
  async _insertSharedContents(newsletterPageCtx, publishingPosts) {
    // ======== 插入大标题 ========
    await this._insertBlocks(
      newsletterPageCtx.id,
      this._buildBlocksSectionHeader('本周分享'),
      'CONTENT SECTION HEADER'
    );

    // ======== 插入 Post 页面 ========
    for (const post of publishingPosts) {
      // Page Title. Block || null
      const PAGE_TITLE = this._buildBlockTitle(post);
      // Page Tags. Block || null
      const PAGE_TAGS = this._buildBlockTags(post);
      // Page Cover. Block || null
      const PAGE_COVER = await this._buildBlockFirstCover(post);
      // Page Content. Block[] || null
      const PAGE_CONTENT = await this._buildBlocksContent(post);

      // 组装
      let CHILDREN = [];
      if (PAGE_TITLE) CHILDREN = [...CHILDREN, PAGE_TITLE];
      if (PAGE_TAGS) CHILDREN = [...CHILDREN, PAGE_TAGS];
      if (PAGE_COVER) CHILDREN = [...CHILDREN, PAGE_COVER];
      if (PAGE_CONTENT) CHILDREN = [...CHILDREN, ...PAGE_CONTENT];

      await this._insertBlocks(newsletterPageCtx.id, CHILDREN, 'CONTENT');
    }
  }

  async _insertOneMoreThing(newsletterPageCtx) {
    await this._insertBlocks(
      newsletterPageCtx.id,
      this._buildBlocksSectionHeader('One More Thing'),
      'ONE MORE THING SECTION HEADER'
    );
  }

  async _insertFriendlyLinks(newsletterPageCtx) {
    await this._insertBlocks(
      newsletterPageCtx.id,
      [
        ...this._buildBlocksSectionHeader('友情链接'),
        NotionClient.buildBlock('paragraph', {
          rich_text: [
            NotionClient.buildBlock('text', { content: '广告位免费出租中... 欢迎互换友链🔗。' }),
          ],
        }),
      ],
      'FRIENDLY LINKS SECTION HEADER'
    );
  }

  async _insertCopyright(newsletterPageCtx) {
    const children = [
      // 分割线
      NotionClient.buildBlock('divider', {}),
      // 第一段
      NotionClient.buildBlock('paragraph', {
        rich_text: [
          NotionClient.buildBlock('text', {
            content: '以上就是本期「不正集」的全部内容，喜欢的话可以转发或推荐给您的朋友。',
          }),
        ],
      }),
      // 第二段
      NotionClient.buildBlock('paragraph', {
        rich_text: [
          NotionClient.buildBlock('text', { content: '订阅地址：' }),
          NotionClient.buildBlock('text', {
            content: 'varzy.zhubai.love',
            link: { url: 'https://varzy.zhubai.love' },
          }),
          NotionClient.buildBlock('text', { content: '｜个人主页：' }),
          NotionClient.buildBlock('text', {
            content: 'varzy.me',
            link: { url: 'https://varzy.me' },
          }),
        ],
      }),
      // 第三段
      NotionClient.buildBlock('paragraph', {
        rich_text: [NotionClient.buildBlock('text', { content: 'Thanks for Reading💗' })],
      }),
    ];
    await this._insertBlocks(newsletterPageCtx.id, children, 'COPYRIGHT');
  }

  // ================================================================
  // 构建 Newsletter 的各种 Block
  // ================================================================

  _buildBlocksSectionHeader(title) {
    return [
      NotionClient.buildBlock('divider', {}),
      NotionClient.buildBlock('heading_1', {
        rich_text: [{ type: 'text', text: { content: `「${title}」` } }],
      }),
    ];
  }

  // 很不幸，Notion 目前并不支持直接引用已上传到 Notion 中的图片，因此只能把封面图先下载，再上传，托管于图床
  async _buildBlockFirstCover(page) {
    const firstCover = NotionClient.getProperty(page, 'Cover')[0];

    if (!firstCover) return null;

    const imageHosting = new ImageHosting();
    await imageHosting.init();
    const hostingUrl = await imageHosting.uploadExternal(firstCover.file.url);

    return NotionClient.buildBlock('image', {
      type: 'external',
      external: { url: hostingUrl },
    });
  }

  _buildBlockTitle(page) {
    const pageTitleRichText = [];
    if (page.icon)
      pageTitleRichText.push({ type: 'text', text: { content: page.icon?.emoji + ' ' } });

    const _title = NotionClient.buildBlock('text', {
      content: page.properties.Name.title.map((title) => title.plain_text).join(''),
    });
    if (page.properties.TitleLink.url) _title.text.link = { url: page.properties.TitleLink.url };
    pageTitleRichText.push(_title);

    return NotionClient.buildBlock('heading_2', { rich_text: pageTitleRichText });
  }

  _buildBlockTags(page) {
    const category = NotionClient.getProperty(page, 'Category').name;
    const tags = NotionClient.getProperty(page, 'Tags').map((tag) => tag.name);
    const tagsContent = [category, ...tags].map((tag) => `#${tag}`).join(' ');

    return NotionClient.buildBlock('paragraph', {
      rich_text: [
        {
          type: 'text',
          text: { content: tagsContent },
          annotations: { italic: true },
        },
      ],
      color: 'gray',
    });
  }

  // @TODO: 根据不同类型生成不同格式
  async _buildBlocksContent(page) {
    const pageBlocks = await this.$no.getFullBlocksList(page.id);
    return (
      pageBlocks.results
        // 过滤空白区块
        .filter((block) => !(block.type === 'paragraph' && !block.paragraph.rich_text.length))
        .map((block) => ({
          type: block.type,
          [block.type]: block[block.type],
        }))
    );
  }
}

module.exports = { Newsletter };
