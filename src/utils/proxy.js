const Shell = require('shelljs');

const initProxy = () => {
  let proxyAddress;

  // 如果直接提供了代理路径
  if (process.env.ZYC_PROXY_ADDRESS) {
    proxyAddress = process.env.ZYC_PROXY_ADDRESS;
  }

  // 如果在 WSL 环境
  if (process.env.ZYC_USE_WSL) {
    const { stdout } = Shell.exec(`cat /etc/resolv.conf | grep nameserver | awk '{ print $2 }'`);
    const hostIP = stdout.trim();
    const port = process.env.ZYC_USE_WSL_PORT;
    proxyAddress = `http://${hostIP}:${port}`;
  }

  Shell.env.http_proxy = proxyAddress;
  Shell.env.https_proxy = proxyAddress;
};

module.exports = { initProxy };
