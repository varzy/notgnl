const Dayjs = require('../utils/day');
const { NEWSLETTER_CATEGORIES } = require('../config/constants');
const { NotionClient } = require('./NotionClient');

class Newsletter {
  constructor() {
    this.$no = new NotionClient();
  }

  async generateNewsletter({ startTime, endTime, title }) {
    // 不指定则默认为当前时间的前一周
    let startFilterTime = startTime
      ? Dayjs(startTime).toISOString()
      : Dayjs().subtract(7, 'day').toISOString();
    // 如果不指定则默认为当前时间
    let endFilterTime = endTime ? Dayjs(endTime).toISOString() : Dayjs().toISOString();

    const res = await this.$no.switchDatabase('channel').queryDatabase({
      page_size: 100,
      filter: {
        and: [
          {
            property: 'Status',
            select: { equals: 'UnNewsletter' },
          },
          {
            property: 'RealPubTime',
            date: {
              on_or_after: startFilterTime,
              on_or_before: endFilterTime,
            },
          },
        ],
      },
    });

    if (!res.results) {
      return 'Nothing to build Newsletter.';
    }

    return await this.composePagesToNewsletter(title, res.results);
  }

  async composePagesToNewsletter(pageTitle, subPages) {
    const latestPage = await this.$no.switchDatabase('newsletter').latestPage();
    const latestNO = latestPage ? latestPage.properties['NO'].number : 1;
    const currentNO = latestNO + 1;

    const newsletterPage = {
      properties: {
        Name: {
          title: [
            {
              text: { content: `#${currentNO} ${pageTitle}` },
            },
          ],
        },
        NO: {
          number: latestNO + 1,
        },
        GeneratedAt: {
          date: {
            start: Dayjs().toISOString(),
            end: null,
            time_zone: Dayjs.tz.guess(),
          },
        },
      },
      // children: await this._buildNewsletterBlocks(subPages),
    };

    // ============================================================
    // 创建页面
    // ============================================================
    const newsletterPageCtx = await this.$no
      .switchDatabase('newsletter')
      .createPage(newsletterPage);

    // ============================================================
    // 计算标签组
    // ============================================================
    const newsletterGroups = NEWSLETTER_CATEGORIES.map((category) => ({ category, pages: [] }));
    newsletterGroups.push({ category: '以及这些...', pages: [] });
    subPages.forEach((page) => {
      const group = newsletterGroups.find(
        (group) => group.category === page.properties.Category.select.name
      );
      if (group) {
        group.pages.push(page);
      } else {
        newsletterGroups[newsletterGroups.length - 1].pages.push(page);
      }
    });

    console.log(newsletterGroups);

    // ============================================================
    // 插入子节点
    // ============================================================
    for (const category of newsletterGroups.filter((category) => category.pages.length)) {
      // ===============
      // 插入分类标题
      // ===============
      const CATEGORY_TITLE = {
        object: 'block',
        type: 'heading_2',
        heading_2: {
          rich_text: [{ type: 'text', text: { content: category.category } }],
          color: 'purple_background',
        },
      };
      // 插入标签标题
      await this.$no.appendChildren({
        block_id: newsletterPageCtx.id,
        children: [CATEGORY_TITLE],
      });

      // ===============
      // 插入分类内容
      // ===============
      for (const page of category.pages) {
        // Page Header 2
        const pageTitleRichText = [];
        if (page.icon) {
          pageTitleRichText.push({ type: 'text', text: { content: page.icon?.emoji + ' ' } });
        }
        const _title = {
          type: 'text',
          text: {
            content: page.properties.Name.title.map((title) => title.plain_text).join(''),
          },
        };
        if (page.properties.TitleLink.url) {
          _title.text.link = { url: page.properties.TitleLink.url };
        }
        pageTitleRichText.push(_title);

        const PAGE_TITLE = {
          object: 'block',
          type: 'heading_3',
          heading_3: { rich_text: pageTitleRichText },
        };
        // Page Content
        const pageBlocks = await this.$no.getBlocks({ block_id: page.id, page_size: 100 });
        const PAGE_CONTENT = pageBlocks.results.map((block) => {
          return {
            object: 'block',
            type: block.type,
            [block.type]: block[block.type],
          };
        });
        // Divider
        const DIVIDER = {
          object: 'block',
          type: 'divider',
        };

        const PAGE_BLOCKS = [PAGE_TITLE, ...PAGE_CONTENT, DIVIDER];

        await this.$no.appendChildren({
          block_id: newsletterPageCtx.id,
          children: PAGE_BLOCKS,
        });
      }
    }
  }

  async _buildNewsletterBlocks(subPages) {
    const newsletterGroups = NEWSLETTER_CATEGORIES.map((category) => ({ category, pages: [] }));
    newsletterGroups.push({ category: '以及这些...', pages: [] });
    subPages.forEach((page) => {
      const group = newsletterGroups.find(
        (group) => group.category === page.properties.Category.select.name
      );
      if (group) {
        group.pages.push(page);
      } else {
        newsletterGroups[newsletterGroups.length - 1].pages.push(page);
      }
    });

    console.log(newsletterGroups);

    const finalText = newsletterGroups
      .filter((category) => category.pages.length)
      .map((category) => {
        const CATEGORY_TITLE = [
          {
            object: 'block',
            type: 'heading_1',
            heading_1: {
              rich_text: [{ type: 'text', text: { content: category.category } }],
              color: 'purple_background',
            },
          },
        ];
        const CATEGORY_CONTENT = category.pages.map(async (page) => {
          // Page Header 2
          const rich_text = [];
          if (page.icon) {
            rich_text.push({ type: 'text', text: { content: page.icon?.emoji } });
          }
          rich_text.push({
            type: 'text',
            text: {
              content: page.properties.Name.title.text,
              url: page.properties.TitleLink.url ?? null,
            },
          });
          const PAGE_TITLE = {
            object: 'block',
            type: 'heading_2',
            heading_2: { rich_text },
          };

          // Page Content
          const pageBlocks = await this.$no.getBlocks({ block_id: page.id, page_size: 100 });
          const PAGE_CONTENT = pageBlocks.results;

          return [PAGE_TITLE, ...PAGE_CONTENT];
        });

        return [CATEGORY_TITLE, ...CATEGORY_CONTENT];

        //   const TITLE = this._buildHeading(category.category, 1);
        //   const CONTENT = category.pages.map(page => {
        //     return this._buildHeading(this._buildTitle(page));
        //   })
        //
        // return [TITLE, ...CONTENT];
      });

    console.log(finalText);
    return finalText;
  }
}

module.exports = { Newsletter };
