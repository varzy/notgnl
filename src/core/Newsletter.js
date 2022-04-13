const Day = require('../utils/day');
const {
  NEWSLETTER_CATEGORIES,
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

    // 根据 posts 的分类生成内容组
    // const newsletterGroups = await this._buildNewsletterGroups(publishingPosts);

    // 创建新的 newsletter 页面
    const newsletterPageCtx = await this._createNewNewsletterPage(
      // newsletterGroups,
      publishingPosts
    );

    // await this._insertPreface(newsletterPageCtx);

    // 插入目录
    await this._insertTableOfContents(newsletterPageCtx);

    // 插入内容
    await this._insertContent(newsletterPageCtx, publishingPosts);

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

    return unNewsletterPosts.results
      .filter((post) => {
        const realPubTime = Day(NotionClient.getProperty(post, 'RealPubTime').start);
        const filterStartTime = Day(startTime).startOf('day');
        const filterEndTime = Day(endTime).endOf('day');
        return (
          realPubTime.isSameOrBefore(filterEndTime) && realPubTime.isSameOrAfter(filterStartTime)
        );
      })
      .sort(
        (a, b) =>
          +new Date(a.properties.RealPubTime.date.start) -
          +new Date(b.properties.RealPubTime.date.start)
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

      // if (pageTitleItems[category.category]) return;
      // pageTitleItems[category.category] = {
      //   order: index,
      //   text: category.pages[0].properties.Name.title.map((title) => title.plain_text).join(''),
      // };
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
              text: { content: `#${currentNO} ${pageTitleContent}` },
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

  // async _buildNewsletterGroups(publishingPosts) {
  //   const newsletterGroups = NEWSLETTER_CATEGORIES.map((category) => ({ category, pages: [] }));
  //   newsletterGroups.push({ category: '以及这些...', pages: [] });
  //   publishingPosts.forEach((page) => {
  //     const group = newsletterGroups.find(
  //       (group) => group.category === NotionClient.getProperty(page, 'Category').name
  //     );
  //     if (group) {
  //       group.pages.push(page);
  //     } else {
  //       newsletterGroups[newsletterGroups.length - 1].pages.push(page);
  //     }
  //   });

  //   return newsletterGroups
  //     .filter((category) => category.pages.length)
  //     .map((category) => {
  //       category.pages = category.pages.sort(
  //         (a, b) =>
  //           +new Date(a.properties.RealPubTime.date.start) -
  //           +new Date(b.properties.RealPubTime.date.start)
  //       );
  //       return category;
  //     });
  // }

  // ================================================================
  // 为 Newsletter 插入各种 Blocks
  // ================================================================

  async _insertBlocks(newsletterPageId, children, label) {
    try {
      await this.$no.appendChildren(newsletterPageId, children);
      logger.info(`Insert Blocks: Success: ${label}`);
    } catch (e) {
      logger.error(`Insert Blocks: Error: ${label}: ${e}`);
    }
  }

  async _insertTableOfContents(newsletterPageCtx) {
    await this.$no.appendChildren(
      newsletterPageCtx.id,
      [NotionClient.buildBlock('table_of_contents', { color: 'gray_background' })],
      'TOC'
    );
  }

  async _insertContent(newsletterPageCtx, publishingPosts) {
    // ======== 插入大标题 ========
    const HEADER = [
      NotionClient.buildBlock('divider', {}),
      NotionClient.buildBlock(
        'heading_1',
        {
          rich_text: [{ type: 'text', text: { content: `「本周分享」` } }],
        },
        { object: 'block' }
      ),
    ];
    await this._insertBlocks(newsletterPageCtx.id, HEADER, 'CONTENT HEADER');

    // ======== 插入 Post 页面 ========
    for (const post of publishingPosts) {
      // Page Title. Block || null
      const PAGE_TITLE = this._buildBlockTitle(post);

      // Page Tags. Block || null
      const PAGE_TAGS = this._buildBlockMeta(post);

      // Page Cover. Block[] || null
      const PAGE_COVER = await this._buildBlockFirstCover(post);

      // Page Content
      const PAGE_CONTENT = await this._buildBlockContent(post);

      // 组装
      const CHILDREN = PAGE_COVER
        ? [PAGE_TITLE, PAGE_TAGS, PAGE_COVER, ...PAGE_CONTENT]
        : [PAGE_TITLE, PAGE_TAGS, ...PAGE_CONTENT];
      await this._insertBlocks(newsletterPageCtx.id, CHILDREN, 'CONTENT');
    }

    // for (const [index, category] of newsletterGroups.entries()) {
    //   // ======== 插入分类标题 ========
    //   const DIVIDER = NotionClient.buildBlock('divider', {});
    //   const CATEGORY_TITLE = NotionClient.buildBlock(
    //     'heading_1',
    //     {
    //       rich_text: [{ type: 'text', text: { content: `「${category.category}」` } }],
    //     },
    //     { object: 'block' }
    //   );
    //   const categoryContent = index === 0 ? [CATEGORY_TITLE] : [DIVIDER, CATEGORY_TITLE];

    //   await this._insertBlocks(newsletterPageCtx.id, categoryContent, 'CATEGORY TITLE');

    //   // ======== 插入分类内容 ========
    //   for (const page of category.pages) {
    //     // Page Cover. Block[] || null
    //     const PAGE_COVER = await this._buildBlockFirstCover(page);

    //     // Page Title. Block || null
    //     const PAGE_TITLE = this._buildBlockTitle(page);

    //     // Page Tags. Block || null
    //     const PAGE_TAGS = this._buildBlockMeta(page);

    //     // Page Content
    //     const PAGE_CONTENT = await this._buildBlockContent(page);

    //     // 组装
    //     const CHILDREN = PAGE_COVER
    //       ? [PAGE_TITLE, PAGE_TAGS, PAGE_COVER, ...PAGE_CONTENT]
    //       : [PAGE_TITLE, PAGE_TAGS, ...PAGE_CONTENT];
    //     await this._insertBlocks(newsletterPageCtx.id, CHILDREN, 'CONTENT');
    //   }
    // }
  }

  async _insertCopyright(newsletterPageCtx) {
    const children = [
      NotionClient.buildBlock('divider', {}),
      NotionClient.buildBlock(
        'paragraph',
        {
          rich_text: [
            { type: 'text', text: { content: `Thanks for reading.` } },
            { type: 'text', text: { content: ` 个人主页：` } },
            { type: 'text', text: { content: `varzy.me`, link: { url: `https://varzy.me` } } },
          ],
        },
        { object: 'block' }
      ),
    ];
    await this._insertBlocks(newsletterPageCtx.id, children, 'COPYRIGHT');
  }

  // ================================================================
  // 构建 Newsletter 的各种 Block
  // ================================================================

  // 很不幸，Notion 目前并不支持直接引用已上传到 Notion 中的图片，因此只能把封面图先下载，再上传，托管于图床
  async _buildBlockFirstCover(page) {
    const firstCover = NotionClient.getProperty(page, 'Cover')[0];

    if (!firstCover) return null;

    const imageHosting = new ImageHosting();
    await imageHosting.init();
    const hostingUrl = await imageHosting.uploadExternal(firstCover.file.url);

    return NotionClient.buildBlock(
      'image',
      {
        type: 'external',
        external: { url: hostingUrl },
      },
      { object: 'block' }
    );
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

    return NotionClient.buildBlock(
      'heading_2',
      { rich_text: pageTitleRichText, color: page.properties.TitleLink.url ? 'blue' : 'default' },
      { object: 'block' }
    );
  }

  // @TODO: 添加发布时间
  _buildBlockMeta(page) {
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

  // @TODO: 移除空白行; 根据不同类型生成不同格式
  async _buildBlockContent(page) {
    const pageBlocks = await this.$no.getFullBlocksList(page.id);
    return (
      pageBlocks.results
        // 过滤空白区块
        .filter((block) => !(block.type === 'paragraph' && !block.paragraph.rich_text.length))
        .map((block) => ({
          object: 'block',
          type: block.type,
          [block.type]: block[block.type],
        }))
    );
  }
}

module.exports = { Newsletter };
