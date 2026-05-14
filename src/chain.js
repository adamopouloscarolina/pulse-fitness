// On-chain client for the WoodenSpoonChallenge contract.
//
// Talks to a local Anvil node at http://127.0.0.1:8545. Falls back
// silently to the mock state machine if Anvil isn't reachable —
// the app still works offline.
//
// The private keys below are Anvil's *deterministic* dev keys —
// they're publicly known, in every Foundry tutorial. Safe to commit
// because they only work on local Anvil and have zero value.

import {
  createPublicClient, createWalletClient, http,
  defineChain,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

export const CHALLENGE_ADDRESS = '0x5FbDB2315678afecb367f032d93F642f64180aa3';

const anvil = defineChain({
  id: 31337,
  name: 'Anvil',
  nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: ['http://127.0.0.1:8545'] } },
});

// Anvil's deterministic dev keys (account index → PK).
// Account 0 plays "You"; 1..3 play Alex, Maria, João.
export const KEYS = {
  you:   '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
  alex:  '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d',
  maria: '0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a',
  joao:  '0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6',
};

export const accounts = Object.fromEntries(
  Object.entries(KEYS).map(([k, pk]) => [k, privateKeyToAccount(pk)])
);

export const publicClient = createPublicClient({ chain: anvil, transport: http() });

const walletClients = Object.fromEntries(
  Object.entries(accounts).map(([k, a]) => [k, createWalletClient({ account: a, chain: anvil, transport: http() })])
);

// ABI surface we actually use
export const ABI = [
  { type: 'function', name: 'createChallenge', stateMutability: 'nonpayable',
    inputs: [
      { name: 'members', type: 'address[]' },
      { name: 'stakeX',  type: 'uint128' },
      { name: 'stakeP',  type: 'uint128' },
      { name: 'duration',type: 'uint64'  },
    ], outputs: [{ name: 'id', type: 'uint256' }] },
  { type: 'function', name: 'join', stateMutability: 'payable',
    inputs: [{ name: 'id', type: 'uint256' }], outputs: [] },
  { type: 'function', name: 'submitSteps', stateMutability: 'nonpayable',
    inputs: [{ name: 'id', type: 'uint256' }, { name: 'steps', type: 'uint256' }], outputs: [] },
  { type: 'function', name: 'settle', stateMutability: 'nonpayable',
    inputs: [{ name: 'id', type: 'uint256' }], outputs: [] },
  { type: 'function', name: 'withdraw', stateMutability: 'nonpayable',
    inputs: [{ name: 'id', type: 'uint256' }], outputs: [] },
  { type: 'function', name: 'withdrawable', stateMutability: 'view',
    inputs: [{ name: 'id', type: 'uint256' }, { name: 'who', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }] },
  { type: 'function', name: 'nextId', stateMutability: 'view',
    inputs: [], outputs: [{ name: '', type: 'uint256' }] },
];

// ---- Liveness check ----------------------------------------------

export async function isChainAlive() {
  try {
    await publicClient.getBlockNumber();
    return true;
  } catch {
    return false;
  }
}

// ---- Reads --------------------------------------------------------
//
// All stakes & payouts are denominated as plain integer "CRC units"
// (1 unit = 1 wei on chain — tiny on-chain value, but conceptually a
// whole CRC for the UI). So `withdrawable` returns 100 means "100 CRC".

export async function getWithdrawable(challengeId, who) {
  const w = await publicClient.readContract({
    address: CHALLENGE_ADDRESS, abi: ABI, functionName: 'withdrawable',
    args: [BigInt(challengeId), accounts[who].address],
  });
  return Number(w);
}

// ---- Writes -------------------------------------------------------

export async function createChallengeOnChain({ stakeX, stakeP, durationDays }) {
  const members = [accounts.you.address, accounts.alex.address, accounts.maria.address, accounts.joao.address];
  const hash = await walletClients.you.writeContract({
    address: CHALLENGE_ADDRESS, abi: ABI, functionName: 'createChallenge',
    args: [members, BigInt(stakeX), BigInt(stakeP), BigInt(durationDays * 86400)],
  });
  await publicClient.waitForTransactionReceipt({ hash });
  const next = await publicClient.readContract({
    address: CHALLENGE_ADDRESS, abi: ABI, functionName: 'nextId',
  });
  return Number(next) - 1;
}

export async function joinChallengeOnChain(challengeId, who, totalStake) {
  const hash = await walletClients[who].writeContract({
    address: CHALLENGE_ADDRESS, abi: ABI, functionName: 'join',
    args: [BigInt(challengeId)], value: BigInt(totalStake),
  });
  await publicClient.waitForTransactionReceipt({ hash });
}

export async function submitStepsOnChain(challengeId, who, steps) {
  const hash = await walletClients[who].writeContract({
    address: CHALLENGE_ADDRESS, abi: ABI, functionName: 'submitSteps',
    args: [BigInt(challengeId), BigInt(Math.floor(steps))],
  });
  await publicClient.waitForTransactionReceipt({ hash });
}

export async function settleOnChain(challengeId) {
  const hash = await walletClients.you.writeContract({
    address: CHALLENGE_ADDRESS, abi: ABI, functionName: 'settle',
    args: [BigInt(challengeId)],
  });
  await publicClient.waitForTransactionReceipt({ hash });
}

export async function withdrawOnChain(challengeId, who) {
  const hash = await walletClients[who].writeContract({
    address: CHALLENGE_ADDRESS, abi: ABI, functionName: 'withdraw',
    args: [BigInt(challengeId)],
  });
  await publicClient.waitForTransactionReceipt({ hash });
}

// Anvil-only time controls (used to skip past the challenge duration
// instantly during demo). On a real chain these would just be "wait".
export async function fastForward(seconds) {
  await fetch(anvil.rpcUrls.default.http[0], {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'evm_increaseTime', params: [seconds] }),
  });
  await fetch(anvil.rpcUrls.default.http[0], {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'evm_mine', params: [] }),
  });
}
