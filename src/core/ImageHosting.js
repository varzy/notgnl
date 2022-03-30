const { HttpClient } = require('./HttpClient');
const path = require('path');
const fs = require('fs');
const FormData = require('form-data');

/**
 * 图床
 * 目前使用 sm.ms
 */
class ImageHosting {
  constructor() {
    this.cacheDir = path.resolve(__dirname, '../../.cache');
    this.tokenFile = path.join(this.cacheDir, 'smms-token.json');

    this.$http = new HttpClient({
      baseURL: 'https://sm.ms/api/v2/',
      timeout: 50000,
    });
  }

  async init() {
    if (!this._isLogin()) await this._login();

    return true;
  }

  async download(url, dir, name) {
    const ext = url.substring(0, url.indexOf('?')).split('.').pop().toLowerCase();
    const res = await this.$http.request({
      url: url,
      method: 'GET',
      responseType: 'arraybuffer',
      responseEncoding: 'binary',
    });
    fs.writeFileSync(path.join(dir, `${name}.${ext}`), res.data, { encoding: 'binary' });
  }

  async upload(file, filename) {
    const formData = new FormData();
    filename
      ? formData.append('smfile', file, { filename, contentType: 'multipart/form-data' })
      : formData.append('smfile', file);

    const res = await this.$http.request({
      url: '/upload',
      method: 'POST',
      headers: {
        Authorization: this._getToken(),
        ...formData.getHeaders(),
      },
      data: formData,
    });

    if (res.data.success) return res.data.data.url;
    if (res.data.code === 'image_repeated') return res.data.images;
    return null;
  }

  async uploadExternal(url) {
    const externalImageRes = await this.$http.request({
      url: url,
      method: 'GET',
      responseType: 'arraybuffer',
      responseEncoding: 'binary',
    });

    // 先对文件进行保存
    const cacheFile = path.join(this.cacheDir, `tmpimage`);
    fs.writeFileSync(cacheFile, externalImageRes.data, { encoding: 'binary' });
    // 进行上传
    const uploadedRes = await this.upload(fs.createReadStream(cacheFile));
    // 删除临时文件
    fs.unlinkSync(cacheFile);

    return uploadedRes;

    // fs.writeFileSync(path.join(this.cacheDir, `downloading.${ext}`), externalImageRes.data, {
    //   encoding: 'binary',
    // });
    //
    // return await this.upload(
    //   fs.createReadStream(externalImageRes.data),
    //   `image.${ext}`
    // );
    // return await this.upload(new Blob([externalImageRes.data]), `image.${ext}`);

    // return await this.upload(fs.createReadStream(path.join(this.cacheDir, `downloading.${ext}`)))
    //
    // const file = fs.readFileSync(path.join(this.cacheDir, 'downloading.jpeg'), {encoding: "binary"});
    // return await this.upload(new Int8Array(externalImageRes.data));
    // return await this.upload(Uint8Array.from(externalImageRes.data).buffer);
  }

  _isLogin() {
    if (!fs.existsSync(this.tokenFile)) return false;

    const { lastLoginTime } = this._getTokenConfigFileCtx();
    // 超过 7 天需要重新登录
    return +new Date() - lastLoginTime < 7 * 24 * 60 * 60 * 1000;
  }

  async _login() {
    const res = await this.$http.request({
      url: '/token',
      method: 'POST',
      params: { username: process.env.SMMS_USERNAME, password: process.env.SMMS_PASSWORD },
    });

    if (!fs.existsSync(this.cacheDir)) fs.mkdirSync(path.resolve(this.cacheDir));

    fs.writeFileSync(
      this.tokenFile,
      JSON.stringify({
        token: res.data.data.token,
        lastLoginTime: +new Date(),
      })
    );

    return res.data.data.token;
  }

  _getToken() {
    const { token } = this._getTokenConfigFileCtx();
    return token;
  }

  _getTokenConfigFileCtx() {
    if (!fs.existsSync(this.tokenFile)) return null;
    return JSON.parse(fs.readFileSync(this.tokenFile, 'utf-8'));
  }
}

module.exports = { ImageHosting };