// Host bridge — the only file that imports from @aboutcircles/miniapp-sdk.
// Keep this isolated from domain logic (recommended by the docs).

import {
  isMiniappMode,
  onAppData,
  onWalletChange,
  sendTransactions,
  signMessage,
} from '@aboutcircles/miniapp-sdk';

function toHexValue(value) {
  return value ? `0x${BigInt(value).toString(16)}` : '0x0';
}

// Normalize every transaction through one adapter so we never leak
// inconsistent value-encoding into the host.
function formatTxForHost(tx) {
  return {
    to: tx.to,
    data: tx.data || '0x',
    value: toHexValue(tx.value || 0n),
  };
}

export async function submitTransactions(txs) {
  return sendTransactions(txs.map(formatTxForHost));
}

export {
  isMiniappMode,
  onAppData,
  onWalletChange,
  signMessage,
};
