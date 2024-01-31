import { formatUnits } from "@ethersproject/units";
import { ethers } from "ethers";
import {
    wssProvider,
    searcherWallet,
    contractProvider,
    WethUsdcPair,
    SwapValue,
    jsonProvider,
    WethMainEthPair, WethUniPair, WethUniV2Pair
} from "./src/constants.js";
import {
    logDebug,
    logError,
    logFatal,
    logInfo,
    logSuccess,
    logTrace,
} from "./src/logging.js";

let count = 0;
const swapExactETHForTokens = async (block_number) => {
    const strLogPrefix = `block_number=${block_number}`
    logTrace(strLogPrefix, "change")
    count++
    if (count < 4) {
        logInfo("!!!return!!!")
        return
    }
    let deadline = parseInt((new Date().getTime() / 1000).toString()) + 600
    let b = await contractProvider.swapExactETHForTokens(0, WethUsdcPair, searcherWallet.address, deadline, {value: SwapValue})
    logInfo("tx_hash is", b.hash)
    count = 0
};


const main = async () => {
    logInfo("============================================================================\n");
    logInfo(`Searcher Wallet: ${searcherWallet.address}`);
    logInfo(`Node URL: ${wssProvider.connection.url}\n`);
    logInfo("============================================================================\n");
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

    logInfo("Listening to block number change...\n");
    // 判断blockNumber是否变化,若变化就调用swap方法
    wssProvider.on("block", (block_number) =>
        swapExactETHForTokens(block_number).catch((e) => {
            logFatal(`block_number=${block_number} error ${JSON.stringify(e)}`);
        })
    );
};

main();
