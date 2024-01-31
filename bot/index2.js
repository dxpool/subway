import { formatUnits } from "@ethersproject/units";
import { ethers } from "ethers";
import { wssProvider, searcherWallet } from "./src/constants.js";
import {
    logError,
    logFatal,
    logInfo,
    logSuccess,
    logTrace,
} from "./src/logging.js";
import {
    callBundleFlashbots,
    sanityCheckSimulationResponse,
    sendBundleFlashbots,
} from "./src/relayer.js";
import { calcNextBlockBaseFee, match, stringifyBN } from "./src/utils.js";

// Note: You'll probably want to break this function up
//       handling everything in here so you can follow along easily
const sandwichUniswapV2RouterTx = async (txHash) => {
    const strLogPrefix = `txhash=${txHash}`;

    // Bot not broken right
    logTrace(strLogPrefix, "received");

    // Get tx data
    const [tx, txRecp] = await Promise.all([
        wssProvider.getTransaction(txHash),
        wssProvider.getTransactionReceipt(txHash),
    ]);

    // Make sure transaction hasn't been mined
    if (txRecp !== null) {
        return;
    }

    // Sometimes tx is null for some reason
    if (tx === null) {
        return;
    }

    // We're not a generalized version
    // So we're just gonna listen to specific addresses
    // and decode the data from there
    if (!match(tx.to, process.env.ADDRESS)) {
        return;
    }

    logTrace(
        strLogPrefix,
        "potentially send tx found",
    );


    // Get block data to compute bribes etc
    // as bribes calculation has correlation with gasUsed
    const block = await wssProvider.getBlock();
    const targetBlockNumber = block.number + 1;
    console.log("target block number, ", targetBlockNumber)
    const nextBaseFee = calcNextBlockBaseFee(block);
    const nonce = await wssProvider.getTransactionCount(searcherWallet.address);

    // 单独构造一笔交易
    console.log("block number, ", targetBlockNumber.toString())
    console.log("next base fee, ", nextBaseFee.toString())
    const n = nextBaseFee.mul(1000000)
    // console.log("next base fee, ", nextBaseFee.toString())
    const bundleTx = {
        from: searcherWallet.address,
        to: process.env.ADDRESS,
        value: ethers.utils.parseEther('0.01'),
        chainId: 5,
        maxPriorityFeePerGas: n,
        maxFeePerGas: n,
        gasLimit: 300000,
        nonce,
        type: 2,
    };

    //  console.log("from --", searcherWallet.address)
    // console.log("to---", process.env.ADDRESS)

    // const bundleTxSign = await searcherWallet.signTransaction(bundleTx);

    // Simulate tx to get the gas used

//  const signedTxs = [bundleTxSign];

    /*
      const simulatedResp = await callBundleFlashbots(signedTxs, targetBlockNumber);
      console.log(simulatedResp);
      // Try and check all the errors
      try {
        sanityCheckSimulationResponse(simulatedResp);
      } catch (e) {
        logError(
          strLogPrefix,
          "error while simulating",
          JSON.stringify(
            stringifyBN({
              error: e,
              block,
              targetBlockNumber,
              nextBaseFee,
              nonce
            })
          )
        );
        return;
      }

     */
    //let maxPriorityFeePerGas = ethers.BigNumber.from(2000000)

    // Okay, update backslice tx

    const buildTxWithBribe = await searcherWallet.signTransaction({
        ...bundleTx,
    });

    const bundleResp = await sendBundleFlashbots(
        [buildTxWithBribe],
        targetBlockNumber + 1
    );

    console.log("bundle resp, ", bundleResp)
    logSuccess(
        strLogPrefix,
        "Bundle submitted!",
        JSON.stringify(
            // block,
            // targetBlockNumber,
            // nextBaseFee,
            // nonce,
            bundleResp
        )
    );
};


const main = async () => {
    logInfo(
        "============================================================================\n"
    );
    logInfo(`Searcher Wallet: ${searcherWallet.address}`);
    logInfo(`Node URL: ${wssProvider.connection.url}\n`);
    logInfo(
        "============================================================================\n"
    );
    // Add timestamp to all subsequent console.logs
    // One little two little three little dependency injections....
    const origLog = console.log;
    console.log = function (obj, ...placeholders) {
        if (typeof obj === "string")
            placeholders.unshift("[" + new Date().toISOString() + "] " + obj);
        else {
            // This handles console.log( object )
            placeholders.unshift(obj);
            placeholders.unshift("[" + new Date().toISOString() + "] %j");
        }

        origLog.apply(this, placeholders);
    };
    logInfo("Listening to mempool...\n");

    // Listen to the mempool on local node
    wssProvider.on("pending", (txHash) =>
        sandwichUniswapV2RouterTx(txHash).catch((e) => {
            logFatal(`txhash=${txHash} error ${JSON.stringify(e)}`);
        })
    );
};

main();
