const Day = require('../utils/day');
const {
  NEWSLETTER_CATEGORIES,
  CHANNEL_DATABASE_ID,
  NEWSLETTER_DATABASE_ID,
} = require('../config/constants');
const { NotionClient } = require('./NotionClient');
const { ImageHosting } = require('./ImageHosting');

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
    const newsletterGroups = await this._buildNewsletterGroups(publishingPosts);

    // 创建新的 newsletter 页面
    const newsletterPageCtx = await this._createNewNewsletterPage(newsletterGroups);

    // 插入目录
    await this._insertTableOfContents(newsletterPageCtx);

    // 插入内容
    await this._insertContent(newsletterPageCtx, newsletterGroups);

    // 插入 copyright
    await this._insertCopyright(newsletterPageCtx);

    return { code: 0, message: 'GENERATED' };
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

    return unNewsletterPosts.results.filter((post) => {
      const realPubTime = Day(NotionClient.getProperty(post, 'RealPubTime').start);
      const filterStartTime = Day(startTime).startOf('day');
      const filterEndTime = Day(endTime).endOf('day');
      return (
        realPubTime.isSameOrBefore(filterEndTime) && realPubTime.isSameOrAfter(filterStartTime)
      );
    });
  }

  /**
   *  创建新一期的 newsletter 页面，并且自动生成期号和标题
   */
  async _createNewNewsletterPage(newsletterGroups) {
    const publishedPages = await this.$no.queryDatabase({
      // ============ 生成期号 ============
      database_id: NEWSLETTER_DATABASE_ID,
      filter: {
        property: 'IsPublished',
        checkbox: { equals: true },
      },
      sort: [{ property: 'created_time', direction: 'descending' }],
    });
    const latestPage = publishedPages.results[0];
    const latestNO = latestPage ? NotionClient.getProperty(latestPage, 'NO') : 0;
    // 考虑到可能存在 .5 期的情况，因此向下取整
    const currentNO = Math.floor(latestNO) + 1;

    // ============ 生成标题 ============
    // 取每个分类下的第一个 Post 的标题组合成新标题
    const pageTitleItems = [];
    newsletterGroups.forEach((category, index) => {
      if (pageTitleItems[category.category]) return;
      pageTitleItems[category.category] = {
        order: index,
        text: category.pages[0].properties.Name.title.map((title) => title.plain_text).join(''),
      };
    });
    const pageTitleContent = Object.values(pageTitleItems)
      .sort((a, b) => a.order - b.order)
      .map((item) => item.text)
      .join('、');

    // ============ 生成 Emoji ============
    // 尝试取第一个 Post 的 Emoji
    const pageEmoji = newsletterGroups[0].pages[0].icon?.emoji || '💌';

    return await this.$no.createPage({
      parent: { database_id: NEWSLETTER_DATABASE_ID },
      icon: { type: 'emoji', emoji: pageEmoji },
      properties: {
        Name: {
          title: [
            {
              text: { content: `#${currentNO} ${pageTitleContent}` },
            },
          ],
        },
        NO: { number: latestNO + 1 },
        GeneratedAt: {
          date: { start: Day().toISOString(), time_zone: Day.tz.guess() },
        },
      },
    });
  }

  async _buildNewsletterGroups(publishingPosts) {
    const newsletterGroups = NEWSLETTER_CATEGORIES.map((category) => ({ category, pages: [] }));
    newsletterGroups.push({ category: '以及这些...', pages: [] });
    publishingPosts.forEach((page) => {
      const group = newsletterGroups.find(
        (group) => group.category === NotionClient.getProperty(page, 'Category').name
      );
      if (group) {
        group.pages.push(page);
      } else {
        newsletterGroups[newsletterGroups.length - 1].pages.push(page);
      }
    });

    return newsletterGroups.filter((category) => category.pages.length);
  }

  async _insertBlocks(newsletterPageId, children, label) {
    try {
      await this.$no.appendChildren(newsletterPageId, children);
    } catch (e) {
      console.log(`INSERT ERROR: ${label}: ${e}`);
    }
  }

  async _insertTableOfContents(newsletterPageCtx) {
    await this.$no.appendChildren(
      newsletterPageCtx.id,
      [NotionClient.buildBlock('table_of_contents', { color: 'gray_background' })],
      'TOC'
    );
  }

  async _insertContent(newsletterPageCtx, newsletterGroups) {
    for (const category of newsletterGroups) {
      // ======== 插入分类标题 ========
      const CATEGORY_TITLE = NotionClient.buildBlock(
        'heading_2',
        {
          rich_text: [{ type: 'text', text: { content: `「${category.category}」` } }],
          // color: 'purple',
        },
        { object: 'block' }
      );
      await this._insertBlocks(newsletterPageCtx.id, [CATEGORY_TITLE], 'CATEGORY TITLE');

      // ======== 插入分类内容 ========
      for (const page of category.pages) {
        // Page Cover. Block[] || null
        const PAGE_COVER = await this._buildBlockFirstCover(page);

        // Page Title. Block || null
        const PAGE_TITLE = this._buildBlockTitle(page);

        // Page Tags. Block || null
        const PAGE_TAGS = this._buildBlockTags(page);

        // Page Content
        const PAGE_CONTENT = await this._buildBlockContent(page);

        // 组装
        const CHILDREN = PAGE_COVER
          ? [PAGE_TITLE, PAGE_TAGS, PAGE_COVER, ...PAGE_CONTENT]
          : [PAGE_TITLE, PAGE_TAGS, ...PAGE_CONTENT];
        await this._insertBlocks(newsletterPageCtx.id, CHILDREN, 'CONTENT');
      }
    }
  }

  async _insertCopyright(newsletterPageCtx) {
    const children = [
      NotionClient.buildBlock('divider', {}),
      NotionClient.buildBlock(
        'paragraph',
        { rich_text: [{ type: 'text', text: { content: `Thanks for reading.` } }] },
        { object: 'block' }
      ),
      NotionClient.buildBlock(
        'paragraph',
        {
          rich_text: [
            { type: 'text', text: { content: `个人主页：` } },
            { type: 'text', text: { content: `varzy.me`, link: { url: `https://varzy.me` } } },
            { type: 'text', text: { content: ` | ` } },
            { type: 'text', text: { content: `创作者中心：` } },
            {
              type: 'text',
              text: { content: `varzy.notion.site`, link: { url: `https://varzy.notion.site` } },
            },
          ],
        },
        { object: 'block' }
      ),
    ];
    await this._insertBlocks(newsletterPageCtx.id, children, 'COPYRIGHT');
  }

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
      'heading_3',
      { rich_text: pageTitleRichText, color: 'purple' },
      { object: 'block' }
    );
  }

  _buildBlockTags(page) {
    const tags = NotionClient.getProperty(page, 'Tags');

    if (!tags.length) return null;

    const tagsContent = tags.map((tag) => `#${tag.name}`).join(' ');
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

  async _buildBlockContent(page) {
    const pageBlocks = await this.$no.getFullBlocksList(page.id);
    return pageBlocks.results.map((block) => ({
      object: 'block',
      type: block.type,
      [block.type]: block[block.type],
    }));
  }
}

module.exports = { Newsletter };
