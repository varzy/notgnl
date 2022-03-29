const Day = require('../utils/day');
const {
  NEWSLETTER_CATEGORIES,
  CHANNEL_DATABASE_ID,
  NEWSLETTER_DATABASE_ID,
} = require('../config/constants');
const { NotionClient } = require('./NotionClient');
const { Echoer } = require('./Echoer');
// const path = require('path');
// const fs = require('fs');
const { ImageHosting } = require('./ImageHosting');

class Newsletter {
  constructor(env) {
    this.$echo = new Echoer(env);
    this.$no = new NotionClient();
  }

  /**
   * @param startTime
   * @param endTime
   * @returns {Promise<void>}
   */
  async generateNewsletter(startTime, endTime) {
    // ============================================
    // 获取全部未生成 Newsletter 的前 100 条 Post
    // @REMARK: Notion Api 的 filter 规则实在太难用，因此在本地进行时间匹配
    // ============================================
    const unNewsletterPosts = await this.$no.queryDatabase({
      database_id: CHANNEL_DATABASE_ID,
      page_size: 100,
      filter: {
        property: 'Status',
        select: { equals: 'UnNewsletter' },
      },
    });

    // ============================================
    // 根据 RealPubTime 字段进行过滤
    // ============================================
    const publishingPosts = unNewsletterPosts.results.filter((post) => {
      const realPubTime = Day(NotionClient.getProperty(post, 'RealPubTime').start);
      return realPubTime.isSameOrBefore(Day(endTime)) && realPubTime.isSameOrAfter(Day(startTime));
    });

    // 如果没有需要生成的 posts
    if (!publishingPosts) {
      return 'Nothing to build Newsletter.';
    }

    return this._compose(publishingPosts);
  }

  async _compose(subPages) {
    // ============================================================
    // 创建新的 Newsletter 页面
    // ============================================================
    const latestPage = await this.$no.latestPage(NEWSLETTER_DATABASE_ID);
    const latestNO = latestPage ? latestPage.properties['NO'].number : 0;
    const currentNO = latestNO + 1;

    const newsletterPageCtx = await this.$no.createPage({
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

    // ============================================================
    // 计算标签组
    // ============================================================
    const newsletterGroups = NEWSLETTER_CATEGORIES.map((category) => ({ category, pages: [] }));
    newsletterGroups.push({ category: '以及这些...', pages: [] });
    subPages.forEach((page) => {
      const group = newsletterGroups.find(
        (group) => group.category === NotionClient.getProperty(page, 'Category').name
      );
      if (group) {
        group.pages.push(page);
      } else {
        newsletterGroups[newsletterGroups.length - 1].pages.push(page);
      }
    });
    const newsletterGroupsWithPosts = newsletterGroups.filter((category) => category.pages.length);

    console.log(newsletterGroupsWithPosts);

    // ============================================================
    // 插入子节点
    // ============================================================
    for (const category of newsletterGroupsWithPosts) {
      // ======== 插入分类标题 ========
      const CATEGORY_TITLE = NotionClient.buildBlock(
        'heading_2',
        {
          rich_text: [{ type: 'text', text: { content: category.category } }],
          color: 'purple_background',
        },
        { object: 'block' }
      );
      // 插入标签标题
      try {
        await this.$no.appendChildren({
          block_id: newsletterPageCtx.id,
          children: [CATEGORY_TITLE],
        });
      } catch (e) {
        console.log(`INSERT CATEGORY ERROR: ${e}`);
      }

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

          PAGE_COVER = NotionClient.buildBlock(
            'image',
            {
              type: 'external',
              external: { url: hostingUrl },
            },
            { object: 'block' }
          );
        }

        // const backupDirs = fs.readdirSync(
        //   process.env.CHANNEL_BACKUP_DIR || path.resolve(__dirname, '../../backup')
        // );
        // const targetBackupDir = backupDirs.find((dirName) => {
        //   const dirId = dirName.split('_')[dirName.split('_').length - 1];
        //   return dirId === page.id;
        // });
        // const firstCover = fs
        //   .readdirSync(targetBackupDir)
        //   .find((fileName) => fileName.startsWith('cover_0'));
        //
        // // 如果找到车备份内容，则上传到图床
        // if (firstCover) {
        //   const imageHosting = new ImageHosting();
        //   await imageHosting.init();
        //   const { url } = await imageHosting.upload(firstCover);
        //   console.log(url);
        //
        //   PAGE_COVER = NotionClient.buildBlock(
        //     'image',
        //     {
        //       type: 'external',
        //       external: { url },
        //     },
        //     { object: 'block' }
        //   );
        // }

        // if (targetBackupDir) {
        //   PAGE_COVER =
        // }
        // }

        // const firstCover = NotionClient.getProperty(page, 'Cover')[0];
        // if (firstCover) {
        //   PAGE_COVER = NotionClient.buildBlock(
        //     'image',
        //     {
        //       type: 'external',
        //       external: { url: firstCover.file.url },
        //     },
        //     { object: 'block' }
        //   );
        // }

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

        try {
          await this.$no.appendChildren({
            block_id: newsletterPageCtx.id,
            children: CHILDREN,
          });
        } catch (e) {
          console.log(`INSERT CONTENT ERROR: ${e}`);
        }
      }
    }

    // ============================================================
    // Copyright
    // ============================================================
    // 插入标签标题
    try {
      await this.$no.appendChildren({
        block_id: newsletterPageCtx.id,
        children: [
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
        ],
      });
    } catch (e) {
      console.log(`INSERT COPYRIGHT ERROR: ${e}`);
    }
  }
}

module.exports = { Newsletter };
