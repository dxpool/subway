import { formatUnits } from "@ethersproject/units";
import { ethers } from "ethers";
import { wssProvider, searcherWallet } from "../src/constants.js";
import {
    logError,
    logFatal,
    logInfo,
    logSuccess,
    logTrace,
} from "../src/logging.js";
import {
    callBundleFlashbots,
    sanityCheckSimulationResponse,
    sendBundleFlashbots,
} from "../src/relayer.js";
import { calcNextBlockBaseFee, match, stringifyBN } from "../src/utils.js";

// Note: You'll probably want to break this function up
//       handling everything in here so you can follow along easily
const sandwichUniswapV2RouterTx = async (blocknumber) => {
    const strLogPrefix = `block_number=${blocknumber}`;
    logTrace(strLogPrefix, "change");

    const block = await wssProvider.getBlock();
    const targetBlockNumber = block.number + 1;
    console.log("target block number, ", targetBlockNumber)
    const nextBaseFee = calcNextBlockBaseFee(block);
    const nonce = await wssProvider.getTransactionCount(searcherWallet.address);

    // 单独构造一笔交易
    console.log("block number, ", targetBlockNumber.toString())
    console.log("next base fee, ", nextBaseFee.toString())
    // 抬高 maxPriorityFeePerGas 和 maxFeePerGas
    const n = nextBaseFee.mul(10000000000)
    console.log("n is, ", n.toString())
    console.log("searcher address, ", searcherWallet.address)
    console.log("to address, ", process.env.ADDRESS)
    console.log("nonce, ", nonce)
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

    const bundleTxSign = await searcherWallet.signTransaction(bundleTx);

    const signedTxs = [bundleTxSign];

    const simulatedResp = await callBundleFlashbots(signedTxs, targetBlockNumber);
    console.log(simulatedResp);
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

    const buildTxWithBribe = await searcherWallet.signTransaction({
        ...bundleTx,
    });

    const bundleResp = await sendBundleFlashbots(
        [buildTxWithBribe],
        targetBlockNumber
    );

    console.log("bundle resp, ", bundleResp)
    logSuccess(
        strLogPrefix,
        "Bundle submitted!",
        JSON.stringify(
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
    logInfo("Listening to block number change ...\n");
    wssProvider.on("block", (blocknumber) =>
        sandwichUniswapV2RouterTx(blocknumber).catch((e) => {
            logFatal(`blocknumber=${blocknumber} error ${JSON.stringify(e)}`);
        })
    );
};

main();
