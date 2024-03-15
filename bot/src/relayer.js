import { createRequire } from "module";
const require = createRequire(import.meta.url);

import { ethers } from "ethers";
import fetch from "node-fetch";
const Common = require("@ethereumjs/common").default;
const {
  FeeMarketEIP1559Transaction,
  AccessListEIP2930Transaction,
  Transaction,
} = require("@ethereumjs/tx");
import { stringifyBN, toRpcHexString } from "./utils.js";
import { authKeyWallet } from "./constants.js";

const urls = [
    "https://builder0x69.io",
    "https://rpc.beaverbuild.org",
    "https://relay.flashbots.net",
    "https://rsync-builder.xyz",
    "https://rpc.titanbuilder.xyz",
    "https://eth-builder.com"
]


let _fbId = 1;
export const fbRequest = async (url, method, params) => {
  const body = JSON.stringify({
    method: method,
    params: params,
    id: _fbId++,
    jsonrpc: "2.0",
  });

  const signature = await authKeyWallet.signMessage(ethers.utils.id(body));
  const headers = {
    "X-Flashbots-Signature": `${authKeyWallet.address}:${signature}`,
    "Content-Type": "application/json",
  };

  const resp = await fetch(url, {
    method: "POST",
    headers,
    body,
  }).then((x) => x.json());

  return resp;
};

export const sendBundleFlashbots = async (signedTxs, targetBlockNumber) => {
  const params = [
    {
      txs: signedTxs,
      blockNumber: toRpcHexString(
        ethers.BigNumber.from(targetBlockNumber.toString())
      ),
      minTimestamp: 0,
      maxTimestamp: parseInt((new Date().getTime() / 1000).toString()) + 60,
      revertingTxHashes: [],
    },
  ];
  for (let i = 0; i < urls; i++) {
      const resp = await fbRequest(
          urls[i],
          "eth_sendBundle",
          params
      );
      console.log("url, ", urls[i], "resp, ", resp)
  }
  return ""
};



// Helper function to help catch the various ways errors can be thrown from simulation
// This helper function is needed as simulation response has may ways where the
// error can be thrown.... which is not documented
export const sanityCheckSimulationResponse = (sim) => {
  // Contains first revert
  if (sim.firstRevert) {
    console.log("firstRevert1")
    throw new Error(sim.firstRevert.revert);
  }

  // Contains first revert
  if (sim.firstRevert) {
    console.log("firstRevert2")
    throw new Error(sim.firstRevert.revert);
  }

  // Simulation error type
  const simE = sim;
  if (simE.error) {
    console.log("simE.error")
    console.log("simE.error.message:", simE.error.message)
    throw new Error(simE.error.message);
  }

  // Another type of silent error
  // This has to be checked last
  const errors = sim.results
    .filter((x) => x.error !== undefined)
    .map((x) => x.error + " " + (x.revert || ""));
  if (errors.length > 0) {
    // TODO 错误出现在这里
    console.log("sim.results: ",sim.results);
    console.log("errors: ", errors);
    console.log("errors.join: ", errors.join(", "));
    throw new Error(errors.join(", "));
  }

  return sim;
};

export const callBundleFlashbots = async (signedTxs, targetBlockNumber) => {
  const params = [
    {
      txs: signedTxs,
      blockNumber: toRpcHexString(
        ethers.BigNumber.from(targetBlockNumber.toString())
      ),
      stateBlockNumber: toRpcHexString(
        ethers.BigNumber.from((targetBlockNumber - 1).toString())
      ),
    },
  ];
  const resp = await fbRequest(
    "https://relay.flashbots.net",
    "eth_callBundle",
    params
  );
  return resp.result;
};

export const getRawTransaction = (tx) => {
  let raw;
  let txData = stringifyBN(tx, true);

  const common = new Common({ chain: "mainnet", hardfork: "shanghai" });

  if (tx.type === null || tx.type === 0) {
    raw =
      "0x" +
      Transaction.fromTxData(txData, { common }).serialize().toString("hex");
  } else if (tx.type === 1) {
    raw =
      "0x" +
      AccessListEIP2930Transaction.fromTxData(txData, { common })
        .serialize()
        .toString("hex");
  } else if (tx.type === 2) {
    raw =
      "0x" +
      FeeMarketEIP1559Transaction.fromTxData(txData, { common })
        .serialize()
        .toString("hex");
  } else {
    throw new Error("Invalid tx type");
  }

  if (ethers.utils.keccak256(raw) !== tx.hash) {
    throw new Error("Invalid tx signature");
  }

  return raw;
};
