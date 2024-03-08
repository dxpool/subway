import { formatUnits } from "@ethersproject/units";
import { ethers } from "ethers";
import {CONTRACTS, wssProvider, searcherWallet} from "./src/constants.js";
import {
  logDebug,
  logError,
  logFatal,
  logInfo, logSuccess,
  logTrace,
} from "./src/logging.js";
import {calcSandwichOptimalIn, calSandwichState} from "./src/numeric.js";
import { parseUniv2RouterTx } from "./src/parse.js";
import {
  callBundleFlashbots,
  getRawTransaction,
  sanityCheckSimulationResponse, sendBundleFlashbots,
  // sendBundleFlashbots,
} from "./src/relayer.js";
import {
  getUniv2ExactWethTokenMinRecv,
  getUniv2PairAddress,
  getUniv2Reserve,
} from "./src/univ2.js";
import {
  calcNextBlockBaseFee,
  match, numberRemoveLastZero,
  numberRemoveZero,
  numberToZeroLast,
  stringifyBN,
  testNumberToHex
} from "./src/utils.js";

// Note: You'll probably want to break this function up
//       handling everything in here so you can follow along easily
const sandwichUniswapV2RouterTx = async (txHash) => {
  const strLogPrefix = `txhash=${txHash}`;

  // logTrace(strLogPrefix, "received");

  const [tx, txRecp] = await Promise.all([
    wssProvider.getTransaction(txHash),
    wssProvider.getTransactionReceipt(txHash),
  ]);

  if (txRecp !== null) {
    return;
  }

  if (tx === null) {
    return;
  }

  if (!match(tx.to, CONTRACTS.UNIV2_ROUTER)) {
    return;
  }

  const routerDataDecoded = parseUniv2RouterTx(tx.data);

  if (routerDataDecoded === null) {
    return;
  }

  const {path, amountOutMin, deadline} = routerDataDecoded;

  if (new Date().getTime() / 1000 > deadline) {
    return;
  }

  const userMinRecv = await getUniv2ExactWethTokenMinRecv(amountOutMin, path);
  const userAmountIn = tx.value;

  logTrace(
      strLogPrefix,
      "potentially sandwichable swapExactETHForTokens tx found",
      JSON.stringify(stringifyBN({
            userAmountIn,
            userMinRecv,
            path,
          })
      )
  );

  // Note: Since this is swapExactETHForTokens, the path will always be like so
  // Get the optimal in amount
  const [weth, token] = path;

  // 判断是否合理的流程
  /*
  if (!address.has(token)) {
      logTrace("Not in White List",token)
      return;
  } else {
      logTrace("In the White List",token)
  }
   */
  const pairToSandwich = getUniv2PairAddress(weth, token);
  const [reserveWeth, reserveToken] = await getUniv2Reserve(pairToSandwich, weth, token);

  const optimalWethIn = calcSandwichOptimalIn(
      userAmountIn,
      userMinRecv,
      reserveWeth,
      reserveToken
  );

  // 右移位数
  const right = BigInt(32)

  // 前缀 prefix
  const prefix = "0x"

  // 0的话说明token
  let isWethTokenOne
  if (ethers.BigNumber.from(weth).gt(ethers.BigNumber.from(token))) {
      isWethTokenOne = 1
  }

  // TODO: 使计算得到的front weth的十六进制数是1000000的倍数
  let valueHex = BigInt(optimalWethIn) >> right
  let tmp = prefix + BigInt(valueHex).toString(16) + "00000000"
  let valueBigInt = BigInt(BigInt(tmp).toString(10))

  if (valueBigInt < BigInt(ethers.constants.Zero)) {
    return;
  }

  const sandwichStates = calSandwichState (
      valueBigInt,
      BigInt(userAmountIn),
      BigInt(userMinRecv),
      BigInt(reserveWeth),
      BigInt(reserveToken),
      isWethTokenOne
  )

  // Sanity check failed
  if (sandwichStates === null) {
    logDebug(
        strLogPrefix,
        "sandwich sanity check failed",
        JSON.stringify(
            stringifyBN({
              optimalWethIn,
              reserveToken,
              reserveWeth,
              userAmountIn,
              userMinRecv,
            })
        )
    );
    return;
  }

  logInfo(strLogPrefix, " sandwichable target found");

  console.log("--- PairAddress --- ", pairToSandwich.toString())
  console.log("--- Revenue --- ", (sandwichStates.revenue / BigInt(1e9)).toString())

  /*
  if (sandwichStates.revenue.lt(0)) {
      logInfo(
          strLogPrefix,
          "revenue < 0",
      )
      return
  }
  */

  // Get block data to compute bribes etc
  // as bribes calculation has correlation with gasUsed
  const block = await wssProvider.getBlock()
  const targetBlockNumber = block.number + 1
  let nextBaseFee = calcNextBlockBaseFee(block)
  const nonce = await wssProvider.getTransactionCount(searcherWallet.address)
  let length = sandwichStates.frontOutHexLength
  let frontTokenAmountOut = sandwichStates.tokenAmountOut

  let frontPrefix
  let backPrefix
  let frontPrefixLength
  let blockPrefix = "0x" + block.number.toString(16).slice(-2)
  const backPrefixLength = prefix + ((68 - (length / 2))).toString(16)

  if (isWethTokenOne) {
    frontPrefix = "0x30"
    backPrefix = "0x26"
    frontPrefixLength = prefix + ((36 - (length / 2))).toString(16)
  } else {
    frontPrefix = "0x2b"
    backPrefix = "0x21"
    frontPrefixLength = prefix + ((68 - (length / 2))).toString(16)
  }

  const frontslicePayload = ethers.utils.solidityPack(
      ["bytes1", "bytes1", "bytes1", "address", "bytes"],
      [
        frontPrefix,
        blockPrefix,
        frontPrefixLength,
        pairToSandwich,
        frontTokenAmountOut
      ]
  )

  const frontSliceTx = {
    to: CONTRACTS.SANDWICH,
    from: searcherWallet.address,
    data: frontslicePayload,
    chainId: 1,
    maxPriorityFeePerGas: 0,
    maxFeePerGas: nextBaseFee,
    gasLimit: 300000,
    nonce,
    type: 2,
    value: valueHex
  }

  const frontSliceTxSigned = await searcherWallet.signTransaction(frontSliceTx)

  const middleTx = getRawTransaction(tx)

  const backSlicePayload = ethers.utils.solidityPack(
      ["bytes1", "bytes1", "bytes1", "address", "address", "bytes"],
      [
        backPrefix,
        blockPrefix,
        backPrefixLength,
        pairToSandwich,
        token,
        frontTokenAmountOut,
      ]
  )

  const backSliceTx = {
    to: CONTRACTS.SANDWICH,
    from: searcherWallet.address,
    data: backSlicePayload,
    chainId: 1,
    maxPriorityFeePerGas: 0,
    maxFeePerGas: nextBaseFee,
    gasLimit: 300000,
    nonce: nonce + 1,
    type: 2,
    value: sandwichStates.backWethHex
  }

  // 打印数据
  console.log("front weth value, ", valueHex)
  console.log("back weth value, ", sandwichStates.backWethHex)
  console.log("token amount ", frontTokenAmountOut)

  const backSliceTxSigned = await searcherWallet.signTransaction(backSliceTx);

  const signedTxs = [frontSliceTxSigned, middleTx, backSliceTxSigned];

  const simulatedResp = await callBundleFlashbots(signedTxs, targetBlockNumber);

  try {
    sanityCheckSimulationResponse(simulatedResp);
  } catch (e) {
    logError(
        strLogPrefix,
        "error while simulating",
        JSON.stringify(
            stringifyBN({
              error: e,
              targetBlockNumber,
            })
        )
    );
    return;
  }

  // Extract gas
  console.log("--- Front  Simulate --- ",  simulatedResp.results[0])
  console.log("--- Middle Simulate --- ",  simulatedResp.results[1])
  console.log("--- After  Simulate --- ",  simulatedResp.results[2])

  // 调整幅度 (估算的百分之110)
  const frontSliceGas = BigInt(simulatedResp.results[0].gasUsed) * BigInt(110) / BigInt(100)

  const backSliceGas = BigInt(simulatedResp.results[2].gasUsed) * BigInt(110) / BigInt(100)

  const bribeAmount = sandwichStates.revenue - (frontSliceGas + backSliceGas) * BigInt(nextBaseFee)

  let maxPriorityFeePerGas = bribeAmount * BigInt(9999) / BigInt(10000)

  if (maxPriorityFeePerGas < BigInt(nextBaseFee)) {
      logTrace(
          strLogPrefix,
          `maxPriorityFee (${formatUnits(
              maxPriorityFeePerGas,
              9
          )}) gwei < nextBaseFee (${formatUnits(nextBaseFee, 9)}) gwei`
      );
      return;
  }

  const backSliceTxSignedWithBribe = await searcherWallet.signTransaction({
    ...backSliceTx,
    maxPriorityFeePerGas: maxPriorityFeePerGas
  })

  const bundleResp = await sendBundleFlashbots(
      [frontSliceTxSigned, middleTx, backSliceTxSignedWithBribe],
      targetBlockNumber
  )

  logSuccess(strLogPrefix, "Bundle submitted!", JSON.stringify(bundleResp))
};


const main = async () => {
  logInfo("============================================================================\n");
  logInfo(`Searcher Wallet: ${searcherWallet.address}\n`);
  logInfo(`Node URL: ${wssProvider.connection.url}\n`);
  logInfo(`Contract Address: ${CONTRACTS.SANDWICH}\n`)
  logInfo("============================================================================\n");

  // Add timestamp to all subsequent console.logs
  // One little two little three little dependency injections....
  const origLog = console.log;
  console.log = function (obj, ...placeholders) {
    if (typeof obj === "string")
      placeholders.unshift("[" + new Date().toISOString() + "] " + obj);
    else {
      placeholders.unshift(obj);
      placeholders.unshift("[" + new Date().toISOString() + "] %j");
    }

    origLog.apply(this, placeholders);
  };

  logInfo("Listening to mempool...\n");

  wssProvider.on("pending", (txHash) =>
      sandwichUniswapV2RouterTx(txHash).catch((e) => {
        logFatal(`txhash=${txHash} error ${JSON.stringify(e)}`);
      })
  );
};

main();
