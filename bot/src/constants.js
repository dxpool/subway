// Globals
import { createRequire } from "module";
const require = createRequire(import.meta.url);
import dotenv from "dotenv";
dotenv.config();

import { ethers } from "ethers";
import { logError } from "./logging.js";

const IUniswapV2PairAbi = require("./abi/IUniswapV2Pair.json");

let hasEnv = true;

const ENV_VARS = [
  "RPC_URL",
  "RPC_URL_WSS",
  "PRIVATE_KEY",
  "FLASHBOTS_AUTH_KEY",
  "SANDWICH_CONTRACT",
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

// Contracts
export const CONTRACTS = {
  UNIV2_ROUTER: "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D",

  // Sandwich contract
  SANDWICH: process.env.SANDWICH_CONTRACT,
};

// Helpful tokens for testing
export const TOKENS = {
  WETH: "0xb4fbf271143f4fbf7b91a5ded31805e42b2208d6",
  USDC: "0xd35cceead182dcee0f148ebac9447da2c4d449c4",
};

// Providers
export const provider = new ethers.providers.JsonRpcProvider(
  process.env.RPC_URL
);
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

// Common contracts
export const uniswapV2Pair = new ethers.Contract(
  ethers.constants.AddressZero,
  IUniswapV2PairAbi,
  searcherWallet
);

function readAddresses() {
  try {
    const jsonData = fs.readFileSync('output.json', 'utf-8');
    const data = JSON.parse(jsonData);
    const addressSet = new Set();
    for (const token in data) {
      if (data.hasOwnProperty(token) && data[token].Address) {
        addressSet.add(data[token].Address);
      }
    }
    return addressSet;
  } catch (error) {
    console.error('Error reading or parsing the JSON file:', error);
    return null;
  }
}

export const address = readAddresses();