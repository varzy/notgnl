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

    // 创建新的 newsletter 页面
    const newsletterPageCtx = await this._createNewNewsletterPage();

    // 根据 posts 的分类生成内容组
    const newsletterGroups = await this._buildNewsletterGroups(publishingPosts);

    // 插入内容
    await this._insertContent(newsletterPageCtx, newsletterGroups);

    // 插入 copyright
    await this._insertCopyright(newsletterPageCtx);

    return { code: 0, message: 'GENERATED' };
  }

  /**
   * Notion Api 的 filter 规则实在太难用，因此获取前 100 条后在本地进行时间匹配
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
      return realPubTime.isSameOrBefore(Day(endTime)) && realPubTime.isSameOrAfter(Day(startTime));
    });
  }

  async _createNewNewsletterPage() {
    const latestPage = await this.$no.latestPage(NEWSLETTER_DATABASE_ID);
    const latestNO = latestPage ? latestPage.properties['NO'].number : 0;
    // 考虑到可能存在 .5 期的情况，因此向下取整
    const currentNO = Math.floor(latestNO) + 1;

    return await this.$no.createPage({
      parent: { database_id: NEWSLETTER_DATABASE_ID },
      properties: {
        Name: {
          title: [
            {
              text: {
                content: `#${currentNO} AUTO GENERATED AT ${Day().format('YYYY-MM-DD HH:mm:ss')}`,
              },
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

  async _insertContent(newsletterPageCtx, newsletterGroups) {
    for (const category of newsletterGroups) {
      // ======== 插入分类标题 ========
      const CATEGORY_TITLE = NotionClient.buildBlock(
        'heading_2',
        {
          rich_text: [{ type: 'text', text: { content: category.category } }],
          color: 'purple_background',
        },
        { object: 'block' }
      );
      await this._insertBlocks(newsletterPageCtx.id, [CATEGORY_TITLE], 'CATEGORY TITLE');

      // ======== 插入分类内容 ========
      for (const page of category.pages) {
        // Page Cover
        let PAGE_COVER;

        // 很不幸，Notion 目前并不支持直接引用已上传到 Notion 中的图片，因此只能先下载，再上传
        const firstCover = NotionClient.getProperty(page, 'Cover')[0];
        if (firstCover) {
          const imageHosting = new ImageHosting();
          await imageHosting.init();
          const hostingUrl = await imageHosting.uploadExternal(firstCover.file.url);
          console.log(hostingUrl);
          PAGE_COVER = NotionClient.buildBlock(
            'image',
            {
              type: 'external',
              external: { url: hostingUrl },
            },
            { object: 'block' }
          );
        }

        // Page Header 2
        const pageTitleRichText = [];
        if (page.icon) {
          pageTitleRichText.push({ type: 'text', text: { content: page.icon?.emoji + ' ' } });
        }
        const _title = NotionClient.buildBlock('text', {
          content: page.properties.Name.title.map((title) => title.plain_text).join(''),
        });
        if (page.properties.TitleLink.url) {
          _title.text.link = { url: page.properties.TitleLink.url };
        }
        pageTitleRichText.push(_title);
        const PAGE_TITLE = NotionClient.buildBlock(
          'heading_3',
          { rich_text: pageTitleRichText },
          { object: 'block' }
        );

        // Page Content
        const pageBlocks = await this.$no.getFullBlocksList(page.id);
        const PAGE_CONTENT = pageBlocks.results.map((block) => ({
          object: 'block',
          type: block.type,
          [block.type]: block[block.type],
        }));

        // 组装
        const CHILDREN = PAGE_COVER
          ? [PAGE_TITLE, PAGE_COVER, ...PAGE_CONTENT]
          : [PAGE_TITLE, ...PAGE_CONTENT];
        await this._insertBlocks(newsletterPageCtx.id, CHILDREN, 'CONTENT');
      }
    }
  }

  async _insertCopyright(newsletterPageCtx) {
    const children = [
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
            { type: 'text', text: { content: `贼歪说：` } },
            {
              type: 'text',
              text: { content: `@AboutZY`, link: { url: `https://t.me/aboutzy` } },
            },
          ],
        },
        { object: 'block' }
      ),
    ];
    await this._insertBlocks(newsletterPageCtx.id, children, 'COPYRIGHT');
  }
}

module.exports = { Newsletter };
