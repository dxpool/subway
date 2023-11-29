// Globals
import { createRequire } from "module";
const require = createRequire(import.meta.url);
import dotenv from "dotenv";
dotenv.config();
import { ethers } from "ethers";

import { logError } from "./logging.js";


const jsonString = JSON.parse(process.env.RPC_WSS_URL);

const IUniswapV2PairAbi = require("./abi/IUniswapV2Pair.json");


let hasEnv = true;

const ENV_VARS = [
  "RPC_WSS_URL",
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


// Contracts'
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

export const wssProviders = [];
export const providers=[];
export const searcherWallets = [];
export const authKeyWallets = [];
export const uniswapV2Pairs = [];
for (let i = 0; i < jsonString.length; i++) {
  const RPC_URL_WSS = jsonString[i]["RPC_URL_WSS"];
  const RPC_URL = jsonString[i]["RPC_URL"];
  wssProviders.push(new ethers.providers.WebSocketProvider(RPC_URL_WSS));
  providers.push(new ethers.providers.JsonRpcProvider(RPC_URL));
  searcherWallets.push(new ethers.Wallet(process.env.PRIVATE_KEY,new ethers.providers.WebSocketProvider(RPC_URL_WSS)));
  authKeyWallets.push(new ethers.Wallet(process.env.PRIVATE_KEY,new ethers.providers.WebSocketProvider(RPC_URL_WSS)));
  uniswapV2Pairs.push(ethers.AddressZero,IUniswapV2PairAbi,new ethers.Wallet(process.env.PRIVATE_KEY,new ethers.providers.WebSocketProvider(RPC_URL_WSS)));
}
