/**
 * Injects a Wallet Standard sandbox wallet before Veil loads so capture can
 * auto-connect and reach the dashboard — no extension or manual click required.
 */
export function veilWalletInitScript(address: string): string {
  const safeAddr = address.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
  return `
(function () {
  const ADDRESS = '${safeAddr}';
  const CHAIN = 'sui:testnet';
  const WALLET_NAME = 'Sui Wallet';
  const pubKey = new Uint8Array(32);

  const account = {
    address: ADDRESS,
    publicKey: pubKey,
    chains: [CHAIN],
    features: ['sui:signAndExecuteTransaction', 'sui:signTransaction', 'sui:signPersonalMessage'],
  };

  let connected = true;
  const listeners = new Map();

  function emit(event, props) {
    (listeners.get(event) || []).forEach((fn) => {
      try { fn(props); } catch (_) {}
    });
  }

  async function doConnect() {
    connected = true;
    emit('change', { accounts: wallet.accounts });
    try {
      window.__VEIL_WALLET_READY = true;
      window.__VEIL_WALLET_ADDRESS = ADDRESS;
      localStorage.setItem("@mysten/dapp-kit:last-connected-wallet-name", WALLET_NAME);
      localStorage.setItem("@mysten/dapp-kit:last-connected-account-address", ADDRESS);
      sessionStorage.setItem("@mysten/dapp-kit:last-connected-wallet-name", WALLET_NAME);
      sessionStorage.setItem("@mysten/dapp-kit:last-connected-account-address", ADDRESS);
    } catch (_) {}
    return { accounts: wallet.accounts };
  }

  const wallet = {
    version: '1.0.0',
    name: WALLET_NAME,
    icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><circle cx="16" cy="16" r="14" fill="%236cf"/></svg>',
    chains: [CHAIN],
    get accounts() { return connected ? [account] : []; },
    features: {
      'standard:connect': {
        version: '1.0.0',
        connect: doConnect,
      },
      'standard:disconnect': {
        version: '1.0.0',
        disconnect: async () => {
          connected = false;
          emit('change', { accounts: [] });
          try { window.__VEIL_WALLET_READY = false; } catch (_) {}
        },
      },
      'standard:events': {
        version: '1.0.0',
        on: (event, listener) => {
          if (!listeners.has(event)) listeners.set(event, []);
          listeners.get(event).push(listener);
          return () => {
            const arr = listeners.get(event) || [];
            const i = arr.indexOf(listener);
            if (i >= 0) arr.splice(i, 1);
          };
        },
      },
      'sui:signPersonalMessage': {
        version: '1.0.0',
        signPersonalMessage: async () => ({
          bytes: new Uint8Array(64),
          signature: new Uint8Array(64),
        }),
      },
      'sui:signTransaction': {
        version: '1.0.0',
        signTransaction: async () => ({
          bytes: new Uint8Array(128),
          signature: new Uint8Array(64),
        }),
      },
      'sui:signAndExecuteTransaction': {
        version: '1.0.0',
        signAndExecuteTransaction: async () => ({
          bytes: new Uint8Array(128),
          signature: new Uint8Array(64),
          digest: 'sandbox-capture-demo',
        }),
      },
    },
  };

  const register = (api) => {
    try { api.register(wallet); } catch (_) {}
    doConnect();
  };

  window.addEventListener('wallet-standard:app-ready', (e) => {
    register(e.detail);
  });
  window.addEventListener('wallet-standard:register-wallet', (e) => {
    register(e.detail);
  });

  try {
    window.dispatchEvent(new CustomEvent('wallet-standard:register-wallet', { detail: register }));
  } catch (_) {}

  window.__veilSandboxConnect = async function () {
    await doConnect();
    const btn = [...document.querySelectorAll('button')].find((b) =>
      /connect sui wallet|connecting/i.test(b.textContent ?? ''),
    );
    if (btn && !btn.disabled) {
      btn.click();
      await new Promise((r) => setTimeout(r, 800));
    }
    if (location.pathname.includes('/dashboard')) return true;
    await new Promise((r) => setTimeout(r, 1200));
    return location.pathname.includes('/dashboard');
  };

  try {
    doConnect();
  } catch (_) {}

  let nudge = 0;
  const timer = setInterval(() => {
    nudge += 1;
    if (location.pathname.includes('/dashboard') || nudge > 100) {
      clearInterval(timer);
      return;
    }
    doConnect();
    if (location.pathname.includes('/auth')) {
      const btn = [...document.querySelectorAll('button')].find((b) =>
        /connect sui wallet/i.test(b.textContent ?? ''),
      );
      if (btn && !btn.disabled) btn.click();
    }
  }, 250);
})();
`;
}
