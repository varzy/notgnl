require('dotenv').config();
process.env.ZYC_USE_PROXY && require('../utils/proxy').initProxy();

const Koa = require('koa');
const app = new Koa();
const bodyParser = require('koa-bodyparser');
const router = require('./router');

app.use(bodyParser()).use(router.routes()).use(router.allowedMethods).listen(3500);
