const Router = require('@koa/router');
const router = new Router();

router.get('/', (ctx) => {
  ctx.body = 'hello, world';
});

/**
 * @TODO: 稿件投递接口。给机器人使用
 */
router.post('/posts', (ctx) => {
  ctx.body = 'Received.';
});

module.exports = router;
