// Globals
import dotenv from "dotenv";
dotenv.config();

import { ethers } from "ethers";
import { logError } from "./logging.js";
import {univ2RouterAbi} from "../abi/univ2Router.js";

let hasEnv = true;

const ENV_VARS = [
  "RPC_URL_WSS",
  "RPC_URL",
  "PRIVATE_KEY",
  "ADDRESS"
];

for (let i = 0; i < ENV_VARS.length; i++) {
  if (!process.env[ENV_VARS[i]]) {
    logError(`Missing env var ${ENV_VARS[i]}`);
    hasEnv = false;
  }
}

if (!hasEnv) {
  process.exit(1);
}

export const Univ2RouterAddress = "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D"

export const wssProvider = new ethers.providers.WebSocketProvider(
  process.env.RPC_URL_WSS
);

// Used to send transactions, needs ether
export const searcherWallet = new ethers.Wallet(
  process.env.PRIVATE_KEY,
  wssProvider
);

// Used to sign flashbots headers doesn't need any ether
export const authKeyWallet = new ethers.Wallet(
  process.env.PRIVATE_KEY,
  wssProvider
);

export const jsonProvider = new ethers.providers.JsonRpcProvider(
    process.env.RPC_URL
)

const signer = new ethers.Wallet(
    process.env.PRIVATE_KEY,
    jsonProvider
)

export const contractProvider = new ethers.Contract(Univ2RouterAddress, univ2RouterAbi, signer)

export const WethUsdcPair = [
  "0xB4FBF271143F4FBf7B91A5ded31805e42b2208d6",
  "0x07865c6E87B9F70255377e024ace6630C1Eaa37F"
]

export const WethMainEthPair = [
  "0xB4FBF271143F4FBf7B91A5ded31805e42b2208d6",
  "0xdD69DB25F6D620A7baD3023c5d32761D353D3De9"
]

export const WethUniPair = [
    "0xB4FBF271143F4FBf7B91A5ded31805e42b2208d6",
    "0x28cee28a7C4b4022AC92685C07d2f33Ab1A0e122"
]

export const WethUniV2Pair = [
    "0xB4FBF271143F4FBf7B91A5ded31805e42b2208d6",
    "0x1f9840a85d5aF5bf1D1762F925BDADdC4201F984"
]

export const SwapValue = ethers.utils.parseEther('0.001')